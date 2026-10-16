# DeepSeek 项目级接入验证

日期：2026-10-16。变更：`add-deepseek-project-scope`。

## 完整性、正确性与一致性

- 6 项新增/修改要求均有实现和验证；原有用户级 YAML、项目资产及事务要求保持有效。
- 默认 project、显式 user、all/auto 与桌面发现：`src/mcp/clients/deepseek.ts`、`deepseek-desktop.ts`、`src/application/mcp-onboarding.ts`。
- 受限声明、真实目录、摘要登记和会话隔离：`runtime/deepseek-project-bridge.mjs`。
- 复合计划、共享桥接、独立移除及诊断：`src/mcp/clients/deepseek-project.ts`、`deepseek-project-config.ts`；复用现有 ChangePlan 和 Agent 资产计划。
- 单元与集成覆盖：`test/mcp/deepseek-project.test.ts`、`deepseek-bridge.test.ts`、原 DeepSeek adapter/命令/应用测试。
- README 沿用通用流程，删除仅 user scope 限制，补充首次重启、本机登记和迁移说明；没有增加独立长教程。
- 桥接是随发布包携带的独立 `.mjs`，仅导入 Node 内置模块；官方 MCP 和 scope 模块由宿主公开 Loader 解析，不复制 Harness 依赖。`bridgeHash` 保护托管产物更新。

## 自动化验证

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`：通过，38 个测试文件、283 项测试。
- `pnpm exec vitest run test/mcp test/application test/commands/agent.test.ts test/commands/mcp.test.ts test/commands/deepseek.test.ts`：通过，17 个文件、170 项测试。
- `pnpm site:lint && pnpm site:build`：通过；保留既有 vinext webpack/路由静态分析提示。
- 变更与主规格严格校验通过；`git diff --check` 通过。
- `pnpm pack --pack-destination /tmp/open-wot-project-proof` 成功，包包含 `runtime/deepseek-project-bridge.mjs`。最终包安装到临时 A 项目后，真实 CLI 将产物复制到隔离 DSH_HOME，桌面宿主从该稳定位置加载。

## 真实 CLI

临时目录：`/tmp/open-wot-project-cli-final`，独立 DSH_HOME，未修改用户真实配置。

26 条实际命令覆盖 list、两种 scope 的 print、dry-run、非交互拒绝、安装/重复安装、status、doctor、移除/重复移除、双向冲突及从 user 到 project 的 MCP-only 迁移。文本与 JSON 输出、退出码保存在该目录 `report.json`。

- 两种 scope 的重复安装及重复移除均无文件变化。
- 非交互未确认及双向 scope 冲突退出码为 1，其余命令为 0。
- 两种 doctor 均实际握手并发现 8 个工具；总体为 `server-ready`，客户端加载为 `unsupported`，Skill/Instructions 通过。
- MCP-only 迁移保留 AGENTS.md，随后项目初始化正常完成。

## 同一真实桌面宿主

安装包：`/Applications/DeepSeek Harness.app`，版本 `0.2.0-rc.2`，桌面包声明构建修订 `5e9e301dd9dc8923b2762f76dacfc5751f6ca851`。设计调研基线另为上游 `639ed015397290b3745d163aafe02ffee4aa3f84`。

直接启动安装包内 `@deepseek-ai/dsh-desktop-host/lib/index.js`，使用桌面相同的 Electron Node-mode、runtime 和 primary-runtime 参数、IPC 关闭协议及 desktop profile。隔离 DSH_HOME 位于 `/tmp/open-wot-project-desktop/home`；测试端口 38519，禁用测试遥测。没有修改安装包、用户现有桌面配置或终止用户桌面进程。

公开接口验证：`loader.import`、`loader.entries`、`agent/created`、`agent.ctx.plugin`、`fiber.await/dispose`、`ctx.effect`、`agents.create/resume`。生产桥接不拦截私有工厂。

### 隔离与资产

同一宿主先后创建并同时保有 A、B、C Agent：

| 场景 | 实测 |
| --- | --- |
| A 项目 | 8 个工具，`wot_status` 返回 CLI 1.1.0 |
| B 项目 | 8 个工具，`wot_status` 返回 CLI 1.0.6 |
| C 未登记 | 0 个 wot-ui 工具 |
| 工具调用 | A/B 的 `wot_status`、`wot_list` 全部成功 |
| 销毁 A | A 工具撤销；B 仍有 8 个工具 |
| 恢复 A | 持久会话恢复后 8 个工具，实际调用成功 |
| A/sub 子目录 | 使用 A 根配置，实际调用成功 |
| A 声明摘要不匹配 | 新会话 0 个工具；B 不受影响 |
| 恢复原声明后重新打开 | A 再次正常加载 |
| 项目资产 | Skill 完整内容可读，真实 agent/pre-step 中 AGENTS.md 规则可见 |

证据：`result-isolation-final.json`。最终所有 Agent 销毁后，工具残留为 0；采样记录的宿主及后代进程共 21 个，宿主正常关闭后全部退出（`process-cleanup-isolation.json`）。

### 失败、取消与卸载

- D 登记不可用固定版本，在离线 npm 中启动失败；D 无残留工具，B 的真实调用继续成功。
- A 创建过程中取消，创建拒绝且清理作用域。
- 通过真实 CLI 移除 A 后重新打开：A 无工具，B 继续实际调用成功。
- 移除所有登记后，共享桥接卸载，已有 B 工具撤销，新 B 无工具。
- 宿主正常关闭，采样记录的宿主及后代进程共 18 个全部退出。

其他 profile 层另行插入启动失败、尚无工具的全局同名 MCP 后，新 A 会话仍为 0 个工具（`result-global.json`）；桥接没有叠加项目服务，宿主正常退出。

证据：`result-lifecycle-final.json`、`process-cleanup-lifecycle.json`。运行时重复挂载、启动等待、未登记/摘要失配、全局有工具及无工具的服务身份冲突，也有独立自动化测试。

## 边界

实际验证的是安装包中的桌面共享宿主与 standard Agent，未向模型发送请求，也未声称验证了聊天界面内模型自主选择工具。其他桌面版本、极简模式及任意自定义 profile 需另行验证。首次安装需要重载或重启，声明/登记变化后需重新打开会话，不承诺已有会话热更新。

核验未发现阻塞问题；主规格同步保留未变更要求和场景。
