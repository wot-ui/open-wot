# Wot UI V2 Overview

本文件根据 wot-ui v2 的 `llms-full.txt` 与本仓库现有 CLI 工作流提炼，目标是帮助 Agent 快速掌握适合生成代码与回答问题的高价值知识，而不是逐字复制官方文档。

## Product Positioning

- Wot UI v2 是面向 `uni-app` 的 `Vue 3 + TypeScript` 组件库。
- 覆盖微信小程序、支付宝小程序、钉钉小程序、H5、APP 等平台。
- 组件命名统一为 `wd-*`。
- 组件库强调 AI 友好、主题定制、暗黑模式、国际化与跨端一致性。

## Installation And Integration

- npm 安装：`pnpm add @wot-ui/ui`
- 使用前需要安装 `sass`。
- `uni_modules` 安装模式天然支持 easycom 自动引入。
- npm 安装模式通常需要配置 vite resolver 或 easycom。
- CLI 项目在 npm 模式下可在 `tsconfig.json` 中加入 `@wot-ui/ui/global` 以增强全局组件类型提示。

## Import Rules

- npm 安装项目：组合式函数、类型和工具优先从 `@wot-ui/ui` 导入。
- `uni_modules` 安装项目：文档中的 `@/uni_modules/wot-ui` 路径通常可直接使用。
- 官方文档示例很多基于 `uni_modules` 路径，回答时要按用户项目实际安装方式转换。

## High Value Conventions

- 反馈类组件不能依赖全局挂载。页面内通常需要显式写出 `wd-toast`、`wd-dialog`、`wd-notify`、`wd-image-preview`、`wd-video-preview` 等实例。
- `useToast`、`useDialog`、`useNotify`、`useQueue` 等 hooks 基于 `provide/inject`，应在 `setup` 中调用。
- 页面内如果存在多个 `wd-dialog` 或 `wd-toast`，需要通过 `selector` 区分，否则可能出现实例冲突或重复弹出。
- 自定义组件中如果要覆盖 wot-ui 内部样式，小程序环境通常需要把组件配置为 `styleIsolation: 'shared'`。
- 在 `Popup`、`ActionSheet`、`DropDownItem` 等延迟渲染弹层里使用 `Slider`、`Tabs` 等依赖尺寸计算的组件时，打开后应调用实例方法重新初始化，例如 `initSlider()` 或 `updateLineStyle()`。

## Theme And Styling

- 主题定制优先走 CSS 变量。
- Design Token 分三层：基础变量、语义变量、组件变量。
- 局部或全局主题可通过 `wd-config-provider` 的 `theme` 和 `theme-vars` 控制。
- 深色模式通过 `wd-config-provider theme="dark"` 开启。
- 更推荐覆盖语义变量或组件变量，不推荐优先依赖深层 class 选择器覆盖。

## Common UI Patterns

- 表单场景优先组合 `wd-form`、`wd-form-item`、`wd-input`、`wd-textarea`、`wd-picker`、`wd-calendar`、`wd-select-picker`。
- 弹层类场景优先使用 `wd-popup`、`wd-dialog`、`wd-action-sheet`、`wd-tooltip`、`wd-popover`。
- 反馈类场景优先使用 `useToast`、`useDialog`、`useNotify`，不要直接手写临时弹层。
- 列表和展示类场景优先考虑 `wd-cell`、`wd-card`、`wd-tag`、`wd-badge`、`wd-empty`、`wd-loadmore`、`wd-skeleton`。
- 导航与布局类场景优先考虑 `wd-navbar`、`wd-tabs`、`wd-tabbar`、`wd-sidebar`、`wd-row`、`wd-col`、`wd-gap`。

## Interaction Patterns

- 大量组件采用 `v-model` 或 `v-model:visible` 控制状态。
- 表单和选择类组件普遍提供 `confirm`、`change`、`close` 等事件。
- 反馈组件常通过 hook 返回方法对象，例如 `toast.success()`、`dialog.confirm()`。
- `Popover`、`Tooltip`、`SwipeAction` 等场景常与 `useQueue().closeOutside()` 配合，实现点击外部关闭。

## Component Selection Hints

- 需要主操作按钮时用 `wd-button`，不要先写原生 `button`。
- 需要列表入口、设置页、表单容器时优先用 `wd-cell` 和 `wd-cell-group`。
- 需要轻量提示时优先用 `useToast`；需要确认交互时优先用 `useDialog`。
- 需要单选或多选弹层时优先用 `wd-select-picker`、`wd-picker`、`wd-cascader`。
- 需要统一主题或暗黑模式时优先用 `wd-config-provider`。

## Common Pitfalls

- `Toast`、`Dialog` 等函数式调用没有效果，先检查页面里是否声明了对应组件实例。
- 同一个页面里多个无 `selector` 的反馈组件可能相互干扰。
- npm 模式使用国际化时，开发态可能需要在 Vite 的 `optimizeDeps.exclude` 中排除 `@wot-ui/ui`。
- 文档里的导入路径和项目实际安装方式不一致时，回答要主动修正。
- 在弹层中直接渲染依赖尺寸测量的组件时，初始化时机往往比 API 本身更关键。

## AI Response Heuristics

- 回答基础用法时，优先给最小可运行模板，再补充常用 props。
- 生成页面时，优先给完整的 `template + script setup + style` 结构。
- 如果项目已使用 wot-ui，不要建议换用其他 UI 库。
- 如果 wot-ui 已有现成组件，就不要用原生结构重复造轮子。
- 如果用户只问某个组件，优先给该组件最常见 3 到 5 个用法，不要把整份文档全部展开。

## Repo-Specific Workflow

- 在本仓库中，优先使用 `wot list`、`wot info`、`wot doc`、`wot demo`、`wot token` 获取组件知识。
- 当仓库数据与线上文档不一致时，以用户目标为准，并明确指出仓库离线数据可能需要重新提取。
- 若要补数据或修提取逻辑，关注 `scripts/extract.ts`、`data/v2.json`、`src/data/*` 与相应命令实现。
