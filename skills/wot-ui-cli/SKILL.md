---
name: wot-ui-cli
description: '回答、使用、调试 @wot-ui/cli 时使用。关键词：wot、@wot-ui/cli、CLI、MCP、doctor、usage、lint、list、info、doc、demo、token、changelog、extract、wot mcp。适用于命令查询、参数说明、MCP 接入、本地调试、数据提取与 open-wot 仓库维护。'
argument-hint: '命令名、参数、MCP 场景、调试问题或数据提取需求'
---

# Wot UI CLI Skill

这个 skill 用于让 Agent 在处理 `@wot-ui/cli` 本身相关的问题时，优先基于本仓库 README 与实际命令能力回答，而不是把它误当成纯组件库文档。

## 适用场景

- 用户询问 `wot` 命令怎么用。
- 用户需要区分 `list`、`info`、`doc`、`demo`、`token`、`changelog`、`doctor`、`usage`、`lint`、`mcp`、`extract` 的用途。
- 用户要接入 MCP Server，或需要 `wot mcp` 的配置与调试方法。
- 用户要在本仓库中调试 `@wot-ui/cli`、验证构建产物、重新提取数据。
- 用户的问题本质上是 open-wot 仓库维护问题，而不是单纯的 wot-ui 组件使用问题。

## 适用范围

- 关注对象是 `@wot-ui/cli` 这个工具包，以及仓库 `open-wot` 的开发维护流程。
- 重点覆盖命令能力、通用参数、MCP、离线数据来源、提取流程、本地调试和发布包边界。
- 如果任务是生成 `wd-*` 页面代码、解释组件 props 或给出主题定制方案，应优先使用 `wot-ui-v2` skill。

## 推荐流程

1. 先确认用户是在问 CLI 工具本身，还是在借 CLI 查询组件知识。
2. 如果是命令使用问题，优先按命令类别回答：组件知识、项目分析、MCP、数据提取、仓库开发。
3. 如果是仓库维护问题，优先给出本仓库里的实际调试命令，而不是泛泛而谈。
4. 如果涉及组件内容本身，可引导或切换到 `wot-ui-v2` skill。

## 命令分组

### 组件知识查询

- `wot list`
- `wot info <Component>`
- `wot doc <Component>`
- `wot demo <Component> [name]`
- `wot token [Component]`
- `wot changelog [version] [component]`

### 项目分析

- `wot doctor [dir]`
- `wot usage [dir]`
- `wot lint [dir]`

### MCP

- `wot mcp`

### 数据提取与仓库维护

- `pnpm extract:cli --wot-dir ../wot-ui --output data/v2.json`
- `pnpm extract:clone`
- `pnpm exec tsx src/index.ts <command>`
- `pnpm build`
- `node dist/index.mjs <command>`

## 工作规则

- 包名是 `@wot-ui/cli`，实际可执行命令是 `wot`。
- 回答命令问题时，优先用仓库 README 中已承诺的行为和参数，不臆造未声明子命令。
- 回答本地调试问题时，优先给源码入口：`pnpm exec tsx src/index.ts ...`。
- 回答构建产物问题时，再给 `node dist/index.mjs ...`。
- 回答 MCP 问题时，要说明 `wot mcp` 走 stdio，终端无交互输出通常是正常现象。
- 回答提取逻辑问题时，要说明数据主要来自上游 `wot-ui/wot-ui` 的 markdown 与 SCSS 源码。
- 当用户问的是组件知识但入口是 CLI，也要保留“这是通过 CLI 查询组件知识”这一层语义。

## 参考资料

- [Wot UI CLI 概览](./references/overview.md)
