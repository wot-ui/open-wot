# Contributing

感谢你参与 open-wot 的开发。本仓库发布 `@wot-ui/cli`，同时维护 CLI、MCP Server、Agent Skills 和 wot-ui v2 离线知识库。

## 开发环境

- Node.js `>= 20`
- pnpm `10.25.x`

安装依赖：

```bash
pnpm install
```

`pnpm install` 会安装 simple-git-hooks。提交前 hook 使用离线 frozen lockfile 校验，并对暂存文件运行 ESLint。

## 仓库结构

```text
src/commands       CLI 子命令
src/application    MCP/Agent 编排与 ChangePlan
src/mcp            MCP Server、tools、prompts 和客户端 adapters
src/data           离线数据加载与版本解析
src/utils          文件、终端、项目扫描等公共能力
scripts            数据提取、同步与压缩
data               发布时携带的 wot-ui 多版本离线数据
skills             随仓库维护的 Agent Skills
test               单元测试与命令测试
apps/website       官网；/docs 在构建时直接渲染根 README.md
.github/workflows  CI、数据同步、发布和覆盖率任务
```

## 本地开发

### Watch 模式

```bash
pnpm dev
```

该命令监听源码并持续构建 `dist/`。可以在另一个终端验证构建产物：

```bash
node dist/index.mjs list
node dist/index.mjs info Button
```

### 直接运行源码

```bash
pnpm exec tsx src/index.ts list
pnpm exec tsx src/index.ts info Button --version 2.0
pnpm exec tsx src/index.ts mcp
```

MCP 使用 stdio，直接启动后没有普通终端输出属于正常现象。需要验证 handshake 时，优先使用隔离项目：

```bash
pnpm exec tsx src/index.ts mcp doctor \
  --client cursor \
  --cwd /path/to/test-project \
  --scope project
```

### 测试开发

```bash
pnpm test:watch
pnpm test:coverage
```

### 官网与文档

官网是 monorepo 中的 `@open-wot/website` 子包：

```bash
pnpm site:dev
pnpm site:lint
pnpm site:build
pnpm site:build:next
```

根目录 `README.md` 是 CLI 用户文档的唯一内容源。官网 `/docs` 会在构建时直接读取 README，生成章节导航、搜索内容、表格和代码块，因此不要在官网子包中复制一份手写文档。

`site:build` 生成 Vinext / Cloudflare Worker 产物；`site:build:next` 生成标准 `.next` 产物，可用于支持 Next.js 的托管平台。

CLI 命令、参数、MCP tools 或接入流程变化时：

1. 更新实现和对应测试。
2. 同步修改根目录 `README.md`。
3. 运行 CLI 的定向测试与真实命令。
4. 运行 `pnpm site:lint && pnpm site:build && pnpm site:build:next`，确认同一份 Markdown 可以生成两种官网产物。

CI 的 Website job 会执行官网 lint 与 build；README 中存在无法渲染的内容时，官网构建会直接失败。

## 提交前验证

常规改动至少运行：

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

这四个命令与当前 CI 使用的脚本一致。CI 额外覆盖：

- Node.js 20 和 22
- Ubuntu、Windows 和 macOS
- Ubuntu 上的 lint 与 typecheck

## 按改动类型验证

| 改动范围 | 除常规验证外还需要 |
| --- | --- |
| CLI 命令、参数或输出 | 手动运行至少一个真实命令；同步 README 和命令测试 |
| MCP tool、prompt 或 Server | 验证 `wot mcp` 能启动；运行真实 handshake 或对应测试 |
| MCP/Agent 配置写入 | 先跑 `--dry-run`；验证幂等、保留用户配置和 remove |
| 数据结构、loader 或版本解析 | 验证已有快照兼容；同步 commands、MCP 和测试 |
| 数据提取脚本 | 运行真实 extract/sync，或至少使用真实上游 fixture 验证 |
| Skills 或 Agent Instructions | 运行 `agent init --dry-run`；检查安装路径和发布包文件 |
| package exports、files 或构建 | 运行 publint 和 npm pack 检查 |
| 仅文档 | 检查本地链接、代码示例和 `git diff --check` |

不要使用真实用户配置做写入测试。为 `--cwd`、HOME 或 npm prefix 准备独立临时目录。

## 更新离线数据

### 同步全部 stable 版本

```bash
pnpm sync:clone
```

该命令克隆 wot-ui 的 tag 历史，逐个提取 stable 快照，并跳过已有版本。

本地已有 wot-ui 仓库时：

```bash
pnpm sync --wot-dir ../wot-ui
```

### 只提取一个版本

直接拉取上游最新版本：

```bash
pnpm extract:clone
```

使用本地已经 checkout 到目标版本的 wot-ui 仓库：

```bash
pnpm extract \
  --wot-dir ../wot-ui \
  --output data/v2.0.4.json
```

提取完成后至少运行：

```bash
pnpm test
pnpm build
```

同时检查 `data/versions.json`、目标版本快照和 `data/v2.json` 是否符合本次同步意图。

## 发布包检查

修改构建、数据、Skills、exports 或 `package.json#files` 时：

```bash
pnpm build
pnpm compress
pnpm exec publint
npm pack --dry-run --json
```

重点确认发布文件中包含：

- `dist/`
- 压缩后的离线数据和 `data/versions.json`
- `skills/wot-ui-v2`
- `skills/wot-ui-cli`

不要把未压缩的完整数据快照或无关仓库文件发布到 npm。

## 提交与 Pull Request

提交前确认：

1. 改动范围最小，没有顺手重构无关模块。
2. 新行为有对应测试，或在 PR 中说明无法自动化的验证步骤。
3. CLI、MCP、数据结构或 Skill 变化已同步 README。
4. PR 描述包含改动范围、验证命令、兼容性影响和风险点。
5. `git status` 中没有意外生成物或本地配置。

## 发布流程

发布由维护者执行：

1. 完成常规验证和发布包检查。
2. 使用 `pnpm release` 选择版本并确认操作；bumpp 默认更新版本、提交、创建 tag 并推送。
3. `v*` tag 推送后，`release.yml` 调用发布 workflow 将 `@wot-ui/cli` 发布到 npm。
4. 发布后核对 npm 包内容、版本和 dist-tags；预发布版本应使用 `beta` 等非 `latest` 标签。

不要绕过 GitHub Actions 直接手动发布，除非维护者明确决定进行故障恢复。

## 自动化

- `ci.yml`：lint、typecheck，以及多系统/Node.js 矩阵下的 build 和 test。
- `sync.yml`：同步上游 wot-ui 数据、验证结果并创建 PR。
- `release.yml`：`v*` tag 触发 npm 发布。
- `coverage-upload.yml`：release tag 触发覆盖率上传。

## 反馈与贡献

- 使用 Issue 报告 bug、数据缺失或命令设计问题。
- 外部输出格式或配置结构发生变化时，请明确说明兼容性影响。
- 涉及安全写入逻辑时，请在 PR 中附上 dry-run、失败保护和回滚验证结果。
