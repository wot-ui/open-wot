## 当前上下文

变更动机见 `proposal.md`。仓库已经将根目录 `AGENTS.md` 和 `.agents/skills/` 作为共享 Agent 资产；Claude Code 使用的发现位置则是根目录 `CLAUDE.md` 和 `.claude/skills/`。参考的 wot-ui commit `57ffeaedb23b87e82550198ae9a3da3d227f284f` 使用相对 Git 符号链接桥接这两套约定。

本次变更只涉及仓库元数据和贡献文档，不涉及 `src/`、CLI 输出、MCP 契约、离线数据或 npm 包运行时内容。现有 `package.json#files` 是发布文件白名单，仍需通过打包校验确认新增的 Claude 兼容入口不会被意外发布。

## 目标与非目标

**目标：**

- 让 Claude Code 读取与其他受支持 Agent 完全相同的项目规则和 Skills。
- 保持 `AGENTS.md` 和 `.agents/skills/` 为唯一事实来源。
- 让兼容桥接不依赖仓库绝对路径，并与参考实现保持一致。

**非目标：**

- 生成 Claude 专用的 OpenSpec Skill 副本或命令适配器。
- 修改 `wot agent init`、其托管规则块、CLI 输出、MCP 配置或发布运行时文件。
- 为主动关闭符号链接检出的环境维护内容复制兜底方案。

## 技术决策

### 使用两个相对 Git 符号链接

创建 `CLAUDE.md -> AGENTS.md` 和 `.claude/skills -> ../.agents/skills`，与参考的上游实现保持一致。相对链接不依赖检出目录的绝对路径，同时保证每类资产只有一个维护源。

备选方案：

- 将文件复制到 Claude 专用路径：不采用，因为内容可能漂移，OpenSpec 更新也需要重复写入。
- 增加同步脚本：不采用，因为静态兼容问题不值得引入额外生命周期和生成 diff。
- 使用 OpenSpec Claude 适配器初始化：不采用，因为它会生成独立的 `.claude/skills` 文件树，无法复用全部共享 `.agents/skills` 资产。

### 兼容资产只用于仓库开发

不修改 `package.json#files` 以发布 `CLAUDE.md` 或 `.claude/`。通过打包校验确认现有白名单会继续排除这些内容。

## 风险与取舍

- [检出环境不保留符号链接] → 文档说明 Claude 兼容能力依赖保留 Git 符号链接。
- [打包或扫描工具跟随符号链接] → 保持显式 npm 发布白名单，并检查 `npm pack --dry-run` 输出。
- [未来 `.claude` 需要其他独立配置] → 只让其中的 `skills` 入口成为符号链接，其他 `.claude` 文件仍可并存。
- [未来需要 Claude 专属根规则] → 优先在唯一事实来源 `AGENTS.md` 中表达条件规则；若替换 `CLAUDE.md` 链接，则需要新的设计决策。

## 迁移与回滚

1. 新增两个相对 Git 符号链接，并确认 Git 记录的 mode 为 `120000`。
2. 更新贡献文档和 Agent 接入文档。
3. 执行仓库全量校验和打包检查。

回滚时删除两个符号链接及其文档即可；整个过程中规范源文件保持不变。
