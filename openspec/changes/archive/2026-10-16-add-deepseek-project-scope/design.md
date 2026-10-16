# DeepSeek 桌面项目级接入设计

## Context

动机与范围见 proposal.md。已有 DeepSeek adapter 仅管理用户级独立 insert 条目，配置编辑器保护无关 YAML 源文本；ChangePlan 已支持不存在的 allowedRoot、并发修改检查与跨目录回滚。此次扩展需要在桌面共享运行时中按会话加载，而非仅增加一个项目文件路径。

源码调研基线：桌面 `0.2.0-rc.2`，上游修订 `639ed015397290b3745d163aafe02ffee4aa3f84`。

- [CLI 配置层](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/cli/README.md)：默认为 bundle、profile、用户层、显式 patch；未提供项目 MCP 自动发现层。
- [桌面宿主](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/apps/desktop/README.md)：桌面启动共享 profile 宿主，不能按全局进程 cwd 推断会话项目。
- [Agent 生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/core/agent/README.md)：本机发布类型声明显示 `agent/created` 监听器串行且可等待，首次工作在监听器完成后开始；Agent 提供所属上下文和会话目录。
- [MCP 客户端](https://github.com/deepseek-ai/deepseek-harness/blob/639ed015397290b3745d163aafe02ffee4aa3f84/packages/mcp/mcp-client/README.md)：服务名在注册作用域内唯一，支持 stdio 的 cwd 与启动失败检查。

这些是方案依据，不是桌面项目隔离已经通过的证据。实现首先进行宿主兼容性验证，失败时不能仅宣布 project scope 可用。

## Goals / Non-Goals

目标：桥接本身可在用户层加载，但 MCP 子进程、工具可见性与清理归属项目会话；项目声明与本机信任登记分离；保留已有用户级适配。

不实现通用插件加载器、不读取项目任意 YAML/JavaScript，不复制整个 Harness 运行时，不改桌面安装包或账户文件。标准模式是首个支持目标；不承诺极简、自定义模式和存量会话热更新。

## Decisions

### 一、受限项目声明与本机登记

项目文件使用 `.dsh/wot-ui.json`，固定 `schemaVersion: 1`，服务仅允许 `command: npx`、`args: ['-y', '@wot-ui/cli[@版本]', 'mcp']`；不接受 env、任意命令、插件路径或表达式。`mcp print --scope project` 输出该声明，不产生任何登记。

用户级 YAML 插入唯一的 `open-wot-project-bridge` 条目，指向 `$DSH_HOME/open-wot/project-bridge.mjs`。桥接配置携带自己的 schema 版本、托管产物完整性摘要 `bridgeHash` 及 `projects` 登记列表，每项仅包含规范化绝对项目根和声明内容摘要。桥接源码随 CLI 发布并复制到稳定用户目录，不引用临时 npx 缓存或当前开发仓库路径。

执行 init 是对本机该项目的明确登记。仅把项目文件拉到另一台机器不触发加载；移动目录或声明内容变化需重新 init。校验固定格式且对合法版本更新展示差异后更新摘要。桥接文件采用与项目资产相同的托管完整性保护，修改过的桥接不强制覆盖。

放弃直接写 `.dsh/cordis.patch.yml` 并宣称自动加载的方案，因为桌面未扫描它；放弃仅提供 `dsh --patch`，因为用户已选择桌面自动接入。

### 二、会话生命周期桥接

采用宿主 `agent/created` 的可等待监听器，覆盖新建、恢复与重建 Agent。使用 Agent 上下文挂载官方 MCP 插件，完成工具发现后释放首次工作。插件模块通过宿主 Loader 的解析环境获得，避免在复制的桥接旁重新安装另一套 Cordis 或 MCP 运行时。桥接产物只携带自身逻辑和必要的纯解析代码。

实施前置验证必须确认宿主模块解析、Agent 上下文插件挂载、工具作用域、失败清理和退出释放均可用。不得通过全局 tools 注册、修改安装包或拦截私有工厂绕过隔离。具体 Loader 挂载 API 以该版本公开接口与实测为准；若宿主不存在满足这些约束的接口，应停止实施并报告，不降级为只有配置文件或 CLI patch 的支持。

每个 Agent 使用独立 MCP 连接和子进程，cwd 固定为匹配项目根。会话内只挂载一次；失败清理不完整工具并输出受控错误，不影响无关会话。Agent 销毁、桥接卸载时关闭其拥有的子进程。首次安装桥接后要求重载或重启；项目变更在重新打开会话时读取，不新增文件监听器。

### 三、项目目录选择

安装在最近的 Git 根执行；Git 子目录提示 `--cwd`，不隐式写父目录。无 Git 标记时将明确的 cwd 作为项目根。仅用户级 MCP 操作继续允许从子目录执行。

运行时使用 `agent.session.header.cwd` 的真实目录。存在最近 Git 根时只匹配该根登记；没有 Git 根时在已登记的祖先中选择最长路径边界匹配。普通子目录可继承登记，独立嵌套仓库不继承外层登记。realpath 校验目录和项目声明，拒绝声明链接逃逸；不从桌面进程 cwd、字符串前缀或某个先创建的会话推断归属。

### 四、scope、事务与移除

`deepseek` 的 supportedScopes 扩展为 project/user，省略 scope 沿用默认 project，all/auto 继续使用现有筛选规则。补充常见桌面安装路径的存在性探测，不启动桌面进程。文件位置和本机桥接可通过列表与预览查看。

project init 生成一个组合 ChangePlan，包含项目声明、桥接产物、用户 YAML 登记以及所选 Skill/Instructions。用户 YAML 根使用解析后的 DSH_HOME，项目资产根使用项目根；不扩大允许根到整个 home 或文件系统。用户 YAML 局部修改继续使用 CST 定位；旧 `open-wot-mcp` 行保持原有识别和保护语义，新桥接行单独校验并拒绝用户扩展字段。

删除项目时只移除当前声明和对应登记；其他项目保持原样。最后一个登记移除后可清理完整的托管桥接与加载行；修改过的共享文件保留并提示。桥接卸载不清理其他插件。所有写入使用原内容比较和既有回滚，不绕过非交互确认。

### 五、全局服务冲突与迁移

用户级旧 `wot-ui` 服务覆盖所有项目，不能与“未登记项目无工具”的语义共存。project init 检查到托管或非托管同名服务时拒绝，不静默变更全局行为。托管服务给出 `wot mcp remove --client deepseek --scope user` 后重新 project init 的指引，保持 Skill/Instructions；非托管服务提示人工处理。

存在项目登记时，user init 同样拒绝引入全局同名服务。来自其他 profile 层的冲突无法只靠用户文件排除，运行时在挂载前检查当前可见工具/注册身份，发现同名全局服务就拒绝项目挂载并记录冲突，不能叠加两个来源或伪称隔离成功。用户手工引入的全局服务仍是其显式全局配置，不由桥接擅自删除。

### 六、诊断、文档与打包

status/doctor 检查项目声明、摘要登记、桥接完整性、可识别的版本兼容性和同名冲突。握手使用项目配置及项目 cwd；成功仍为 `server-ready`，实际桌面加载未知时注册状态保留 unsupported。不能为检测运行时而隐式启动桌面或导出 profile。

README 沿用统一接入流程：移除 DeepSeek 必须 user scope 的限制，补一处首次桥接重启及每台机器登记的说明，按需说明用户级迁移。其他客户端、MCP tools/prompts、离线数据与发布 Skill 内容不变。

桥接以独立、无需编译的 `runtime/deepseek-project-bridge.mjs` 纳入包 files，构建后的 CLI 从发布包读取并复制该产物；使用打包后的临时安装验证复制、稳定路径和宿主解析。无绝对开发路径、不依赖生产包未声明的开发依赖。提交前验证同一桌面宿主的 A/B/C 项目与恢复、销毁行为，不能以三个独立运行进程替代项目隔离验收。

## Risks / Trade-offs

- 上游生命周期与模块解析兼容性 → 先做真实宿主验证，记录支持版本，失败时不开放支持声明。
- 首次 project init 也需要用户层文件 → 预览明确列出桥接和登记；项目级描述限定服务可见性，不声称完全不写用户目录。
- 同一项目多会话带来多个 MCP 进程 → 首版优先清晰的所有权和释放语义，不引入连接池。
- 项目声明被版本控制更新 → 摘要不一致时停用并要求重新 init；不执行未登记的新声明。
- 已有用户级服务迁移影响其他项目 → 明确提示、让用户选择移除，不自动迁移其他目录。
- 退出与加载失败造成资源泄漏 → 同时测启动中取消、半完成挂载、Agent 销毁和桥接卸载。

## Migration Plan

1. 先验证桌面共享宿主作用域，再扩展配置与命令；保留旧 user scope 代码和测试。
2. 新用户以默认 project 初始化；已有用户级服务先显式移除 MCP，再初始化所需项目。
3. 首次重载桌面后在项目会话自动加载；项目移动或新机器需重新 init。
4. 回退可逐个 project remove；如需恢复旧行为，再明确执行 user init。不可在其他项目仍登记时删除共享桥接。
