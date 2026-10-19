# DeepSeek Harness 接入设计

## Context

动机与首版范围见 proposal.md。现有 `McpClientAdapter` 已覆盖发现、检查、计划安装、计划移除、预览和注册验证；`ChangePlan` 负责确认、源内容检查、路径保护及回滚。现有 JSONC/TOML 适配器无法直接表达 DeepSeek 的 YAML 补丁列表，但无需改变 MCP 服务端契约。

2026-10-16 查阅的官方材料：

- [MCP 插件](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/mcp/mcp-client/README.md)：stdio 配置及工具桥接；MCP prompt templates 不支持。
- [补丁示例](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/docs/user/guide/mcp-memory.md)：独立的 `insert` 补丁可以加入用户级配置。
- [CLI 配置层](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/cli/README.md)：profile、用户级配置及显式补丁的加载关系。
- [路径解析](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/util/home-paths/README.md)：`DSH_HOME`、空白值及当前用户波浪号路径。
- [Skill 发现](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/skill/skill-filesystem/README.md)：共享 Skill 路径和最近 Git 根定位。

本次验收基线为本机桌面版 DeepSeek Harness `0.2.0-rc.2`，内置 CLI 同版本；对应官方标签 `dsh-v0.2.0-rc.2` 指向源码修订 `639ed015397290b3745d163aafe02ffee4aa3f84`。配置导出与标准模式运行使用桌面包内置 CLI，并通过临时 `DSH_HOME` 和项目隔离用户配置。

以上链接固定到实测版本的源码修订。运行时验收结果与方法见 verification.md，文档调研不替代运行时验证。

## Goals / Non-Goals

目标是保持 adapter、命令和事务层边界，使 DeepSeek 接入对原有客户端的影响限于注册表扩展；生成配置可以由官方标准模式消费，检查结果能表达证据范围。

首版不解析所有 profile 的最终有效插件树，不执行 YAML 表达式，不修改模型凭证，不新增 profile 参数，也不把 DSH 安装成 open-wot 依赖。项目级 MCP 和指定 profile 的后续工作不列入本次实施任务。

## Decisions

### 一、专用适配器与用户级配置

增加 `src/mcp/clients/deepseek.ts`，实现现有接口，在 `types.ts` 与 `index.ts` 注册 `deepseek`。只声明 `supportedScopes: ['user']`，沿用 all/auto 的 scope 过滤；显式不支持的 scope 必须在计划执行前失败，提示完整命令。

配置位置取 `DetectContext.env` 中非空的 `DSH_HOME`，展开当前用户的 `~` 并相对 `context.cwd` 解析，否则使用 `context.homeDir/.dsh`。发现依据为 PATH 中的 `dsh` 或目标配置文件；无需启动可执行文件。现有 `--pin` 继续通过统一服务定义生成参数。

选择用户级配置是因为官方明确加载该层。单纯在项目创建 YAML 不构成生效保证；指定 profile 会引入新的选择与迁移接口，本次不做。所有写入预览都说明该层被多个 profiles 使用。

### 二、独立托管补丁与源文本保留

生成单独的顶层补丁项，内部只包含一个固定 id 的插件条目：

```yaml
- insert:
    - id: open-wot-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: wot-ui
        transport: stdio
        command: npx
        args: [-y, '@wot-ui/cli', mcp]
```

`mcp print` 输出完整补丁列表而非裸插件项。init 使用相同生成逻辑，固定 id、插件名与服务名共同界定托管身份。服务工作目录沿用 DSH 默认值，不将安装时项目绝对路径固化为用户级配置。

使用能够保留源位置的 YAML 解析器定位节点，按源范围替换托管顶层项；其余源文本保持原样。新增项时处理空文件、注释文件、空列表、流式列表及显式文档结束标记，保持换行风格，写后重新解析校验。不能仅凭正则定位 YAML，也不能将整个文件转成普通对象后重新序列化。`!!js` 等自定义标量标签仅作为惰性文本，不引入 Cordis 表达式求值器。

首选评估 `yaml` 的文档/CST 接口；实施时先用代表性 fixture 验证源范围和标签保留，再按 pnpm catalog 规范加入依赖。若某种结构无法保证无关源文本不变，必须给出明确诊断而不是重写文件。

