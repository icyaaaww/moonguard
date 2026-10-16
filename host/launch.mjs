import { spawn } from 'node:child_process';

export function parseArgs(args) {
  const options = { port: 4317, open: false };
  const fields = { '--workspace': 'workspace', '--demo-root': 'demoRoot', '--port': 'port' };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--open') options.open = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--version') options.version = true;
    else if (fields[arg]) {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${arg} 缺少参数`);
      options[fields[arg]] = args[++i];
    } else throw new Error(`未知参数：${arg}。使用 --help 查看帮助。`);
  }
  if (!/^\d+$/.test(String(options.port)) || Number(options.port) > 65535) throw new Error('端口必须为 0–65535；0 表示自动选择');
  options.port = Number(options.port);
  return options;
}

function openBrowser(url) {
  // The URL is generated from the bound loopback port, never from user input.
  const command = process.platform === 'win32'
    ? ['rundll32.exe', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log('请在浏览器中打开上面的本地地址。'));
  child.unref();
}

export async function launch(args, makeServer) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('请安装 Node.js 22 或以上版本');
    const options = parseArgs(args);
    if (options.help) {
      console.log('MoonGuard 月盾 1.1.0\n用法：node host/server.mjs [--workspace <目录>] [--port <端口>] [--open]\n不指定目录时打开示例，可在页面中打开自己的资料目录。--port 0 自动选择空闲端口。\n保持终端运行；按 Ctrl+C 停止。');
      return;
    }
    if (options.version) { console.log('1.1.0'); return; }
    const server = await makeServer(options);
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(options.port, '127.0.0.1', resolve); });
    const url = `http://127.0.0.1:${server.address().port}`;
    console.log(`MoonGuard 1.1.0 ready at ${url}\n${options.workspace ? '本地资料目录已打开。' : '已打开示例；点击“打开资料目录”开始使用。'}\n保持此窗口运行。按 Ctrl+C 停止；恢复记录保留在原工作区。`);
    let stopping = false;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      console.log('正在等待当前请求完成后退出…');
      server.close();
    };
    process.once('SIGINT', stop); process.once('SIGTERM', stop);
    if (options.open) openBrowser(url);
    return server;
  } catch (error) {
    console.error(error.code === 'EADDRINUSE' ? '端口被占用。请使用 --port 0 自动选择空闲端口。' : `无法启动：${error.message}`);
    process.exitCode = 1;
  }
}
