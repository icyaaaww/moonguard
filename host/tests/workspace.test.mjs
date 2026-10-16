import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { preview, apply, restore, previewRestore, history, readWorkspace, workspaceRoot } from '../workspace.mjs';
import { demoFiles } from '../demo.mjs';

test('unencodable text is rejected without creating files', async t => {
  const root = await fixture(t, []);
  const plan = await preview(root, [{ kind: 'create', path: 'invalid.txt', content: 'a\0b' }]);
  assert.ok(plan.issues.some(i => i.code === 'invalid_text'));
  await assert.rejects(apply(root, plan));
  for (const content of ['\ud800', '\udc00', '\ud800x']) {
    await assert.rejects(preview(root, [{ kind: 'create', path: 'invalid.txt', content }]), /JSON/);
  }
  assert.deepEqual((await readWorkspace(root)).files, []);
});

async function fixture(t, files = demoFiles) {
  const parent = path.resolve(process.env.MOONGUARD_TEST_ROOT ?? os.tmpdir());
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'moonguard-test-'));
  for (const f of files) { await fs.mkdir(path.dirname(path.join(root, f.path)), { recursive: true }); await fs.writeFile(path.join(root, f.path), f.content); }
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('moonguard-test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return workspaceRoot(root);
}

test('real files: preview changes nothing; apply + restore recovers exact bytes and folders', async t => {
  const root = await fixture(t);
  const before = await readWorkspace(root);
  const plan = await preview(root);
  assert.equal(plan.issues.length, 0);
  assert.deepEqual(await readWorkspace(root), before);
  const result = await apply(root, plan);
  assert.equal(result.state, 'committed');
  assert.match(await fs.readFile(path.join(root, 'README.md'), 'utf8'), /docs\/engineering\/architecture.md/);
  assert.equal(result.receipt.algorithm, 'SHA-256');
  await restore(root, result.id);
  assert.deepEqual(await readWorkspace(root), before);
  assert.equal((await restore(root, result.id)).alreadyRestored, true);
});

test('external modification after preview blocks every write', async t => {
  const root = await fixture(t);
  const plan = await preview(root);
  await fs.appendFile(path.join(root, 'README.md'), '\nhuman edit');
  const before = await readWorkspace(root);
  await assert.rejects(apply(root, plan), e => e.issues.some(i => i.code === 'stale'));
  assert.deepEqual(await readWorkspace(root), before);
});

test('restore conflict preserves user edits', async t => {
  const root = await fixture(t);
  const result = await apply(root, await preview(root));
  await fs.appendFile(path.join(root, 'README.md'), '\nhuman edit');
  const before = await readWorkspace(root);
  await assert.rejects(restore(root, result.id), e => e.issues.some(i => i.code === 'restore_conflict'));
  assert.deepEqual(await readWorkspace(root), before);
});

test('interrupted commit recovers after reloading durable journal', async t => {
  const root = await fixture(t);
  const before = await readWorkspace(root);
  let id;
  await assert.rejects(apply(root, await preview(root), { failAfter: 2 }), e => { id = e.transaction; return Boolean(id); });
  assert.equal((await history(root))[0].state, 'needs-recovery');
  await assert.rejects(apply(root, await preview(root)), /未完成事务/);
  await restore(root, id);
  assert.deepEqual(await readWorkspace(root), before);
});

test('failure before first file mutation is recoverable', async t => {
  const root = await fixture(t); const before = await readWorkspace(root); let id;
  await assert.rejects(apply(root, await preview(root), { failAfter: 0 }), e => { id = e.transaction; return Boolean(id); });
  assert.deepEqual(await readWorkspace(root), before);
  await restore(root, id); assert.deepEqual(await readWorkspace(root), before);
});

test('create write move trash with UTF-8 BOM and CRLF round trip', async t => {
  const root = await fixture(t, [{ path: '原稿.md', content: '\ufeff你好😀\r\n' }, { path: 'old.txt', content: 'archive' }]);
  const before = await readWorkspace(root);
  const plan = await preview(root, [
    { kind: 'move', path: '原稿.md', to: '资料/原稿.md', content: null },
    { kind: 'write', path: '资料/原稿.md', to: null, content: 'updated\r\n' },
    { kind: 'create', path: 'empty.txt', to: null, content: '' },
    { kind: 'trash', path: 'old.txt', to: null, content: null },
  ]);
  const result = await apply(root, plan); await restore(root, result.id);
  assert.deepEqual(await readWorkspace(root), before);
});

test('restore preserves unrelated additions', async t => {
  const root = await fixture(t);
  const result = await apply(root, await preview(root));
  await fs.writeFile(path.join(root, 'user.txt'), 'keep');
  await restore(root, result.id);
  assert.equal(await fs.readFile(path.join(root, 'user.txt'), 'utf8'), 'keep');
});

