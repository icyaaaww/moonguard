# MoonGuard 月盾 1.1.0

本版让文档归档更可靠，并在恢复文件前展示内容预演。MoonBit 核心库独立编号为 `icyaaaww/moonguard@0.1.1`。

## 下载与启动

下载 `MoonGuard-1.1.0.zip` 并完整解压。需要 Node.js 22 或以上；Windows 双击 `Start-MoonGuard.cmd`，Linux/macOS 执行 `sh start-moonguard.sh`。程序自动选择空闲端口，打开本地页面。包内包含编译后的核心，普通使用无需 MoonBit 编译器或安装 npm 依赖。

`SHA256SUMS.txt` 提供应用包与核心包的校验值。仅使用 MoonBit 库的开发者可运行 `moon add icyaaaww/moonguard@0.1.1`，API 示例见 `README.mbt.md`。

## 本版改进

- 文档分类要求闭合且明确的 frontmatter，支持 BOM、CRLF 和受支持分类的引号形式，避免未闭合或重复分类触发移动。
- Markdown 链接改写识别完整代码围栏长度，保护较长围栏、混合围栏及缩进代码示例。
- 预演拒绝目录大小写不一致、仅改变大小写的替换操作以及 Windows 上标设备名，提前发现跨平台路径冲突。
- CLI 新增只读 `check`、安全 UTF-8 `--output` 导出和 `restore-preview`；错误输入及冲突具有可判断的退出码。
- 页面恢复先展示逐文件当前内容和恢复结果，再确认执行；可取消，冲突时禁用确认。确认时重新核对已查看的快照。

## 验证与适用范围

发布流程检查 MoonBit JS / Wasm GC、宿主、CLI、HTTP、MCP 和 DOM 界面集成，并验证独立压缩包与注册表安装。完整结果记录在 `docs/mooncakes-release.md`；Linux/Windows CI 可在发布标签对应的 GitHub Actions 中查看。

已在内置浏览器的隔离示例中完成归档、展开恢复内容和确认恢复。macOS、实际大模型/OpenSeek 会话、规模化使用尚未验证；真实试用人数仍为 0。

适合小型 UTF-8 文本工作区：最多 200 个文本文件、200 项操作。简单 Markdown 支持并非完整解析器；移动表单不自动改写链接。恢复针对路径与内容，不包含全部文件元数据。

## 升级

停止旧服务，将 1.1.0 解压到新目录，再打开原资料目录。保留原目录及 `.moonguard` 恢复日志，日志仍为 schema 1。新增路径校验可能拒绝存在大小写歧义的旧计划；需要重新检查路径并预演。恢复期间暂停其他程序写入。

旧版应用 v1.0.0 和核心包 0.1.0 保留，不覆盖已有发布。
