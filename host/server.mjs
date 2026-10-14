import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { workspaceRoot, readWorkspace, preview, apply, restore, history, appendDemoEdit, GuardError } from './workspace.mjs';
import { createDemo } from './demo.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = new Map([['/', 'index.html'], ['/app.mjs', 'app.mjs'], ['/style.css', 'style.css'], ['/core.mjs', 'core.mjs'], ['/core-client.mjs', 'core-client.mjs']]);
assets.set('/study.mjs', 'study.mjs');
assets.set('/study-model.mjs', 'study-model.mjs');

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new GuardError('需要 application/json');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 4 * 1024 * 1024) throw new GuardError('请求过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export async function makeServer({ workspace = null, demoRoot = path.join(project, '.demo'), externalClient = false } = {}) {
  const demo = !workspace;
  let root = workspace ? await workspaceRoot(workspace) : await createDemo(demoRoot);
  const token = randomBytes(24).toString('hex');
  let currentPlan = null;
  let planId = null;
  let planSource = null;
  let busy = false;
  let revision = 0;
  const proposals = new Map();
  const propose = async (input, source) => {
    if ((await history(root)).some(h => !['committed', 'undone'].includes(h.state))) throw new GuardError('存在未完成事务，请先恢复');
    const next = await preview(root, input.operations ?? null, input.title ?? '导入的操作计划');
    if (proposals.has(planId)) proposals.get(planId).state = 'superseded';
    currentPlan = next;
    planSource = source;
    planId = randomBytes(16).toString('hex');
    proposals.set(planId, { id: planId, state: next.issues.length ? 'invalid' : next.changes.length ? 'awaiting_review' : 'no_changes', transaction: null });
    while (proposals.size > 32) proposals.delete(proposals.keys().next().value);
    revision++;
  };
  const state = async () => ({ snapshot: await readWorkspace(root), workspace: root, demo, history: await history(root), plan: currentPlan, planId, planSource, revision, externalClient });
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
    const send = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    let ownsBusy = false;
    try {
      const port = server.address()?.port;
      if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(403, { error: '拒绝非本机 Host' });
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) {
        if (req.headers['x-moonguard-token'] !== token) return send(403, { error: '缺少本次会话令牌' });
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return send(403, { error: '拒绝跨站请求' });
        if (req.method === 'GET' && url.pathname === '/api/revision') return send(200, { revision, busy });
        if (req.method === 'GET' && url.pathname === '/api/session') return send(200, await state());
        if (req.method !== 'POST') return send(405, { error: '方法不受支持' });
        if (busy) return send(409, { error: '正在完成上一个操作' });
        busy = true; ownsBusy = true;
        const input = await body(req);
        let result = null;
        if (url.pathname === '/api/preview') {
          await propose(input, input.operations == null ? 'organize' : 'import');
        } else if (url.pathname === '/api/apply') {
          if (!currentPlan || input.planId !== planId) throw new GuardError('预演编号已过期，请重新预演');
          if (input.failAfter !== undefined && !demo) throw new GuardError('故障注入仅用于示例工作区');
          const failAfter = input.failAfter === 2 && demo ? 2 : -1;
          try { result = await apply(root, currentPlan, { failAfter }); }
          catch (e) {
            Object.assign(proposals.get(planId), { state: e.transaction ? 'needs_recovery' : 'rejected', transaction: e.transaction ?? null });
            revision++; throw e;
          }
          Object.assign(proposals.get(planId), { state: 'committed', transaction: result.id });
          currentPlan = null; planId = null;
        } else if (url.pathname === '/api/restore') {
          result = await restore(root, input.id);
          if (proposals.has(planId)) proposals.get(planId).state = 'superseded';
          currentPlan = null; planId = null;
          for (const proposal of proposals.values()) if (proposal.transaction === input.id) proposal.state = 'restored';
        } else if (url.pathname === '/api/decline') {
          if (!currentPlan || input.planId !== planId) throw new GuardError('预演编号已过期');
          proposals.get(planId).state = 'declined';
          currentPlan = null; planId = null;
        } else if (url.pathname === '/api/demo-edit') {
          if (!demo) throw new GuardError('仅能修改隔离的演示资料');
          await appendDemoEdit(root, 'README.md');
          result = { edited: 'README.md' };
        } else if (url.pathname === '/api/demo-reset') {
          if (!demo) throw new GuardError('真实工作区不支持重置');
          root = await createDemo(demoRoot); currentPlan = null; planId = null;
          proposals.clear();
        } else return send(404, { error: '接口不存在' });
        revision++;
        return send(200, { ...await state(), result });
      }
      if (req.method !== 'GET') return send(405, { error: '方法不受支持' });
      const asset = assets.get(url.pathname);
      if (!asset) return send(404, { error: '页面不存在' });
      let content = await fs.readFile(path.join(project, 'web', asset));
      if (asset === 'index.html') content = Buffer.from(content.toString().replace('__SESSION_TOKEN__', token));
      const mime = asset.endsWith('.html') ? 'text/html' : asset.endsWith('.css') ? 'text/css' : 'text/javascript';
      res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` }); res.end(content);
    } catch (e) {
      send(e instanceof GuardError ? 409 : 400, { error: e.message, issues: e.issues ?? [], transaction: e.transaction ?? null });
    } finally { if (ownsBusy) busy = false; }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  // Capability given to the MCP adapter: intentionally no apply, restore or token.
  server.guard = Object.freeze({
    async snapshot() { if (busy) throw new GuardError('正在操作工作区，请稍后重试'); return readWorkspace(root); },
    async propose(input) {
      if (busy) throw new GuardError('正在操作工作区，请稍后重试');
      busy = true;
      try {
        await propose(input, 'mcp');
        return { ...proposals.get(planId), title: currentPlan.title, issues: currentPlan.issues,
          changes: currentPlan.changes.map(c => ({ path: c.path, kind: c.before === null ? 'create' : c.after === null ? 'trash' : 'write' })),
          operationCount: currentPlan.operations.length };
      } finally { busy = false; }
    },
    status(id) { const p = proposals.get(id); if (!p) throw new GuardError('计划编号不存在或已过期，请重新提交'); return { ...p }; },
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const server = await makeServer({ workspace: option('--workspace'), demoRoot: option('--demo-root') });
  server.listen(Number(option('--port') ?? 4317), '127.0.0.1', () => {
    console.log(`MoonGuard ready at http://127.0.0.1:${server.address().port}`);
    console.log(option('--workspace') ? 'Local workspace mode.' : 'Isolated sample workspace. No API key required.');
  });
}