test('symlink directory escape and metadata symlink are refused', async t => {
  const root = await fixture(t); const outside = await fixture(t, [{ path: 'secret.txt', content: 'do not change' }]);
  await fs.symlink(outside, path.join(root, 'escape'), 'junction');
  const plan = await preview(root, [{ kind: 'create', path: 'escape/secret.txt', to: null, content: 'bad' }]);
  assert.ok(plan.issues.length);
  await assert.rejects(apply(root, plan));
  assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'do not change');
  await fs.rmdir(path.join(root, '.moonguard'));
  await fs.symlink(outside, path.join(root, '.moonguard'), 'junction');
  await assert.rejects(history(root), /元数据目录/);
});

test('hardlinks are opaque and cannot be overwritten', async t => {
  const root = await fixture(t, [{ path: 'source.md', content: 'original' }]);
  await fs.link(path.join(root, 'source.md'), path.join(root, 'linked.md'));
  const plan = await preview(root, [{ kind: 'write', path: 'linked.md', to: null, content: 'bad' }]);
  assert.ok(plan.issues.length); await assert.rejects(apply(root, plan));
  assert.equal(await fs.readFile(path.join(root, 'source.md'), 'utf8'), 'original');
});

test('untrusted plans cannot inject changes', async t => {
  const root = await fixture(t); const before = await readWorkspace(root);
  const plan = await preview(root); plan.changes.push({ path: '../secret.txt', before: null, after: 'bad' });
  await assert.rejects(apply(root, plan), e => e.issues.some(i => i.code === 'invalid_plan'));
  assert.deepEqual(await readWorkspace(root), before);
});

test('workspace lock prevents overlapping commits', async t => {
  const root = await fixture(t); const plan = await preview(root);
  const results = await Promise.allSettled([apply(root, plan), apply(root, plan)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter(r => r.status === 'rejected').length, 1);
});

test('all interruption positions of the sample transaction can be recovered', async t => {
  const root = await fixture(t); const before = await readWorkspace(root);
  const size = (await preview(root)).changes.length;
  for (let i = 0; i < size; i++) {
    let id;
    await assert.rejects(apply(root, await preview(root), { failAfter: i }), e => { id = e.transaction; return Boolean(id); });
    await restore(root, id);
    assert.deepEqual(await readWorkspace(root), before, `failure position ${i}`);
  }
});

test('portable directory casing is checked before any filesystem write', async t => {
  const root = await fixture(t, [{ path: 'Docs/a.md', content: 'keep' }]);
  const before = await readWorkspace(root);
  const plan = await preview(root, [{ kind: 'create', path: 'docs/b.md', content: 'new' }]);
  assert.ok(plan.issues.some(i => i.code === 'case_collision'));
  await assert.rejects(apply(root, plan));
  assert.deepEqual(await readWorkspace(root), before);
  assert.deepEqual(await history(root), []);
  const valid = await preview(root, [{ kind: 'create', path: 'Docs/b.md', content: 'new' }]);
  const result = await apply(root, valid);
  await restore(root, result.id);
  assert.deepEqual(await readWorkspace(root), before);
});

test('restore preview leaves files and journal untouched until explicit confirmation', async t => {
  const root = await fixture(t);
  const baseline = await readWorkspace(root);
  const result = await apply(root, await preview(root));
  const current = await readWorkspace(root);
  const journal = path.join(root, '.moonguard', result.id + '.json');
  const originalJournal = await fs.readFile(journal);
  const review = await previewRestore(root, result.id);
  assert.equal(review.plan.issues.length, 0);
  assert.deepEqual(Object.fromEntries(review.plan.result.files.map(f => [f.path, f.content])), Object.fromEntries(baseline.files.map(f => [f.path, f.content])));
  assert.deepEqual(await readWorkspace(root), current);
  assert.deepEqual(await fs.readFile(journal), originalJournal);
  await restore(root, result.id, { expectedPlan: review.plan });
  assert.deepEqual(await readWorkspace(root), baseline);
  assert.equal((await previewRestore(root, result.id)).alreadyRestored, true);
});

test('restore preview reports conflicts and confirmation rejects changed snapshots', async t => {
  const root = await fixture(t);
  const result = await apply(root, await preview(root));
  const review = await previewRestore(root, result.id);
  await fs.writeFile(path.join(root, 'new.txt'), 'unrelated addition');
  const before = await readWorkspace(root);
  await assert.rejects(restore(root, result.id, { expectedPlan: review.plan }), e => e.issues.some(i => i.code === 'restore_stale'));
  assert.deepEqual(await readWorkspace(root), before);
  await fs.appendFile(path.join(root, 'README.md'), '\nhuman edit');
  const conflict = await previewRestore(root, result.id);
  assert.ok(conflict.plan.issues.some(i => i.code === 'restore_conflict'));
  assert.deepEqual(conflict.plan.changes, []);
  assert.equal((await history(root))[0].state, 'committed');
});

test('interrupted transaction with no changed files can still be previewed and finalized', async t => {
  const root = await fixture(t);
  let id;
  await assert.rejects(apply(root, await preview(root), { failAfter: 0 }), e => { id = e.transaction; return Boolean(id); });
  const review = await previewRestore(root, id);
  assert.equal(review.plan.issues.length, 0);
  assert.equal(review.plan.changes.length, 0);
  assert.equal(review.alreadyRestored, false);
  await restore(root, id, { expectedPlan: review.plan });
  assert.equal((await history(root))[0].state, 'undone');
});
