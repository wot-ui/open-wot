# Wot UI CLI Overview

## 目录

- [定位](#定位)
- [命令矩阵](#命令矩阵)
- [Agent 与 MCP](#agent-与-mcp)
- [仓库目录](#仓库目录)
- [开发与验证](#开发与验证)
- [数据更新](#数据更新)
- [发布包与发布](#发布包与发布)

## 定位

- npm 包：`@wot-ui/cli`
- 可执行命令：`wot`
- Node.js：`>= 20`
- 包管理器：pnpm `10.25.x`
- 数据范围：wot-ui v2
- 核心能力：CLI 查询、项目分析、MCP Server、Agent 接入、多版本离线知识和数据提取

## 命令矩阵

### 组件知识与项目分析

| 命令 | 用途 |
| --- | --- |
| `wot list [keyword]` | 按名称、中文名、标签、分类或描述查找组件 |
| `wot info <component>` | props、events、slots、CSS 变量 |
| `wot doc <component>` | 完整 Markdown 文档 |
| `wot demo <component> [name]` | demo 列表或指定源码 |
| `wot token [component]` | 组件 CSS 变量 |
| `wot changelog [versionOrComponent] [component]` | 版本或组件更新记录 |
| `wot doctor [dir]` | 项目环境与依赖诊断 |
| `wot usage [dir]` | `.vue` 文件中的组件使用统计 |
| `wot lint [dir]` | 未知组件、空按钮等规则 |

查询命令支持 `--version <version>` 和 `--format text|json|markdown`。

### Agent

| 子命令 | 用途 |
| --- | --- |
| `list` | 列出支持和检测到的客户端 |
| `init` | 初始化 MCP、Skill 和 Instructions |
| `status` | 检查三类能力 |
| `doctor` | 检查文件和真实 MCP handshake |
| `remove` | 删除 open-wot 托管内容 |

`init/status/doctor/remove` 支持 `--client auto|all|claude|cursor|vscode|codex`、`--scope`、`--with`、`--cwd`、`--format` 和 `--pin`。`init/remove` 支持 `--dry-run`、`--yes`；`doctor` 支持 `--timeout`。

### MCP

| 子命令 | 用途 |
| --- | --- |
| `wot mcp` / `wot mcp serve` | 启动 stdio Server |
| `list` | 客户端检测 |
| `init` | 写入 MCP 配置 |
| `status` | 检查配置 |
| `doctor` | 配置、handshake 和客户端状态检查 |
| `remove` | 删除托管配置 |
| `print` | 输出单客户端配置片段 |

## Agent 与 MCP

支持的 project scope 配置：

| Client | 文件 |
| --- | --- |
| Claude Code | `.mcp.json` |
| Cursor | `.cursor/mcp.json` |
| VS Code | `.vscode/mcp.json` |
| Codex | `.codex/config.toml` |

一次接入所有客户端：

```bash
wot agent init --client all
wot agent doctor --client all --timeout 30000
```

默认 Agent 接入安装 MCP、`wot-ui-v2` Skill 和托管 Instructions。`wot-ui-cli` Skill 随 npm 包发布，但不默认安装到组件使用项目。

MCP 提供 8 个 tools：

```text
wot_status
wot_list
wot_info
wot_doc
wot_demo
wot_token
wot_changelog
wot_lint
```

## 仓库目录

```text
src/commands       CLI 子命令
src/application    MCP/Agent 编排和 ChangePlan
src/mcp            Server、tools、prompts、adapters
src/data           loader 和版本解析
src/utils          文件、终端、项目扫描等公共能力
scripts            extract、sync、compress
data               多版本离线数据
skills             Agent Skills
test               测试
```

## 开发与验证

安装和调试：

```bash
pnpm install
pnpm dev
pnpm exec tsx src/index.ts info Button
pnpm build
node dist/index.mjs info Button
```

提交前：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

定向要求：

- CLI 输出变化：运行真实命令，同步 README 和命令测试。
- MCP/Agent：使用隔离目录验证 dry-run、幂等、doctor 和 remove。
- 数据结构：验证历史快照兼容 commands 与 MCP。
- Skills：验证 `agent init --dry-run` 和 npm 包文件列表。
- package exports/files：运行 publint 和 npm pack。

## 数据更新

离线数据来自上游 wot-ui 的组件 Markdown、changelog 和 SCSS。

```bash
pnpm sync:clone
pnpm extract:clone
pnpm sync --wot-dir ../wot-ui
pnpm extract --wot-dir ../wot-ui --output data/v2.0.4.json
```

提取后运行 `pnpm test && pnpm build`，并检查 `data/versions.json`、目标快照和 `data/v2.json`。

## 发布包与发布

```bash
pnpm build
pnpm compress
pnpm exec publint
npm pack --dry-run --json
```

发布包应包含 `dist/`、压缩数据、`data/versions.json`、`skills/wot-ui-v2` 和 `skills/wot-ui-cli`。

维护者使用 `pnpm release`。bumpp 默认更新版本、提交、创建 tag 并推送；`v*` tag 触发 GitHub Actions 发布。发布后检查 npm 版本、文件和 dist-tags，预发布版本不要占用 `latest`。
