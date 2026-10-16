import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { parseArgs } from '../launch.mjs';

test('launcher rejects invalid arguments and preserves paths with spaces', () => {
  for (const args of [['--port'], ['--port','-1'], ['--port','65536'], ['--port','abc'], ['--unknown'], ['--workspace','--open']]) assert.throws(() => parseArgs(args));
  assert.deepEqual(parseArgs(['--workspace','D:/my notes','--port','0','--open']), {workspace:'D:/my notes',port:0,open:true});
});
test('entrypoint help and version work without opening a workspace', () => {
  assert.equal(execFileSync(process.execPath, ['host/server.mjs','--version'], {encoding:'utf8'}).trim(), '1.1.0');
  assert.match(execFileSync(process.execPath, ['host/server.mjs','--help'], {encoding:'utf8'}), /--workspace/);
});
