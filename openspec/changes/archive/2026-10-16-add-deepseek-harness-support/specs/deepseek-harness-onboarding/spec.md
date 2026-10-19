# DeepSeek Harness 接入规格

## Purpose

为 DeepSeek Harness 用户提供一致的 wot-ui MCP 与项目知识接入流程，涵盖客户端发现、用户级配置安装和移除、项目资产复用及可验证的诊断结果，并保护已有配置与用户修改，避免将配置存在误认为客户端已经加载。

## ADDED Requirements

### Requirement: 客户端选择与范围兼容
CLI MUST 识别 `deepseek`，显示名称为 DeepSeek Harness，仅声明支持用户级 MCP；MUST 保持原有客户端选择、输出结构及多客户端歧义处理语义。

#### Scenario: 探测客户端
- **GIVEN** PATH 中存在 `dsh` 可执行文件，或解析后的用户级配置文件存在
- **WHEN** 用户执行 `wot mcp list` 或 `wot agent list`
- **THEN** 列表包含已探测的 `deepseek`，且 MCP 列表显示实际配置位置

#### Scenario: 拒绝项目级配置
- **WHEN** 用户显式选择 `deepseek` 执行带 project scope 的配置操作
- **THEN** 命令非零退出并提示使用 `--scope user`，不写入任何文件
- **AND** 未指定 scope 时继续采用既有 project 默认值，不暗中改为用户级

#### Scenario: 全客户端选择
- **WHEN** 用户选择 `--client all`
- **THEN** user scope 包含 DeepSeek，project scope 排除 DeepSeek
- **AND** auto 仍按选定 scope 筛选客户端，多匹配时仍要求显式选择

### Requirement: 用户级配置位置与预览
系统 MUST 按 DeepSeek 的路径规则解析非空 `DSH_HOME`，否则使用 `~/.dsh`，目标文件为 `cordis.patch.yml`；预览 MUST 返回可合入该文件的完整补丁片段，保留 `--pin` 语义。

#### Scenario: 默认与自定义配置根
- **GIVEN** `DSH_HOME` 未设置、为空白、为绝对路径、相对路径或当前用户的波浪号路径
- **WHEN** 用户预览或初始化用户级配置
- **THEN** 空白值使用默认目录，其余值按当前用户主目录及执行目录解析为绝对配置位置
- **AND** 自定义位置在默认用户主目录外时仍使用明确且受限的写入边界

#### Scenario: 预览固定版本
- **WHEN** 用户执行 `wot mcp print --client deepseek --scope user --pin 1.1.0`
- **THEN** 输出一个插入官方 MCP 客户端插件的 YAML 补丁，服务名为 `wot-ui`，stdio 启动参数引用 `@wot-ui/cli@1.1.0 mcp`
- **AND** 不写入文件，不启动 DSH，不安装插件

### Requirement: 配置安装幂等并保留用户内容
系统 MUST 通过可识别的专属条目管理 wot-ui 配置，重复执行相同安装不得追加重复条目；MUST 保留无关 YAML 内容、注释与自定义标签，MUST NOT 执行配置中的 JavaScript 表达式。

#### Scenario: 初次安装及重复安装
- **GIVEN** 用户级配置不存在或为合法补丁列表
- **WHEN** 用户连续两次执行相同 init
- **THEN** 最终仅有一个 open-wot 管理的服务条目，第二次没有文件内容变更
- **AND** 该条目能在受支持的 DSH 标准模式中暴露现有 wot-ui 工具

#### Scenario: 保留无关配置
- **GIVEN** 文件包含其他插件、注释、CRLF 换行及 `!!js` 标签
- **WHEN** 用户安装、更新版本或移除 open-wot 管理的条目
- **THEN** 无关源文本保持不变，表达式不被执行，文件仍可由 DSH 加载

#### Scenario: 拒绝损坏或冲突配置
- **GIVEN** YAML 损坏、根结构错误、重复键，或文件内存在重复托管条目、非托管的同名服务、修改过的托管条目及无法唯一定位目标的引用
- **WHEN** 用户执行 init 或 remove
- **THEN** 命令非零退出，说明冲突位置或类型，不覆盖或猜测修复配置
- **AND** status 或 doctor 显示问题，不报告配置匹配

### Requirement: 预览与事务保护
DeepSeek 接入 MUST 复用既有确认、dry-run、并发修改检查、路径保护及事务回滚语义，公共输出 MUST NOT 泄露配置中的秘密值。

