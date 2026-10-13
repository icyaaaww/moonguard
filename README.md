# MoonGuard 月盾

**先看见，再改变。** 将 AI 提议的文件操作变成可预演、可检查、可恢复的计划。

这是一个已经能操作真实本地文件的早期 MVP：MoonBit 负责计划与冲突判断，同一份编译产物同时运行在浏览器和本地执行器中。附带知识库归档演示、Web 工作台与 CLI。当前内置归档器使用确定性规则；尚未接入大模型、MCP 或 OpenSeek。

## 一分钟启动

需要 Node.js 22 或以上。在本目录运行：

```sh
npm start
```

打开 `http://127.0.0.1:4317`。无需安装 npm 依赖，也无需模型密钥；已包含从 MoonBit 编译的 `web/core.mjs`。

默认创建新的 `.demo/session-…` 示例目录。页面上的“新建示例工作区”会保留旧目录，方便检查真实文件。示例中的工作室和访谈文档均为虚构演示资料。

推荐体验：**生成预演 → 预演之后 → 确认并执行 → 恢复上一次操作**。再体验“模拟用户修改”与“在第 2 步后中断”，观察冲突拦截和恢复。

若端口占用：`npm start -- --port 4318`。

## 已实现

- MoonBit SDK：`plan`、`check_apply`、`restore_plan`、`organize`，无文件 I/O、无第三方运行时依赖。
- 四种受限操作：创建、完整内容写入、移动、可恢复回收。
- 预演显示路径变化和逐行内容对照；浏览器与执行器独立计算后比对结果。
- 执行前重新核对读取快照，拒绝过期或被篡改的计划。
- 修改前保存恢复日志，执行后生成 SHA-256 内容记录。
- 恢复时保护后续人工改动；遇到冲突拒绝覆盖；中断后可重新加载日志恢复。
- 外部工具通过 JSON 接入，无需依赖某个模型供应商。
- 本机 HTTP 接口具有会话令牌、Origin 与 Host 校验。

## 使用真实工作区

```sh
npm start -- --workspace /absolute/path/to/workspace
```

第一次请使用资料副本。执行或恢复期间暂停编辑器自动保存、同步程序与其他写入者。月盾锁只协调月盾进程，不能锁住所有外部应用。

首版面向小型文本工作区：`.md`、`.txt`、`.json`、`.csv`，最多 200 个文本文件、200 个操作、单文件 262,144 个 UTF-16 码元、总计 2,097,152 个码元。宿主扫描最多 1,000 项；单文件超过 1 MiB、二进制、隐藏文件、链接等作为不可操作项处理。含 NUL 或无法编码成 UTF-8 的内容会被拒绝。

恢复保证针对**路径和文本字节内容**，不包含原始 mtime、ACL、扩展属性或硬链接关系。详见 [边界与架构](docs/architecture.md)。

## 接入外部规划器

在“导入操作 JSON”中粘贴以下格式，或使用 [示例文件](examples/operations.json)：

```json
{
  "title": "新增项目说明",
  "operations": [
    { "kind": "create", "path": "overview.md", "content": "# 项目说明\n" }
  ]
}
```

| kind | 字段 | 约束 |
| --- | --- | --- |
| `create` | `path`, `content` | 目标必须不存在 |
| `write` | `path`, `content` | 目标必须存在；完整替换内容 |
| `move` | `path`, `to` | 源存在、目标不存在；拒绝覆盖 |
| `trash` | `path` | 源存在；日志保存原内容 |

未使用字段可省略或为 `null`。路径使用工作区相对路径和 `/`，不接受绝对路径、`..`、隐藏路径、Windows 保留名称等。`trash` 由月盾日志恢复，不是操作系统回收站。

## CLI

```sh
node host/cli.mjs preview /path/to/workspace /path/to/operations.json
node host/cli.mjs apply /path/to/workspace /path/to/preview.json
node host/cli.mjs history /path/to/workspace
node host/cli.mjs restore /path/to/workspace TRANSACTION-ID
```

`preview` 将完整计划输出到 stdout；不提供 operations 文件时使用内置归档器。将输出保存为 UTF-8 JSON，放在被操作工作区**之外**，以免新增计划文件使快照失效。Windows PowerShell 5.1 的默认重定向编码不同，建议使用页面“导出计划 JSON”或显式 UTF-8 保存。

## MoonBit 开发

本次验证：MoonBit `0.1.20261012` / compiler `v0.10.15+943464bfa`，Node `24.19.0`。安装 MoonBit 后，在项目根目录运行：

```sh
moon update
moon check --target all
moon test --target js
moon test --target wasm-gc
moon info
moon fmt
npm run build
npm test
```

`npm run build` 运行 `scripts/build.mbtx`：先编译 JS release，再更新浏览器与宿主共同使用的 `web/core.mjs`。构建脚本使用 `moonbitlang/async`，本次解析到 `0.22.4`；纯核心库没有这个依赖。首次构建脚本需要下载依赖。工具链和脚本依赖暂未完全锁定，升级后应重新执行所有验证。

公共 MoonBit API 和可执行示例见 [README.mbt.md](README.mbt.md)；生成的接口见 [pkg.generated.mbti](pkg.generated.mbti)。

## 中断恢复与日志

日志位于工作区 `.moonguard/<transaction-id>.json`，内含原文件与计划内容。它是恢复所需的资料，**不是加密存储**；不要把真实工作区日志或导出的计划提交到公共仓库。

页面的故障按钮是可重复的异常注入，会正确释放进程锁。操作系统直接杀死进程可能留下 `.moonguard/lock`：先停止该工作区的月盾实例，查看锁中的 PID 并确认没有任何月盾进程仍在写入；必要时重启电脑后再处理。保留工作区与日志副本，然后只移除已确认过期的 `lock` 文件，重新启动并优先恢复未完成事务。PID 可能被复用，不可仅因 PID 不同就自动删锁。

若发现 `.moonguard-tmp-*` 文件，不要批量删除；它可能是中断时尚未重命名的内容。先保存副本并核对对应日志。首版没有自动清理遗留锁或临时文件。

## 项目资料

- [项目申报书](docs/application.zh-CN.md)
- [参赛项目方案](docs/proposal.zh-CN.md)
- [三分钟演示脚本](docs/demo-script.zh-CN.md)
- [架构与适用边界](docs/architecture.md)
- [本地验证记录](docs/validation.md)

Apache-2.0 许可。项目仓库为 [icyaaaww/moonguard](https://github.com/icyaaaww/moonguard)，参赛者为 icyaaaww。`moonguard/moonguard` 是暂定包名，尚未声明 Mooncakes 命名空间所有权或发布 Mooncakes。正式提交前需要确定已注册包名，并完成包发布及真实用户验证。
