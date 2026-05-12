# 升级后常见错误与修复

用户升级到 v2 后，优先对照本文件排查报错。每条错误给出原因和最小修复步骤，详细操作引用对应子文件。

---

## 模块找不到

### `Cannot find module 'wot-design-uni'` / `Module not found: 'wot-design-uni'`

**原因**：项目中仍有代码从旧包名导入，但新包已是 `@wot-ui/ui`。

**修复**：
1. 全局搜索 `from 'wot-design-uni'` 替换为 `from '@wot-ui/ui'`
2. 搜索 `from '@/uni_modules/wot-design-uni'` 替换为 `from '@/uni_modules/wot-ui'`
3. 确认 `tsconfig.json` 已将 types 中的 `wot-design-uni/global` 改为 `@wot-ui/ui/global`

详见 `infra.md`。

---

### `Cannot find module '@/uni_modules/wot-design-uni/components/common/util'`

**原因**：工具函数路径在 v2 中变更。

**修复**：
```
旧: from '@/uni_modules/wot-design-uni/components/common/util'
新: from '@/uni_modules/wot-ui/common/util'
```

或使用 npm 入口：
```ts
import { CommonUtil } from '@wot-ui/ui'
CommonUtil.isArray([])
```

详见 `infra.md`。

---

## 组件找不到

### `Component wd-message-box not found` / `<wd-message-box> is not registered`

**原因**：`wd-message-box` 在 v2 中已改名为 `wd-dialog`。

**修复**：
- 模板：`<wd-message-box />` → `<wd-dialog />`
- 注意 `closeOnClickModal` 默认值由 `true` 变为 `false`

详见 `components.md`（MessageBox → Dialog 章节）。

---

### `Component wd-status-tip not found`

**修复**：`<wd-status-tip>` → `<wd-empty>`，图标名按需调整。

详见 `components.md`（StatusTip → Empty 章节）。

---

### `Component wd-col-picker not found`

**修复**：`<wd-col-picker>` → `<wd-cascader>`，`columns` → `options`，`column-change` → `lazy-load`。

详见 `components.md`（ColPicker → Cascader 章节）。

---

### `Component wd-number-keyboard not found`

**修复**：`<wd-number-keyboard>` → `<wd-keyboard>`，添加 `mode="custom"` 等属性。

详见 `components.md`（NumberKeyboard → Keyboard 章节）。

---

## Hook / 函数报错

### `useMessage is not a function` / `useMessage is not defined`

**原因**：v2 将 `useMessage` 改名为 `useDialog`。

**修复**：
```ts
// v1
import { useMessage } from 'wot-design-uni'
const message = useMessage()
message.confirm(...)

// v2
import { useDialog } from '@wot-ui/ui'
const dialog = useDialog()
dialog.confirm(...)
```

详见 `components.md`（MessageBox → Dialog 章节）。

---

### `useDialog is not defined` / 弹框调用后无响应

**原因**：页面中没有声明 `<wd-dialog />` 实例，函数式调用依赖页面中存在对应实例。

**修复**：在使用 `useDialog()` 的页面模板中添加：
```vue
<wd-dialog />
```

如果同一页面有多个弹框，使用 `selector` 区分：
```vue
<wd-dialog selector="my-dialog" />
<script setup>
const dialog = useDialog('my-dialog')
</script>
```

---

## TypeScript 类型报错

### `FormRules is not exported from 'wot-design-uni'` / `Property 'rules' does not exist on type`

**原因**：v2 的表单校验体系从 `rules`/`FormRules` 迁移到 `schema`/`FormSchema`。

**修复**：
```ts
// v1
import type { FormRules } from '@/uni_modules/wot-design-uni/components/wd-form/types'
const rules: FormRules = { username: [{ required: true, message: '请填写用户名' }] }

// v2（推荐 zodAdapter）
import { z } from 'zod'
import { zodAdapter } from '@wot-ui/ui'
const schema = zodAdapter(z.object({ username: z.string().min(1, '请填写用户名') }))
```

详见 `form.md`。

---

### `Property 'rules' does not exist on type 'WdInput'` / `WdFormItem` 上 prop 不存在

