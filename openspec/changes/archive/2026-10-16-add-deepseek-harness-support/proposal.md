# DeepSeek Harness 接入提案

## Why

open-wot 已提供多个客户端的 MCP、Skill 和 Instructions 接入闭环，但 DeepSeek Harness 用户仍需自行编写插件补丁。增加专用客户端适配后，用户可以通过同一套命令配置、检查和移除 wot-ui 知识能力。

## What Changes

- 增加客户端 `deepseek`，显示名称为 DeepSeek Harness，支持 `agent` 和 `mcp` 的客户端列表、探测、配置预览、初始化、状态检查、诊断和移除。
- 首版支持用户级 MCP：写入解析后的 `$DSH_HOME/cordis.patch.yml`，默认位置为 `~/.dsh/cordis.patch.yml`，通过官方 MCP 客户端插件启动现有 stdio 服务。
- 推荐命令为 `wot agent init --client deepseek --scope user`；保持 `--scope` 仅控制 MCP 的既有语义，Skill 和托管 Instructions 安装到当前项目。
- 复用 `.agents/skills/wot-ui-v2` 与 `AGENTS.md`。对于位于 Git 项目子目录的接入，写操作前明确提示用户通过 `--cwd` 选择 DeepSeek 发现 Skill 所用的项目根，避免静默写到父目录或生成无法发现的 Skill。
- 只编辑 open-wot 管理的 YAML 条目，保留其他插件、注释和自定义标签；支持幂等、dry-run、冲突诊断和现有事务回滚。
- doctor 区分服务可用与客户端实际加载；没有实际加载证据时保持 `server-ready`，不报告 `ready`。
- README 增加命令、配置作用范围、标准模式验收方法及 MCP prompt templates 不受客户端支持的说明。

首版非目标：项目级 MCP 自动加载、指定 profile 管理、任意自定义插件树适配、安装 DeepSeek Harness、修改模型或凭证、开发独立 DSH 插件包。后续项目级和 profile 接入另行提案。

## Capabilities

### New Capabilities

- `deepseek-harness-onboarding`：DeepSeek 客户端探测、用户级 MCP 配置生命周期、项目资产接入、诊断边界和兼容性。

### Modified Capabilities

无。现有 Claude Code 共享资产规格不变。

## Impact

- 代码：`src/mcp/clients` 新增专用适配器并注册客户端；`src/application/agent-onboarding.ts` 和命令层仅增加必要的 DeepSeek 边界检查，复用 `ChangePlan`。
- 依赖：预计增加支持保留 YAML 源位置、注释和标签的解析依赖，并更新 pnpm catalog 与锁文件；不引入 DSH 运行时依赖。
- CLI 输出：新增客户端记录、scope 提示和配置诊断；保持现有 JSON 字段、退出码及六个客户端的行为。
- MCP 契约：现有 tools、prompts、stdio 服务启动方式保持不变；只增加客户端配置适配。
- Skills：复用现有发布资产，保护用户修改；不变更组件知识和离线数据。
- 文档与官网：仅编辑 README 接入文档，官网 `/docs` 随构建读取；不新增平行文档或官网页面。
- 验证：补充适配器、命令、资产和回滚测试，执行真实 CLI 与隔离 DSH 标准模式验收，运行全量检查及官网检查。
