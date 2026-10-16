import { core } from './core-client.mjs';
import { initStudy } from './study.mjs';
import { initComposer } from './composer.mjs';

const $ = id => document.getElementById(id);
const token = document.querySelector('meta[name="moonguard-token"]').content;
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
let session = null;
let selected = 'README.md';
let afterView = false;
let busy = false;
let imported = null;
let lastIssues = [];
let validationOk = false;
let restored = false;
let restoreReview = null;
const study = initStudy();
const composer = initComposer({ getFiles: () => session?.snapshot.files ?? [], submit: value => { imported = value; action(doPreview); } });
let actionGeneration = 0;
const stateLabel = { committed: '已执行 · 可检查恢复', undone: '已恢复', prepared: '等待恢复', committing: '执行中断', undoing: '恢复中断', 'needs-recovery': '需要恢复' };

async function api(endpoint, data) {
  const response = await fetch(`/api/${endpoint}`, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'x-moonguard-token': token, ...(data === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const payload = await response.json();
  if (data !== undefined) study.record(endpoint, response.ok, payload, Boolean(session?.demo));
  if (!response.ok) throw Object.assign(new Error(payload.error), payload);
  return payload;
}

function message(text, error = false, issues = []) {
  $('message').hidden = !text;
  $('message').className = `message${error ? ' error' : ''}`;
  $('message').innerHTML = `<strong>${escape(text)}</strong>${issues.length ? `<ul>${issues.slice(0, 8).map(i => `<li>${escape(i.path || '工作区')} · ${escape(i.message)}</li>`).join('')}</ul>` : ''}`;
}

async function action(fn) {
  if (busy) return;
  actionGeneration++;
  busy = true; renderButtons();
  try { await fn(); }
  catch (e) {
    lastIssues = e.issues ?? []; validationOk = false;
    message(e.message, true, lastIssues);
    try { session = await api('session'); } catch { /* Keep the visible last known state. */ }
  } finally { busy = false; render(); }
}

function pending() { return session?.history.find(h => !['committed', 'undone'].includes(h.state)); }
function latestRecoverable() { return pending() ?? session?.history.find(h => h.state === 'committed'); }

function renderButtons() {
  const plan = session?.plan;
  const ready = plan && plan.changes.length && !plan.issues.length && validationOk && !pending();
  $('preview').disabled = busy || !session || Boolean(pending());
  $('apply').disabled = busy || !ready;
  $('fault').disabled = busy || !ready || !session?.demo;
  $('restore').disabled = busy || !latestRecoverable();
  $('restore').textContent = pending() ? '↶ 恢复中断的事务' : '↶ 恢复上一次操作';
  $('simulate').disabled = busy || !session?.demo;
  $('reset').disabled = busy;
  $('refresh').disabled = busy;
  $('import').disabled = busy || Boolean(pending());
  $('compose').disabled = busy || !session || Boolean(pending());
  $('organize').disabled = busy || !session || Boolean(pending());
  $('open-workspace').disabled = busy || !session || Boolean(pending());
  $('open-workspace').hidden = Boolean(session?.externalClient);
  $('export').disabled = !plan || busy;
  $('apply').textContent = busy ? '正在处理…' : '确认并执行 →';
  $('decline').hidden = !plan || session?.planSource !== 'mcp';
  $('decline').disabled = busy;
}

function renderTree() {
  const snapshot = afterView && session.plan ? session.plan.result : session.snapshot;
  const files = [...snapshot.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  $('file-count').textContent = `${files.length} FILES`;
  $('tab-current').classList.toggle('selected', !afterView);
  $('tab-after').classList.toggle('selected', afterView);
  $('tab-after').disabled = !session.plan;
  const changed = new Set(session.plan?.changes.map(c => c.path) ?? []);
  let lastFolder = '';
  $('file-tree').innerHTML = files.map(file => {
    const parts = file.path.split('/'); const name = parts.pop(); const folder = parts.join('/');
    const header = folder && folder !== lastFolder ? `<div class="folder-row">⌄ ${escape(folder)}/</div>` : '';
    lastFolder = folder;
    return header + `<button class="tree-item${selected === file.path ? ' selected' : ''}" data-file="${escape(file.path)}" title="${escape(file.path)}"><span class="file-icon">≡</span><span class="filename">${escape(name)}</span>${changed.has(file.path) ? '<i class="dot"></i>' : ''}</button>`;
  }).join('') || '<div class="empty-file">这个视图中没有文本文件</div>';
  for (const button of $('file-tree').querySelectorAll('[data-file]')) button.addEventListener('click', () => { selected = button.dataset.file; renderTree(); renderDiff(); });
  $('tree-note').textContent = afterView ? '预演结果 · 尚未写入文件' : `${snapshot.blocked.length ? `${snapshot.blocked.length} 项不参与操作` : '文件保存在本地工作区'}`;
}

function fileContent(snapshot, name) { return snapshot?.files.find(f => f.path === name)?.content ?? null; }

function renderDiff() {
  const p = session.plan;
  let oldPath = selected, newPath = selected;
  const move = p?.operations.find(op => op.kind === 'move' && (op.path === selected || op.to === selected));
  if (move) { oldPath = move.path; newPath = move.to; }
  const before = fileContent(p?.baseline ?? session.snapshot, oldPath);
  const after = fileContent(p?.result ?? session.snapshot, newPath);
  $('selected-file').textContent = move ? `${oldPath} → ${newPath}` : selected;
  $('selected-file').title = $('selected-file').textContent;
  $('diff-badge').textContent = !p ? '当前内容' : move ? '移动' : before === after ? '未改变' : before === null ? '新增' : after === null ? '回收' : '内容更新';
  const a = before === null ? [] : before.split('\n'), b = after === null ? [] : after.split('\n');
  const content = (lines, other, side, missing) => {
    if (missing) return '<div class="empty-file">此位置没有文件</div>';
    const limited = lines.slice(0, 400);
    return limited.map((line, i) => `<div class="code-line${p && line !== other[i] ? ` ${side}` : ''}"><span class="line-number">${i+1}</span><span>${escape(line) || ' '}</span></div>`).join('') + (lines.length > 400 ? '<div class="empty-file">仅显示前 400 行；完整内容见导出的计划。</div>' : '');
  };
  $('diff').innerHTML = `<div class="code-pane">${content(a,b,'remove',before === null)}</div><div class="code-pane">${content(b,a,'add',after === null)}</div>`;
  $('diff-note').textContent = p ? '逐行对照 · 预演使用与执行相同的 MoonBit 核心' : '选择文件，查看内容与计划中的变化。';
}

function renderReview() {
  const p = session.plan;
  const issues = lastIssues.length ? lastIssues : p?.issues ?? [];
  const interrupted = pending();
  const last = session.history[0];
  let title = '等待预演', detail = '先生成计划，再检查每一处变化。', icon = '◌', mode = '';
  if (interrupted) { title = '事务等待恢复'; detail = '原始内容已记录，点击恢复检查当前文件。'; icon = '↶'; mode = 'bad'; }
  else if (issues.length) { title = '发现冲突'; detail = '先检查冲突文件，再重新生成预演。'; icon = '!'; mode = 'bad'; }
  else if (p && p.changes.length && validationOk) { title = '计划可以执行'; detail = '浏览器和本地执行器的预演结果一致。'; icon = '✓'; mode = 'good'; }
  else if (p && !p.changes.length) { title = '无需修改'; detail = '这份计划没有产生文件变化。按主题归档仅处理受支持的 category 文档；也可新建自定义操作。'; icon = '✓'; mode = 'good'; }
  else if (restored || last?.state === 'undone') { title = '恢复完成'; detail = '受影响文件的路径与内容已校验。'; icon = '↶'; mode = 'good'; }
  else if (last?.state === 'committed') { title = '变更已执行'; detail = '原始内容已保存，可以检查恢复。'; icon = '✓'; mode = 'good'; }
  $('review-state').className = `review-state ${mode}`;
  $('review-state').innerHTML = `<span class="review-symbol">${icon}</span><h3>${title}</h3><p>${detail}</p>`;
  $('metric-move').textContent = p ? p.operations.filter(o => o.kind === 'move').length.toString().padStart(2,'0') : '—';
  $('metric-write').textContent = p ? p.operations.filter(o => o.kind === 'write').length.toString().padStart(2,'0') : '—';
  $('metric-other').textContent = p ? p.operations.filter(o => ['create','trash'].includes(o.kind)).length.toString().padStart(2,'0') : '—';
  $('checks').innerHTML = [`工作目录边界`, `路径与覆盖冲突`, `执行前重新校验`].map((s,i) => `<p><span>${p && !issues.length && i < 2 ? '✓' : '○'}</span>${s}</p>`).join('');
  $('review-footnote').textContent = p ? '执行时将再次核对文件，过期计划会被拒绝。' : '预演不会修改你的文件。';
  $('step-preview').className = `step ${p || last ? 'done' : 'current'}`;
  $('step-apply').className = `step ${last?.state === 'committed' ? 'done' : p && !issues.length ? 'current' : ''}`;
  $('step-restore').className = `step ${last?.state === 'undone' ? 'done' : interrupted ? 'current' : ''}`;
}

function renderHistory() {
  $('history-count').textContent = session.history.length;
  $('history-list').innerHTML = session.history.length ? session.history.map(entry => `<article class="history-entry"><div><span class="history-state">${stateLabel[entry.state] ?? escape(entry.state)}</span><h3>${escape(entry.title)}</h3><p>${new Date(entry.created).toLocaleString('zh-CN')} · ${entry.changedPaths} 个文件路径</p><code>${escape(entry.id)}</code>${entry.receipt ? '<p>已生成 SHA-256 内容校验记录</p>' : ''}</div><button data-restore="${escape(entry.id)}" ${entry.state === 'undone' || busy ? 'disabled' : ''}>${entry.state === 'undone' ? '已恢复' : '检查并恢复 ↶'}</button></article>`).join('') : '<div class="history-empty">还没有执行记录。先在工作台生成一份预演。</div>';
  for (const button of $('history-list').querySelectorAll('[data-restore]')) button.addEventListener('click', () => doRestore(button.dataset.restore));
}

function render() {
  if (!session) { renderButtons(); return; }
  if (!session.plan && !session.snapshot.files.some(f => f.path === selected)) selected = session.snapshot.files[0]?.path ?? '';
  $('workspace-name').textContent = session.demo ? 'Orbit · 示例知识库' : '本地工作区';
  $('workspace-info').textContent = session.demo ? '隔离的示例文件，可自由体验预演、冲突与恢复。' : session.workspace;
  $('workspace-info').title = session.workspace;
  $('demo-lab').hidden = !session.demo;
  $('blocked-count').textContent = `（${session.snapshot.blocked.length} 项未参与）`;
  $('blocked-list').innerHTML = session.snapshot.blocked.slice(0, 100).map(name => `<li>${escape(name)}</li>`).join('') + (session.snapshot.blocked.length > 100 ? '<li>仅显示前 100 项</li>' : '');
  $('task-title').textContent = session.plan?.title ?? imported?.title ?? '按主题归档文档，并更新本地链接';
  $('planner-caption').textContent = session.planSource === 'mcp' && session.plan ? 'MCP 外部工具提案 · 等待你检查并执行' : imported ? '自定义文件计划 · 请逐项检查路径和内容' : '按文档 category 分类 · 无需模型密钥';
  $('status-line').textContent = `${session.snapshot.files.length} 个文本文件 · ${session.demo ? '隔离示例目录' : '本地目录'} · ${session.externalClient ? 'MCP 客户端可读取文件内容' : '不上传文件内容'}`;
  renderTree(); renderDiff(); renderReview(); renderHistory(); renderButtons();
}

function switchView(view) {
  $('workspace-view').hidden = view !== 'workspace'; $('history-view').hidden = view !== 'history';
  $('study-view').hidden = view !== 'study';
  $('breadcrumb').textContent = {workspace:'变更工作台',history:'恢复记录',study:'试用记录'}[view];
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
}

async function doPreview() {
  lastIssues = []; restored = false;
  session = await api('preview', imported ?? {});
  const local = imported ? core('plan', { snapshot: session.plan.baseline, operations: imported.operations, title: imported.title }) : core('organize', { snapshot: session.plan.baseline });
  validationOk = JSON.stringify(local) === JSON.stringify(session.plan);
  if (!validationOk) throw new Error('浏览器与执行器预演不一致，已阻止执行');
  lastIssues = session.plan.issues;
  afterView = false; selected = 'README.md';
  if (!session.plan.baseline.files.some(f => f.path === selected)) selected = session.plan.baseline.files[0]?.path ?? session.plan.result.files[0]?.path ?? '';
  message(lastIssues.length ? '计划未通过检查，原文件没有改变。' : session.plan.changes.length ? `预演已就绪：${session.plan.operations.length} 个操作，涉及 ${session.plan.changes.length} 个文件路径。原文件没有改变。` : '当前任务无需修改文件。', Boolean(lastIssues.length), lastIssues);
}

function doRestore(id) {
  return action(async () => {
    restoreReview = null; $('restore-confirm').disabled = true;
    session = await api('restore-preview', { id });
    const review = session.result;
    restoreReview = review;
    const issues = review.plan?.issues ?? [];
    const changes = review.plan?.changes ?? [];
    $('restore-summary').textContent = review.alreadyRestored ? '这次操作已恢复，无需重复执行。' : issues.length ? '存在冲突，不能恢复。请先检查并处理下列问题。' : changes.length ? `将恢复 ${changes.length} 个文件路径。展开每一项查看当前内容和恢复结果；确认之前不会修改文件。` : '文件已处于原始状态；确认后将完成事务恢复记录。';
    $('restore-issues').innerHTML = issues.map(i => `<li>${escape(i.path || '工作区')} · ${escape(i.message)}</li>`).join('');
    const content = value => value === null ? '<em>此位置没有文件</em>' : `<pre>${escape(value.slice(0, 8000))}</pre>${value.length > 8000 ? '<p>仅显示前 8000 个字符，请使用 CLI restore-preview 查看完整计划。</p>' : ''}`;
    $('restore-changes').innerHTML = changes.map(c => `<details><summary>${escape(c.path)} · ${c.before === null ? '恢复文件' : c.after === null ? '移除本次新增文件' : '还原内容'}</summary><h3>当前内容</h3>${content(c.before)}<h3>恢复结果</h3>${content(c.after)}</details>`).join('');
    $('restore-confirm').disabled = review.alreadyRestored || issues.length > 0;
    $('restore-dialog').showModal();
  });
}

$('restore-confirm').addEventListener('click', () => {
  if (!restoreReview || busy) return;
  const review = restoreReview;
  $('restore-confirm').disabled = true;
  action(async () => {
    try {
      session = await api('restore', { id: review.id, reviewId: review.reviewId });
    } catch (e) {
      $('restore-summary').textContent = e.message + '。请关闭此窗口并重新预演恢复。';
      restoreReview = null;
      throw e;
    }
    restoreReview = null; $('restore-dialog').close(); switchView('workspace');
    validationOk = false; lastIssues = []; restored = true; afterView = false; selected = 'README.md';
    message(session.result.alreadyRestored ? '这次操作已恢复，无需重复执行。' : `恢复完成，已校验 ${session.result.verifiedPaths} 个受影响文件路径。`);
  });
});

$('preview').addEventListener('click', () => action(doPreview));
$('organize').addEventListener('click', () => { imported = null; action(doPreview); });
$('compose').addEventListener('click', () => composer.open(selected));
$('open-workspace').addEventListener('click', () => { $('workspace-error').textContent = ''; $('workspace-dialog').showModal(); });
$('workspace-submit').addEventListener('click', async () => {
  if (busy) return;
  $('workspace-submit').disabled = true;
  await action(async () => {
    try {
      session = await api('workspace', { path: $('workspace-path').value.trim().replace(/^"(.*)"$/, '$1') });
    } catch (error) { $('workspace-error').textContent = error.message; throw error; }
    imported = null; validationOk = false; lastIssues = []; afterView = false; restored = false;
    composer.reset(); $('workspace-dialog').close(); switchView('workspace');
    message('资料目录已打开。点击“新建操作”安排文件变更，检查预演后再执行。');
  });
  $('workspace-submit').disabled = false;
});
$('apply').addEventListener('click', () => action(async () => {
  session = await api('apply', { planId: session.planId });
  composer.reset();
  afterView = false; lastIssues = []; validationOk = false;
  message('变更已执行。原始内容已保存，内容校验记录已生成。');
}));
$('restore').addEventListener('click', () => { const target = latestRecoverable(); if (target) doRestore(target.id); });
$('decline').addEventListener('click', () => action(async () => {
  session = await api('decline', { planId: session.planId }); imported=null;validationOk=false;lastIssues=[];afterView=false;
  message('已拒绝这份提案，文件没有改变。');
}));
$('simulate').addEventListener('click', () => action(async () => {
  session = await api('demo-edit', {}); selected = 'README.md'; afterView = false;
  message('已在 README.md 添加一段模拟人工编辑。尝试执行或恢复，验证系统是否保护这段内容。');
}));
$('fault').addEventListener('click', () => action(async () => {
  session = await api('apply', { planId: session.planId, failAfter: 2 });
}));
$('reset').addEventListener('click', () => action(async () => {
  session = await api('demo-reset', {}); imported = null; lastIssues = []; validationOk = false; restored = false; afterView = false; selected = 'README.md';
  composer.reset();
  message('已创建新的示例工作区。上一份示例文件仍保留在本地。');
}));
$('refresh').addEventListener('click', () => action(async () => { session = await api('session'); message('已刷新当前文件。已有计划在执行时仍会重新校验。'); }));
$('tab-current').addEventListener('click', () => { afterView = false; renderTree(); });
$('tab-after').addEventListener('click', () => { afterView = true; renderTree(); });
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
$('guide').addEventListener('click', () => $('guide-dialog').showModal());
$('import').addEventListener('click', () => { $('import-error').textContent = ''; $('import-dialog').showModal(); });
document.querySelectorAll('.close-dialog').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('import-submit').addEventListener('click', () => {
  try {
    const value = JSON.parse($('import-json').value);
    if (!Array.isArray(value.operations) || !value.operations.length) throw new Error('需要一个非空 operations 数组');
    imported = { title: typeof value.title === 'string' ? value.title : '导入的操作计划', operations: value.operations };
    $('import-dialog').close(); action(doPreview);
  } catch (e) { $('import-error').textContent = e.message; }
});
$('export').addEventListener('click', () => {
  if (!session.plan) return;
  const blob = new Blob([JSON.stringify(session.plan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'moonguard-preview.json'; a.click(); URL.revokeObjectURL(url);
});

action(async () => {
  session = await api('session');
  if (session.plan) {
    const p = session.plan;
    if (['import','mcp'].includes(session.planSource)) imported = { title: p.title, operations: p.operations };
    validationOk = JSON.stringify(core('plan', { snapshot: p.baseline, operations: p.operations, title: p.title })) === JSON.stringify(p);
    if (!validationOk) throw new Error('浏览器与执行器预演不一致，已阻止执行');
  }
});

// Poll only a revision number. Fetch contents only when the shared session changes.
let syncing = false;
setInterval(async () => {
  if (busy || syncing || document.hidden || !session) return;
  syncing = true;
  try {
    const generation = actionGeneration;
    const version = await api('revision');
    if (version.busy || version.revision === session.revision || busy) return;
    const next = await api('session');
    if (busy || generation !== actionGeneration) return;
    session = next;
    imported = session.plan && ['import','mcp'].includes(session.planSource) ? { title: session.plan.title, operations: session.plan.operations } : null;
    validationOk = session.plan ? JSON.stringify(core('plan', { snapshot: session.plan.baseline, operations: session.plan.operations, title: session.plan.title })) === JSON.stringify(session.plan) : false;
    lastIssues = []; afterView = false;
    message(session.planSource === 'mcp' && session.plan ? '收到外部工具提案。请检查文件变化，再决定是否执行。' : '工作区状态已更新。');
    render();
  } catch { /* Retry on the next tick; never enable execution from a failed sync. */ }
  finally { syncing = false; }
}, 2000);
