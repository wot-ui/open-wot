# DeepSeek Harness 接入规格

## Purpose

为 DeepSeek Harness 用户提供一致的 wot-ui MCP 与项目知识接入流程，涵盖客户端发现、用户级与项目级配置安装和移除、桌面会话隔离、项目资产复用及可验证的诊断结果，并保护已有配置与用户修改，避免将配置存在误认为客户端已经加载。

## Requirements

### Requirement: 客户端选择与范围兼容
CLI MUST 识别 `deepseek`，显示名称为 DeepSeek Harness，声明支持 project 和 user 两种 MCP scope；MUST 保持原有客户端选择、输出结构及多客户端歧义处理语义。

#### Scenario: 探测客户端
- **GIVEN** PATH 中存在 `dsh` 可执行文件、标准位置存在 DeepSeek 桌面安装，或解析后的项目/用户配置文件存在
- **WHEN** 用户执行 `wot mcp list` 或 `wot agent list`
- **THEN** 列表包含已探测的 `deepseek`，且 MCP 列表显示实际配置位置

#### Scenario: 拒绝项目级配置
- **GIVEN** 项目根不明确、项目配置损坏，或已有用户级同名服务冲突
- **WHEN** 用户执行 DeepSeek project scope 初始化
- **THEN** 命令非零退出并给出修复指引，不写入任何文件

#### Scenario: 全客户端选择
- **GIVEN** 当前目录满足所选能力的位置要求
- **WHEN** 用户选择 `--client all`
- **THEN** user 和 project scope 均包含 DeepSeek
- **AND** auto 仍按选定 scope 筛选客户端，多匹配时仍要求显式选择

#### Scenario: 全客户端接入兼容 Git 子目录
- **GIVEN** 当前目录是 Git 子目录，DeepSeek 的 project MCP 或项目 Skill 要求从 Git 根目录操作
- **WHEN** 用户以 `--client all` 初始化或移除 Agent/MCP 接入
- **THEN** 跳过该次 DeepSeek 计划并给出包含根目录修复指引的 warning，继续规划其他客户端
- **AND** 在 DeepSeek project MCP 或项目 Skill 需要 Git 根目录时，显式选择 `deepseek`，或 `auto` 仅匹配 DeepSeek，仍报位置错误
- **AND** `auto` 匹配多个客户端时先报客户端歧义，不执行位置校验；用户级 MCP 单独操作不受影响
- **AND** 配置损坏、冲突或安全校验错误仍使操作失败，不作为可跳过的位置错误

#### Scenario: 默认使用项目级接入
- **WHEN** 用户执行 `wot agent init --client deepseek` 而未指定 scope
- **THEN** 按 project scope 生成项目配置和必要的本机加载登记，不创建全局 wot-ui 服务
- **AND** 显式 `--scope user` 继续保留原有用户级接入行为

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

#### Scenario: 项目配置未具备加载条件
- **GIVEN** 项目声明存在，但本机登记缺失或过期、桥接缺失或被修改、存在同名用户级服务，或宿主兼容性检查失败
- **WHEN** 用户执行 project scope 的 status 或 doctor
- **THEN** 检查失败并说明对应问题，不把该配置报告为已接入
- **AND** 不自动运行桌面版、修改 profile 或打印无关配置

### Requirement: 公开使用边界
README MUST 说明用户级 MCP 对加载该层的 profiles 生效、项目资产位置、项目级接入需要本机桥接与项目登记以及 DSH 不支持 MCP prompt templates；MUST 保持 README 为接入流程唯一文档源。

#### Scenario: 用户按文档接入
- **WHEN** 用户遵循 README 的 DeepSeek 示例
- **THEN** 通用示例采用默认 project scope，用户级示例显式使用 `--scope user`，预览、安装、诊断、移除和标准模式验证步骤仍适用
- **AND** 文档不承诺任意自定义 profile 或极简模式具有完整 MCP、Skill 和 Instructions 能力

#### Scenario: 文档保持简洁
- **WHEN** 用户查阅 DeepSeek 接入说明
- **THEN** 通用流程说明首次桥接安装需要重新加载或重启、新机器需要重新登记、已有用户级服务的迁移方式
- **AND** 不重复展开一套专用生命周期命令或插件实现细节

### Requirement: 项目配置与本机登记
系统 MUST 将项目级服务声明保存到项目 `.dsh/wot-ui.json`，并通过显式初始化登记本机项目根及安装可复用的桌面加载桥接；MUST 将项目声明视为受限数据，不执行任意项目插件、表达式或启动命令。

