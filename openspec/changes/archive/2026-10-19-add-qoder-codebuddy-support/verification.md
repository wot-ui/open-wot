# Qoder 与 CodeBuddy 接入验证记录

验证日期：2026-10-19。分支：`codex/add-qoder-codebuddy-support`。

## 核对结果

| 维度 | 结果 |
| --- | --- |
| 完整性 | 18 项任务完成；6 项需求、14 个场景均找到实现与测试或人工验证依据 |
| 正确性 | 四种客户端的 MCP、Skill、Instructions 生命周期通过；保留无关内容、幂等、预览、边界与回滚行为通过 |
| 一致性 | 复用 JSONC 适配器和事务层；原客户端独立初始化输出保持一致；共享 Instructions 合并为单个托管区块 |

初次核对后的 review 发现两个配置兼容问题，已按本文末尾的修复记录处理。客户端内加载未实测，仍属于下述明确保留的验证限制。

## 需求与证据

| 需求及场景 | 实现 | 验证 |
| --- | --- | --- |
| 区分客户端；显式选择、列表及 auto 歧义 | `src/mcp/clients/types.ts`、`index.ts`、`qoder.ts:13`、`codebuddy.ts:34` | 新适配器测试覆盖公共文件不触发误探测、Windows 启动器和 Qoder 同名入口；原有 auto 歧义测试通过；构建后两种 list 与帮助输出验证通过 |
| MCP 生命周期；CLI / IDE 初始化、用户旧路径、幂等预览、保留和移除 | `src/mcp/clients/qoder.ts:61`、`codebuddy.ts:6`、`json-adapter.ts` | `test/mcp/qoder-codebuddy.test.ts` 的路径、JSONC、CRLF、首个已有文件、损坏文件测试；`test/commands/mcp.test.ts` 与 8 组构建后验证 |
| 原生 Agent 资产；分能力安装和用户修改保留 | `src/application/agent-onboarding.ts:73`、`:259`、`:272` | `test/application/agent-onboarding.test.ts` 对四个客户端验证 user scope 仍使用项目资产，保留修改过的 Skill 和用户规则；命令测试验证 `--with` |
| 共享文件；同时安装 IDE / CLI | `src/commands/agent.ts:155`、`src/application/agent-onboarding.ts:220` | all 的 MCP 计划去重、Instructions 合并、顺序初始化与重复执行测试通过 |
| 配置错误及事务失败；损坏文件和中途失败 | `src/mcp/clients/json-adapter.ts`、`src/application/change-plan.ts` | 损坏 JSONC 与标记拒绝修改；QODER_CONFIG_DIR 符号链接边界测试；新客户端 MCP 与资产的中途提交失败回滚测试及原事务测试通过 |
| 诊断与文档；独立握手及接入说明 | `src/mcp/clients/qoder.ts:86`、`codebuddy.ts:59`、`README.md` | 四种客户端均测试 `server-ready` 与 `unsupported` 注册状态独立；构建产物真实 MCP 调用通过；README 官网构建通过 |

## 已通过的检查

- 定向测试通过，随后全量 `pnpm lint && pnpm typecheck && pnpm test && pnpm build` 通过：40 个测试文件、349 项测试。
- `pnpm site:lint && pnpm site:build` 通过；构建器已有的 webpack 配置与路由分类提示未阻止构建。
- `git diff --check` 通过。
- `pnpm exec openspec validate add-qoder-codebuddy-support --strict` 通过。
- 构建后命令验证：临时项目与隔离 `os.homedir()`，四个 ID 分别验证 project / user，共 8 组；运行 MCP / Agent list、帮助、print 与 `--pin`、Agent dry-run、init、重复 init、status、分能力 doctor、remove 和重复 MCP remove。文件及文本 / JSON 输出断言均通过。未在 open-wot 项目执行 Agent 初始化，也未修改真实主目录配置。
- 从 `node dist/index.mjs mcp` 进行真实 JSON-RPC initialize、tools/list 和 tools/call：服务为 `wot-ui` 1.1.0，暴露 8 个工具；`wot_status` 成功，`wot_list` 返回 90 个组件。更新检查关闭，验证使用本地构建与离线数据。

## 客户端版本与验证限制

| 客户端 | 已完成 | 未完成 |
| --- | --- | --- |
| Qoder IDE 1.34.0 | 官方 Linux 发行包的通用应用代码静态检查，确认 project / user MCP 路径与启动器约定 | 未安装或启动该客户端，未在会话中确认 MCP / Skill / Instructions 加载 |
| Qoder CLI | 官方 MCP、Skills、规则与配置文档核验；配置写入、诊断状态和目录边界测试 | 无可用本机 CLI 版本，未进行登录会话加载验证 |
| CodeBuddy IDE 4.12.1（genie 3.10.0） | 本机官方应用代码静态检查，确认 MCP 路径与 `buddy` 入口 | 未改变实际客户端配置，未进行登录会话加载验证 |
| CodeBuddy Code CLI | 官方配置优先级与原生资产文档核验；检测到本机旧版 1.7.0 | 未以旧版客户端作为当前文档兼容性证据，未进行登录会话加载验证 |

这些静态证据、fixture 与独立服务握手不等于客户端注册成功。`doctor` 保留 `unsupported` 注册状态；README 提供客户端内确认、信任与重启步骤。自定义启动器、旧版或远程 IDE 的非标准目录可能需要显式选择客户端或手动配置。发布前可按 README 在目标客户端中确认 `wot_status`、`wot_list` 及原生 Skill / Instructions 加载。

## Review 修复记录

