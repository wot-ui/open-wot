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
- MCP Server：`wot mcp`
- 元数据提取：从 `wot-ui/wot-ui` 源码生成本地 `v2.json`

## 安装

```bash
npm install -g @wot-ui/cli
```

安装完成后可直接使用 `wot` 命令。

如果你在仓库内本地调试，推荐直接运行源码入口，而不是依赖全局命令：

```bash
pnpm exec tsx src/index.ts list
```

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
```

如果要调试构建产物：

```bash
pnpm build:cli
node dist/index.mjs list
```

### 本地调试 MCP

```bash
pnpm exec tsx src/index.ts mcp
```

MCP 走 stdio，终端无交互输出属于正常现象。若要查看 tools 与 prompts 的调用过程，建议配合 MCP Inspector 或编辑器内置 MCP 客户端调试。

## 自动化流程

- `.github/workflows/ci.yml`：在 `push`/`PR` 时执行 lint、typecheck、build、test（多 OS × Node 版本矩阵）
- `.github/workflows/sync.yml`：每日 02:00 UTC 自动检测 `@wot-ui/ui` 最新版本，有更新时拉取全量多版本快照并创建同步 PR；也可手动触发单版本提取
- `.github/workflows/release.yml`：`v*` tag 触发自动发布 `@wot-ui/cli` 到 npm（发布前自动运行 `pnpm compress && pnpm build`，npm 包只含 `.json.gz`）
- `.github/workflows/coverage-upload.yml`：`v*` tag 触发，上传测试覆盖率到 Codecov

## 当前边界

- 当前仅支持 `wot-ui v2`
- `usage` 与 `lint` 当前聚焦 `.vue` 文件中的 `<wd-*>` 标签及相关 import
- 提取脚本优先从 SCSS 源码解析 CSS 变量，并在必要时回退到 markdown 表格

## 相关文档

- [CONTRIBUTING.md](CONTRIBUTING.md)：贡献与开发流程

## License

[MIT](./LICENSE) License © wot-ui
