# DeepSeek 桌面版项目级 MCP 接入

## Why

当前 open-wot 的 DeepSeek MCP 配置作用于用户级，无法让桌面版在不同项目中自动使用各自的服务配置。用户希望在桌面版打开项目后自动获得该项目的 wot-ui 工具，并保证其他项目不会继承它。

## What Changes

- 支持 `wot agent init --client deepseek` 的默认 project scope；用户级接入继续通过 `--scope user` 使用。
- 项目保存可提交的 `.dsh/wot-ui.json` 声明；首次初始化同时安装用户级加载桥接，并登记本机允许加载的项目根目录。预览明确展示两类写入。
- 桌面版标准模式创建或恢复项目会话时，桥接按会话目录选择已登记项目，仅在该会话作用域注册官方 MCP 客户端，并设置服务工作目录。
- 支持项目预览、幂等安装、状态、诊断、移除、固定版本及组合事务；无配置的项目不获得项目级 wot-ui 工具。
- 已有用户级同名服务时明确报冲突并提供迁移命令，不静默删除全局接入；非托管配置保持不变。
- README 仅补充通用接入流程中的必要差异，不恢复冗长的 DeepSeek 独立章节。

非目标：任意项目插件执行、修改 DeepSeek 桌面安装包、自动切换模式、修改模型与凭证、支持所有自定义 profile、保证现存会话即时热更新。首次安装桥接需要重新加载或重启 Harness，配置更新通过重新打开会话生效。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `deepseek-harness-onboarding`：扩展 project scope、桌面自动加载与会话隔离、项目登记和生命周期、诊断及公开使用边界。

## Impact

- CLI/application：扩展 DeepSeek adapter、scope 选择、项目根检查及跨根事务计划；project scope 的 all/auto 将按既有规则包含 DeepSeek。
- 运行时/打包：新增随 CLI 发布的最小桥接产物；使用宿主兼容的官方 MCP 客户端，不能引入另一套 Harness 服务实例。源码调研表明存在按 Agent 隔离的上下文和可等待的创建事件，但真实桌面兼容性必须先验证。
- 存储：新增项目声明与用户级桥接/项目登记，保留既有用户级 YAML 服务格式及其他客户端语义。
- 输出：预览和 doctor 增加桥接、登记与冲突说明；不把独立握手成功当作桌面加载证据。
- MCP tools/prompts、离线数据、发布的组件 Skill 内容保持不变。README 及其官网展示、测试、包内容和 OpenSpec 受影响。
