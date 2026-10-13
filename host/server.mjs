import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { workspaceRoot, readWorkspace, preview, apply, restore, history, appendDemoEdit, GuardError } from './workspace.mjs';
import { createDemo } from './demo.mjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = new Map([['/', 'index.html'], ['/app.mjs', 'app.mjs'], ['/style.css', 'style.css'], ['/core.mjs', 'core.mjs'], ['/core-client.mjs', 'core-client.mjs']]);

async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new GuardError('需要 application/json');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 4 * 1024 * 1024) throw new GuardError('请求过大'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

export async function makeServer({ workspace = null, demoRoot = path.join(project, '.demo') } = {}) {
  const demo = !workspace;
  let root = workspace ? await workspaceRoot(workspace) : await createDemo(demoRoot);
  const token = randomBytes(24).toString('hex');
  let currentPlan = null;
  let planId = null;
  let planSource = null;
  let busy = false;
  const state = async () => ({ snapshot: await readWorkspace(root), workspace: root, demo, history: await history(root), plan: currentPlan, planId, planSource });
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
        if (req.method === 'GET' && url.pathname === '/api/session') return send(200, await state());
        if (req.method !== 'POST') return send(405, { error: '方法不受支持' });
        if (busy) return send(409, { error: '正在完成上一个操作' });
        busy = true; ownsBusy = true;
        const input = await body(req);
        let result = null;
        if (url.pathname === '/api/preview') {
          currentPlan = await preview(root, input.operations ?? null, input.title ?? '导入的操作计划');
          planSource = input.operations == null ? 'organize' : 'import';
          planId = randomBytes(16).toString('hex');
        } else if (url.pathname === '/api/apply') {
          if (!currentPlan || input.planId !== planId) throw new GuardError('预演编号已过期，请重新预演');
          if (input.failAfter !== undefined && !demo) throw new GuardError('故障注入仅用于示例工作区');
          const failAfter = input.failAfter === 2 && demo ? 2 : -1;
          result = await apply(root, currentPlan, { failAfter });
          currentPlan = null; planId = null;
        } else if (url.pathname === '/api/restore') {
          result = await restore(root, input.id); currentPlan = null; planId = null;
        } else if (url.pathname === '/api/demo-edit') {
          if (!demo) throw new GuardError('仅能修改隔离的演示资料');
          await appendDemoEdit(root, 'README.md');
          result = { edited: 'README.md' };
        } else if (url.pathname === '/api/demo-reset') {
          if (!demo) throw new GuardError('真实工作区不支持重置');
          root = await createDemo(demoRoot); currentPlan = null; planId = null;
        } else return send(404, { error: '接口不存在' });
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
