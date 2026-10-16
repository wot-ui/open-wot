# DeepSeek Harness 验证记录

验证日期：2026-10-16。变更：`add-deepseek-harness-support`。

## 核验结论

| 维度 | 结果 |
| --- | --- |
| 完整性 | 8 项需求、18 个场景均有实现与验证依据；实施及验收完成 |
| 正确性 | 配置生命周期、资产发现、失败保护、诊断边界符合规格 |
| 一致性 | 复用 adapter、ChangePlan、项目资产与 README 文档入口；没有修改 MCP 契约 |

未发现 CRITICAL、WARNING 或需要修复的 SUGGESTION。可同步主规格并归档。

## 需求与证据

| 需求 | 实现 | 验证 |
| --- | --- | --- |
| 客户端选择与范围兼容 | `src/mcp/clients/{types,index,deepseek}.ts`、`src/application/mcp-onboarding.ts` | DeepSeek adapter 测试覆盖发现、all/auto、scope；既有 clients 测试覆盖多匹配歧义 |
| 用户级配置位置与预览 | `src/mcp/clients/deepseek.ts` | 默认、空白、相对、绝对及波浪号路径；真实 print 和固定版本测试 |
| 配置安装幂等并保留用户内容 | `src/mcp/clients/deepseek-config.ts` | 33 项 YAML/adapter 测试覆盖注释、CRLF、惰性标签、流式结构、损坏与冲突；真实运行时加载成功 |
| 预览与事务保护 | `src/application/change-plan.ts` | 干运行、非交互确认、秘密值保护、并发修改、链接逃逸、提交失败与回滚失败测试 |
| 移除仅作用于托管内容 | `src/mcp/clients/deepseek-config.ts` | 移除及重复移除、无关内容保留、修改过的资产保留 |
| 复用可发现的项目资产 | `src/application/agent-onboarding.ts`、`src/commands/agent.ts` | Git 目录/worktree 标记、子目录阻止、MCP 单独操作、status/doctor 提示及真实标准模式上下文 |
| 诊断区分服务可用与客户端加载 | `src/mcp/clients/deepseek.ts` | 握手成功、超时、缺少工具测试；真实 doctor 返回 `server-ready` 和 8 个工具 |
| 公开使用边界 | `README.md` | user scope、共享资产、标准模式及 prompt 限制说明；官网 lint/build 通过 |

新增专用测试位于 `test/mcp/deepseek.test.ts`、`test/application/deepseek.test.ts`、`test/commands/deepseek.test.ts`，共 44 项。

## 自动化与真实 CLI

- `pnpm lint && pnpm typecheck && pnpm test && pnpm build`：通过，36 个测试文件、248 项测试。
- `pnpm site:lint && pnpm site:build`：通过。
- `openspec validate add-deepseek-harness-support --strict`：通过。
- 隔离项目运行编译后的 CLI，验证 list、print、init dry-run、init、重复 init、status、doctor、remove、重复 remove、project scope 拒绝及恢复安装，退出码与文件内容符合预期。
- 真实 CLI 的 `npx` 使用临时项目链接的本地构建包，并启用离线模式，保证验证本次实现。

## 桌面版运行时验收

本机安装位置为 `/Applications/DeepSeek Harness.app`，桌面版和内置 CLI 均为 `0.2.0-rc.2`。官方标签 `dsh-v0.2.0-rc.2` 对应修订 `639ed015397290b3745d163aafe02ffee4aa3f84`。

使用桌面包的 `Contents/Resources/runtime/cli/bin/dsh`，在临时 `DSH_HOME`、`DSH_AGENTS_HOME` 和项目目录内运行 `web` profile，再通过运行时的 `agentPresets.mount` 挂载 `standard`。CLI 生成的用户补丁被配置组合器接受，未修改用户实际配置。

临时验证插件经真实 `tools.execute` 调用 MCP，通过 Skill 服务读取完整内容，并执行标准模式 `agent/pre-step` 上下文装配链。结果为：

```json
{
  "preset": "standard",
  "wotToolCount": 8,
  "wot_status": { "isError": false, "server": "wot-ui", "version": "1.1.0" },
  "wot_list": { "isError": false },
  "skill": { "name": "wot-ui-v2", "loaded": true },
  "contextSources": ["user", "agent-instructions", "skill-catalog"],
  "instructionsVisible": true,
  "skillCatalogVisible": true,
  "ok": true
}
```

此验证实际经过桌面包运行时、官方 MCP 插件、stdio 子进程和项目上下文加载链；没有发起模型请求，也未验证桌面聊天界面中的模型自主选工具行为。首轮系统提示装配未包含项目上下文，检查上游实现后改用其真实的 `agent/pre-step` 链，确认指令和 Skill 目录均被注入。临时服务完成后自行退出。

原始本机证据保留在 `/tmp/open-wot-dsh-validation.kj8el4/` 的 `cli-results.json`、`composed.yml`、`validate-plugin.mjs`、`runtime-result.json`。这些是临时文件，以上摘要为仓库中的持久记录，不依赖临时目录长期存在。

## 支持边界

本次实测支持版本为 `0.2.0-rc.2` 标准模式。用户级补丁可被后续 profile 层覆盖；极简、自定义模式及后续上游版本需要另外验证。doctor 保持独立服务证据边界，不因本次开发验收而改为报告客户端已加载。新功能尚未发布到 npm。

## 归档结果

17 项任务全部完成；新增主规格 `openspec/specs/deepseek-harness-onboarding/spec.md`，逐项比对与 delta 一致，主规格严格校验 3/3 通过。变更归档至 `openspec/changes/archive/2026-10-16-add-deepseek-harness-support`。
