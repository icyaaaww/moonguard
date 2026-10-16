import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { core } from '../web/core-client.mjs';

const MAX_BYTES = 1024 * 1024;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const digest = value => createHash('sha256').update(value).digest('hex');
const exists = async file => fs.lstat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });

export class GuardError extends Error {
  constructor(message, issues = [], transaction = null) {
    super(message); this.issues = issues; this.transaction = transaction;
  }
}

export async function workspaceRoot(root) {
  const absolute = path.resolve(root);
  const stat = await fs.lstat(absolute);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new GuardError('工作区必须是真实目录，不能是符号链接');
  return fs.realpath(absolute);
}

// All operations are bounded to a single cooperative workspace. These checks
// reject existing symlinks/reparse points; they are not an OS sandbox against
// an adversary replacing ancestors between syscalls.
async function checkedPath(root, relative, { internal = false, createParents = false } = {}) {
  if (typeof relative !== 'string' || !relative || path.isAbsolute(relative) || relative.includes('\\') ||
      relative.includes(':') || relative.split('/').some(p => !p || p === '.' || p === '..')) {
    throw new GuardError('路径不合法');
  }
  if (!internal && relative.split('/').some(p => p.startsWith('.'))) throw new GuardError('隐藏路径不能被操作');
  if (relative !== relative.normalize('NFC')) throw new GuardError('路径必须采用 NFC Unicode 形式');
  let current = root;
  const segments = relative.split('/');
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]);
    let stat = await exists(current);
    if (!stat && createParents && i < segments.length - 1) {
      await fs.mkdir(current);
      stat = await fs.lstat(current);
    }
    if (stat?.isSymbolicLink()) throw new GuardError(`拒绝符号链接：${relative}`);
    if (stat && i < segments.length - 1 && !stat.isDirectory()) throw new GuardError(`父级不是目录：${relative}`);
    if (stat && i === segments.length - 1 && (!stat.isFile() || stat.nlink > 1)) {
      throw new GuardError(`目标不是普通独立文件：${relative}`);
    }
  }
  return current;
}

async function readText(root, relative, internal = false) {
  const full = await checkedPath(root, relative, { internal });
  const stat = await exists(full);
  if (!stat) return null;
  if (stat.size > MAX_BYTES * (internal ? 32 : 1)) throw new GuardError(`文件过大：${relative}`);
  return decoder.decode(await fs.readFile(full));
}

export async function readWorkspace(root) {
  const snapshot = { files: [], folders: [], blocked: [] };
  let scanned = 0;
  const walk = async (relative = '') => {
    const directory = relative ? path.join(root, relative) : root;
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new GuardError('读取期间目录类型发生变化');
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (++scanned > 1000) throw new GuardError('工作区条目过多，首版限制为 1000 项');
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.name.startsWith('.')) { if (name !== '.moonguard') snapshot.blocked.push(name); continue; }
      if (name !== name.normalize('NFC')) { snapshot.blocked.push(name); continue; }
      const s = await fs.lstat(path.join(root, name));
      if (s.isSymbolicLink() || (s.isFile() && s.nlink > 1)) snapshot.blocked.push(name);
      else if (s.isDirectory()) { snapshot.folders.push(name); await walk(name); }
      else if (s.isFile() && /\.(md|txt|json|csv)$/i.test(name) && s.size <= MAX_BYTES) {
        try {
          const content = await readText(root, name);
          if (content === null) throw new GuardError('读取期间文件消失');
          if (content.includes('\0')) snapshot.blocked.push(name);
          else snapshot.files.push({ path: name, content });
        } catch (e) {
          if (e instanceof TypeError) snapshot.blocked.push(name); else throw e;
        }
      } else snapshot.blocked.push(name);
    }
  };
  await walk();
  snapshot.files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  snapshot.folders.sort(); snapshot.blocked.sort();
  return snapshot;
}

