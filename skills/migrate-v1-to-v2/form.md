# Form 表单体系迁移

v2 中变化最大的组件。v1 偏向"表单组件直接承载校验规则"，v2 统一为 `wd-form` + `wd-form-item` + `schema` 校验模型。

---

## 基础结构迁移

```vue
<!-- v1：输入组件直接承载 prop 和 rules -->
<wd-form ref="form" :model="model" :rules="rules">
  <wd-input label="用户名" prop="username" v-model="model.username"
    :rules="[{ required: true, message: '请填写用户名' }]" />
</wd-form>

<!-- v2：wd-form-item 承载标题、布局、校验提示 -->
<wd-form ref="form" :model="model" :schema="schema" :title-width="100">
  <wd-form-item title="用户名" prop="username">
    <wd-input v-model="model.username" placeholder="请填写用户名" />
  </wd-form-item>
</wd-form>
```

> `wd-form-item` 与 `input`、`textarea` 结合使用时，会自动开启 `compact` 属性。迁移后如果表单项高度或间距有变化，请检查这里。

---

## 校验规则：schema / zodAdapter

```ts
// v1：使用 rules + FormRules
import type { FormRules } from '@/uni_modules/wot-design-uni/components/wd-form/types'
const rules: FormRules = {
  username: [{ required: true, message: '请填写用户名' }]
}

// v2：使用 schema + zodAdapter（推荐，需安装 zod）
import { z } from 'zod'
import { zodAdapter } from '@/uni_modules/wot-ui'  // 或 '@wot-ui/ui'
const schema = zodAdapter(
  z.object({
    username: z.string().min(1, '请填写用户名')
  })
)
// pnpm add zod
```

---

## 手写 FormSchema（不引入 Zod）

```ts
import type { FormSchema } from '@/uni_modules/wot-ui/components/wd-form/types'
const schema: FormSchema = {
  validate(model) {
    const issues = []
    if (!model.username) issues.push({ path: ['username'], message: '请填写用户名' })
    return issues
  },
  isRequired(path: string) { return path === 'username' }
}
```

---

## 必填星号迁移

v2 中必填星号和校验规则是两个概念，需单独控制：

- 在 `wd-form-item` 上设置 `required`
- 在 `FormSchema` 中提供 `isRequired(path)`
- 在 `zodAdapter` 的第二个参数中提供 `isRequired(path)`

```ts
const schema = zodAdapter(
  z.object({ username: z.string().min(1, '请填写用户名') }),
  { isRequired(path: string) { return path === 'username' } }
)
```

---

## 选择器表单项拆分

v2 中表单结构统一收口到 `wd-form-item`，选择器和表单展示需拆开：

```vue
<wd-cascader v-model="model.address" v-model:visible="showAddressPicker" :options="area" @confirm="handleConfirm" />
<wd-form-item title="地址" prop="address" is-link :value="addressText" placeholder="请选择地址" @click="showAddressPicker = true" />
```

同样适用于 `Picker`、`SelectPicker`、`Calendar`、`DatetimePicker`。详见 `components.md` 中的"Picker 触发方式变更"章节。

> 检查 `model` 保存的是组件值还是展示文本。`wd-form-item` 的 `value` 通常用于展示文本，不一定等同于提交给后端的字段值。

---

## wd-form-item 布局属性表

原来散落在各输入组件上的布局配置，上移到 `wd-form` 或 `wd-form-item`：

| 属性 | 说明 |
| --- | --- |
| `border` | 是否展示边框线 |
| `center` | 是否使内容垂直居中 |
| `size` | 单元格大小 |
| `title-width` | 左侧标题宽度 |
| `layout` | 表单项布局，可选 `horizontal`、`vertical` |
| `value-align` | 右侧内容对齐方式 |
| `asterisk-position` | 必填星号位置 |
| `hide-asterisk` | 是否隐藏必填星号 |
| `ellipsis` | 是否超出隐藏显示省略号 |

---

## 校验触发迁移

```vue
<wd-form :model="model" :schema="schema" validate-trigger="change">
  <wd-form-item title="用户名" prop="username" validate-trigger="blur">
    <wd-input v-model="model.username" />
  </wd-form-item>
</wd-form>
```

