import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { makeServer } from '../server.mjs';

async function fixture(t, real = false, externalClient = false) {
  const parent = path.resolve(process.env.MOONGUARD_TEST_ROOT ?? os.tmpdir());
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'moonguard-http-'));
  const server = await makeServer({ ...(real ? { workspace: directory } : { demoRoot: directory }), externalClient });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(path.resolve(directory)), parent);
    assert.ok(path.basename(directory).startsWith('moonguard-http-'));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const html = await (await fetch(base)).text();
  const token = html.match(/name="moonguard-token" content="([^"]+)"/)?.[1];
  assert.ok(token);
  const request = async (endpoint, data, headers = {}) => {
    const response = await fetch(base + endpoint, {
      method: data === undefined ? 'GET' : 'POST',
      headers: { 'x-moonguard-token': token, 'content-type': 'application/json', ...headers },
      ...(data === undefined ? {} : { body: typeof data === 'string' ? data : JSON.stringify(data) }),
    });
    return { status: response.status, value: await response.json() };
  };
  return { base, request, directory };
}

test('workspace switch invalidates old plans, preserves files, and can reopen recovery history', async t => {
  const { request, directory } = await fixture(t);
  const original = (await request('/api/session')).value;
  const proposal = (await request('/api/preview', {})).value;
  const target = path.join(directory, 'real-notes');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, '我的资料.md'), '# 我的资料\r\n', 'utf8');
  assert.equal((await request('/api/workspace', { path: 'relative' })).status, 409);
  assert.notEqual((await request('/api/workspace', { path: path.join(target, 'missing') })).status, 200);
  assert.equal((await request('/api/session')).value.workspace, original.workspace);
  const opened = await request('/api/workspace', { path: target });
  assert.equal(opened.status, 200); assert.equal(opened.value.demo, false); assert.equal(opened.value.plan, null);
  assert.equal((await request('/api/apply', { planId: proposal.planId })).status, 409);
  const newPlan = (await request('/api/preview', { operations: [{kind:'move',path:'我的资料.md',to:'归档/资料.md'}] })).value;
  const result = (await request('/api/apply', { planId: newPlan.planId })).value.result;
  assert.equal(await fs.readFile(path.join(target, '归档/资料.md'), 'utf8'), '# 我的资料\r\n');
  await request('/api/workspace', { path: original.workspace });
  const reopened = (await request('/api/workspace', { path: target })).value;
  assert.equal(reopened.history[0].id, result.id);
  assert.equal((await request('/api/restore', { id: result.id })).status, 200);
  assert.equal(await fs.readFile(path.join(target, '我的资料.md'), 'utf8'), '# 我的资料\r\n');
});

test('workspace switch cannot abandon pending transactions or expand an MCP session', async t => {
  const local = await fixture(t);
  const plan = (await local.request('/api/preview', {})).value;
  await local.request('/api/apply', { planId: plan.planId, failAfter: 2 });
  assert.equal((await local.request('/api/workspace', { path: local.directory })).status, 409);
  const mcp = await fixture(t, false, true);
  assert.equal((await mcp.request('/api/workspace', { path: mcp.directory })).status, 409);
});

test('HTTP rejects missing session token, foreign Origin and foreign Host', async t => {
  const { base, request } = await fixture(t);
  assert.equal((await fetch(base + '/api/session')).status, 403);
  assert.equal((await request('/api/preview', {}, { origin: 'https://example.com' })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    http.get(base, { headers: { host: 'example.com' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await request('/api/session')).status, 200);
});

test('HTTP rejects malformed body and stale plan IDs, then completes apply/restore', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/api/preview', '{broken')).status, 400);
  assert.equal((await request('/api/preview', {}, { 'content-type': 'text/plain' })).status, 409);
  const first = await request('/api/preview', {});
  const second = await request('/api/preview', {});
  assert.notEqual(first.value.planId, second.value.planId);
  assert.equal((await request('/api/apply', { planId: first.value.planId })).status, 409);
  const applied = await request('/api/apply', { planId: second.value.planId });
  assert.equal(applied.status, 200);
  assert.equal(applied.value.result.state, 'committed');
  const restored = await request('/api/restore', { id: applied.value.result.id });
  assert.equal(restored.value.result.state, 'undone');
  assert.deepEqual(restored.value.snapshot, first.value.plan.baseline);
});

test('HTTP exposes interrupted transaction and supports recovery', async t => {
  const { request } = await fixture(t);
  const p = await request('/api/preview', {});
  const failed = await request('/api/apply', { planId: p.value.planId, failAfter: 2 });
  assert.equal(failed.status, 409);
  assert.ok(failed.value.transaction);
  assert.equal((await request('/api/session')).value.history[0].state, 'needs-recovery');
  const recovered = await request('/api/restore', { id: failed.value.transaction });
  assert.equal(recovered.value.result.state, 'undone');
  assert.deepEqual(recovered.value.snapshot, p.value.plan.baseline);
});

test('real workspace disallows demo edits, reset and fault injection', async t => {
  const { request } = await fixture(t, true);
  for (const endpoint of ['/api/demo-edit', '/api/demo-reset']) assert.equal((await request(endpoint, {})).status, 409);
  const p = await request('/api/preview', { operations: [{ kind: 'create', path: 'new.md', content: 'hello' }] });
  assert.equal((await request('/api/apply', { planId: p.value.planId, failAfter: 2 })).status, 409);
  assert.equal((await request('/api/session')).value.snapshot.files.length, 0);
});

test('HTTP restore review checks identity, previews without writing, and confirms once', async t => {
  const { request } = await fixture(t);
  const p = await request('/api/preview', {});
  const applied = await request('/api/apply', { planId: p.value.planId });
  const id = applied.value.result.id;
  const review = await request('/api/restore-preview', { id });
  assert.equal(review.status, 200);
  assert.deepEqual(review.value.snapshot, applied.value.snapshot);
  assert.deepEqual(review.value.history, applied.value.history);
  assert.equal(review.value.result.plan.issues.length, 0);
  assert.equal((await request('/api/restore', { id, reviewId: 'wrong' })).status, 409);
  const restored = await request('/api/restore', { id, reviewId: review.value.result.reviewId });
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.value.snapshot, p.value.plan.baseline);
  assert.equal((await request('/api/restore', { id, reviewId: review.value.result.reviewId })).status, 409);
});

test('HTTP restore confirmation refuses an intervening manual edit', async t => {
  const { request } = await fixture(t);
  const p = await request('/api/preview', {});
  const applied = await request('/api/apply', { planId: p.value.planId });
  const id = applied.value.result.id;
  const review = await request('/api/restore-preview', { id });
  const edited = await request('/api/demo-edit', {});
  const rejected = await request('/api/restore', { id, reviewId: review.value.result.reviewId });
  assert.equal(rejected.status, 409);
  assert.ok(rejected.value.issues.some(i => i.code === 'restore_conflict'));
  assert.deepEqual((await request('/api/session')).value.snapshot, edited.value.snapshot);
});
