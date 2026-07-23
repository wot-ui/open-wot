# Project Guidelines

## Scope

open-wot 是 wot-ui v2 的 CLI、MCP 与离线知识库仓库。优先做最小改动，保持命令输出、数据结构和测试预期稳定。

## Architecture

- `src/commands` 放 CLI 子命令实现。
- `src/mcp` 放 MCP server、tools 与 prompts。
- `src/data` 放元数据加载与版本解析。
- `scripts/extract.ts` 负责从上游 wot-ui 仓库提取离线数据。
- `data/` 保存发布时携带的离线数据。
- `skills/` 保存给 Agent 使用的技能说明与参考资料。
- `apps/website` 是官网子包；`README.md` 是官网 `/docs` 的唯一内容源。

## Build And Test

- 安装依赖：`pnpm install`
- 代码检查：`pnpm lint`
- 类型检查：`pnpm typecheck`
- 测试：`pnpm test`
- 构建：`pnpm build`
- 全量校验：`pnpm lint && pnpm typecheck && pnpm test && pnpm build`

## Conventions

- 修改 CLI、MCP tool、prompt 或数据结构后，同步检查对应测试与 README。
- 修改提取逻辑后，优先验证真实提取流程或至少验证生成数据兼容现有 loader。
- 修改命令输出后，至少手动跑一个真实命令确认文本格式没有意外回归。
- 修改 CLI、MCP 或接入流程文档时，只编辑 `README.md`；官网文档会在构建时直接读取它，不要新增平行的手写 HTML 文档。
- 修改官网后运行 `pnpm site:lint && pnpm site:build`。
- 处理 wot-ui 组件知识、示例生成、文档问答时，先查看 `skills/wot-ui-v2/SKILL.md`。
- 未经明确要求，不要顺手重构无关模块。
