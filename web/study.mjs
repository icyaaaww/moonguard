import { tasks, feedbackOptions, evidenceFor, validateRecord } from './study-model.mjs';
export function initStudy() {
  const $ = id => document.getElementById(id);
  let record = null, active = null, exported = false;
  $('study-feedback').innerHTML = feedbackOptions.map((label,i)=>`<label><input type="checkbox" value="${i}"> ${label}</label>`).join('');
  function render() {
    $('study-start').disabled = Boolean(record);
    for(const id of ['study-source','study-code','study-consent'])$(id).disabled=Boolean(record);
    $('study-export').disabled = !record || Boolean(active);
    $('study-tasks').innerHTML = record ? tasks.map((task,i)=>{
      const done=record.tasks.find(t=>t.id===task.id);
      const running=active?.id===task.id;
      return `<article class="study-task"><h3>${i+1}. ${task.title}</h3><p>${task.instruction}</p><p>${done ? `已记录：${({completed:'独立完成',assisted:'协助完成',failed:'未完成',skipped:'跳过'})[done.outcome]} · ${Math.round(done.elapsedMs/1000)} 秒 · ${evidenceFor(task,done.events)?'操作事件齐全':'操作事件不完整'}` : running ? '计时中：切到工作台完成任务，再回到这里记录结果。' : '未开始'}</p><button class="secondary" data-task="${task.id}" ${active || done ? 'disabled':''}>开始计时</button></article>`;
    }).join('') : '<p>先选择记录来源并取得试用者同意。练习记录不会计入真实试用汇总。</p>';
    $('study-finish').hidden = !active;
    $('study-active').textContent = active ? tasks.find(t=>t.id===active.id).title : '';
    for(const b of $('study-tasks').querySelectorAll('[data-task]')) b.addEventListener('click',()=>{exported=false;active={id:b.dataset.task,start:performance.now(),events:[]};render();});
  }
  $('study-start').addEventListener('click',()=>{
    if(!/^P\d{2,4}$/.test($('study-code').value)||!$('study-consent').checked){$('study-error').textContent='请填写 P01 这类匿名编号，并勾选试用同意。';return;}
    record={schema:1,product:'moonguard',version:'1.0.0',sessionId:crypto.randomUUID(),source:$('study-source').value,participantCode:$('study-code').value,consent:true,started:new Date().toISOString(),tasks:[],feedback:[]};
    $('study-error').textContent='已开始。刷新或关闭页面会丢失尚未导出的记录。';render();
  });
  $('study-save-task').addEventListener('click',()=>{
    if(!active)return;
    record.tasks.push({id:active.id,outcome:$('study-outcome').value,ease:Number($('study-ease').value),elapsedMs:Math.round(performance.now()-active.start),events:active.events});active=null;render();
  });
  $('study-export').addEventListener('click',()=>{
    record.feedback=[...$('study-feedback').querySelectorAll('input:checked')].map(e=>feedbackOptions[Number(e.value)]);
    try {
      const data=validateRecord(record);
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`moonguard-study-${record.source}-${record.participantCode}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      exported=true;
      $('study-error').textContent='已导出到浏览器下载目录。只有你主动交给观察者时，记录才会离开本机。';
    }catch(e){$('study-error').textContent=e.message;}
  });
  $('study-feedback').addEventListener('change',()=>{exported=false;});
  window.addEventListener('beforeunload',e=>{if(record&&!exported){e.preventDefault();e.returnValue='';}});
  render();
  return { record(endpoint,ok,payload,demo) {
    if(!active||active.events.length>=200)return;
    let kind=null;
    if(ok)kind=({'preview':'preview_ok','demo-edit':'demo_edit_ok','demo-reset':'demo_reset_ok','apply':'apply_ok','restore':'restore_ok'})[endpoint];
    if(endpoint==='preview'&&payload.plan?.issues?.length)kind=null;
    if(endpoint==='apply'&&!ok){if(payload.transaction)kind='apply_interrupted';else if(payload.issues?.some(i=>['stale','stale_structure'].includes(i.code)))kind='apply_stale';}
    if(kind)active.events.push({kind,demo,offsetMs:Math.round(performance.now()-active.start)});
  } };
}
