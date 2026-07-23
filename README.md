# Open Wot

open-wot 是 wot-ui 的 AI 工具链仓库，当前对外发布的核心包为 `@wot-ui/cli`。它提供命令行工具、MCP Server、离线组件知识库与数据提取脚本，用于把 wot-ui v2 的组件知识接入编辑器、AI Agent 和本地工程分析流程。

## 仓库定位

- 面向 wot-ui v2 的组件知识查询工具
- 面向本地项目的组件使用分析与 lint 工具
- 面向 AI 客户端的 MCP stdio 服务
- 面向仓库维护者的数据提取与同步工作流

## 核心能力

- 组件知识查询：`list`、`info`、`doc`、`demo`、`token`、`changelog`
- 项目分析：`doctor`、`usage`、`lint`
- Agent 接入：`wot agent init` 自动配置 MCP、内置 Skill 与 Agent Instructions
- MCP 生命周期：`wot mcp`（默认启动 Server）、`wot mcp serve/list/init/status/doctor/remove/print`
- 元数据提取：从 `wot-ui/wot-ui` 源码生成本地 `v2.json`

## 安装

```bash
npm install -g @wot-ui/cli
```

安装完成后可直接使用 `wot` 命令。

`wot` 在交互式终端启动时会自动检查 `@wot-ui/cli` 是否有新版本。检查结果最多缓存 24 小时，提示只写入 stderr，不会污染 `--format json` 的 stdout；CI 和非交互式环境会自动跳过。`wot mcp` 不会在启动时输出更新提示，MCP 客户端可通过 `wot_status` tool 查询 CLI 更新状态。若需要关闭检查，可设置 `WOT_DISABLE_UPDATE_CHECK=1` 或 `NO_UPDATE_NOTIFIER=1`。

如果你在仓库内本地调试，推荐直接运行源码入口，而不是依赖全局命令：

```bash
pnpm exec tsx src/index.ts list
```

## 快速开始

```bash
wot list
wot list button
wot info Button
wot demo Button basic
wot doc Button
wot token Button
wot changelog
wot doctor ./my-project
wot usage ./my-project
wot lint ./my-project
wot agent list
wot agent init --client cursor
wot mcp
```

## 命令说明

### 组件知识

- `wot list [keyword]`：列出可用的 wot-ui 组件，支持按名称、中文名、标签、分类和描述过滤
- `wot info <component>`：查看组件 props、events、slots、CSS 变量
- `wot doc <component>`：输出组件 markdown 文档
- `wot demo <component> [name]`：查看 demo 列表或指定 demo 源码
- `wot token [component]`：查看组件 CSS 变量与默认值
- `wot changelog [version] [component]`：查看版本更新记录

### 项目分析

- `wot doctor [dir]`：检查项目依赖、运行环境与基础集成情况
- `wot usage [dir]`：统计 `.vue` 文件中的 `wd-*` 使用情况
- `wot lint [dir]`：检查未知组件、空按钮等规则

### Agent 接入

```bash
wot agent list
wot agent init --client cursor
wot agent status --client cursor
wot agent doctor --client cursor
wot agent remove --client cursor
```

`agent init` 默认同时安装三项能力：

- 在客户端项目配置中注册 `wot-ui` MCP Server
- 安装仓库内置的 `wot-ui-v2` Skill
- 在 `AGENTS.md` 或 `CLAUDE.md` 中维护 open-wot 自己拥有的 Instructions 区块

当前 npm 发布包只随附以下两个 Skill：

| Skill | 主要用途 | 随 npm 发布 | `agent init` 默认安装 |
| --- | --- | --- | --- |
| `wot-ui-v2` | 组件选型、API 查询、页面生成与组件问题排查 | 是 | 是 |
| `wot-ui-cli` | CLI、MCP、数据提取与 open-wot 仓库维护 | 是 | 否 |

可通过 `--with` 限制能力范围：

```bash
wot agent init --client codex --with mcp
wot agent init --client claude --with skill,instructions
wot agent status --client claude --with skill,instructions
wot agent doctor --client claude --with skill,instructions
wot agent init --client cursor --dry-run
```

`status` 和 `doctor` 只检查 `--with` 选中的能力；未选择 MCP 时，`doctor` 不会启动 MCP Server。

`init` 和 `remove` 支持 `--dry-run`。写操作在交互式终端中会请求确认；脚本和 CI 必须显式传入 `--yes`。重复执行是幂等的，删除操作只移除 `wot-ui` MCP 条目、未修改的内置 Skill 文件和 open-wot 托管 Instructions 区块。

