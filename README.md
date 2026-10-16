# MoonGuard 月盾

**先看见，再改变。** 将 AI 提议的文件操作变成可预演、可检查、可恢复的计划。

MoonGuard 1.0 是面向文档与知识库用户公开发布的本地文件变更工具。你可以在页面打开资料目录，用表单安排移动、重命名、新建、修改和回收，检查预演后再执行，需要时从记录恢复。MoonBit 负责计划与冲突判断，同一份编译产物同时运行在浏览器和本地执行器中。也提供 CLI 和可选 MCP 适配器。

**[下载正式版](https://github.com/icyaaaww/moonguard/releases/latest)** · [使用手册](docs/user-guide.zh-CN.md) · [报告问题](https://github.com/icyaaaww/moonguard/issues)

适用于小型 UTF-8 文本资料目录。公开发布不等于已经完成规模化用户验证；真实用户验证仍为 0 位，实际大模型/OpenSeek 会话尚未验证。支持边界和测试证据见下文。

## 一分钟启动

需要预先安装 Node.js 22 或以上，无需 MoonBit 编译器或模型密钥。

1. 在 Releases 下载 `MoonGuard-1.0.0.zip`，完整解压到可写目录。
2. Windows 双击 `Start-MoonGuard.cmd`；Linux/macOS 在终端运行 `sh start-moonguard.sh`。
3. 启动器自动选择空闲端口并打开浏览器。点击“打开资料目录”，粘贴文件夹完整路径；点击“新建操作”开始使用。保持启动窗口运行，结束时按 Ctrl+C。

Windows 与 Linux 自动测试通过情况以对应 GitHub Actions 为准；macOS 启动脚本提供兼容入口，尚未实机验证。下载包不捆绑 Node.js，也不是无需运行环境的独立安装程序。

开发者也可在项目目录运行：

```sh
npm start
```

打开 `http://127.0.0.1:4317`。无需安装 npm 依赖，也无需模型密钥；已包含从 MoonBit 编译的 `web/core.mjs`。

默认创建新的 `.demo/session-…` 示例目录。页面上的“新建示例工作区”会保留旧目录，方便检查真实文件。示例中的工作室和访谈文档均为虚构演示资料。

推荐体验：**生成预演 → 预演之后 → 确认并执行 → 恢复上一次操作**。再体验“模拟用户修改”与“在第 2 步后中断”，观察冲突拦截和恢复。

若端口占用：`npm start -- --port 0 --open`。`node host/server.mjs --help` 查看启动参数。

## 已实现

- MoonBit SDK：`plan`、`check_apply`、`restore_plan`、`organize`，无文件 I/O、无第三方运行时依赖。
- 在页面打开资料目录；切换时作废旧计划，保留各目录独立的恢复日志。
- 用操作表单创建多步计划，无需手写 JSON；可查看不参与处理的项目。
- 四种受限操作：创建、完整内容写入、移动、可恢复回收。
- 预演显示路径变化和逐行内容对照；浏览器与执行器独立计算后比对结果。
- 执行前重新核对读取快照，拒绝过期或被篡改的计划。
- 修改前保存恢复日志，执行后生成 SHA-256 内容记录。
- 恢复时保护后续人工改动；遇到冲突拒绝覆盖；中断后可重新加载日志恢复。
- 外部工具通过 JSON 接入，无需依赖某个模型供应商。
- 本机 HTTP 接口具有会话令牌、Origin 与 Host 校验。
- MCP 外部客户端可读取指定文件、提交计划和查询状态；用户在本地页面检查、执行或拒绝，MCP 不提供执行工具。
- 四项文档维护者试用任务，支持计时、评分、匿名记录导出与本地汇总；演练不计入真人数据。

## 外部工具接入

```sh
npm ci --prefix integrations/mcp --ignore-scripts
node integrations/mcp/demo-client.mjs --port 4318
```

这是独立的官方 MCP SDK 客户端示例，会启动 stdio 服务器并提交归档提案。打开输出的 reviewUrl 查看变化，再由你执行或拒绝；终端会显示状态更新。普通 `npm start` 无需安装这个可选适配器。详见 [MCP 接入与 OpenSeek 配置说明](integrations/mcp/README.md)。

MCP 客户端读取文件时，内容可能交给其模型服务商。示例配置只使用虚构文档；对真实资料应先选择经授权的副本。我们没有自动修改任何外部客户端的配置。

## 邀请同学、同事试用

运行 `npm start`，打开侧栏“参与试用（可选）”。日常使用不需要填写。按任务开始计时、操作、填写结果，最后导出 JSON；页面不自动上传或持久化记录。将参与者自愿提供的文件放入已忽略的 `private-study/`，用 `node host/study-report.mjs <文件...>` 生成汇总。

完整的 [试用包与邀请文案](docs/user-study.zh-CN.md) 可直接用于组织首轮试用。当前 [真实用户验证状态](docs/user-validation-results.md) 为 **0 位参与者**；开发演练和协议测试不等于真人反馈。

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
node host/cli.mjs preview /path/to/workspace /path/to/operations.json --output /outside/preview.json
node host/cli.mjs check /path/to/workspace /outside/preview.json
node host/cli.mjs apply /path/to/workspace /path/to/preview.json
node host/cli.mjs history /path/to/workspace
node host/cli.mjs restore /path/to/workspace TRANSACTION-ID
```

`preview` 将完整计划输出到 stdout；不提供 operations 文件时使用内置归档器。主分支新增 `--output`：直接写入 UTF-8 文件，拒绝覆盖已有文件，也拒绝写入工作区内部（包括经目录链接间接指向工作区的路径）。输出目录需要已存在。输入 JSON 可带 UTF-8 BOM。

`check` 只检查计划是否仍适用于当前文件，不写文件或日志；实际执行时仍会再次检查。退出码：0 成功，1 参数/读写错误，2 预演不合法或检查未通过。`check` 和 `--output` 尚不包含在旧版 v1.0.0 下载包中。没有 `--output` 时，务必把重定向输出放在工作区**之外**；Windows PowerShell 5.1 默认重定向编码不同，建议使用新参数或页面导出。

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
- [文档维护者试用包](docs/user-study.zh-CN.md)
- [真实用户验证状态](docs/user-validation-results.md)
- [参赛项目方案](docs/proposal.zh-CN.md)
- [三分钟演示脚本](docs/demo-script.zh-CN.md)
- [架构与适用边界](docs/architecture.md)
- [本地验证记录](docs/validation.md)

Apache-2.0 许可。项目仓库为 [icyaaaww/moonguard](https://github.com/icyaaaww/moonguard)，参赛者为 icyaaaww。
Mooncakes 核心库已发布为 [`icyaaaww/moonguard@0.1.0`](https://mooncakes.io/docs/icyaaaww/moonguard)，可在其他 MoonBit 项目中安装：

```sh
moon add icyaaaww/moonguard
```

API 导入示例见 `README.mbt.md`，[发布与独立安装验证记录](docs/mooncakes-release.md)提供实际检查结果。
库版本 `0.1.0` 与应用版本 `1.0.0` 独立编号；当前发布工具要求包版本为 `0.x.y`。真实用户验证仍待开展。
