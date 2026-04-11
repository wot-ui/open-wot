# @wot-ui/cli

`@wot-ui/cli` 是面向 wot-ui 的命令行工具包，提供组件知识查询、项目分析、MCP Server 与离线数据提取能力。

## 能力概览

- 组件查询：`list`、`info`、`doc`、`demo`、`token`、`changelog`
- 项目分析：`doctor`、`usage`、`lint`
- MCP 集成：`wot mcp`
- 数据提取：从 `wot-ui/wot-ui` 源码生成 `data/v2.json`

## 安装

```bash
npm install -g @wot-ui/cli
```

## 常用命令

```bash
wot list
wot info Button
wot doc Button
wot demo Button basic
wot token Button
wot changelog
wot doctor ./my-app
wot usage ./my-app
wot lint ./my-app
wot mcp
```

## 命令说明

- `wot list`：列出所有可用组件
- `wot info <Component>`：查看组件基础信息
- `wot doc <Component>`：输出组件 markdown 文档
- `wot demo <Component> [name]`：查看示例列表或示例源码
- `wot token [Component]`：查看 CSS 变量与默认值
- `wot changelog [version] [component]`：查看版本更新记录
- `wot doctor [dir]`：检查工程环境与依赖
- `wot usage [dir]`：统计 `.vue` 中的 `wd-*` 使用情况
- `wot lint [dir]`：运行 wot-ui 相关规则检查
- `wot mcp`：启动 MCP stdio Server

## 输出格式

部分命令支持：

- `--format text`
- `--format json`
- `--lang zh`
- `--lang en`
- `--version v2`

## 提取数据

使用本地已有的 wot-ui 仓库：

```bash
pnpm extract --wot-dir ../wot-ui --output ./data/v2.json
```

如果希望直接克隆上游仓库并提取，建议在仓库根目录执行：

```bash
pnpm extract:clone
```

提取脚本会输出当前处理阶段，包括数据源路径、扫描到的组件文档数量、解析结果与文件写入位置。

## 开发调试

在 `packages/cli` 内开发时，最方便的方式是直接运行源码：

```bash
pnpm --filter @wot-ui/cli exec tsx src/index.ts list
pnpm --filter @wot-ui/cli exec tsx src/index.ts mcp
```

构建与测试命令：

```bash
pnpm --filter @wot-ui/cli build
pnpm --filter @wot-ui/cli test
pnpm --filter @wot-ui/cli typecheck
```

## 当前边界

- 当前仅支持 `wot-ui v2`
- `usage` 和 `lint` 当前聚焦 `.vue` 文件
- CSS 变量优先从组件 SCSS 源码提取
