## 为什么

open-wot 目前无法通过统一接入命令配置 Qoder 和 CodeBuddy，用户需要手动安装 MCP、Skill 和项目规则。本次覆盖两者的 IDE 与 CLI，使它们能够使用现有的初始化、状态检查、诊断和移除流程。

## 变更内容

- 为 Qoder IDE、Qoder CLI、CodeBuddy IDE 和 CodeBuddy Code CLI 增加明确的客户端选择、探测和接入配置；区分不同产品形态，避免将 CLI 配置路径当成 IDE 路径。
- 接入现有 `wot mcp` 与 `wot agent` 命令，保留 `--dry-run`、`--yes`、`--pin`、`--with` 和事务回滚语义。
- 使用客户端原生 Skill 目录和可识别的 Instructions，兼容项目已有内容。
- 更新 README 支持矩阵、接入示例、路径、作用域和诊断说明，并补齐针对性测试。
- 保持原客户端 ID、默认行为和 JSON 输出结构稳定；新增客户端会扩展列表及 `--client all` 的目标集合。

非目标：不安装客户端、不管理登录或模型配置、不改变 MCP 工具协议和离线数据、不开发客户端插件、不顺带重构其他适配器。

## 能力

### 新增能力

- `qoder-codebuddy-onboarding`：Qoder 与 CodeBuddy 的 IDE / CLI 客户端选择、配置生命周期、Agent 资产管理和诊断边界。

### 修改能力

无。已有 DeepSeek 和仓库 Claude Code 共享资产规格保持不变。

## 影响范围

- `src/mcp/clients/`：客户端注册、探测、MCP 配置路径和适配器。
- `src/application/agent-onboarding.ts`：Skill 与 Instructions 目标及托管内容生成；必要时最小调整多客户端计划合并。
- `src/commands/agent.ts`、`src/commands/mcp.ts`：检查客户端帮助、输出与错误提示是否由注册表完整驱动。
- `test/mcp/`、`test/application/`、`test/commands/`：新增接入测试与原客户端回归。
- `README.md`：唯一接入文档源；官网 `/docs` 随构建读取更新，不另写页面。
- Skill 正文、MCP tools/prompts、`data/`、提取逻辑和依赖版本不变。
