## 背景

动机与范围见 proposal.md。当前注册表已有七种客户端，JSON 类客户端通过 `JsonMcpClientAdapter` 完成文件计划，事务层负责校验、去重与回滚。Agent 资产只区分 Claude 和其他客户端，新增原生目录需要小幅扩展映射。

## 目标与边界

- 复用现有 JSONC 编辑、变更计划和诊断能力，保持公共输出结构。
- 将 IDE / CLI 作为不同适配目标，不假设同品牌的文件位置完全一致。
- 不新增 scope，不自动授予客户端信任，也不修改用户权限配置。
- 不调整原客户端的单独初始化输出；仅在多客户端共享文件场景中合并必要内容。

## 设计决策

### 客户端 ID 与配置矩阵

采用 `qoder` / `qoder-cli` 和 `codebuddy` / `codebuddy-cli` 四个 ID；无后缀 ID 对应 IDE，帮助文字明确写出产品形态。不同配置位置使用不同适配器，避免每次命令隐式选择不同形态。

已确认的路径：

| 目标 | project MCP | user MCP | 项目 Skill | 项目 Instructions |
| --- | --- | --- | --- | --- |
| Qoder CLI | `.mcp.json` | `~/.qoder/settings.json` | `.qoder/skills/wot-ui-v2` | `AGENTS.md` |
| CodeBuddy CLI | `.mcp.json`，兼容已有 `mcp.json` | 按官方优先级选择已有文件 | `.codebuddy/skills/wot-ui-v2` | `CODEBUDDY.md` |
| CodeBuddy IDE | `.mcp.json` | `~/.codebuddy/mcp.json` | `.codebuddy/skills/wot-ui-v2` | `CODEBUDDY.md` |
| Qoder IDE | `.mcp.json` | `~/.qoder/mcp.json` | `.qoder/skills/wot-ui-v2` | `AGENTS.md` |

