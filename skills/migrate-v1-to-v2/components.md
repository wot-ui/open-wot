# 组件迁移详情

---

## MessageBox → Dialog（高影响）

**基本替换：**

| v1 | v2 |
| --- | --- |
| `<wd-message-box />` | `<wd-dialog />` |
| `useMessage()` | `useDialog()` |
| `message.confirm(...)` | `dialog.confirm(...)` |
| 多实例使用 `selector` | 保持不变 |

**行为差异（重要）：**

| 属性/行为 | v1 | v2 |
| --- | --- | --- |
| `closeOnClickModal` 默认值 | `true` | `false` |
| Prompt 返回输入内容 | `res`（字符串） | `res.value` |
| 输入框类型/占位符 | `inputType`/`inputPlaceholder` | `inputProps: { type, placeholder }` |
| 多行输入 | — | `textareaProps` |
| 按钮高级配置 | — | `confirmButtonProps`/`cancelButtonProps` |
| 多按钮场景 | — | `actions` |

```ts
// v1
message.prompt({ title: '请输入手机号', inputType: 'tel', inputPlaceholder: '请输入11位手机号' })
  .then((res) => { console.log(res) })

// v2
dialog.prompt({
  title: '请输入手机号',
  inputProps: { type: 'tel', placeholder: '请输入11位手机号' }
}).then((res) => { console.log(res.value) })
```

---

## StatusTip → Empty（高影响）

```vue
<!-- v1 -->
<wd-status-tip icon="no-result" tip="暂无结果" />

<!-- v2 -->
<wd-empty icon="no-content" tip="暂无内容">
  <wd-button type="primary">重新加载</wd-button>
</wd-empty>
```

- 图标名可能需要调整，常见：`no-result`、`no-wifi`、`no-content`
- 自定义图片或底部操作区使用 `wd-empty` 的插槽

---

## ColPicker → Cascader（高影响）

| v1 | v2 |
| --- | --- |
| `<wd-col-picker>` | `<wd-cascader>` |
| `columns` | `options` |
| `column-change` | `lazy-load` |
| — | 支持 `value-key`、`text-key`、`children-key` |

确认 `v-model` 绑定值的数据结构是否变化。

> 如在表单中使用 Cascader，还需将触发层拆分为 `wd-form-item`，详见 `form.md` 中的"选择器表单项拆分"。

---

## NumberKeyboard → Keyboard（高影响）

v2 不再提供独立的 `wd-number-keyboard`，需迁移为 `wd-keyboard`：

```vue
<!-- v1 -->
<wd-number-keyboard v-model="value" :visible="visible" @close="visible = false" />

<!-- v2 -->
<wd-keyboard v-model="value" v-model:visible="visible" mode="custom" extra-key="." close-text="完成" />
```

需逐一检查：`visible`、`v-model`、`extra-key`、`close-text`、`random-key-order`、`safe-area-inset-bottom`。

---

## Button（中影响）

| v1 | v2 |
| --- | --- |
| `type="error"` | `type="danger"` |
| `plain` | `variant="plain"` |
| `type="text"` | `variant="text"` |
| `type="icon" icon="xxx"` | 只传 `icon="xxx"` |
| `classPrefix` | `class-prefix` |

```vue
<!-- v1 -->
<wd-button type="error" plain>删除</wd-button>
<wd-button type="text">文字按钮</wd-button>
<wd-button type="icon" icon="picture" />

<!-- v2 -->
<wd-button type="danger" variant="plain">删除</wd-button>
<wd-button variant="text">文字按钮</wd-button>
<wd-button icon="image" />
```

> `round` 默认值为 `false`。如项目依赖 v1 圆角外观，需做视觉回归。

---

## Tag（中影响）

`plain` → `variant="plain"`：

```vue
<!-- v1 -->
<wd-tag plain>标签</wd-tag>
<!-- v2 -->
<wd-tag variant="plain">标签</wd-tag>
```

数据中维护标签配置也需调整：
```ts
// v1
const tag = { type: 'primary', plain: true }
// v2
const tag = { type: 'primary', variant: 'plain' }
```

---

## Radio / Checkbox（中影响）

| v1 | v2 |
| --- | --- |
| `shape="check"` | `type="circle"` |
| `shape="dot"` | `type="dot"` |
| `shape="button"` | `type="button"` |
| `shape="square"` | `type="square"` |
| `inline` | `direction="horizontal"` |
| `icon-placement="left/right"` | `placement="left/right"` |
| `cell` 模式 | 手动组合 `wd-cell` |

