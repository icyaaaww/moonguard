import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../cli.mjs', import.meta.url));
async function run(...args) {
  try { return { code: 0, ...await exec(process.execPath, [cli, ...args]) }; }
  catch (e) { if (typeof e.code !== 'number') throw e; return { code: e.code, stdout: e.stdout, stderr: e.stderr }; }
}
async function fixture(t) {
  const parent = path.resolve(process.env.MOONGUARD_TEST_ROOT ?? os.tmpdir());
  await fs.mkdir(parent, { recursive: true });
  const base = await fs.mkdtemp(path.join(parent, 'moonguard-cli-'));
  const root = path.join(base, 'workspace');
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'a.md'), 'original');
  const input = path.join(base, 'operations.json');
  await fs.writeFile(input, '\uFEFF' + JSON.stringify({ operations: [{ kind: 'write', path: 'a.md', content: '更新😀' }] }));
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(base)), parent);
    assert.ok(path.basename(base).startsWith('moonguard-cli-'));
    await fs.rm(base, { recursive: true, force: true });
  });
  return { base, root, input, output: path.join(base, 'preview.json') };
}

test('CLI saves UTF-8 preview and checks without creating a journal', async t => {
  const { root, input, output } = await fixture(t);
  assert.equal((await run('preview', root, input, '--output', output)).code, 0);
  const plan = JSON.parse(await fs.readFile(output, 'utf8'));
  assert.equal(plan.result.files[0].content, '更新😀');
  const check = await run('check', root, output);
  assert.equal(check.code, 0);
  assert.equal(JSON.parse(check.stdout).ready, true);
  assert.deepEqual(await fs.readdir(root), ['a.md']);
  assert.equal(await fs.readFile(path.join(root, 'a.md'), 'utf8'), 'original');
  assert.equal((await run('apply', root, output)).code, 0);
  assert.equal(await fs.readFile(path.join(root, 'a.md'), 'utf8'), '更新😀');
});

test('CLI check reports stale and tampered plans with nonzero status', async t => {
  const { root, input, output } = await fixture(t);
  await run('preview', root, input, '--output', output);
  await fs.writeFile(path.join(root, 'a.md'), 'human edit');
  const stale = await run('check', root, output);
  assert.equal(stale.code, 2);
  assert.ok(JSON.parse(stale.stdout).issues.some(i => i.code === 'stale'));
  const plan = JSON.parse(await fs.readFile(output, 'utf8')); plan.changes = [];
  await fs.writeFile(output, JSON.stringify(plan));
  const tampered = await run('check', root, output);
  assert.equal(tampered.code, 2);
  assert.ok(JSON.parse(tampered.stdout).issues.some(i => i.code === 'invalid_plan'));
  assert.deepEqual(await fs.readdir(root), ['a.md']);
});

test('CLI output refuses existing files and destinations inside the workspace', async t => {
  const { root, input, output, base } = await fixture(t);
  await fs.writeFile(output, 'keep');
  assert.equal((await run('preview', root, input, '--output', output)).code, 1);
  assert.equal(await fs.readFile(output, 'utf8'), 'keep');
  assert.equal((await run('preview', root, input, '--output', path.join(root, 'preview.json'))).code, 1);
  const alias = path.join(base, 'alias');
  await fs.symlink(root, alias, 'junction');
  assert.equal((await run('preview', root, input, '--output', path.join(alias, 'preview.json'))).code, 1);
  assert.deepEqual(await fs.readdir(root), ['a.md']);
});

test('CLI rejects malformed operation files rather than silently organizing', async t => {
  const { root, input } = await fixture(t);
  for (const value of [null, {}, { operations: null }, { operations: [], title: 12 }]) {
    await fs.writeFile(input, JSON.stringify(value));
    const result = await run('preview', root, input);
    assert.equal(result.code, 1);
    assert.match(JSON.parse(result.stderr).error, /operations/);
  }
  const result = await run('preview', root, input, 'extra');
  assert.equal(result.code, 1);
  assert.equal((await run('--help')).code, 0);
  assert.deepEqual(await fs.readdir(root), ['a.md']);
});

test('CLI invalid operation preview is inspectable and returns exit code 2', async t => {
  const { root, input } = await fixture(t);
  await fs.writeFile(input, JSON.stringify({ operations: [{ kind: 'trash', path: 'missing.md' }] }));
  const result = await run('preview', root, input);
  assert.equal(result.code, 2);
  assert.ok(JSON.parse(result.stdout).issues.some(i => i.code === 'missing'));
  assert.deepEqual(await fs.readdir(root), ['a.md']);
});

test('CLI recovery preview shows changes and reports conflicts without restoring', async t => {
  const { root, input, output } = await fixture(t);
  await run('preview', root, input, '--output', output);
  const applied = JSON.parse((await run('apply', root, output)).stdout);
  const review = await run('restore-preview', root, applied.id);
  assert.equal(review.code, 0);
  assert.equal(JSON.parse(review.stdout).plan.result.files[0].content, 'original');
  assert.equal(await fs.readFile(path.join(root, 'a.md'), 'utf8'), '更新😀');
  await fs.writeFile(path.join(root, 'a.md'), 'human edit');
  const conflict = await run('restore-preview', root, applied.id);
  assert.equal(conflict.code, 2);
  assert.ok(JSON.parse(conflict.stdout).plan.issues.some(i => i.code === 'restore_conflict'));
  assert.equal(await fs.readFile(path.join(root, 'a.md'), 'utf8'), 'human edit');
});
