## MoonGuard 项目申报书

> 更新核对稿 · 2026-10-16 · 对应应用 1.1.0、核心库 0.1.1；供参赛者人工改写、核实后提交。

**基本信息**

- 项目名称：MoonGuard（月盾）：基于 MoonBit 的 AI 文件操作预演与恢复引擎
- 参赛者：icyaaaww；联系方式：13066083317
- GitHub 仓库：[icyaaaww/moonguard](https://github.com/icyaaaww/moonguard)
- 项目方向：MoonBit AI Agent 工具基础库 / 本地文件操作与恢复基础设施
- 是否为移植项目：否，原创实现；项目许可证：Apache License 2.0
- 应用发行版：[v1.1.0](https://github.com/icyaaaww/moonguard/releases/tag/v1.1.0)；Mooncakes：[icyaaaww/moonguard@0.1.1](https://mooncakes.io/docs/icyaaaww/moonguard)

**项目简介**

AI 批量整理知识库时，用户难以提前看清改动，中断后难以判断完成状态，直接还原备份又可能覆盖后续人工修改。MoonGuard 将操作转为可检查的计划：先展示差异，执行前复核快照，写入前保存日志，恢复时遇到后续修改则停止覆盖。

可复用的 MoonBit 核心通过 `plan`、`check_apply`、`restore_plan` 完成净变更、路径约束和恢复决策；Node.js 宿主负责文件 I/O、日志和并发协调。浏览器与宿主共用 MoonBit 编译产物并比对计划。知识库整理是首个应用，核心也面向 Agent 文件工具、批量文档编辑器和开发者工具，将“执行前检查”和“恢复时保护人工修改”做成公共能力。

**核心功能范围**

- 提供快照、操作、问题、净变更和计划模型及 JSON 接口；支持创建、完整内容写入、移动和可恢复回收。
- 重算计划并复核快照，拒绝过期、篡改、覆盖、越界、目录大小写歧义与 Windows 保留名；宿主拦截链接等不安全文件类型。
- 保存原始内容、事务状态和 SHA-256 校验值，支持撤销与中断恢复，保留无关新增文件。1.1.0 新增恢复内容预演、取消及确认，确认时重新核对快照。
- 提供浏览器操作表单与 CLI；新增只读 `check`、`restore-preview` 和 UTF-8 `--output`，拒绝覆盖已有导出文件或导出到工作区内。
- 提供确定性 Markdown 归档示例：识别闭合且无重复分类的简化 frontmatter，支持 BOM/CRLF/简单引号，更新简单相对链接并保护代码示例。
- 提供官方 SDK 的 MCP stdio 适配器，支持文件读取、提案及状态查询，由用户在本地页面审阅、执行或拒绝；MCP 不直接执行文件修改。

**已交付与验证**

- 已公开源码、README、许可证、API 示例、启动脚本、手册及 CI；v1.1.0 发布时累计 12 次提交。应用需 Node.js 22+；核心可用 `moon add icyaaaww/moonguard@0.1.1` 安装。
- MoonBit JS / Wasm GC 各 42 项、宿主/CLI/HTTP 38 项、MCP 3 项、DOM 1 项测试通过；发布提交的 Linux、Windows CI 通过，应用独立解压后 38 项宿主测试通过。
- 新项目从注册表安装后，两个目标各 7 项 API 测试通过，22 个文件与发布包校验一致；浏览器已完成隔离示例归档与恢复。证据见 `docs/mooncakes-release.md`。

**移植或参考说明**

非现有项目的整体移植，无对应原项目及原项目许可证。语言与标准库参考 [MoonBit 官方文档](https://docs.moonbitlang.com/en/latest/)和 [MoonBit Core](https://github.com/moonbitlang/core)；MCP 适配器使用 [官方 TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) 与 [Zod](https://github.com/colinhacks/zod)，保留其 MIT 许可证，依赖由 lockfile 固定。[OpenSeek](https://github.com/moonbitlang/openseek) 和 [workflow](https://github.com/moonbitlang/workflow) 仅作为 Agent 场景和流程恢复方向的调研参考，未移植其实现。

当前限定单一协作式工作区的 `.md/.txt/.json/.csv` UTF-8 文本，最多 200 个文件、200 项操作；Markdown/YAML 为有限子集。恢复覆盖路径与内容，不保证全部元数据、跨文件原子性或断电可靠性。OpenSeek/大模型实测、macOS 和真人试用尚未完成，真实参与者为 0。下一阶段用已有四项任务验证文档维护者的操作理解、冲突处理与恢复体验，再据反馈完善适配。