若 Instructions 中的 open-wot 标记残缺、顺序错误或重复，CLI 会拒绝修改，避免误删用户内容。

### 通用参数

多数查询命令支持以下参数：

- `--format text`（默认）或 `--format json`：输出格式
- `--version <ver>`：指定 wot-ui 版本，支持以下格式：
  - `2.0`（minor，自动解析到最新 patch）
  - `2.0.4`（exact patch）
  - `latest`（始终使用最新稳定版）
  - 不传时自动从项目 `node_modules/@wot-ui/ui` 或 `package.json` 依赖声明检测，检测不到则回退到最新版

示例：

```bash
wot info Button --version 2.0.0
wot doc Button --version 2.0
wot list --format json --version latest
```

## MCP 集成

`wot mcp` 保留默认启动 stdio Server 的行为；在脚本或文档中也可以使用语义更明确的 `wot mcp serve`。

推荐使用 CLI 自动配置：

```bash
wot mcp list
wot mcp init --client cursor
wot mcp status --client cursor
wot mcp doctor --client cursor
```

支持的客户端和 project scope 配置位置：

| Client | 配置文件 | 根字段 |
| --- | --- | --- |
| Claude Code | `.mcp.json` | `mcpServers` |
| Cursor | `.cursor/mcp.json` | `mcpServers` |
| VS Code | `.vscode/mcp.json` | `servers` |
| Codex | `.codex/config.toml` | `mcp_servers.wot-ui` |

Claude Code、Cursor 和 Codex 同时支持 `--scope user`；VS Code 当前使用 project scope。管理命令支持 `--format json`，`init`、`status`、`doctor`、`remove` 和 `print` 支持通过 `--pin [version]` 固定生成配置中的 `@wot-ui/cli` 版本；只有会写文件的 `init` 和 `remove` 支持 `--dry-run`。

dry-run 和 JSON 结果只输出托管配置节点的安全预览，不输出配置文件完整内容或其他 Server 的环境变量。写操作还可以使用 `--client all` 一次处理所有支持当前 scope 的客户端。

Codex adapter 会在写入前后验证完整 TOML。若现有配置使用 `[mcp_servers.wot-ui.env]` 等外部嵌套子表，CLI 会拒绝自动接管或删除；请先将自定义字段迁移到主 Server 定义，再重新执行命令。

`doctor` 分三层检查配置、MCP handshake 和客户端注册状态。Handshake 会验证 Server 名称以及 `wot_status`、`wot_list` 核心工具；Claude Code 和 Codex 会进一步调用客户端 CLI 查询注册状态。Cursor、VS Code 没有稳定查询接口时会显示 `server-ready`，提示用户重启客户端并在 MCP 面板确认，而不会将它描述为客户端已经就绪。需要用户批准或信任项目时退出码为 `2`，配置或 handshake 失败时退出码为 `1`。

只需要查看配置而不写文件时：

```bash
wot mcp print --client vscode
```

也可以手动配置。通用 JSON 客户端示例：

将以下配置加入支持 MCP 的客户端：

```json
{
  "mcpServers": {
    "wot-ui": {
      "command": "npx",
      "args": ["-y", "@wot-ui/cli", "mcp"]
    }
  }
}
```

当前 MCP Server 提供以下 tools：

| Tool | 功能 | 主要参数 |
| --- | --- | --- |
| `wot_status` | 查看 MCP Server 与 `@wot-ui/cli` 状态，包括当前版本、是否有 CLI 更新及更新命令。 | 无 |
| `wot_list` | 列出当前离线知识库中的组件摘要，不包含完整文档、API 与 demo 源码，适合在生成页面前发现可用组件。 | `version` |
| `wot_info` | 查询单个组件的 props、events、slots、CSS 变量等结构化信息。 | `component`, `version` |
| `wot_doc` | 获取单个组件的完整 markdown 文档，适合需要阅读用法细节或限制说明时调用。 | `component`, `version` |
| `wot_demo` | 获取不含源码的 demo 摘要列表；指定 demo 名称时获取完整示例源码。 | `component`, `demo`, `version` |
| `wot_token` | 查询组件 CSS 变量；不传组件名时返回所有组件的 CSS 变量摘要。 | `component`, `version` |
| `wot_changelog` | 查询 wot-ui v2 离线数据中的更新记录，可按版本或组件过滤。 | `version`, `component` |
| `wot_lint` | 扫描本地项目中的 wot-ui 使用问题，例如未知组件、空按钮等规则。 | `dir`, `version` |

