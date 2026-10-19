## Purpose

让用户通过 open-wot 的统一接入命令，为 Qoder 和 CodeBuddy 的 IDE 与 CLI 配置 wot-ui MCP、Skill 和项目规则，并能够检查、诊断和移除托管内容，同时保护项目已有配置及其他客户端的接入行为。

## ADDED Requirements

### Requirement: 明确区分客户端形态

CLI MUST 接受 `qoder`、`qoder-cli`、`codebuddy`、`codebuddy-cli`，分别表示 Qoder IDE、Qoder CLI、CodeBuddy IDE 和 CodeBuddy Code CLI；列表 MUST 显示具体形态及实际支持的 MCP scope。

#### Scenario: 显式选择与列表
- **WHEN** 用户执行 `wot agent list` 或 `wot mcp list`
- **THEN** 列表包含四个新增 ID，沿用已有输出结构
- **AND** 显式传入其中一个 ID 时只操作对应客户端所需的配置及资产

#### Scenario: 自动探测出现歧义
- **GIVEN** 存在多个客户端的有效探测依据
- **WHEN** 用户使用 `--client auto`
- **THEN** 沿用多客户端歧义提示，要求指定客户端或 `all`
- **AND** 仅有公共 `.mcp.json` 或 `AGENTS.md` 不足以证明新增客户端已经安装

#### Scenario: 同名启动器来源未知
- **GIVEN** PATH 中只有来源无法确认的 `qoder` 原生二进制或自定义启动器，且没有客户端专属配置
- **WHEN** 用户使用 `--client auto`
- **THEN** 不将其默认判定为 Qoder CLI，并提示显式选择客户端

### Requirement: MCP 配置生命周期

新增客户端 MUST 支持 `print`、`init`、`status`、`doctor` 和 `remove`，使用该形态实际识别的配置位置及 `mcpServers.wot-ui` stdio 定义。四种客户端 MUST 支持 project 和 user scope；两个 IDE 的 project scope 使用 `.mcp.json`，user scope 分别使用 `~/.qoder/mcp.json` 和 `~/.codebuddy/mcp.json`。未支持的 scope MUST 明确报错且不落盘。

#### Scenario: CLI 项目初始化
- **GIVEN** 目标项目尚未配置 MCP
- **WHEN** 用户执行 `wot mcp init --client qoder-cli` 或 `wot mcp init --client codebuddy-cli`
- **THEN** 在项目 `.mcp.json` 中配置 `mcpServers.wot-ui`
- **AND** 启动定义使用 `npx -y @wot-ui/cli mcp`，`--pin` 沿用现有版本固定行为

#### Scenario: IDE 初始化
- **WHEN** 用户为 IDE 选择列表中声明支持的 scope 执行初始化
- **THEN** 配置写入该 IDE 实际加载的文件，`status` 报告同一路径
- **AND** 不将 CLI 专用配置文件冒充 IDE 配置，也不静默将 project scope 提升为 user scope

#### Scenario: CLI 用户配置与旧路径
- **GIVEN** 用户选择 user scope
- **WHEN** 初始化 Qoder CLI 或 CodeBuddy CLI
- **THEN** Qoder CLI 使用用户 `.qoder/settings.json` 的 `mcpServers`
- **AND** CodeBuddy CLI 按 `.codebuddy/.mcp.json`、`.codebuddy/mcp.json`、`.codebuddy.json` 的顺序选择首个已有用户文件；均不存在时创建第一个
- **AND** CodeBuddy CLI 项目 scope 在 `.mcp.json` 不存在而 `mcp.json` 存在时复用后者，避免新文件遮蔽旧配置

#### Scenario: 幂等与预览
- **GIVEN** 已用相同参数初始化
- **WHEN** 再次初始化
- **THEN** 不产生重复条目或文件变更
- **AND** 使用 `--dry-run` 时只输出计划，不创建或修改文件

#### Scenario: 保留无关配置与移除
- **GIVEN** 配置包含其他 MCP 服务、注释和客户端设置
- **WHEN** 初始化或移除 wot-ui
- **THEN** 保留其他服务及无关内容，移除只删除 `wot-ui` 服务项
- **AND** 对已不存在的托管项重复移除不产生额外变更

### Requirement: 原生 Agent 资产

Agent 初始化 MUST 为 Qoder IDE 与 CLI 使用项目 `.qoder/skills/wot-ui-v2` 和 `AGENTS.md`，为 CodeBuddy IDE 与 CLI 使用 `.codebuddy/skills/wot-ui-v2` 和 `CODEBUDDY.md`。MCP 的 user scope MUST NOT 将 Skill 或 Instructions 移至主目录。