```vue
<!-- v1 -->
<wd-radio-group v-model="value" shape="button" inline>...</wd-radio-group>

<!-- v2 -->
<wd-radio-group v-model="value" type="button" direction="horizontal">...</wd-radio-group>
```

v1 的 `cell` 模式手动组合示例：

```vue
<wd-radio-group v-model="value">
  <wd-cell-group border>
    <wd-cell title="选项一" clickable @click="value = 1">
      <template #right-icon><wd-radio :value="1" /></template>
    </wd-cell>
  </wd-cell-group>
</wd-radio-group>
```

> Checkbox 在 `CheckboxGroup` 中选项值使用 `name`，单独使用 `wd-checkbox` 时才用 `v-model`、`true-value`、`false-value`。

---

## Search（中影响）

```vue
<!-- v1 -->
<wd-search light />
<!-- v2 -->
<wd-search variant="light" />
```

右侧插槽不再通过 `use-suffix-slot` 控制，直接使用 `input-suffix`、`suffix` 等具名插槽。

---

## Grid（中影响）

`@itemclick` → `@click`：

```vue
<!-- v1 -->
<wd-grid-item text="开始" icon="play-circle-stroke" @itemclick="start" />
<!-- v2 -->
<wd-grid-item text="开始" icon="play-circle-stroke" @click="start" />
```

> `wd-grid-item` 需配合父级 `wd-grid` 的 `clickable` 才触发点击。

---

## Fab（中影响）

| v1 | v2 |
| --- | --- |
| `type="error"` | `type="danger"` |
| camelCase 属性 | kebab-case |

```vue
<!-- v1 -->
<wd-fab type="error" :zIndex="99" inactiveIcon="plus" activeIcon="close" />
<!-- v2 -->
<wd-fab type="danger" :z-index="99" inactive-icon="plus" active-icon="close" />
```

---

## Badge / Slider / Tabs / Steps / Swiper / Rate / SlideVerify（低影响）

| 组件 | v1 | v2 |
| --- | --- | --- |
| Badge | `v-model` / `modelValue` | `value` |
| Slider | 数组值自动双滑块 | 需显式设置 `range` |
| Slider | `hide-label` | `popover-visible="never"` |
| Slider | `hide-min-max` | `show-extreme-value` |
| Tabs | `autoLineWidth` | `line-theme="text"` |
| Rate | `disabled-color` | 通过 `color`/`active-color` 处理 |
| SlideVerify | `width`/`height` | 外层容器或 `custom-style` 控制尺寸 |
| Steps | `title-slot`/`description-slot`/`icon-slot` | 直接使用 `title`、`description`、`icon` 插槽 |
| Swiper | `pagination-position` | `indicator-position` |

Swiper v2 指示器配置：
```vue
<wd-swiper v-model:current="current" :list="list"
  :indicator="{ type: 'fraction' }" indicator-position="bottom-right" />
```

---

## Tooltip / Popover / Collapse（低影响）

| 组件 | v1 | v2 |
| --- | --- | --- |
| Tooltip | `:show` | `v-model` / `model-value` |
| Popover | `useContentSlot` 开关 | 不再需要，直接使用 `content` 插槽 |
| Collapse | `:value` | `v-model` |
| Collapse | `useMoreSlot` | `use-more-slot` |

**Tooltip / Popover 动态内容重定位**：当插槽内容尺寸动态变化时，浮层定位可能偏移，调用实例方法 `updatePosition()` 重新计算：

```ts
const tooltip = ref<InstanceType<typeof WdTooltip>>()
// 在内容尺寸变化后调用
tooltip.value?.updatePosition()
```

---

## DatetimePickerView / ImgCropper / CountTo / Segmented（低影响）

| 组件 | v1 | v2 |
| --- | --- | --- |
| DatetimePickerView | `columns-height` | `item-height` / `visible-item-count` |
| DatetimePickerView | `loading`/`loading-color` | 不再提供，外层自行控制 loading |
| ImgCropper | `setRoate`（拼写错误） | `setRotate` |
| CountTo | `type="info"` | 改用其他 type 或 `color` 自定义颜色 |
| CountTo | `fontSize` 属性 | `custom-style="font-size: 24px;"` 或外层样式 |
| Segmented | `size` | `theme`（如 `"card"`） |
| Segmented | `vibrateShort` | `vibrate-short` |

---

## PickerView 级联模型（低影响）

v2 推荐使用 `cascade` 和树形 `columns`：

```vue
<wd-picker-view v-model="value" :columns="columns" cascade />
```

实例方法调整：

| v1 | v2 |
| --- | --- |
| `getLabels()` | `getSelectedLabels()` |
| `setColumnData()` | 使用 `cascade` 树形数据或 `resetColumns()` |
| `getColumnData()` | 保留 |
| `resetColumns()` | 保留 |