其中 `version` 支持与 CLI 一致的写法，例如 `2.0`、`2.0.4`、`latest`；不传时会按项目依赖或离线数据自动解析。

为控制 Agent 上下文占用，MCP 的 `wot_list` 只返回 `name`、`nameZh`、`tag`、`category`、`description` 和 `since`；需要组件 API、文档或示例源码时，再调用 `wot_info`、`wot_doc` 或带具体 demo 名称的 `wot_demo`。CLI 的 `list --format json` 与 `demo --format json` 继续保留原有详细结构，避免影响已有脚本。

## 数据来源

当前版本聚焦 `wot-ui v2`。仓库内的离线数据来自 `wot-ui/wot-ui` 源码，主要提取自：

- `docs/component/*.md`
- `docs/guide/changelog.md`
- `src/uni_modules/wot-ui/components/*/index.scss`

`data/` 目录保存每个 stable patch 版本的独立快照（`v2.0.0.json`、`v2.0.1.json`、…），以及一个始终指向最新版的 `v2.json`。

### 更新数据

**全量同步所有历史 tag（推荐，首次或需要补全历史版本时使用）：**

```bash
pnpm sync:clone
```

克隆 wot-ui 仓库（`--filter=tree:0 --no-checkout`，不下载文件树），按所有 stable tag 逐一 checkout + 提取，已有快照自动跳过。

**仅更新最新版本（快速，CI 单版本触发时使用）：**

```bash
pnpm extract:clone
```

**使用本地已有的 wot-ui 仓库：**

```bash
# 全量多版本
pnpm sync --wot-dir ../wot-ui

# 单个版本，手动指定 checkout 后提取
pnpm extract --wot-dir ../wot-ui --output data/v2.0.4.json
```

## 开发本仓库

当前根目录就是主发布包，核心源码位于 `src`，离线数据位于 `data`，提取脚本位于 `scripts`。

### 环境要求

- Node.js `>= 20`
- pnpm `10.x`

### 安装依赖

```bash
pnpm install
```

### 常用开发命令

```bash
pnpm lint          # ESLint 检查
pnpm typecheck     # TypeScript 类型检查
pnpm test          # 单元测试
pnpm build         # 构建产物到 dist/
pnpm compress      # 压缩 data/*.json → data/*.json.gz（发布前自动执行）
```

### 本地调试 CLI

直接运行源码入口最方便：

```bash
pnpm exec tsx src/index.ts list
pnpm exec tsx src/index.ts info Button
pnpm exec tsx src/index.ts info Button --version 2.0.0
pnpm exec tsx src/index.ts doc Button --version 2.0
```

如果要调试构建产物：

```bash
pnpm build
node dist/index.mjs list
node dist/index.mjs info Button --version 2.0.0
```

### 本地调试 MCP

```bash
pnpm exec tsx src/index.ts mcp
```

MCP 走 stdio，终端无交互输出属于正常现象。若要查看 tools 与 prompts 的调用过程，建议配合 MCP Inspector 或编辑器内置 MCP 客户端调试。

## 自动化流程

- `.github/workflows/ci.yml`：在 `push`/`PR` 时执行 lint、typecheck、build、test（多 OS × Node 版本矩阵）
- `.github/workflows/sync.yml`：每日 02:00 UTC 自动检测 `@wot-ui/ui` 最新版本，有更新时拉取全量多版本快照并创建同步 PR；也可手动触发单版本提取
- `.github/workflows/release.yml`：`v*` tag 触发自动发布 `@wot-ui/cli` 到 npm；`prepublishOnly` 依次执行 `pnpm build` 和 `pnpm compress`，发布包携带压缩后的组件数据及 `versions.json` 版本索引
- `.github/workflows/coverage-upload.yml`：`v*` tag 触发，上传测试覆盖率到 Codecov

## 当前边界

- 当前仅支持 `wot-ui v2`
- `usage` 与 `lint` 当前聚焦 `.vue` 文件中的 `<wd-*>` 标签及相关 import
- 提取脚本优先从 SCSS 源码解析 CSS 变量，并在必要时回退到 markdown 表格

## 相关文档

- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献与开发流程

## License

[MIT](./LICENSE) License © wot-ui