`validate` 方法支持校验全部字段、单个字段或多个字段：

```ts
await form.value?.validate()                        // 校验全部
await form.value?.validate('username')              // 单字段
await form.value?.validate(['username', 'password']) // 多字段
```

`errorType` → `error-type`，`resetOnChange` → `reset-on-change`。

---

## Cell、Input、Textarea 的表单相关属性

v1 中这些组件承担了部分表单项职责，v2 需迁移到 `wd-form-item`：

```vue
<!-- v1 -->
<wd-input label="用户名" prop="username" v-model="model.username" required />

<!-- v2 -->
<wd-form-item title="用户名" prop="username" required>
  <wd-input v-model="model.username" />
</wd-form-item>
```

`Input`、`Textarea` 放入 `wd-form-item` 时，`compact` 会**自动开启**（移除输入组件自身的内边距和背景）。如果放入 `wd-cell` 而非 `wd-form-item`，需要**手动设置** `compact`：

```vue
<wd-cell title="备注">
  <wd-textarea v-model="model.remark" compact />
</wd-cell>
```

Cell 自身属性调整：

| v1 | v2 |
| --- | --- |
| `icon` | `prefix-icon` |
| `custom-icon-class` | `custom-prefix-class` 或 `custom-suffix-class` |
| `vertical` | `layout="vertical"` |
| `marker-side` | `asterisk-position` |

---

## Form 组件实例类型（TypeScript）

使用 `ref` 获取表单实例时，推荐声明完整类型：

```ts
import WdForm from '@wot-ui/ui/components/wd-form/wd-form.vue'
// uni_modules 路径:
// import WdForm from '@/uni_modules/wot-ui/components/wd-form/wd-form.vue'

const form = ref<InstanceType<typeof WdForm>>()

async function submit() {
  const result = await form.value?.validate()
  if (result?.valid) { /* 提交 */ }
}
```

---

## 数组字段校验（zodAdapter）

表单有动态列表字段时，`prop` 使用方括号路径语法，Zod schema 使用 `z.array()`：

```ts
const schema = zodAdapter(z.object({
  items: z.array(z.object({
    name: z.string().min(1, '请填写名称'),
    qty: z.number().min(1, '数量不能为 0')
  }))
}))
```

```vue
<template v-for="(item, index) in model.items" :key="index">
  <!-- prop 路径: items[0].name, items[1].name ... -->
  <wd-form-item :title="`商品名 ${index + 1}`" :prop="`items[${index}].name`">
    <wd-input v-model="item.name" />
  </wd-form-item>
</template>
```

---

## 异步校验

`FormSchema.validate` 支持返回 `Promise<Issue[]>`：

```ts
import type { FormSchema } from '@wot-ui/ui/components/wd-form/types'

const schema: FormSchema = {
  async validate(model) {
    const issues: { path: string[]; message: string }[] = []
    // 例如：异步检查用户名是否已存在
    const exists = await checkUsernameExists(model.username)
    if (exists) issues.push({ path: ['username'], message: '用户名已被使用' })
    return issues
  },
  isRequired: (path) => path === 'username'
}
```

---

## Form 迁移清单

- [ ] 将 `prop`、`rules` 从输入组件迁移到 `wd-form-item` 和 `schema`
- [ ] `rules` / `FormRules` / `FormItemRule` → `schema` / `FormSchema`
- [ ] 如使用 Zod，安装 `zod` 并通过 `zodAdapter` 转换
- [ ] 检查必填星号是否需要通过 `required` 或 `isRequired` 单独控制
- [ ] `errorType` → `error-type`，`resetOnChange` → `reset-on-change`
- [ ] `ColPicker` 场景迁移为 `Cascader`，确认回显文本和提交值
- [ ] 检查动态字段、隐藏字段、数组字段和异步校验
- [ ] 声明表单实例类型 `ref<InstanceType<typeof WdForm>>()`
- [ ] 检查 `validate()`、`validate(prop)`、`reset()` 调用是否符合预期
- [ ] `wd-form-item` + `input`/`textarea` 组合是否触发了不期望的 compact 样式
