---
name: create-wot-ui-theme
description: '为 wot-ui 生成单文件主题 SCSS，并在用户明确要求接入时追加 App.vue 的 `@use`。当用户要做品牌主题、语义变量落地、单文件主题接入时使用。'
argument-hint: '主题名、主题风格、主色阶、自定义范围、是否需要接入 App.vue'
---

# Create Wot-ui Theme Skill

这个 skill 用于在 `wot-ui` 项目中生成“单文件主题 SCSS”方案。它约束主题文件在 `src/themes/styles` 下完成语义变量定义与挂载，`App.vue` 只负责 `@use` 引入，不扩展成 light/dark 双文件结构，也不改造 `uni_modules/wot-ui/styles/theme/index.scss`。

## 适用场景

- 用户明确要求为 `wot-ui` 生成品牌主题、业务主题或定制语义变量主题。
- 用户希望新增 `src/themes/styles/{主题名}.scss`，并把挂载逻辑也收进主题文件。
- 用户要求 `App.vue` 只保留 `@use './themes/styles/{主题名}.scss' as {主题名};` 这一类引入。
- 用户强调不要生成 dark 主题文件、不要拆成双文件主题结构、不要改内置主题入口。

## 不适用场景

- 用户只是想知道 `wd-config-provider` 或普通 CSS 变量怎么用，这种情况优先使用 `wot-ui-v2` skill。
- 用户要做 light/dark 双主题、动态换肤系统、运行时 token 注入，这不属于本 skill 的目标结构。
- 当前仓库没有实际业务 `src/App.vue` 或主题目录时，不要臆造文件；应基于用户目标项目路径执行，或先向用户确认目标工程位置。

## 核心约束

- 只生成一个主题文件：`src/themes/styles/{主题名}.scss`。
- 主题文件内必须同时包含：
  - 一个 `@mixin {主题名}-theme-vars`
  - `page`、`.wot-theme-{主题名}`、`.wot-theme-{主题名} .wd-root-portal` 的挂载选择器
- `App.vue` 只负责 `@use` 引入，不重复写挂载选择器。
- 所有语义变量都必须填写固定色值或 `transparent`，不要写成 `var(--wot-xxx)`。
- 不生成 `dark.scss`，不修改 `uni_modules/wot-ui/styles/theme/index.scss`。
- 如果用户没有明确要求接入 `App.vue`，默认只生成主题文件并给出应追加的 `@use` 语句。

## 执行前确认

生成前优先确认这些信息；缺少时先问清楚再动手：

1. 主题名称，例如 `antd`、`ocean`、`forest`
2. 主题风格描述，例如品牌化、偏中性、偏高对比
3. 主色 10 阶是否全部自定义
4. `danger`、`success`、`warning` 是否沿用默认值
5. 文本、边框、填充、反馈态是否需要整体调性调整
6. 是否需要同步接入 `src/App.vue`

## 推荐流程

1. 先查看项目里是否已存在 `src/themes/styles/*.scss` 与 `src/App.vue`，确认接入位置和现有顺序。
2. 若用户未给足主题信息，先收集主题名、风格和 token 调整范围。
3. 创建 `src/themes/styles/{主题名}.scss`，按本 skill 的完整模板输出全部语义变量。
4. 如用户明确要求接入，再在 `src/App.vue` 的 `<style lang="scss">` 中只追加 `@use './themes/styles/{主题名}.scss' as {主题名};`。
5. 检查变量是否完整、值是否全为固定色值、挂载选择器是否在主题文件内。

## 主题文件要求

### 结构要求

- 只保留一个 mixin，命名为 `{主题名}-theme-vars`
- 注释风格尽量贴近 `antd.scss` 这种语义分组写法
- 挂载选择器直接写在同一文件末尾
- mixin 调用形式固定为 `@include {主题名}-theme-vars();`

### App.vue 要求

- 只追加 `@use './themes/styles/{主题名}.scss' as {主题名};`
- 不在 `App.vue` 里重复写 `page, .wot-theme-{主题名}` 这些挂载块
- 如果已有其他主题 `@use`，保持原有顺序和已有块不被破坏，只追加当前主题

## 完整变量模板

