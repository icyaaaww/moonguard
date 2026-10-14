export const tasks = [
  { id: 'preview', title: '看懂归档变化', instruction: '新建示例工作区，生成预演。查看 README 与归档后的文件树，向观察者说明会移动哪些文件、链接会如何变化。先不要执行。', evidence: ['preview_ok'] },
  { id: 'stale', title: '识别过期计划', instruction: '新建示例工作区，生成预演，再模拟用户修改。尝试执行，说明为什么被拒绝、人工修改是否保留。', evidence: ['preview_ok','demo_edit_ok','apply_stale'] },
  { id: 'restore', title: '执行并恢复', instruction: '新建示例工作区，预演并执行归档，再恢复。检查文件路径和内容，向观察者说明恢复的结果。', evidence: ['apply_ok','restore_ok'] },
  { id: 'interruption', title: '处理中断', instruction: '新建示例工作区，生成预演，在第 2 步后中断，然后恢复。说明中断后的状态及恢复依据。', evidence: ['apply_interrupted','restore_ok'] },
];
export const feedbackOptions = ['没有明显障碍','不理解预演结果','不理解冲突提示','找不到恢复入口','不知道哪些文件受影响','等待太久','需要更完整的 Markdown 支持','其他（另向观察者说明）'];
export function evidenceFor(task, events) {
  let index=0;
  for(const event of events){
    if(!event.demo)continue;
    if(event.kind==='demo_reset_ok')index=0;
    if(event.kind===task.evidence[index])index++;
  }
  return index===task.evidence.length;
}
export function validateRecord(value) {
  const bad = message => { throw new Error(message); };
  if (!value || value.schema !== 1 || value.product !== 'moonguard' || !['practice','participant'].includes(value.source)) bad('不支持的试用记录格式');
  if (typeof value.sessionId !== 'string' || !/^[a-f0-9-]{36}$/.test(value.sessionId)) bad('缺少会话编号');
  if (!/^P\d{2,4}$/.test(value.participantCode) || value.consent !== true) bad('缺少匿名编号或试用同意');
  if (typeof value.started !== 'string' || !Number.isFinite(Date.parse(value.started))) bad('缺少开始时间');
  if (!Array.isArray(value.tasks) || value.tasks.length > tasks.length || !Array.isArray(value.feedback) || value.feedback.some(f => !feedbackOptions.includes(f))) bad('试用任务或反馈不合法');
  const ids = new Set();
  for (const row of value.tasks) {
    const definition = tasks.find(t => t.id === row.id);
    if (!definition || ids.has(row.id) || !['completed','assisted','failed','skipped'].includes(row.outcome)) bad('任务编号或结果不合法');
    ids.add(row.id);
    if (!Number.isFinite(row.elapsedMs) || row.elapsedMs < 0 || row.elapsedMs > 86400000 || !Number.isInteger(row.ease) || row.ease < 1 || row.ease > 5) bad('任务时长或评分不合法');
    if (!Array.isArray(row.events) || row.events.length > 200) bad('任务事件过多');
    for (const e of row.events) if (!['preview_ok','demo_edit_ok','apply_ok','apply_stale','apply_interrupted','restore_ok','demo_reset_ok'].includes(e.kind) || typeof e.demo !== 'boolean' || !Number.isFinite(e.offsetMs) || e.offsetMs < 0 || e.offsetMs > row.elapsedMs) bad('任务事件不合法');
  }
  // Return an allowlisted structure: exclude any unexpected free text/content.
  return { schema: 1, product: 'moonguard', version: '0.2.0', sessionId: value.sessionId, source: value.source,
    participantCode: value.participantCode, consent: true, started: value.started,
    tasks: value.tasks.map(r => ({ id:r.id,outcome:r.outcome,elapsedMs:r.elapsedMs,ease:r.ease,events:r.events.map(e => ({kind:e.kind,demo:e.demo,offsetMs:e.offsetMs})) })), feedback: [...value.feedback] };
}

export function summarize(records) {
  const clean = records.map(validateRecord);
  if (new Set(clean.map(r => r.sessionId)).size !== clean.length) throw new Error('重复会话，请勿重复导入同一份记录');
  const included = clean.filter(r => r.source === 'participant');
  if (new Set(included.map(r => r.participantCode)).size !== included.length) throw new Error('参与者编号重复；每人仅选择一次基线试用，复测单独汇总');
  const median = a => { a.sort((x,y)=>x-y); return a.length ? a.length % 2 ? a[(a.length-1)/2] : (a[a.length/2-1]+a[a.length/2])/2 : null; };
  return { participantRecords: included.length, practiceExcluded: clean.length - included.length,
    provenance: '参与者来源由记录者声明；软件无法核验真人身份。事件只证明操作响应，不证明理解程度。',
    tasks: tasks.map(t => {
      const rows = included.flatMap(r => r.tasks.filter(x => x.id === t.id));
      const independent = rows.filter(r=>r.outcome==='completed');
      return { id:t.id, title:t.title, recorded:rows.length, missing:included.length-rows.length,
        independent:independent.length, assisted:rows.filter(r=>r.outcome==='assisted').length,
        failed:rows.filter(r=>r.outcome==='failed').length, skipped:rows.filter(r=>r.outcome==='skipped').length,
        independentWithEvidence:independent.filter(r=>evidenceFor(t,r.events)).length,
        medianRecordedSeconds:median(rows.map(r=>r.elapsedMs/1000)), medianEase:median(rows.map(r=>r.ease)) };
    }), feedback: feedbackOptions.map(label=>({label,count:included.filter(r=>r.feedback.includes(label)).length})) };
}