#### Scenario: 首次安装与预览
- **WHEN** 用户在项目根执行 project scope 的 init dry-run 或 print
- **THEN** print 输出项目声明；dry-run 展示项目声明、本机桥接、用户级加载项及所选项目资产的全部写入计划，不写文件
- **AND** 正式 init 通过既有确认机制一次性应用这些文件

#### Scenario: 重复安装与版本固定
- **GIVEN** 项目已正确接入
- **WHEN** 用户重复 init 或指定新的 `--pin` 版本
- **THEN** 相同配置为无操作；版本变更仅更新该项目声明与相应本机登记，不改变其他项目版本

#### Scenario: 新机器或项目移动
- **GIVEN** 项目配置来自版本控制或项目移到新目录，尚无匹配的本机登记
- **WHEN** 桌面版创建该项目的会话
- **THEN** 不执行项目声明，用户需在新位置重新执行 init；status/doctor 明确提示未登记

#### Scenario: 声明被修改或损坏
- **GIVEN** 项目声明含未知版本、额外字段、非允许命令、无效结构，或内容与本机登记不一致
- **WHEN** 加载或检查项目接入
- **THEN** 不注册该项目的服务，并给出不包含秘密值的诊断；修复声明后通过 init 明确更新登记

### Requirement: 桌面会话按项目隔离
在受支持的 DeepSeek 桌面标准模式中，系统 MUST 在新建和恢复会话首次使用工具前，按会话真实目录加载匹配的已登记项目，MUST NOT 使用桌面进程的工作目录判断项目；服务与工具 MUST 随所属会话作用域清理。

#### Scenario: 两个项目同时运行
- **GIVEN** A、B 项目登记了不同固定版本，C 项目没有接入，且无用户级全局 wot-ui 服务
- **WHEN** 同一个桌面进程同时创建 A、B、C 会话
- **THEN** A、B 各自可调用对应版本的 `wot_status` 和 `wot_list`，MCP 进程工作目录为各自项目根
- **AND** C 不获得任何项目级 wot-ui 工具，三个会话之间不共享项目服务

#### Scenario: 子目录、链接与嵌套仓库
- **GIVEN** 会话位于已登记项目的子目录、符号链接路径或其下独立的 Git 仓库
- **WHEN** 确定项目配置归属
- **THEN** 同一真实项目目录及普通子目录使用相同登记；不跨越更近的 Git 根继承父项目服务，也不加载越界的配置链接

#### Scenario: 恢复与清理
- **WHEN** 已登记项目的会话恢复，或其 Agent 被销毁
- **THEN** 恢复时重新校验并加载该项目，销毁时撤销其工具并关闭对应子进程，不影响其他会话
- **AND** 配置变更至少在重新打开会话后生效，不承诺现存会话即时热更新

#### Scenario: 不兼容或加载失败
- **GIVEN** 桌面运行时能力不兼容、桥接无法解析宿主 MCP 插件或 MCP 启动失败
- **WHEN** 尝试加载项目服务
- **THEN** 该会话不获得部分注册或其他项目的服务，并留下明确故障诊断；不退回全局注册，不阻止无关项目使用

### Requirement: 双范围冲突与独立移除
系统 MUST 保留已有用户级接入，项目初始化遇到同名全局服务时 MUST 拒绝并提示用户显式迁移；项目移除 MUST 仅撤销当前项目的托管配置和登记，不影响其他登记项目。

#### Scenario: 从用户级迁移
- **GIVEN** 用户已有用户级 wot-ui MCP
- **WHEN** 用户初始化 project scope
- **THEN** 不修改文件，并提示先用 `wot mcp remove --client deepseek --scope user` 移除托管全局服务，再重新初始化项目
- **AND** 非托管或被修改的全局服务仍需用户手动处理，不删除项目 Skill 或 Instructions

#### Scenario: 后加全局服务
- **GIVEN** 已有项目登记
- **WHEN** 用户尝试 user scope 初始化同名全局服务，或其他配置层让运行时出现同名全局服务
- **THEN** CLI 拒绝造成冲突的写入；运行时不再叠加项目服务，并明确报告冲突

#### Scenario: 移除多个项目中的一个
- **GIVEN** A、B 均登记
- **WHEN** 用户移除 A 的 project scope 接入并重新打开会话
- **THEN** A 不再获得项目服务，B 继续可用；重复移除为无操作
- **AND** 最后一个项目移除时，仅清理内容完整且仍由 open-wot 管理的共享桥接，保留用户修改并报告提示

#### Scenario: 跨根写入失败
- **GIVEN** 项目文件、用户级桥接和登记属于同一变更计划
- **WHEN** 任一提交失败、并发内容变化或目标链接越界
- **THEN** 不留下可被误认为成功的部分登记；已提交文件恢复，新文件撤销；回滚失败保留恢复信息并非零退出