`v-model` 推荐始终使用数组形式，单列也建议 `['value']`。

---

## Picker / SelectPicker / Calendar / DatetimePicker 触发方式（中影响）

v2 中这些弹层选择器更偏向**纯选择器职责**，不再把外层触发单元格作为主要结构。v1 中直接依赖组件内置的 `label`、`label-width`、`prop`、`rules` 等表单项能力的代码，需要迁移为 `wd-cell` 或 `wd-form-item` 负责触发和展示，选择器组件只负责弹出和选择。

```vue
<!-- v1：选择器自带触发单元格和 label -->
<wd-picker label="类型" prop="type" v-model="model.type" :columns="typeList" />

<!-- v2：选择器专注弹出，触发和展示交给 wd-form-item -->
<wd-picker v-model="model.type" v-model:visible="showTypePicker" :columns="typeList" />

<wd-form-item
  title="类型"
  prop="type"
  is-link
  :value="typeText"
  placeholder="请选择类型"
  @click="showTypePicker = true"
/>
```

同样适用于 `SelectPicker`、`Calendar`、`DatetimePicker`：触发逻辑统一由外层 `wd-cell` 或 `wd-form-item` 承接。

> 如在表单中使用，还需更新 schema/zodAdapter 校验规则，详见 `form.md` 中的"选择器表单项拆分"。

---

## ImagePreview / VideoPreview（新增）

v2 新增图片和视频预览能力，可替代 `uni.previewImage` 或自定义视频预览层：

```vue
<!-- 图片预览 -->
<wd-image-preview v-model:show="show" :urls="imageList" :current="currentIndex" />

<!-- 视频预览 -->
<wd-video-preview v-model:show="show" :src="videoUrl" />
```

也可以通过 Hook 方式调用：

```ts
import { useImagePreview } from '@wot-ui/ui'  // 或 '@/uni_modules/wot-ui'

const imagePreview = useImagePreview()
imagePreview.showImagePreview({ urls: imageList, current: 0 })
```

```ts
import { useVideoPreview } from '@wot-ui/ui'

const videoPreview = useVideoPreview()
videoPreview.showVideoPreview({ src: videoUrl })
```

> 详细 API 见文档：[ImagePreview](https://wot-ui.cn/component/image-preview.html)、[VideoPreview](https://wot-ui.cn/component/video-preview.html)。

---

## 图标迁移

v2 对图标示例和部分组件默认图标做了调整。迁移后如果页面出现空图标、图标名称不匹配或视觉含义不一致，优先排查以下属性：`icon`、`prefix-icon`、`suffix-icon`、`class-prefix`、`css-icon`。

**扫描项目中所有图标引用**：
```bash
rg 'icon="[^"]*"' --include="*.vue" -o | sort -u
```

然后在 v2 图标文档中逐一核对图标名是否仍然存在。常见变更：
- `Button` 的 `type="icon"` 已移除，直接传 `icon` 属性即可
- 自定义图标类名前缀在模板中推荐使用 `class-prefix`（而不是 camelCase 的 `classPrefix`）
- 部分组件的默认 icon 有视觉更新，功能不变但图标名可能调整

---

## camelCase → kebab-case 属性名（低影响）

v2 文档模板示例统一使用 kebab-case，常见属性：

| v1 | v2 |
| --- | --- |
| `zIndex` | `z-index` |
| `classPrefix` | `class-prefix` |
| `customClass` | `custom-class` |
| `customStyle` | `custom-style` |
| `safeAreaInsetBottom` | `safe-area-inset-bottom` |
| `startVal` | `start-val` |
| `endVal` | `end-val` |
| `autoStart` | `auto-start` |
| `useEasing` | `use-easing` |

---

## 批量替换速查

### 导入路径

```
# npm
旧: from 'wot-design-uni'
新: from '@wot-ui/ui'

# npm 工具函数
旧: from 'wot-design-uni/components/common/util'
新: from '@wot-ui/ui/common/util'

# uni_modules
旧: from '@/uni_modules/wot-design-uni'
新: from '@/uni_modules/wot-ui'

# uni_modules 工具函数
旧: from '@/uni_modules/wot-design-uni/components/common/util'
新: from '@/uni_modules/wot-ui/common/util'
```

### 组件标签

```
旧: <wd-message-box
新: <wd-dialog

旧: useMessage()
新: useDialog()

旧: <wd-status-tip
新: <wd-empty

旧: <wd-col-picker
新: <wd-cascader

旧: <wd-number-keyboard
新: <wd-keyboard  （需调整 mode 等属性）
```
