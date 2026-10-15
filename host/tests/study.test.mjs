import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, validateRecord, evidenceFor, tasks } from '../../web/study-model.mjs';
const fixture = (source='practice',participantCode='P01',sessionId='11111111-1111-1111-1111-111111111111') => ({
  schema:1,product:'moonguard',source,participantCode,sessionId,consent:true,started:'2026-10-14T00:00:00Z',feedback:[],
  tasks:[{id:'preview',outcome:'completed',elapsedMs:10000,ease:4,events:[{kind:'preview_ok',demo:true,offsetMs:2000}]}],
});
test('practice sessions are excluded; missing tasks are not counted as success',()=>{
  const result=summarize([fixture(),fixture('participant','P02','22222222-2222-2222-2222-222222222222')]);
  assert.equal(result.participantRecords,1);assert.equal(result.practiceExcluded,1);
  assert.equal(result.tasks[0].independentWithEvidence,1);assert.equal(result.tasks[1].missing,1);
  assert.equal(result.tasks[1].medianEase,null);
});
test('self-reported completion without evidence is kept separate',()=>{
  const r=fixture('participant');r.tasks[0].events=[];
  const result=summarize([r]);assert.equal(result.tasks[0].independent,1);assert.equal(result.tasks[0].independentWithEvidence,0);
});
test('study validation rejects duplicated subjects/sessions, malformed timings and unconsented records',()=>{
  assert.throws(()=>summarize([fixture(),fixture()]),/重复会话/);
  assert.throws(()=>summarize([fixture('participant'),fixture('participant','P01','22222222-2222-2222-2222-222222222222')]),/编号重复/);
  const r=fixture();r.consent=false;assert.throws(()=>validateRecord(r),/同意/);
  r.consent=true;r.tasks[0].elapsedMs=-1;assert.throws(()=>validateRecord(r),/时长/);
});
test('exports allowlist fields rather than retaining file contents or personal fields',()=>{
  const r=fixture();r.name='private';r.fileContents='private';r.tasks[0].events[0].path='private';
  assert.ok(!JSON.stringify(validateRecord(r)).includes('private'));
  r.version='0.2.0';assert.equal(validateRecord(r).version,'0.2.0');
  r.version='1.0.0';assert.equal(validateRecord(r).version,'1.0.0');
});
test('evidence must be in order and in the same demonstration workspace',()=>{
  const event=kind=>({kind,demo:true,offsetMs:0});
  assert.equal(evidenceFor(tasks[2],[event('restore_ok'),event('apply_ok')]),false);
  assert.equal(evidenceFor(tasks[2],[event('apply_ok'),event('demo_reset_ok'),event('restore_ok')]),false);
  assert.equal(evidenceFor(tasks[2],[event('apply_ok'),event('restore_ok')]),true);
});
