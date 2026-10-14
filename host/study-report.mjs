import * as fs from 'node:fs/promises';
import { summarize } from '../web/study-model.mjs';
const files = process.argv.slice(2);
try {
  if (!files.length) throw new Error('用法：node host/study-report.mjs <record1.json> [record2.json ...]；输出匿名汇总到 stdout，不上传数据。');
  const records = await Promise.all(files.map(async file=>{
    if((await fs.stat(file)).size>1024*1024)throw new Error('单份记录超过 1 MiB');
    return JSON.parse(await fs.readFile(file,'utf8'));
  }));
  console.log(JSON.stringify(summarize(records),null,2));
} catch(e) {console.error(e.message);process.exitCode=1;}