- 修复 `all` 初始化遮蔽 CodeBuddy CLI 旧配置的问题：在 MCP 计划返回前检查新建文件是否会变成更高优先级的配置。发现冲突时整次命令在写入前失败，错误指出新旧路径，并提示先合并或迁移，或单独选择 `codebuddy-cli` 复用已有路径。此检查也覆盖 Agent 初始化和单独选择其他会创建共享文件的客户端；不自动复制 CLI 专用设置。未改变已有规格允许在落盘前报告共享配置冲突的约定。
- 修复 CodeBuddy IDE 误探测：不再把 IDE / CLI 共用的 `~/.codebuddy/mcp.json` 当作 IDE 安装依据，改为依赖 `buddy` 启动器；仅有 CLI 与旧文件时 `auto` 正确选择 CLI，两个启动器都存在时仍保留歧义提示。
- 新增 6 项回归测试，覆盖两种 scope 的遮蔽拒绝与旧文件安装 / 幂等 / 移除、已有更高优先级配置时正常执行 all、Agent 的 dry-run / yes 均不写文件，以及 CLI 与 IDE 独立探测。
- 修复后全量检查通过：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`，40 个测试文件、355 项测试；`pnpm site:lint && pnpm site:build` 通过；`pnpm exec openspec validate --specs` 通过。
- 构建产物人工回归通过：MCP / Agent 两组命令分别验证 project / user，共 4 组；`all --dry-run` 和 `all --yes` 遇到旧配置冲突均返回错误且未写任何文件，随后显式 CLI 的安装、重复安装、状态和移除成功，原有服务保留。独立复跑仅 CLI 旧配置的探测复现脚本，结果只包含 `codebuddy-cli`。

## DeepSeek Review 后续修复与复核

- 完整性：原 18 项任务保持完成；规格补充未知启动器、空旧配置及按引用移除规则的 3 个场景，共 6 项需求、17 个场景。CLI 确认本项目无活动 change，故不重新归档；直接核对已有归档 proposal、design、tasks、spec 与当前主规格，并更新记录。
- 正确性：P1 改为解析 JSONC 后判断已有 MCP 注册。无关对象、空文件、空注册不阻断，真实注册或损坏配置仍在写入前拒绝；错误指向实际迁移目标，不再建议切换到不相关的客户端。MCP / Agent 的整次计划去掉旧文件重复注册，避免 all 移除后残留。
- 正确性：P3 按所选客户端的 Skill 路径移除引用，保留其他路径和区块外原文；all 移除协调同一份引用集合，重复移除无变更。共享同一 Skill 路径的 IDE / CLI 仍共享引用，README 说明影响。
- 正确性：P4 未知 qoder 原生 EXE / CMD 不默认当作 CLI；CLI 需独立 qodercli 入口、npm 包路径或专属配置证据。回归覆盖 Windows 原生可执行文件、未知 shim 和已知 npm shim，显式选择不受影响。
- 一致性：保持 JSONC 适配器、变更计划和事务层，无新增配置格式；同步主规格、归档规格和设计。P2 在 README 明确 CLI 1.7.0 不兼容当前路径策略，未验证最低兼容版本，不猜测版本阈值；客户端内加载限制仍保留。另明确 QODER_CONFIG_DIR 的相对路径与字面量 ~ 语义。
- 验证：`pnpm lint && pnpm typecheck && pnpm test && pnpm build` 通过，40 个测试文件、373 项测试；`pnpm site:lint && pnpm site:build`、`pnpm exec openspec validate --specs` 和 `git diff --check` 通过。
- 构建后人工回归：临时项目与隔离 os.homedir，MCP / Agent × project / user 共 4 组验证空旧配置下 all 的 dry-run、init、remove 无旧文件残留；Agent 验证移除 Qoder 引用后 Cursor 规则仍有效且重复移除无变更。另 4 组验证真实旧服务冲突仍在任何写入前拒绝，随后显式 CLI 生命周期成功且原服务保留。未修改真实客户端配置。
- 复核结论：无新增未解决的实现或场景缺口；保留客户端会话加载未实测与最低兼容 CLI 版本未验证两项限制，已公开写入 README。

## 再次 Review：相同旧注册的迁移

- 问题确认：旧路径仅注册相同定义的 wot-ui 时，原遮蔽检查仍拒绝创建新路径，阻断 CLI 单独接入后扩展到 all 的流程。
- 修复：仅在旧 mcpServers 恰好包含 wot-ui 且与本次定义深度相等时放行；对象键顺序不影响比较，版本、环境变量、禁用标记或其他字段的差异仍按冲突处理。复用 JSONC 移除计划，将旧条目清理与新文件创建纳入同一事务，避免后续 remove 留下隐藏注册；计划期间旧配置发生变化则拒绝继续。
- 完整性与一致性：新增相同注册迁移场景，当前共 6 项需求、18 个场景；主规格、归档规格、设计与 README 同步。其余 review 中的既有空白文件、宽泛提示和可选重构不纳入本次修复。
- 验证：新增 11 项回归测试覆盖 project / user、claude / qoder / codebuddy / all、Agent 合并计划、dry-run 无写入、注释与根设置保留、幂等、移除无残留、不同定义拒绝及中途失败回滚。`pnpm lint && pnpm typecheck && pnpm test && pnpm build` 通过，40 个测试文件、384 项测试；官网 lint / build、4 份主规格校验和 diff 空白检查通过。
- 构建后真实命令：隔离项目及 os.homedir，MCP / Agent × project / user 共 4 组验证“在旧文件安装 CodeBuddy CLI → all dry-run / init → 重复 init → CLI status → all remove”；迁移前预览不写入、迁移后旧注释及设置保留、两份配置均无残留。未修改真实客户端配置。