**原因**：v2 的 `prop` 和校验规则从输入组件迁移到了 `wd-form-item`，输入组件不再承载表单职责。

**修复**：
```vue
<!-- v1 -->
<wd-input label="用户名" prop="username" v-model="model.username"
  :rules="[{ required: true, message: '请填写用户名' }]" />

<!-- v2 -->
<wd-form-item title="用户名" prop="username">
  <wd-input v-model="model.username" />
</wd-form-item>
```

详见 `form.md`。

---

### 类型导入路径错误（`UploadFileItem` / `WdFormInstance` 等）

**修复**：
```ts
// v1
import type { UploadFileItem } from '@/uni_modules/wot-design-uni/components/wd-upload/types'

// v2
import type { UploadFileItem } from '@/uni_modules/wot-ui/components/wd-upload/types'
```

---

## Sass / 样式编译警告

### `@import is deprecated. Dart Sass will remove it in a future version.`

**原因**：项目仍使用 `@import` 引入 Sass 文件，v2 推荐使用 `@use`。

**修复**：将 `@import './variables.scss'` 改为 `@use './variables.scss' as *`，如果文件中使用了旧除法 `/` 改为 `math.div()`。

详见 `styles.md`。

---

### `Deprecation Warning: Using / for division outside of a calc() is deprecated`

**修复**：
```scss
// 旧
width: 100px / 2;

// 新
@use 'sass:math';
width: math.div(100px, 2);
```

详见 `styles.md`。

---

### `Deprecation Warning [legacy-js-api]: ...`

**修复**：在 `vite.config.ts` 中配置：
```ts
css: {
  preprocessorOptions: {
    scss: {
      api: 'modern-compiler',
      silenceDeprecations: ['legacy-js-api']
    }
  }
}
```

详见 `styles.md`。

---

## easycom / 组件自动注册问题

### 所有 `wd-*` 组件在页面中无法识别 / Volar 无组件类型提示

**原因**：`easycom` 或 `tsconfig.json` 中的配置仍指向旧包名。

**修复**（npm 安装）：
- `pages.json`：
  ```json
  { "^wd-(.*)": "@wot-ui/ui/components/wd-$1/wd-$1.vue" }
  ```
- `tsconfig.json`：
  ```json
  { "types": ["@wot-ui/ui/global"] }
  ```

详见 `infra.md`。

---

## 视觉/行为异常（非报错）

### 表单项高度/间距异常（比 v1 更紧凑或更松散）

**原因**：`wd-form-item` 与 `wd-input`、`wd-textarea` 组合时会自动激活 `compact` 模式，可能导致间距变化。

**排查**：检查 `wd-form-item` 是否包裹了 `input` / `textarea`，以及是否有与 v1 不同的 `title-width`、`layout`、`border` 设置。

详见 `form.md`（基础结构迁移章节）。

---

### Dialog 点击遮罩不关闭

**原因**：`closeOnClickModal` 默认值从 v1 的 `true` 变为 v2 的 `false`。

**修复**：显式设置 `close-on-click-modal` 属性：
```vue
<wd-dialog close-on-click-modal />
```

---

### Prompt 弹框获取不到输入内容

**原因**：v2 Prompt 返回值为 `DialogResult` 对象，输入内容在 `res.value` 中。

**修复**：
```ts
// v1：res 直接是字符串
dialog.prompt(...).then(res => console.log(res))

// v2：res.value 才是输入内容
dialog.prompt(...).then(res => console.log(res.value))
```

---

### Radio / Checkbox 的形态渲染不正确

**原因**：`shape` 属性在 v2 中改为 `type`，`inline` 改为 `direction="horizontal"`。

**修复**：参见 `components.md`（Radio/Checkbox 章节）。

---

### 按钮视觉与 v1 不一致（圆角 / 高度）

**原因**：v2 中 `Button` 的 `round` 默认值为 `false`，高度由固定高度控制（不再通过内边距撑开）。

**修复**：如果需要恢复圆角外观，显式设置 `round`；如需自定义高度，使用 `custom-style`。
