## 背景与动机

仓库将 Agent 项目规则和 OpenSpec Skills 统一维护在 `AGENTS.md` 与 `.agents/skills/`，但 Claude Code 只会发现 `CLAUDE.md` 与 `.claude/skills/`。如果没有兼容桥接，Claude Code 无法读取其他 Agent 正在使用的同一套规则和工作流。

## 变更内容

- 新增仓库根目录符号链接 `CLAUDE.md`，指向 `AGENTS.md`。
- 新增符号链接 `.claude/skills`，指向 `../.agents/skills`。
- 保持 `AGENTS.md` 和 `.agents/skills/` 为唯一事实来源，不复制、不分叉其中的内容。
- 补充 Claude Code 兼容链接及其仓库内使用边界的说明。
- 不改变现有 CLI 输出、MCP 契约、离线数据、发布包 Skills 和官网行为。

## 能力范围

### 新增能力

- `claude-code-shared-agent-assets`：Claude Code 通过相对符号链接发现仓库共享的 Agent 规则与 Skills，规范内容仍只在 `AGENTS.md` 和 `.agents/skills/` 中维护。

### 调整能力

无。

## 影响范围

- 仓库元数据：新增 Git 符号链接 `CLAUDE.md` 和 `.claude/skills`。
- Agent 体验：Claude Code 可以使用与直接读取 `.agents/` 的 Agent 相同的项目规则和 OpenSpec Skills。
- 文档：更新 `CONTRIBUTING.md`；由于这是 Agent 接入流程变化，还需要同步更新 `README.md`。
- 兼容性：检出环境必须保留 Git 符号链接。
- 非目标：不生成 Claude 专用 Skill 副本，不增加 Claude 命令适配器，不修改 CLI 行为，也不把这些仓库级文件加入 npm 发布包。
