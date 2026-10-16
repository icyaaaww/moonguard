#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { workspaceRoot, preview, checkPlan, apply, restore, previewRestore, history } from './workspace.mjs';

const help = `MoonGuard
  node host/cli.mjs preview <workspace> [operations.json] [--output preview.json]
  node host/cli.mjs check <workspace> <preview.json>
  node host/cli.mjs apply <workspace> <preview.json>
  node host/cli.mjs restore <workspace> <transaction-id>
  node host/cli.mjs restore-preview <workspace> <transaction-id>
  node host/cli.mjs history <workspace>

preview prints JSON or writes a new UTF-8 file outside the workspace.
check validates the current files without changing files or journals.
Exit codes: 0 success; 1 usage/I/O error; 2 invalid preview or failed check.`;

async function readJson(file) {
  return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
}

async function writePreview(root, destination, value) {
  const requested = path.resolve(destination);
  // Resolve the parent so an outside junction cannot redirect output inside.
  const parent = await fs.realpath(path.dirname(requested));
  const target = path.join(parent, path.basename(requested));
  const relative = path.relative(root, target);
  if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))) {
    throw new Error('计划输出必须位于工作区之外，避免改变预演快照');
  }
  await fs.writeFile(target, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

try {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) {
    console.log(help);
  } else {
    const [command, directory, ...rest] = args;
    if (!['preview', 'check', 'apply', 'restore', 'restore-preview', 'history'].includes(command) || !directory) throw new Error(help);
    let output = null;
    const flag = rest.indexOf('--output');
    if (flag !== -1) {
      if (command !== 'preview' || flag !== rest.length - 2 || !rest[flag + 1] || rest[flag + 1].startsWith('--')) throw new Error('--output 只用于 preview，后面需要文件路径');
      output = rest[flag + 1]; rest.splice(flag, 2);
    }
    if (rest.length > 1 || rest.some(arg => arg.startsWith('--')) || (command === 'history' && rest.length)) throw new Error('参数不合法；使用 --help 查看用法');
    const [argument] = rest;
    if (['check', 'apply', 'restore', 'restore-preview'].includes(command) && !argument) throw new Error(`${command} 缺少计划文件或事务编号`);
    const root = await workspaceRoot(directory);
    let value;
    if (command === 'preview') {
      const input = argument ? await readJson(argument) : null;
      if (argument && (!input || typeof input !== 'object' || !Array.isArray(input.operations) || (input.title !== undefined && typeof input.title !== 'string'))) {
        throw new Error('操作文件需要 operations 数组；title 必须为字符串');
      }
      value = await preview(root, input?.operations ?? null, input?.title);
      if (value.issues.length) process.exitCode = 2;
    } else if (command === 'check') {
      value = await checkPlan(root, await readJson(argument));
      if (!value.ready) process.exitCode = 2;
    } else if (command === 'apply') value = await apply(root, await readJson(argument));
    else if (command === 'restore-preview') {
      value = await previewRestore(root, argument);
      if (value.plan?.issues.length) process.exitCode = 2;
    }
    else if (command === 'restore') value = await restore(root, argument);
    else value = await history(root);
    if (output) {
      await writePreview(root, output, value);
      console.error(`已保存 UTF-8 计划：${path.resolve(output)}`);
    } else console.log(JSON.stringify(value, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ error: error.message, issues: error.issues ?? [], transaction: error.transaction ?? null }, null, 2));
  process.exitCode = 1;
}