#### Scenario: 干运行
- **WHEN** 用户执行 `wot agent init --client deepseek --scope user --dry-run`
- **THEN** 展示 MCP 与所选项目资产的变更计划、用户级作用范围，不创建目录或写入文件
- **AND** 文本与 JSON 预览只包含允许显示的目标及变更摘要

#### Scenario: 写入失败回滚
- **GIVEN** 组合计划包含 MCP、Skill 和 Instructions，执行时后续文件提交失败
- **WHEN** 应用计划
- **THEN** 已写入的文件恢复至原内容，新建文件被撤销，命令非零退出并报告回滚结果
- **AND** 回滚自身失败时报告未恢复的目标及保留的恢复信息

#### Scenario: 拒绝并发修改及越界链接
- **GIVEN** 计划形成后目标内容被修改，或目标符号链接逃逸授权根目录
- **WHEN** 应用计划
- **THEN** 写入被拒绝，保留并发产生的内容，不向越界路径写入

### Requirement: 移除仅作用于托管内容
系统 MUST 仅移除完整可识别的 open-wot 托管 MCP 条目；不存在时 MUST 为无操作，MUST 保留同文件其他补丁以及用户修改过的项目资产。

#### Scenario: 移除与重复移除
- **GIVEN** 已安装的托管条目与其他插件共存
- **WHEN** 用户连续执行两次 remove
- **THEN** 首次只删除托管条目，第二次无文件内容变更，其他插件继续存在

### Requirement: 复用可发现的项目资产
Agent 接入 MUST 继续将 Skill 放在 `.agents/skills/wot-ui-v2`，将 Instructions 放在当前项目 `AGENTS.md` 的既有托管区块；user scope MUST NOT 将这些资产改写到用户主目录。

#### Scenario: 在项目根安装
- **GIVEN** 执行目录是最近的 Git 根目录，或没有 Git 祖先
- **WHEN** 用户运行 `wot agent init --client deepseek --scope user`
- **THEN** 默认安装 MCP、Skill 和 Instructions，重复执行不重复追加内容
- **AND** 保留已有非托管 Instructions，用户修改过的 Skill 文件保持不变并产生提示

#### Scenario: 子目录导致 Skill 不可发现
- **GIVEN** 执行目录处于 Git 项目子目录，最近的 `.git` 标记可以是目录或 worktree 文件
- **WHEN** 用户初始化或移除包含 Skill 的 DeepSeek 接入
- **THEN** 写操作开始前失败，并提示用 `--cwd` 指向发现的项目根
- **AND** 不自动向父目录写入；status 和 doctor 报告该定位问题

#### Scenario: 只管理 MCP
- **WHEN** 用户在项目子目录选择 `--with mcp --scope user`
- **THEN** 不因 Skill 根定位阻止 MCP 操作，也不修改项目资产

### Requirement: 诊断区分服务可用与客户端加载
doctor MUST 检查配置及 MCP 握手，并验证 `wot_status` 和 `wot_list` 存在；未获得 DSH 实际加载证据时 MUST 返回 `server-ready` 及明确的人工验证指引，MUST NOT 报告 `ready`。

#### Scenario: 服务可用但未验证运行时
- **GIVEN** 配置匹配且 MCP 握手成功
- **WHEN** 用户执行 DeepSeek doctor
- **THEN** 服务检查通过，客户端注册检查显示 `unsupported`，总体状态为 `server-ready`
- **AND** 指引说明在标准模式确认工具并实际调用；不自动启动 DSH、不运行可能初始化 profile 的配置导出命令

#### Scenario: 配置或服务失败
- **GIVEN** 托管条目无效、被禁用、启动超时或缺少必需工具
- **WHEN** 用户执行 doctor
- **THEN** 返回失败及非零退出码，不把独立握手成功当成客户端注册成功

### Requirement: 公开使用边界
README MUST 说明用户级 MCP 对加载该层的 profiles 生效、项目资产位置、project scope 不受支持以及 DSH 不支持 MCP prompt templates；MUST 保持 README 为接入流程唯一文档源。

#### Scenario: 用户按文档接入
- **WHEN** 用户遵循 README 的 DeepSeek 示例
- **THEN** 示例显式使用 `--scope user`，包含预览、安装、诊断、移除和标准模式验证步骤
- **AND** 文档不承诺任意自定义 profile 或极简模式具有完整 MCP、Skill 和 Instructions 能力
