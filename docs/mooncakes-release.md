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

发布准备与独立解包验证已完成；实际发布和注册表安装验证尚待执行。