async function metadata(root) {
  const directory = path.join(root, '.moonguard');
  const stat = await exists(directory);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new GuardError('元数据目录不合法');
  if (!stat) await fs.mkdir(directory, { mode: 0o700 }).catch(e => { if (e.code !== 'EEXIST') throw e; });
  const verified = await fs.lstat(directory);
  if (!verified.isDirectory() || verified.isSymbolicLink()) throw new GuardError('元数据目录不合法');
  return directory;
}

async function atomicWrite(root, relative, content, internal = false) {
  const full = await checkedPath(root, relative, { internal, createParents: true });
  const original = await exists(full);
  const temp = path.join(path.dirname(full), `.moonguard-tmp-${randomUUID()}`);
  const handle = await fs.open(temp, 'wx', original ? original.mode & 0o777 : 0o600);
  try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
  catch (e) { await handle.close(); await fs.unlink(temp).catch(() => {}); throw e; }
  finally { await handle.close(); }
  try { await checkedPath(root, relative, { internal }); await fs.rename(temp, full); }
  catch (e) { await fs.unlink(temp).catch(() => {}); throw e; }
}

async function lock(root, fn) {
  const directory = await metadata(root);
  const lockFile = path.join(directory, 'lock');
  const handle = await fs.open(lockFile, 'wx').catch(e => {
    if (e.code === 'EEXIST') throw new GuardError('工作区正被操作，或上次进程中断留下锁；请按 README 检查');
    throw e;
  });
  try { await handle.writeFile(JSON.stringify({ pid: process.pid, created: new Date().toISOString() })); return await fn(); }
  finally { await handle.close(); await fs.unlink(lockFile); }
}

const journalName = id => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new GuardError('事务编号不合法');
  return `.moonguard/${id}.json`;
};
async function save(root, journal) {
  await atomicWrite(root, journalName(journal.id), JSON.stringify(journal, null, 2), true);
}
async function load(root, id) {
  const raw = await readText(root, journalName(id), true);
  if (raw === null) throw new GuardError('找不到该事务');
  const value = JSON.parse(raw);
  if (value.id !== id || value.schema !== 1 || value.root !== root) throw new GuardError('事务不属于此工作区');
  return value;
}

export async function history(root) {
  const directory = await metadata(root);
  const result = [];
  for (const name of await fs.readdir(directory)) {
    if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
    const j = await load(root, name.slice(0, -5));
    result.push({ id: j.id, state: j.state, title: j.plan.title, created: j.created, updated: j.updated,
      changedPaths: j.plan.changes.length, receipt: j.receipt ?? null });
  }
  return result.sort((a, b) => b.created.localeCompare(a.created));
}

async function ensureNoPending(root) {
  const pending = (await history(root)).find(j => !['committed', 'undone'].includes(j.state));
  if (pending) throw new GuardError('存在未完成事务，请先恢复', [], pending.id);
}

async function applyChanges(root, changes, { failAfter = -1 } = {}) {
  let count = 0;
  // Each change is rechecked immediately before writing. The host lock only
  // serializes MoonGuard processes; users must pause external writers.
  for (const change of changes) {
    if (count === failAfter) throw new GuardError('演示故障：执行器在指定步骤主动中断');
    const actual = await readText(root, change.path);
    if (actual !== change.before) throw new GuardError('执行期间文件发生变化', [{ code: 'concurrent_write', path: change.path, message: '该文件已变化，停止后续操作' }]);
    if (change.after === null) await fs.unlink(await checkedPath(root, change.path));
    else await atomicWrite(root, change.path, change.after);
    count++;
  }
}

export async function preview(root, operations = null, title = '导入的文件操作计划') {
  const snapshot = await readWorkspace(root);
  return operations === null ? core('organize', { snapshot }) : core('plan', { snapshot, operations, title });
}

export async function checkPlan(root, plan) {
  const issues = core('check', { plan, snapshot: await readWorkspace(root) });
  return { ready: issues.length === 0, issues, changedPaths: plan.changes.length };
}

