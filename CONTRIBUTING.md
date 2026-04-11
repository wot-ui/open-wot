# Contributing

感谢你参与 open-wot 的开发。

本仓库当前以 `@wot-ui/cli` 为核心，主要维护以下几类能力：

- wot-ui 组件知识查询
- 本地项目分析与 lint
- MCP Server 能力暴露
- 从 `wot-ui/wot-ui` 源码提取离线数据

## 开发环境

- Node.js `>= 20`
- pnpm `10.x`

安装依赖：

```bash
pnpm install
```

## 仓库结构

- `src`：CLI、MCP 与项目分析源码
- `data`：离线组件元数据
- `scripts`：提取脚本
- `skills`：面向 Agent 的技能说明
- `.github/workflows`：CI、release、sync 自动化
- `test`：根包测试

## 常用命令

### 全仓库

```bash
pnpm lint
pnpm test:all
pnpm build:all
pnpm typecheck:all
```

### 主包

```bash
pnpm build
pnpm test
pnpm typecheck
```

### 源码调试 CLI

```bash
pnpm exec tsx src/index.ts list
pnpm exec tsx src/index.ts info Button
pnpm exec tsx src/index.ts mcp
```

### 提取最新数据

如果你本地已有 wot-ui 仓库：

```bash
pnpm extract:cli --wot-dir ../wot-ui --output data/v2.json
```

如果你希望直接拉取最新上游数据：

```bash
pnpm extract:clone
```

## 开发建议

- 优先做最小改动，避免顺手重构无关代码
- 修改提取逻辑后，至少重新跑一次真实数据提取或 fixture 测试
- 修改 CLI 输出后，至少手动验证一个真实命令
- 修改 MCP 逻辑后，至少确认 `wot mcp` 能正常启动
- 修改数据结构后，同步检查 `commands`、`mcp` 与测试是否受影响

## 提交流程

建议在提交前执行：

```bash
pnpm test:all
pnpm build:all
pnpm typecheck:all
```

如果改动包含数据提取逻辑，建议额外执行：

```bash
pnpm extract:clone
```

确认生成的数据、命令输出和文档说明一致后再提交。

## 文档维护

以下文档需要保持同步：

- 根目录 `README.md`
- 与自动化相关的 workflow 文档说明

当以下内容发生变化时，请同步更新文档：

- 新增或删除 CLI 命令
- MCP tools / prompts 变化
- 提取脚本参数变化
- 数据来源、支持范围或开发流程变化

## 自动化说明

- `.github/workflows/ci.yml`：校验 lint、typecheck、build、test
- `.github/workflows/release.yml`：通过 reusable workflow 发布 `@wot-ui/cli`
- `.github/workflows/sync.yml`：从上游 `wot-ui/wot-ui` 提取最新数据并创建 PR

其中 [sync.yml](.github/workflows/sync.yml) 支持手动传入 `wot_ref`，也支持由上游 release 事件触发。

## 反馈与贡献方式

- 提交 issue 描述 bug、数据缺失或命令设计问题
- 提交 PR 时在描述中说明改动范围、验证方式与风险点
- 如果变更影响输出格式或外部集成，请明确写出兼容性影响
