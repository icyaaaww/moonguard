// Runnable example of a separate MCP consumer. It never approves file changes.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
const args=process.argv.slice(2);
if(args.some(arg=>!['--demo-root','--port'].includes(arg)&&arg.startsWith('--')))throw new Error('This example accepts only --demo-root and --port; it always uses isolated demo files.');
const client=new Client({name:'moonguard-example-consumer',version:'0.2.0'});
const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./server.mjs',import.meta.url)),...args],stderr:'inherit'});
const call=async(name,arguments_={})=>{
  const response=await client.callTool({name,arguments:arguments_});
  if(response.isError)throw new Error(response.content[0].text);
  return JSON.parse(response.content[0].text);
};
await client.connect(transport);
const proposal=await call('moonguard_propose');
console.log(JSON.stringify({client:'Official MCP SDK example consumer (no LLM)',proposal},null,2));
console.log('Open reviewUrl, inspect the plan, then execute or decline in the browser. Ctrl+C stops this example.');
let last=proposal.state,polling=false;
const timer=setInterval(async()=>{
  if(polling)return;polling=true;
  try{const state=await call('moonguard_status',{id:proposal.id});if(state.state!==last){last=state.state;console.log(JSON.stringify(state));}}
  catch(e){console.error(e.message);clearInterval(timer);await client.close();}
  finally{polling=false;}
},2000);
const close=async()=>{clearInterval(timer);await client.close();};
process.once('SIGINT',close);process.once('SIGTERM',close);