export async function apply(root, plan, options = {}) {
  return lock(root, async () => {
    await ensureNoPending(root);
    const issues = core('check', { plan, snapshot: await readWorkspace(root) });
    if (issues.length) throw new GuardError('预演已失效或计划不合法，未修改文件', issues);
    const now = new Date().toISOString();
    const j = { schema: 1, id: randomUUID(), root, created: now, updated: now, state: 'prepared', plan };
    await save(root, j); // Durable original contents exist before the first file change.
    try {
      j.state = 'committing'; await save(root, j);
      await applyChanges(root, plan.changes, options);
      const current = await readWorkspace(root);
      const check = core('restore', { plan, snapshot: current, recovery: false });
      if (check.issues.length) throw new GuardError('执行后校验未通过', check.issues);
      j.state = 'committed'; j.updated = new Date().toISOString();
      j.receipt = { algorithm: 'SHA-256', plan: digest(JSON.stringify(plan)), paths: plan.changes.map(c => ({ path: c.path, before: c.before === null ? null : digest(c.before), after: c.after === null ? null : digest(c.after) })) };
      await save(root, j);
      return { id: j.id, state: j.state, receipt: j.receipt };
    } catch (e) {
      j.state = 'needs-recovery'; j.updated = new Date().toISOString(); await save(root, j);
      throw new GuardError(e.message, e.issues ?? [], j.id);
    }
  });
}

async function restoration(root, journal) {
  const entries = await history(root);
  const pending = entries.find(entry => !['committed', 'undone'].includes(entry.state));
  if (pending && pending.id !== journal.id) throw new GuardError('请先恢复未完成的事务', [], pending.id);
  return core('restore', { plan: journal.plan, snapshot: await readWorkspace(root), recovery: journal.state !== 'committed' });
}

export async function previewRestore(root, id) {
  const j = await load(root, id);
  if (j.state === 'undone') return { id, state: j.state, alreadyRestored: true, plan: null };
  return { id, state: j.state, alreadyRestored: false, plan: await restoration(root, j) };
}

export async function restore(root, id, { expectedPlan } = {}) {
  return lock(root, async () => {
    const j = await load(root, id);
    if (j.state === 'undone') return { id, state: 'undone', alreadyRestored: true };
    const plan = await restoration(root, j);
    if (plan.issues.length) throw new GuardError('恢复遇到冲突，未修改文件', plan.issues, id);
    if (expectedPlan !== undefined && JSON.stringify(plan) !== JSON.stringify(expectedPlan)) {
      throw new GuardError('恢复预演已过期，请重新检查', [{ code: 'restore_stale', path: '', message: '文件在恢复预演后发生变化' }], id);
    }
    j.state = 'undoing'; j.updated = new Date().toISOString(); await save(root, j);
    try {
      await applyChanges(root, plan.changes);
      const remaining = core('restore', { plan: j.plan, snapshot: await readWorkspace(root), recovery: true });
      if (remaining.issues.length || remaining.changes.length) throw new GuardError('恢复校验未通过', remaining.issues);
      // Only remove empty directories that this transaction could have created.
      const original = new Set(j.plan.baseline.folders);
      const candidates = new Set(j.plan.changes.flatMap(c => c.path.split('/').slice(0, -1).map((_, i, a) => a.slice(0, i + 1).join('/'))));
      for (const dir of [...candidates].filter(d => !original.has(d)).sort((a, b) => b.length - a.length)) {
        const full = path.join(root, dir);
        const s = await exists(full);
        if (s?.isDirectory() && !s.isSymbolicLink()) await fs.rmdir(full).catch(e => { if (!['ENOTEMPTY', 'EEXIST'].includes(e.code)) throw e; });
      }
      j.state = 'undone'; j.updated = new Date().toISOString(); await save(root, j);
      return { id, state: j.state, verifiedPaths: j.plan.changes.length };
    } catch (e) {
      j.state = 'needs-recovery'; await save(root, j);
      throw new GuardError(e.message, e.issues ?? [], id);
    }
  });
}

export async function appendDemoEdit(root, relative) {
  const content = await readText(root, relative);
  if (content === null) throw new GuardError('示例文件不存在');
  await atomicWrite(root, relative, content + '\n> 现场编辑：这段内容来自用户，请保留。\n');
}
