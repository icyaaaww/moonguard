#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import { workspaceRoot, preview, apply, restore, history } from './workspace.mjs';

const [command, directory, argument] = process.argv.slice(2);
try {
  if (!['preview', 'apply', 'restore', 'history'].includes(command) || !directory) {
    console.log('MoonGuard\n  node host/cli.mjs preview <workspace> [operations.json]\n  node host/cli.mjs apply <workspace> <preview.json>\n  node host/cli.mjs restore <workspace> <transaction-id>\n  node host/cli.mjs history <workspace>\n\npreview prints JSON to stdout. Save it to a file outside the workspace.');
    process.exitCode = command ? 1 : 0;
  } else {
    const root = await workspaceRoot(directory);
    let value;
    if (command === 'preview') {
      const input = argument ? JSON.parse(await fs.readFile(argument, 'utf8')) : null;
      value = await preview(root, input?.operations ?? null, input?.title);
    } else if (command === 'apply') {
      if (!argument) throw new Error('缺少 preview.json');
      value = await apply(root, JSON.parse(await fs.readFile(argument, 'utf8')));
    } else if (command === 'restore') value = await restore(root, argument ?? '');
    else value = await history(root);
    console.log(JSON.stringify(value, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message, issues: error.issues ?? [], transaction: error.transaction ?? null }, null, 2));
  process.exitCode = 1;
}
