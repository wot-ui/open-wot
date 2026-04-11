# open-wot

open-wot 是 wot-ui 的 AI 工具链仓库，当前对外发布的核心包为 `@wot-ui/cli`。它提供命令行工具、MCP Server、离线组件知识库与数据提取脚本，用于把 wot-ui v2 的组件知识接入编辑器、AI Agent 和本地工程分析流程。

## 仓库定位

- 面向 wot-ui v2 的组件知识查询工具
- 面向本地项目的组件使用分析与 lint 工具
- 面向 AI 客户端的 MCP stdio 服务
- 面向仓库维护者的数据提取与同步工作流

## 核心能力

- 组件知识查询：`list`、`info`、`doc`、`demo`、`token`、`changelog`
- 项目分析：`doctor`、`usage`、`lint`
- MCP Server：`wot mcp`
- 元数据提取：从 `wot-ui/wot-ui` 源码生成本地 `v2.json`

## 安装

```bash
npm install -g @wot-ui/cli
```

安装完成后可直接使用 `wot` 命令。

## 快速开始

```bash
wot list
wot info Button
wot demo Button basic
wot doc Button
wot token Button
wot changelog
wot doctor ./my-project
wot usage ./my-project
wot lint ./my-project
wot mcp
```

## 命令说明

### 组件知识

- `wot list`：列出可用的 wot-ui 组件
- `wot info <Component>`：查看组件 props、events、slots、CSS 变量
- `wot doc <Component>`：输出组件 markdown 文档
- `wot demo <Component> [name]`：查看 demo 列表或指定 demo 源码
- `wot token [Component]`：查看组件 CSS 变量与默认值
- `wot changelog [version] [component]`：查看版本更新记录

### 项目分析

- `wot doctor [dir]`：检查项目依赖、运行环境与基础集成情况
- `wot usage [dir]`：统计 `.vue` 文件中的 `wd-*` 使用情况
- `wot lint [dir]`：检查未知组件、空按钮等规则

### 通用参数

多数查询命令支持以下参数：

- `--format text`
- `--format json`
- `--lang zh`
- `--lang en`
- `--version v2`

## MCP 集成

将以下配置加入支持 MCP 的客户端：

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

当前 MCP Server 提供以下 tools：

- `wot_list`
- `wot_info`
- `wot_doc`
- `wot_demo`
- `wot_token`
- `wot_changelog`
- `wot_lint`

## 数据来源

当前版本聚焦 `wot-ui v2`。仓库内的离线数据来自 `wot-ui/wot-ui` 源码，主要提取自：

- `docs/component/*.md`
- `docs/guide/changelog.md`
- `src/uni_modules/wot-ui/components/*/index.scss`

重新生成本地数据有两种方式。

使用本地已有的 wot-ui 仓库：

```bash
pnpm extract:cli --wot-dir ../wot-ui --output packages/cli/data/v2.json
```

直接克隆最新的 wot-ui 仓库并提取：

```bash
pnpm extract:clone
```

## 开发本仓库

本仓库是一个 pnpm monorepo，当前核心代码集中在 `packages/cli`。

### 环境要求

- Node.js `>= 20`
- pnpm `10.x`

### 安装依赖

```bash
pnpm install
```

### 常用开发命令

```bash
pnpm test:all
pnpm build:all
pnpm typecheck:all
pnpm build:cli
pnpm test:cli
pnpm typecheck:cli
```

### 本地调试 CLI

直接运行源码入口最方便：

```bash
pnpm --filter @wot-ui/cli exec tsx src/index.ts list
pnpm --filter @wot-ui/cli exec tsx src/index.ts info Button
```

如果要调试构建产物：

```bash
pnpm build:cli
node packages/cli/dist/index.mjs list
```

### 本地调试 MCP

```bash
pnpm --filter @wot-ui/cli exec tsx src/index.ts mcp
```

MCP 走 stdio，终端无交互输出属于正常现象。若要查看 tools 与 prompts 的调用过程，建议配合 MCP Inspector 或编辑器内置 MCP 客户端调试。

## 自动化流程

- `.github/workflows/ci.yml`：执行根包与 CLI 子包的 lint、typecheck、build、test
- `.github/workflows/release.yml`：在 `v*` tag 上发布 `@wot-ui/cli`
- `.github/workflows/sync.yml`：拉取上游 `wot-ui/wot-ui`，提取最新元数据，并自动创建同步 PR

## 当前边界

- 当前仅支持 `wot-ui v2`
- `usage` 与 `lint` 当前聚焦 `.vue` 文件中的 `<wd-*>` 标签及相关 import
- 提取脚本优先从 SCSS 源码解析 CSS 变量，并在必要时回退到 markdown 表格

## 相关文档

- [packages/cli/README.md](packages/cli/README.md)：CLI 包使用说明
- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献与开发流程

## License

[MIT](./LICENSE) License © wot-ui
