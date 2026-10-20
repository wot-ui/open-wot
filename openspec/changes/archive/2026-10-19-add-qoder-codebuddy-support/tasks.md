## 1. 核验客户端配置

- [x] 1.1 从官方配置定义或隔离客户端实例核验 Qoder IDE、CodeBuddy IDE 的实际 MCP 路径与 scope，记录客户端版本及证据，补全 design.md 配置矩阵；未完成不得宣称 IDE 自动接入可用。
- [x] 1.2 核验四种形态的可执行入口、配置探测依据、环境变量配置根目录，以及客户端加载 / 重启 / 信任步骤，确定可靠探测条件。

## 2. MCP 适配

- [x] 2.1 在 `src/mcp/clients/` 注册 `qoder`、`qoder-cli`、`codebuddy`、`codebuddy-cli`，声明实际支持的 scope，复用 JSONC 配置与计划能力。
- [x] 2.2 实现 CodeBuddy CLI 的首个已有文件解析策略，保证 inspect、install、remove 与 detect 使用一致目标，覆盖无文件、旧文件、多文件和损坏文件情况。
- [x] 2.3 实现客户端专属探测，避免仅因公共 `.mcp.json` 或 `AGENTS.md` 存在而错误识别新客户端；保持原有 auto / all 语义。
- [x] 2.4 检查 list、print、status、doctor、remove、`--pin` 及 CLI 帮助输出；保留服务握手与注册状态的区分。

## 3. Agent 资产与共享文件

- [x] 3.1 扩展 `src/application/agent-onboarding.ts` 的原生 Skill 与 Instructions 映射，使生成引用与实际目标一致，保留原客户端单独执行的输出。
- [x] 3.2 处理 `--client all` 的共享 `.mcp.json`、Skill 与 Instructions 去重；为 `AGENTS.md` 生成兼容多个 Skill 路径的单个托管区块并验证重复执行稳定性。
- [x] 3.3 验证 `--with`、user scope 下的项目资产、用户修改文件保留、托管区块移除及共享资源移除提示。

## 4. 测试与文档

- [x] 4.1 在 `test/mcp/clients.test.ts` 及必要的新 fixture 中覆盖路径、探测、JSONC 保留、幂等、无效 scope 和配置损坏。
- [x] 4.2 在 `test/application/agent-onboarding.test.ts`、`test/application/mcp-onboarding.test.ts` 和 `test/application/change-plan.test.ts` 覆盖共享文件、分能力操作、用户内容保留、路径边界和中途失败回滚。
- [x] 4.3 在 `test/commands/agent.test.ts` 与 `test/commands/mcp.test.ts` 覆盖新增客户端选择、auto 歧义、all 行为、dry-run、文本和 JSON 输出，以及 doctor 注册状态限制。
- [x] 4.4 只在 `README.md` 更新客户端矩阵、四种目标的真实命令示例、scope / 配置 / 资产路径、共享影响和客户端内验证步骤。

## 5. 验证与归档

- [x] 5.1 运行定向测试：`pnpm exec vitest run test/mcp/clients.test.ts test/application/agent-onboarding.test.ts test/application/mcp-onboarding.test.ts test/application/change-plan.test.ts test/commands/agent.test.ts test/commands/mcp.test.ts`，并运行实际新增测试文件。
- [x] 5.2 运行 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`；运行 `pnpm site:lint && pnpm site:build` 验证 README 在官网中的集成。
- [x] 5.3 使用 `node dist/index.mjs` 在临时项目与隔离主目录逐一执行四种客户端的 list、print、dry-run、init、status、remove，确认命令输出与实际文件一致；不得对 open-wot 自身执行 agent init。
- [x] 5.4 用构建产物验证真实 MCP handshake 和 `wot_status`、`wot_list`；分别记录 IDE / CLI 客户端内加载结果和版本，明确无法进行的验证，不把 fixture 通过当成客户端实测。
- [x] 5.5 运行 `pnpm exec openspec validate add-qoder-codebuddy-support --strict`，使用 `openspec-verify-change` 核对规格、实现和验证证据，确认无误后使用 `openspec-archive-change` 归档。
