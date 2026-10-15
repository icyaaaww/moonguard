import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { JSDOM } from 'jsdom';
import { makeServer } from '../../host/server.mjs';

test('workbench forms open a directory, preview four operations, apply and restore exact contents', async t => {
  const parent = path.resolve(os.tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'moonguard-ui-'));
  const workspace = path.join(root, '我的资料');
  await fs.mkdir(workspace);
  const originals = { 'a.md': '# A\r\n', 'b.txt': '\uFEFForiginal\n', 'old.json': '{"old":true}\n' };
  for (const [name, content] of Object.entries(originals)) await fs.writeFile(path.join(workspace, name), content);
  await fs.writeFile(path.join(workspace, 'ignored.bin'), Buffer.from([0, 1, 2]));
  const server = await makeServer({ demoRoot: path.join(root, 'demo') });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const nativeFetch = globalThis.fetch, nativeInterval = globalThis.setInterval;
  for (const asset of ['/app.mjs', '/composer.mjs', '/style.css', '/core.mjs', '/study.mjs']) assert.equal((await nativeFetch(url + asset)).status, 200);
  const dom = new JSDOM(await (await nativeFetch(url)).text(), { url });
  const previousDocument = globalThis.document, previousWindow = globalThis.window;
  globalThis.document = dom.window.document; globalThis.window = dom.window;
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  globalThis.fetch = (input, options) => nativeFetch(new URL(input, url), options);
  const timers = [];
  globalThis.setInterval = (...args) => { const timer = nativeInterval(...args); timers.push(timer); return timer; };
  t.after(async () => {
    timers.forEach(clearInterval); globalThis.fetch = nativeFetch; globalThis.setInterval = nativeInterval;
    globalThis.document = previousDocument; globalThis.window = previousWindow; dom.window.close();
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    assert.equal(path.dirname(root), parent); assert.ok(path.basename(root).startsWith('moonguard-ui-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  const $ = id => dom.window.document.getElementById(id);
  const wait = async predicate => {
    for (let n = 0; n < 200; n++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error(`UI did not settle: ${$('message').textContent}`);
  };
  await import('../../web/app.mjs');
  await wait(() => !$('compose').disabled);
  $('open-workspace').click(); $('workspace-path').value = workspace; $('workspace-submit').click();
  await wait(() => !$('workspace-dialog').open);
  assert.equal($('workspace-info').textContent, await fs.realpath(workspace));
  assert.equal($('demo-lab').hidden, true);
  assert.match($('blocked-list').textContent, /ignored.bin/);
  $('compose').click();
  const add = (kind, file, extra) => {
    $('operation-kind').value = kind; $('operation-kind').dispatchEvent(new dom.window.Event('change'));
    $('operation-path').value = file;
    if (kind === 'move') $('operation-to').value = extra;
    if (kind === 'write') { $('operation-load').click(); assert.equal($('operation-content').value, originals[file]); }
    if (['write', 'create'].includes(kind)) $('operation-content').value = extra;
    $('operation-add').click();
  };
  add('move', 'a.md', '归档/a.md'); add('write', 'b.txt', 'updated\n');
  add('create', 'new.md', '# New\n'); add('trash', 'old.json');
  assert.equal($('operation-list').children.length, 4);
  $('operation-preview').click(); await wait(() => !$('apply').disabled);
  for (const [name, content] of Object.entries(originals)) assert.equal(await fs.readFile(path.join(workspace, name), 'utf8'), content);
  assert.match($('message').textContent, /预演已就绪/);
  $('apply').click(); await wait(() => !$('restore').disabled && /变更已执行/.test($('message').textContent));
  assert.equal(await fs.readFile(path.join(workspace, '归档/a.md'), 'utf8'), originals['a.md']);
  assert.equal(await fs.readFile(path.join(workspace, 'b.txt'), 'utf8'), 'updated\n');
  assert.equal(await fs.readFile(path.join(workspace, 'new.md'), 'utf8'), '# New\n');
  await assert.rejects(fs.access(path.join(workspace, 'old.json')));
  $('restore').click(); await wait(() => /恢复完成/.test($('message').textContent));
  for (const [name, content] of Object.entries(originals)) assert.equal(await fs.readFile(path.join(workspace, name), 'utf8'), content);
  await assert.rejects(fs.access(path.join(workspace, 'new.md')));
  assert.deepEqual(await fs.readFile(path.join(workspace, 'ignored.bin')), Buffer.from([0, 1, 2]));
});