已于 2026-10-19 完成静态核验。CodeBuddy IDE 4.12.1（本机官方应用，内置 genie 3.10.0）的 `getMcpSettingsFilePath` 使用主目录 `.codebuddy/mcp.json`，项目加载器使用 `.mcp.json`。Qoder IDE 1.34.0（[官方发行包](https://download.qoder.com/release/latest/qoder-ide_amd64.deb)，编辑器内核 1.106.3）的 `ApplicationConfigService._getProjectMcpConfigFileUris` 返回项目 `.qoder/mcp.json` 和 `.mcp.json`，`_getDefaultLocalMcpConfigFileUri` 返回主目录 `.qoder/mcp.json`，`product.json` 的 `dataFolderName` 为 `.qoder`。open-wot 为 IDE 选择公共项目 `.mcp.json`，四种适配器均支持 project / user；不管理旧版 SharedClientCache 或远程 IDE 的自定义配置文件。

以上证明配置路径与加载代码，不代表已经完成登录后的交互实测。Qoder 发行包仅下载到临时目录用于静态检查，未安装或启动。CodeBuddy IDE 的启动器为 `buddy`，CLI 为 `codebuddy` / `cbc`；Qoder IDE 与新 CLI 均可能使用 `qoder`，探测读取启动器中的 Electron / VS Code 标识区分两者，并兼容 CLI 的 `qodercli`。公共项目文件不单独触发新增客户端探测。

CLI 中 CodeBuddy 复用官方首个已有文件策略；在全部候选缺失时使用推荐路径。路径选择必须贯穿 detect、inspect、install 和 remove；不可在 remove 时误创建高优先级文件。Qoder 默认使用 CLI 文档的项目 `.mcp.json`，不修改其他设置层；README 说明本地或会话覆盖项可能影响加载。Qoder CLI 的 `QODER_CONFIG_DIR` 按官方配置参考作为用户配置根目录，仅影响该 CLI 用户 MCP 路径；事务边界使用该根目录并继续校验符号链接。

替代方案：只加两个品牌 ID 并同时写入多份配置会引入不可见的全局影响；强行共用路径会产生“写入成功但客户端未加载”的假阳性，因此不采用。

### 探测与注册验证

探测使用真实可执行入口或客户端专属配置证据，IDE 与 CLI 的同名启动器需核验来源。公共 `.mcp.json`、`AGENTS.md` 不作为新增客户端的独立安装证据，否则已有 Claude 项目会触发错误的 `auto` 歧义。CodeBuddy IDE 的用户 MCP 文件也是 CLI 支持的旧路径，不能单独证明 IDE 已安装；IDE 自动探测只使用 `buddy` 启动器。优先复用探测辅助函数，必要时为新适配器覆盖 detect，不改变原客户端行为。

第一版沿用 JSON 适配器的注册状态限制，保留真实 MCP handshake。只有核实了稳定、可测试的客户端输出时才新增注册解析，不把 `mcp list` 的人类可读文本未经验证当作稳定契约。

### Agent 资产与共享规则

通过小型映射统一生成目标路径与 Instructions 引用，保留已有客户端默认路径。Qoder 两种形态共享 `.qoder` 资产；CodeBuddy 两种形态共享 `.codebuddy` 资产，不复制到多个目录。

重点检查 `AGENTS.md` 的共享冲突：Qoder 使用原生 Skill 路径，而原有客户端使用 `.agents`。多客户端计划必须在写入前生成包含所需引用的一个托管区块，不能通过最后写入者覆盖前者，也不能生成多个相同边界标记。只合并 open-wot 托管内容，用户文字保持原样。重复执行同一组命令必须得到相同结果。

项目 `.mcp.json` 同时可能供 Claude、Qoder CLI 和 CodeBuddy 使用。服务名与命令相同时沿用计划去重；若本次计划会创建更高优先级的 CodeBuddy CLI 文件并遮蔽已有配置，在写入前报告冲突，提示先合并或迁移，或单独选择 CLI 复用原路径；移除共享项提示影响范围，不为本次引入所有权数据库或新的文件格式。

### 测试和交付

在临时项目与临时主目录验证路径矩阵、格式保留、重复执行、损坏配置、共享计划和回滚。真实 CLI 命令验证 list、print、dry-run、init/status/remove 文本与 JSON；从构建产物验证 MCP 握手。客户端 UI / CLI 实测须单独记录版本和结果，缺少真实客户端时明确限制，不能用 fixture 代替客户端加载证据。

## 风险与取舍

- IDE 文档缺少明确路径 → 首项任务核验实际客户端，不把未经核验路径写入产品。
- 同名 CLI / IDE 启动器或公共配置造成误探测 → 使用专属证据，测试只装其中一种及均未安装的情形。
- 多个客户端共享 MCP / Instructions → 去重和合并测试，移除提示共享影响。
- 旧配置可能被高优先级新文件遮蔽 → CodeBuddy 复用首个已有文件，损坏文件直接报错。
- 用户的高优先级本地配置或客户端信任设置使配置未生效 → 文档说明确认步骤，诊断区分配置、服务和注册状态。

## 迁移与回退

无需数据迁移；仅新增客户端选择项。未选择新客户端时保留旧路径、协议和资产。通过 `remove` 清理托管项；事务失败沿用回滚。共享资源移除会影响其他使用者，必须提示。

## 核验依据

以下为 2026-10-19 查阅的官方资料；IDE 与 CLI 的文档不能相互代替：

- [Qoder CLI MCP](https://docs.qoder.com/cli/mcp-reference)：scope、文件位置与覆盖顺序。
- [Qoder IDE MCP](https://docs.qoder.com/user-guide/chat/model-context-protocol)：支持 stdio 和 JSON 配置；未给出明确落盘路径。
- [Qoder CLI Skills](https://docs.qoder.com/cli/Skills) 与 [IDE Skills](https://docs.qoder.com/extensions/skills)：原生 Skill 目录。
- [Qoder IDE Rules](https://docs.qoder.com/user-guide/rules) 与 [CLI 项目规则排错](https://docs.qoder.com/cli/troubleshoot-loading)：`AGENTS.md`。
- [CodeBuddy CLI MCP](https://www.codebuddy.ai/docs/cli/mcp)：JSONC 与首个已有文件策略。
- [CodeBuddy IDE 发布说明](https://www.codebuddy.ai/docs/ide/release-notes/release-notes)：项目 `.mcp.json` 支持。
- [CodeBuddy IDE Skills](https://www.codebuddy.ai/docs/ide/Features/Skills)、[CLI Skills](https://www.codebuddy.ai/docs/cli/skills) 与 [IDE Rules](https://www.codebuddy.ai/docs/ide/User-guide/Rules)：原生 Skill 及 `CODEBUDDY.md`。
