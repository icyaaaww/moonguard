import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { makeServer } from '../server.mjs';

async function fixture(t, real = false) {
  const parent = path.resolve(process.env.MOONGUARD_TEST_ROOT ?? os.tmpdir());
  await fs.mkdir(parent, { recursive: true });
  const directory = await fs.mkdtemp(path.join(parent, 'moonguard-http-'));
  const server = await makeServer(real ? { workspace: directory } : { demoRoot: directory });
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
  return { base, request };
}

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