```scss
@mixin {主题名}-theme-vars {
  /* {主题描述} semantic tokens */
  /* Primary */
  --wot-primary-1: #F5F8FFFF;
  --wot-primary-2: #E5EDFFFF;
  --wot-primary-3: #B8CFFFFF;
  --wot-primary-4: #7CA4FFFF;
  --wot-primary-5: #4480FFFF;
  --wot-primary-6: #1C64FDFF;
  --wot-primary-7: #164ED1FF;
  --wot-primary-8: #1341ADFF;
  --wot-primary-9: #0F3285FF;
  --wot-primary-10: #0A235CFF;

  /* Danger */
  --wot-danger-main: #F14646FF;
  --wot-danger-hover: #FB7C7CFF;
  --wot-danger-clicked: #DC2C2CFF;
  --wot-danger-disabled: #FFC9C9FF;
  --wot-danger-particular: #FFE3E3FF;
  --wot-danger-surface: #FFF5F5FF;

  /* Success */
  --wot-success-main: #12B886FF;
  --wot-success-hover: #59CDAAFF;
  --wot-success-clicked: #0F956CFF;
  --wot-success-disabled: #B8EADBFF;
  --wot-success-particular: #E7F8F3FF;
  --wot-success-surface: #F3FBF9FF;

  /* Warning */
  --wot-warning-main: #F57F00FF;
  --wot-warning-hover: #FFA94DFF;
  --wot-warning-clicked: #D05706FF;
  --wot-warning-disabled: #FFD8A8FF;
  --wot-warning-particular: #FFE8CCFF;
  --wot-warning-surface: #FFF6EBFF;

  /* Text */
  --wot-text-main: #1D1F29FF;
  --wot-text-secondary: #4E5369FF;
  --wot-text-auxiliary: #868A9CFF;
  --wot-text-disabled: #C9CBD4FF;
  --wot-text-placeholder: #A9ACB8FF;
  --wot-text-white: #FFFFFFFF;

  /* Icon */
  --wot-icon-main: #1D1F29FF;
  --wot-icon-secondary: #4E5369FF;
  --wot-icon-auxiliary: #868A9CFF;
  --wot-icon-disabled: #C9CBD4FF;
  --wot-icon-placeholder: #A9ACB8FF;
  --wot-icon-white: #FFFFFFFF;

  /* Border */
  --wot-border-extra-strong: #868A9CFF;
  --wot-border-strong: #C9CBD4FF;
  --wot-border-main: #E5E6EBFF;
  --wot-border-light: #F2F3F5FF;
  --wot-border-white: #FFFFFFFF;
  --wot-border-zero: transparent;

  /* Filled */
  --wot-filled-extra-strong: #C9CBD4FF;
  --wot-filled-strong: #E5E6EBFF;
  --wot-filled-content: #F2F3F5FF;
  --wot-filled-bottom: #F7F8FAFF;
  --wot-filled-oppo: #FFFFFFFF;
  --wot-filled-zero: transparent;

  /* Divider */
  --wot-divider-main: #00000014;
  --wot-divider-light: #0000000A;
  --wot-divider-strong: #00000026;
  --wot-divider-white: #FFFFFFFF;

  /* Feedback */
  --wot-feedback-hover: #0000000A;
  --wot-feedback-active: #00000014;
  --wot-feedback-accent: #1C64FD14;

  /* Opacity filled */
  --wot-opacfilled-tooltip-toast-cover: #000000BF;
  --wot-opacfilled-main-cover: #0000008C;
  --wot-opacfilled-light-cover: #0000004D;

  /* Picker view mask */
  --wot-picker-view-mask-start-color: #FFFFFFD9;
  --wot-picker-view-mask-end-color: #FFFFFF33;

  /* Classify application */
  --wot-classifyapplication-yellow-background: #FFFAF1FF;
  --wot-classifyapplication-yellow-border: #FDD78CFF;
  --wot-classifyapplication-yellow-content: #FAAD14FF;
  --wot-classifyapplication-Cyan-background: #F4FBFDFF;
  --wot-classifyapplication-Cyan-border: #BDEAF1FF;
  --wot-classifyapplication-Cyan-content: #22B8CFFF;
  --wot-classifyapplication-Purple-background: #F9F8FFFF;
  --wot-classifyapplication-Purple-border: #D0BFFFFF;
  --wot-classifyapplication-Purple-content: #8059F3FF;
  --wot-classifyapplication-Grape-background: #FBF6FDFF;
  --wot-classifyapplication-Grape-border: #EEBEFAFF;
  --wot-classifyapplication-Grape-content: #AE3EC9FF;
  --wot-classifyapplication-Pink-background: #FFF0F6FF;
  --wot-classifyapplication-Pink-border: #FCC2D7FF;
  --wot-classifyapplication-Pink-content: #FF357CFF;
}

page,
.wot-theme-{主题名},
.wot-theme-{主题名} .wd-root-portal {
  @include {主题名}-theme-vars();
}
```

## 输出检查清单

- [ ] 主题文件位于 `src/themes/styles/{主题名}.scss`
- [ ] 文件包含一个 `@mixin {主题名}-theme-vars`
- [ ] 文件内完成 `page`、`.wot-theme-{主题名}`、`.wot-theme-{主题名} .wd-root-portal` 挂载
- [ ] 包含主色、功能色、文字、图标、边框、填充、分割线、反馈、透明填充、Picker View 遮罩、分类色全部变量
- [ ] 所有值都是固定色值或 `transparent`
- [ ] `App.vue` 中若接入，只追加 `@use './themes/styles/{主题名}.scss' as {主题名};`
- [ ] mixin 调用形式为 `@include {主题名}-theme-vars();`

## 回答与实现规则

- 用户未明确要求接入时，不要主动改 `App.vue`
- 用户未明确要求时，不要顺手生成 dark 主题、变量映射层或额外目录结构
- 生成代码时优先保持最小改动，不破坏现有主题文件顺序、选择器范围和项目风格
- 如果发现项目里已有不同主题体系，先说明差异，再确认是否仍按本单文件结构落地
