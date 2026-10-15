# MoonGuard 核心库发布记录

库名：`icyaaaww/moonguard`，首次包版本 `0.1.0`，对应本地应用 `1.0.0`。
库与应用独立编号；当前发布工具要求包主版本为 0。

## 发布内容

`.moonignore` 采用明确的文件名单，包含核心、JSON bridge、测试、可运行的 `cmd/main` 示例、API README、架构说明与 Apache-2.0 许可证。
不包含浏览器、Node 文件执行器、MCP 宿主、npm 依赖、构建缓存、恢复日志或真实用户资料。
核心只处理调用者传入的快照与操作计划，不执行磁盘读写；宿主仍须复查当前快照、安全文件类型及并发写入，并先持久化恢复日志。

## 验证方法

```sh
moon check --target all
moon info
moon fmt
moon test --target js
moon test --target wasm-gc
moon package --list
```

在独立目录解包后再执行全目标检查、两种运行目标的测试与 `moon run cmd/main --target js`。
本次两种目标各 35 项通过；重新编译后的 Node 宿主 26 项、MCP 3 项、DOM 界面集成 1 项通过。
DOM 集成结果不代替真实浏览器视觉验收或真实用户试用。

## 安装与外部调用

发布后，在新的 MoonBit 项目中执行：

```sh
moon add icyaaaww/moonguard
```

在 `moon.pkg` 中导入根包 `"icyaaaww/moonguard" @guard`，调用 `plan`、`check_apply`、`restore_plan`。
API 示例见 `README.mbt.md`。外部消费测试应覆盖正常计划、过期快照拒绝、恢复冲突、路径越界拒绝，不能只确认安装命令成功。

## 本次状态

发布已完成：[Mooncakes 包文档](https://mooncakes.io/docs/icyaaaww/moonguard)。
`moon publish` 返回 `200 OK`，`moon view icyaaaww/moonguard` 返回 `0.1.0`、正确许可证与 GitHub 地址。
注册表记录发布时间为 **2026-10-15 09:10:40 UTC / 北京时间 17:10:40**。
源码提交：`56936ff5f099106e57e399985046f26a64fe829c`。

预检返回 `202 Accepted` 且正文为 `Dry run completed successfully. No changes were made.`；当前工具对此成功预检仍返回非零退出码。本记录以正式发布响应和独立安装为完成依据。

发布 ZIP 为 24,140 字节、22 个文件；从注册表安装后的全部 22 个文件已逐个比对 SHA-256，与发布包一致。
ZIP SHA-256：`a77467c283ceac32da87430c5dd004178ce1bc27980ac6915b29ee740b97aa05`。

| 检查 | 实际结果 |
| --- | --- |
| 发布包独立解包检查、示例运行 | 通过 |
| 发布包核心测试 | JS 35/35、Wasm GC 35/35 |
| 重新编译后的宿主 / MCP / DOM 集成 | 26/26、3/3、1/1 |
| 全新消费项目 `moon add icyaaaww/moonguard` | 从注册表下载 0.1.0，无本地路径依赖 |
| 消费项目 `moon check --target all` | 通过，有仅在测试中使用的辅助函数 unused_value 提示 |
| 外部 API 测试：计划与恢复、过期快照、恢复冲突、路径越界 | JS 4/4、Wasm GC 4/4 |
| 消费项目可执行示例 | 成功输出 ready 计划与前后快照 |

以上证明包可安装和调用，不代表实际用户采用，也不代表比赛报名或最终验收已提交。
