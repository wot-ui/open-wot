# 样式与主题迁移

---

## Sass 升级（@import → @use，math.div）

v2 推荐 `sass@^1.98.0`，升级后需检查：

- 是否仍在使用 `@import` → 迁移为 `@use` 或 `@forward`
- 是否依赖全局可见的变量/mixin/function → `@use` 后需通过命名空间访问或 `as *` 展开
- 是否使用旧除法写法 `/` → 迁移为 `math.div()`
- 是否调用 Sass 废弃的内置函数或旧 API

```scss
// 旧写法
@import './variables.scss';
.page { width: 100px / 2; color: $primary-color; }

// 新写法
@use 'sass:math';
@use './variables.scss' as *;
.page { width: math.div(100px, 2); color: $primary-color; }
```

如遇 `legacy JS API` 警告，在 `vite.config.ts` 中配置：

```ts
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api']
      }
    }
  }
})
```

---

## 主题文件引入

```scss
/* npm 安装 */
@use '@wot-ui/ui/styles/theme/index.scss' as *;

/* uni_modules 安装 */
@use '@/uni_modules/wot-ui/styles/theme/index.scss' as *;
```

---

## 全局语义变量覆盖

v2 基于 Design Token 三层变量体系，推荐优先覆盖语义变量（CSS 自定义属性）：

```scss
/* 全局品牌色示例 */
page,
.wd-root-portal {
  --wot-primary-5: #4096ff;
  --wot-primary-6: #1677ff;
  --wot-primary-7: #0958d9;
}
```

---

## ConfigProvider 局部主题

```vue
<wd-config-provider :theme-vars="themeVars">
  <wd-button type="primary">提交</wd-button>
</wd-config-provider>

<script setup lang="ts">
const themeVars = {
  buttonPrimaryBgColor: '#ff6b35',
  buttonPrimaryColor: '#fff'
}
</script>
```

---

## 样式覆盖优先级（5级）

1. 优先使用 `custom-class`、`custom-style` 直接传入
2. 需要统一品牌视觉时，优先覆盖 CSS 变量
3. 页面内覆盖组件样式：直接使用 `.wd-*` 类名（无 scoped）
4. `scoped` 样式中覆盖组件内部样式：使用 `:deep()`

   ```css
   :deep(.wd-button) {
     font-weight: 600;
   }
   ```

5. 自定义组件内覆盖小程序组件样式：检查 `styleIsolation: 'shared'`

## Sass / 第三方库兼容性

如果项目依赖某个第三方样式库（如 `unocss`、`windicss` 或其他基于旧 Sass 语法的库），且该库锁定了较旧的 Sass 语法，可能在升级 Sass 版本后出现编译警告或报错。

处理方式：

1. **优先升级对应依赖**：查看该库是否有已兼容新 Sass 的版本
2. **临时使用 `silenceDeprecations`**（仅过渡期使用，不建议长期保留）：

   ```ts
   export default defineConfig({
     css: {
       preprocessorOptions: {
         scss: {
           api: 'modern-compiler',
           silenceDeprecations: ['legacy-js-api', 'import', 'global-builtin']
         }
       }
     }
   })
   ```

3. **降级 Sass**（不推荐）：固定 `sass` 版本到 `< 1.80` 可暂时避免部分警告，但会丧失新特性和安全修复

---

## 深色模式

v2 通过 CSS 变量自动跟随系统深色模式，无需手动编写 `@media (prefers-color-scheme: dark)` 覆盖块。如果在 v1 中有手动维护的暗色覆盖，迁移后需要验证是否与 v2 的自动深色产生冲突，必要时移除旧的手写覆盖。
