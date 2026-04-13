# Wot UI CLI Overview

本文件根据本仓库 README 整理，目标是让 Agent 快速理解 `@wot-ui/cli` 的能力边界、命令分组、MCP 接入方式、开发调试路径与数据来源。

## Package Identity

- 包名：`@wot-ui/cli`
- 仓库：open-wot
- 可执行命令：`wot`
- 核心定位：wot-ui 的 AI 工具链仓库，提供 CLI、MCP Server、离线组件知识库与数据提取脚本。

## Repository Positioning

- 面向 wot-ui v2 的组件知识查询工具。
- 面向本地项目的组件使用分析与 lint 工具。
- 面向 AI 客户端的 MCP stdio 服务。
- 面向仓库维护者的数据提取与同步工作流。

## Core Capabilities

### Component Knowledge

- `list`：列出可用组件。
- `info <Component>`：查看 props、events、slots、CSS 变量。
- `doc <Component>`：输出组件 markdown 文档。
- `demo <Component> [name]`：查看 demo 列表或指定 demo 源码。
- `token [Component]`：查看组件 CSS 变量与默认值。
- `changelog [version] [component]`：查看版本更新记录。

### Project Analysis

- `doctor [dir]`：检查项目依赖、运行环境与基础集成情况。
- `usage [dir]`：统计 `.vue` 文件中的 `wd-*` 使用情况。
- `lint [dir]`：检查未知组件、空按钮等规则。

### MCP Server

- `mcp`：启动 MCP stdio server。

## Typical User Flows

### Query Component Knowledge Through CLI

常用顺序：

1. `wot list`
2. `wot info Button`
3. `wot demo Button basic`
4. `wot doc Button`
5. `wot token Button`

### Analyze A Local Project

常用顺序：

1. `wot doctor ./my-project`
2. `wot usage ./my-project`
3. `wot lint ./my-project`

### Run MCP In A Client

典型配置：

```json
{
  "mcpServers": {
    "wot-ui": {
      "command": "wot",
      "args": ["mcp"]
    }
  }
}
```

当前 README 明确列出的 MCP tools 有：

- `wot_list`
- `wot_info`
- `wot_doc`
- `wot_demo`
- `wot_token`
- `wot_changelog`
- `wot_lint`

## Common Flags

多数查询命令支持：

- `--format text`
- `--format json`
- `--version v2`

## Install And Run

### Global Install

```bash
npm install -g @wot-ui/cli
```

安装后直接用 `wot`。

### Source Mode In This Repo

```bash
pnpm exec tsx src/index.ts list
pnpm exec tsx src/index.ts info Button
pnpm exec tsx src/index.ts mcp
```

适合本地调试源码，不依赖全局安装。

### Built Artifact Mode

```bash
pnpm build
node dist/index.mjs list
```

适合验证构建产物行为。

## MCP Operational Notes

- `wot mcp` 走 stdio。
- 终端里没有交互输出通常是正常现象。
- 若要调试 tool 与 prompt 调用过程，建议配合 MCP Inspector 或编辑器内置 MCP 客户端。

## Data Source And Extraction

当前版本聚焦 `wot-ui v2`。

离线数据主要提取自上游 `wot-ui/wot-ui` 的：

- `docs/component/*.md`
- `docs/guide/changelog.md`
- `src/uni_modules/wot-ui/components/*/index.scss`

重新生成数据有两种方式：

### Use A Local Wot UI Repo

```bash
pnpm extract:cli --wot-dir ../wot-ui --output data/v2.json
```

### Clone Latest Upstream And Extract

```bash
pnpm extract:clone
```

## Repo Layout

- `src`：CLI、MCP 与项目分析源码。
- `data`：离线组件元数据。
- `scripts`：提取脚本。
- `skills`：面向 Agent 的技能说明。
- `test`：根包测试。

## Local Development Commands

### Environment

- Node.js `>= 20`
- pnpm `10.x`

### Install

```bash
pnpm install
```

### Common Validation

```bash
pnpm lint
pnpm test:all
pnpm build:all
pnpm typecheck:all
```

### Package-Level Commands

```bash
pnpm build
pnpm test
pnpm typecheck
```

## Agent Guidance

- 如果用户问的是命令怎么用，按“命令组 + 示例命令 + 输出用途”来回答。
- 如果用户问的是仓库维护或调试，优先给本仓库中的真实命令和目录。
- 如果用户问的是组件本身怎么写页面，不要停留在 CLI 层，应切换到 `wot-ui-v2` skill。
- 不要把 `wot` 命令和 `@wot-ui/ui` 组件库 API 混为一谈。
