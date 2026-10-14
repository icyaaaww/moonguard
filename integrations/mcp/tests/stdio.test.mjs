import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const entry=fileURLToPath(new URL('../server.mjs',import.meta.url));
async function fixture(t){
  const parent=path.resolve(process.env.MOONGUARD_TEST_ROOT??os.tmpdir());await fs.mkdir(parent,{recursive:true});
  const root=await fs.mkdtemp(path.join(parent,'moonguard-mcp-'));
  const client=new Client({name:'moonguard-integration-test',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[entry,'--workspace',root],stderr:'pipe'});
  transport.stderr?.on('data',()=>{});
  t.after(async()=>{await client.close();assert.equal(path.dirname(root),parent);assert.ok(path.basename(root).startsWith('moonguard-mcp-'));await fs.rm(root,{recursive:true,force:true});});
  await fs.writeFile(path.join(root,'note.md'),'original');
  await client.connect(transport);
  const tool=async(name,args={})=>{const r=await client.callTool({name,arguments:args});let value;try{value=JSON.parse(r.content[0].text);}catch{value={error:r.content[0].text};}return {error:r.isError===true,value};};
  const listing=await tool('moonguard_workspace');
  const base=listing.value.reviewUrl;
  const html=await(await fetch(base)).text();const token=html.match(/name="moonguard-token" content="([^"]+)"/)[1];
  const http=async(endpoint,data)=>{const r=await fetch(base+'/api/'+endpoint,{method:data===undefined?'GET':'POST',headers:{'x-moonguard-token':token,'content-type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:r.status,value:await r.json()};};
  return {root,client,tool,http,listing};
}
test('official MCP stdio client discovers tools, proposes without writes, then observes browser apply/restore',async t=>{
  const {root,client,tool,http,listing}=await fixture(t);
  const names=(await client.listTools()).tools.map(t=>t.name).sort();
  assert.deepEqual(names,['moonguard_propose','moonguard_read_file','moonguard_status','moonguard_workspace']);
  assert.ok(!JSON.stringify(listing.value).includes('original'));
  assert.equal((await tool('moonguard_read_file',{path:'note.md'})).value.content,'original');
  const proposed=await tool('moonguard_propose',{title:'external edit',operations:[{kind:'write',path:'note.md',content:'reviewed'}]});
  assert.equal(proposed.value.state,'awaiting_review');
  assert.equal(await fs.readFile(path.join(root,'note.md'),'utf8'),'original');
  const state=await http('session');assert.equal(state.value.planSource,'mcp');assert.equal(state.value.planId,proposed.value.id);
  const applied=await http('apply',{planId:proposed.value.id});assert.equal(applied.status,200);
  assert.equal((await tool('moonguard_status',{id:proposed.value.id})).value.state,'committed');
  await http('restore',{id:applied.value.result.id});
  assert.equal((await tool('moonguard_status',{id:proposed.value.id})).value.state,'restored');
  assert.equal(await fs.readFile(path.join(root,'note.md'),'utf8'),'original');
});
test('MCP rejects traversal and malformed operations; stale and superseded proposals cannot write',async t=>{
  const {root,tool,http}=await fixture(t);
  assert.equal((await tool('moonguard_read_file',{path:'../private.md'})).error,true);
  assert.equal((await tool('moonguard_propose',{operations:[{kind:'shell',path:'note.md'}]})).error,true);
  const invalid=await tool('moonguard_propose',{operations:[{kind:'create',path:'../bad.md',content:'x'}]});assert.equal(invalid.value.state,'invalid');
  const args={operations:[{kind:'write',path:'note.md',content:'new'}]};
  const first=await tool('moonguard_propose',args),second=await tool('moonguard_propose',args);
  assert.equal((await tool('moonguard_status',{id:first.value.id})).value.state,'superseded');
  assert.equal((await http('apply',{planId:first.value.id})).status,409);
  await fs.writeFile(path.join(root,'note.md'),'human');
  assert.equal((await http('apply',{planId:second.value.id})).status,409);
  assert.equal((await tool('moonguard_status',{id:second.value.id})).value.state,'rejected');
  assert.equal(await fs.readFile(path.join(root,'note.md'),'utf8'),'human');
});

test('user decline is visible to MCP and invalidates execution',async t=>{
  const {root,tool,http}=await fixture(t);
  const p=await tool('moonguard_propose',{operations:[{kind:'write',path:'note.md',content:'not approved'}]});
  assert.equal((await http('decline',{planId:p.value.id})).status,200);
  assert.equal((await tool('moonguard_status',{id:p.value.id})).value.state,'declined');
  assert.equal((await http('apply',{planId:p.value.id})).status,409);
  assert.equal(await fs.readFile(path.join(root,'note.md'),'utf8'),'original');
});