托管项允许唯一且完整的标准结构，`--pin` 仅更新规范服务定义。用户增添 env、cwd、disabled、其他配置字段，改变插件或启动命令，或者把托管插件混入共享 insert 项时，视为修改过的配置，init/remove 保留并报冲突。合法的 open-wot 版本参数变化可更新；任意 npx 命令不能视为托管配置。其他条目使用 `serverName: wot-ui`、再次以补丁引用 `open-wot-mcp` 或重复托管 id 时也拒绝写入。不读取外部 include 文件，不声称排除了其他 profile 中的冲突。

remove 只移除完整独立的托管项；缺失为无操作。必要时保留空列表以保持文件可解析，不删除含用户注释的文件。

### 三、复用事务与输出保护

adapter 只返回 `ChangePlan`。所有实际写入通过既有执行器，保留 dry-run、交互确认、`--yes`、原内容比较及事务回滚。公开 preview 仅显示受控字段，不输出整个 YAML 或无关标签值；解析异常转换为位置和错误类别，避免把原始敏感行带进文本或 JSON。

自定义 DSH_HOME 可能位于系统主目录外，也可能尚不存在，不能简单把所有 user scope 的 allowedRoot 固定为 homeDir。实施时将规范化后的 DSH 根作为允许边界；如现有执行器不支持尚不存在的 allowedRoot，应最小扩展其祖先解析校验，使目标和根的已有祖先都完成 realpath 验证，同时保持拒绝符号链接目标及越界的现有规则。该必要变更必须有默认路径、自定义路径、缺失目录及链接逃逸的回归测试，不以扩大到文件系统根目录来规避检查。

### 四、项目资产与子目录行为

默认继续安装项目 `.agents/skills/wot-ui-v2` 和 AGENTS.md 托管区块。`--scope user` 不改变这两个位置；`--with` 保持既有能力选择语义，本轮不重构所有客户端的能力模型。

仅针对 DeepSeek 且包含 Skill 的操作，向上查找最近 `.git` 文件或目录：未找到时采用 cwd；找到且不等于 cwd 时，init/remove 在组合计划应用前报错并提示 `--cwd <根目录>`，status/doctor 显示不可发现的问题。选择 `--with mcp` 或仅 Instructions 不受该 Skill 检查影响。不要静默把资产移到父目录，也不要改变其他客户端路径。由于既有客户端解析按 scope 筛选，显式 DeepSeek 的这些命令仍要求 `--scope user`。

### 五、诊断证据与支持模式

inspect 验证托管项结构、服务定义和冲突；doctor 复用独立 MCP 握手与必需工具校验。`verifyRegistration` 首版返回 `unsupported` 并提示在 DSH 标准模式确认工具及调用结果，总体保持 `server-ready`。无需增加报告字段或退出码。

不自动调用 `dsh --dump-config` 作为注册检查：该命令只能证明组合后的配置，而且官方说明它可能初始化 profile。运行时验收在隔离 DSH_HOME 内进行，标准模式必须实际发现和调用 `wot_status`、`wot_list`，加载 Skill 并确认 Instructions 的托管内容可见。配置导出可以辅助诊断，但不能替代该验收。

## Risks / Trade-offs

- 上游快速变化 → 记录测试版本与源码修订，以 fixture 和真实标准模式验收约束支持范围。
- 用户级条目对多个 profiles 生效 → README 和预览明确范围；不承诺极简或自定义 profile 的能力完整性。
- 复杂 YAML 或用户修改造成无法安全编辑 → 明确拒绝并保留内容，不自动迁移非托管配置。
- 其他 profile 或命令行补丁可能覆写本层 → doctor 不把配置匹配或独立握手当成运行时注册证据。
- 共享 Skill 和 AGENTS.md 也可能被其他 Agent 使用 → 保持既有托管区块及修改保护，移除时提示共享资产影响，不新增独立副本或引用计数系统。
- 真实 DSH 验收需要可运行版本 → 本次通过标准模式运行时服务调用与 pre-step 上下文链验证，不依赖模型请求；桌面界面中的模型自主选工具行为不在本次验收范围。

## Migration Plan

1. 无需迁移现有六个客户端或离线数据；新增客户端及依赖随正常包构建发布。
2. 用户用显式 `--client deepseek --scope user` 预览并初始化；已有非托管 wot-ui 配置须先自行消除冲突，CLI 不强制覆盖。
3. 完成适配器与组合事务测试、真实 CLI 操作和隔离 DSH 标准模式验收；运行全量及官网检查。
4. 实施完成后执行 OpenSpec verify，再按归档流程同步规格。移除集成使用同 scope 的 remove，失败时依赖已有事务恢复原文件。
