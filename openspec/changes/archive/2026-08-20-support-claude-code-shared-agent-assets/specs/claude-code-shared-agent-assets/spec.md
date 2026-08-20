## Purpose

让 Claude Code 使用仓库统一维护的 Agent 项目规则与共享 Skills，同时避免产生需要独立维护的 Claude 专用内容副本。

## ADDED Requirements

### Requirement: Claude Code 发现共享项目规则
仓库 MUST 通过 `CLAUDE.md` 向 Claude Code 暴露根目录 `AGENTS.md` 中的规范，并保持 `AGENTS.md` 为唯一维护源。

#### Scenario: Claude Code 加载项目规则
- **WHEN** Claude Code 从仓库根目录加载项目规则
- **THEN** `CLAUDE.md` 解析为 `AGENTS.md` 的当前内容

#### Scenario: 规范源发生更新
- **WHEN** 维护者更新 `AGENTS.md`
- **THEN** Claude Code 无需执行第二次内容同步即可读取更新后的规则

### Requirement: Claude Code 发现共享 Skills
仓库 MUST 通过 `.claude/skills` 向 Claude Code 暴露 `.agents/skills/`，并保持 `.agents/skills/` 为唯一维护源。

#### Scenario: Claude Code 枚举项目 Skills
- **WHEN** Claude Code 扫描 `.claude/skills/`
- **THEN** 它可以发现 `.agents/skills/` 当前包含的全部 Skill

#### Scenario: 共享 Skills 发生变化
- **WHEN** `.agents/skills/` 中新增、更新或删除 Skill
- **THEN** Claude Code 视图同步反映该变化，且不需要向 `.claude/skills/` 复制文件

### Requirement: 兼容链接可安全随仓库迁移
兼容入口 MUST 使用提交到 Git 的相对符号链接，使其在仓库检出到不同绝对路径后仍然有效。

#### Scenario: 仓库检出到其他路径
- **WHEN** 贡献者将仓库克隆到任意能够保留 Git 符号链接的文件系统路径
- **THEN** 两个 Claude Code 兼容链接都在当前检出目录内正确解析

### Requirement: 现有 Agent 消费路径保持不变
兼容桥接 MUST NOT 移动、复制或替换现有 Agent 集成使用的 `AGENTS.md` 与 `.agents/skills/`。

#### Scenario: 非 Claude Agent 读取共享资产
- **WHEN** 现有 Agent 加载 `AGENTS.md` 或 `.agents/skills/`
- **THEN** 它仍然获得变更前相同的规范路径和内容
