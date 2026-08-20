## 1. Claude Code 兼容链接

- [x] 1.1 将 `CLAUDE.md` 创建为指向 `AGENTS.md` 的相对 Git 符号链接，并验证 Git 记录的 mode 为 `120000`、目标为 `AGENTS.md`。
- [x] 1.2 将 `.claude/skills` 创建为指向 `../.agents/skills` 的相对 Git 符号链接，并验证 Claude Code 路径能够发现全部共享 OpenSpec Skills。

## 2. 文档与打包边界

- [x] 2.1 更新 `CONTRIBUTING.md` 和根目录 `README.md` 的 Agent 接入说明，说明 Claude Code 通过符号链接复用 `AGENTS.md` 与 `.agents/skills/`。
- [x] 2.2 运行 `npm pack --dry-run --json` 或仓库等价的打包检查，确认 `CLAUDE.md` 和 `.claude/` 不会进入发布包。

## 3. 完整验证

- [x] 3.1 检查两个相对链接的目标，并确认 `git ls-files -s CLAUDE.md .claude/skills` 的 mode 为 `120000`。
- [x] 3.2 运行 `pnpm lint`、`pnpm typecheck`、`pnpm test` 和 `pnpm build`。
- [x] 3.3 运行 `pnpm exec openspec validate support-claude-code-shared-agent-assets --strict`，并在变更文档中记录平台相关的检出限制。
