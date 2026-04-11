# @wot-ui/cli

面向 wot-ui 的 CLI、MCP 与 Skills 工具集。

## 能力概览

- 组件知识查询：`list`、`info`、`doc`、`demo`、`token`、`changelog`
- 本地项目分析：`doctor`、`usage`、`lint`
- 通过 `wot mcp` 启动 MCP stdio 服务
- 通过提取脚本从 wot-ui 源码生成离线元数据

## 安装

```bash
npm install -g @wot-ui/cli
```

## 命令示例

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

- `wot list`：列出可用组件
- `wot info <Component>`：查看组件详情
- `wot doc <Component>`：输出组件 markdown 文档
- `wot demo <Component> [name]`：查看 demo 列表或示例源码
- `wot token [Component]`：查看 CSS 变量与默认值
- `wot changelog [version] [component]`：查看更新记录
- `wot doctor [dir]`：检查工程依赖与环境
- `wot usage [dir]`：统计 `.vue` 中的 `wd-*` 使用情况
- `wot lint [dir]`：执行 wot-ui 相关规则检查
- `wot mcp`：启动 MCP stdio Server

## 提取命令

使用本地已有的 wot-ui 仓库：

```bash
pnpm extract --wot-dir ../wot-ui --output ./data/v2.json
```

直接克隆上游仓库并提取：

```bash
pnpm extract:clone
```

## 开发调试

```bash
pnpm --filter @wot-ui/cli exec tsx src/index.ts list
pnpm --filter @wot-ui/cli exec tsx src/index.ts mcp
pnpm --filter @wot-ui/cli build
pnpm --filter @wot-ui/cli test
pnpm --filter @wot-ui/cli typecheck
```

## 当前边界

- 当前只支持 wot-ui v2
- `usage` 和 `lint` 当前只聚焦 `.vue` 文件
- CSS 变量优先从组件 SCSS 源码提取