#### Scenario: 分能力初始化
- **WHEN** 对新增客户端执行 `wot agent init --with skill,instructions`
- **THEN** 安装完整 Skill 及其附属文件，写入引用正确 Skill 路径的托管 Instructions 区块
- **AND** 不改变 MCP 文件或项目中托管区块外的文字

#### Scenario: 移除修改过的资产
- **GIVEN** 用户修改了已安装 Skill 的文件，或在 Instructions 中添加了自己的内容
- **WHEN** 执行 `wot agent remove`
- **THEN** 保留修改过的 Skill 文件并提示，Instructions 仅移除所选客户端对应的 Skill 引用，剩余引用为空时才移除 open-wot 托管区块
- **AND** 对共享 MCP 文件、Skill 或规则的移除提示其可能影响其他使用同一路径的客户端

### Requirement: 多客户端共享文件兼容

`--client all` MUST 按支持的 scope 包含新增客户端，共用文件的相同变更 MUST 去重；不同托管内容 MUST 合并为有效结果或在落盘前报告冲突，MUST NOT 静默覆盖其他客户端所需的配置或 Skill 引用。

#### Scenario: 同时安装 IDE 和 CLI
- **WHEN** 用户执行 `wot agent init --client all`
- **THEN** 共享 `.mcp.json`、同品牌 Skill 及 Instructions 不产生重复条目或重复区块
- **AND** 不因新客户端的 Skill 路径不同而丢失现有客户端的规则引用
- **AND** 不支持当前 scope 的适配器遵循已有过滤语义

#### Scenario: 旧文件没有 MCP 注册
- **GIVEN** CodeBuddy CLI 的旧路径是无关 JSON 对象、空文件或空 `mcpServers`
- **WHEN** 初始化其他共用新配置文件的客户端或执行 `all`
- **THEN** 不以遮蔽既有 MCP 服务为由阻断
- **AND** `all` 不在已失去优先级的旧文件重复写入 `wot-ui`

#### Scenario: 迁移相同的旧 wot-ui 注册
- **GIVEN** 旧文件只包含与本次生成定义完全一致的 `wot-ui` 服务
- **WHEN** 初始化将创建更高优先级的配置文件
- **THEN** 将服务迁移到新文件，并在同一事务中移除旧条目，保留旧文件的注释和其他设置
- **AND** 重复初始化无变更，后续移除不留下旧注册，写入失败时回滚两份文件
- **AND** 定义不同或含其他服务时仍在写入前报告冲突

#### Scenario: 按引用移除共享规则
- **GIVEN** `AGENTS.md` 托管区块同时包含 `.agents` 和 `.qoder` 的 Skill 引用
- **WHEN** 仅移除 Qoder 的 Instructions
- **THEN** 保留 `.agents` 的引用和托管区块外的原始文字，重复移除不产生变更
- **AND** `all` 移除时各客户端生成一致的共享文件计划

### Requirement: 配置错误与事务失败

新增接入 MUST 沿用计划校验、符号链接边界检查及事务回滚；无效配置或 Instructions 标记 MUST 在修改前报告，不能通过覆盖用户文件掩盖错误。

#### Scenario: 配置损坏
- **GIVEN** 有效目标文件的 JSONC 无法解析，或 Instructions 托管标记不完整
- **WHEN** 用户初始化或移除
- **THEN** 报告对应文件错误并保留原文件，不通过创建另一个更高优先级文件绕过错误

#### Scenario: 写入中途失败
- **GIVEN** Agent 初始化包含多个文件变更
- **WHEN** 某个提交步骤失败
- **THEN** 回滚已写入内容，并按现有格式报告失败及回滚结果

### Requirement: 诊断与文档准确

`doctor` MUST 区分文件配置、独立 MCP 服务握手和客户端内实际注册状态。没有可靠注册检查时 MUST 返回现有 `unsupported` 或等价未验证状态，并提供客户端内确认步骤，MUST NOT 将独立服务可用宣称为 IDE 或 CLI 已加载。

#### Scenario: 独立服务握手通过
- **GIVEN** 生成的命令可启动并暴露 `wot_status`、`wot_list`
- **WHEN** 执行 `doctor`
- **THEN** 报告服务握手结果，并独立报告客户端注册的验证结果或限制

#### Scenario: 查看接入说明
- **WHEN** 用户阅读 README 的支持矩阵和示例
- **THEN** 能区分四种客户端 ID、实际 scope、配置路径、Skill / Instructions 位置和必要的客户端确认或重启步骤

- **AND** 接入说明明确 CodeBuddy CLI 1.7.0 与当前路径策略不兼容，未验证最低兼容版本，不以独立握手通过替代客户端内加载确认
