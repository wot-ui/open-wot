# 基础设施迁移（包名 / easycom / Volar / Vite 插件 / 国际化）

---

## npm 安装方式替换

> **前置要求**：Vue ≥ 3.4、uni-app 编译器 ≥ 4.x（推荐）。旧版编译器可能在组件 ref 类型推断和 Volar 支持方面有所缺失。

> **双包冲突**：不要在同一项目中同时安装 `wot-design-uni` 和 `@wot-ui/ui`！两者都包含 `wd-*` 前缀的 easycom 规则，会导致命名空间冲突、组件注册混乱。请先卸载旧包再安装新包。

以下命令由**用户在终端执行**，Agent 不负责执行包管理命令：

```bash
# 卸载旧包
pnpm remove wot-design-uni

# 安装新包
pnpm add @wot-ui/ui
```

然后替换所有文件中的导入路径：

```
旧: from 'wot-design-uni'
新: from '@wot-ui/ui'

旧: from 'wot-design-uni/components/common/util'
新: from '@wot-ui/ui/common/util'
```

---

## uni_modules 安装方式替换

删除 `src/uni_modules/wot-design-uni/` 目录，重新在插件市场下载 `wot-ui`，然后替换路径：

```
旧: from '@/uni_modules/wot-design-uni'
新: from '@/uni_modules/wot-ui'

旧: from '@/uni_modules/wot-design-uni/components/...'
新: from '@/uni_modules/wot-ui/components/...'

旧: from '@/uni_modules/wot-design-uni/components/common/util'
新: from '@/uni_modules/wot-ui/common/util'
```

---

## easycom 配置（pages.json）

```json
{
  "easycom": {
    "autoscan": true,
    "custom": {
      "^wd-(.*)": "@wot-ui/ui/components/wd-$1/wd-$1.vue"
    }
  }
}
```

uni_modules 安装无需配置，`autoscan: true` 即可自动注册。

---

## Volar 全局类型（tsconfig.json）

```json
{
  "compilerOptions": {
    "types": ["@wot-ui/ui/global"]
  }
}
```

若使用 uni_modules 安装，类型声明随模块附带，无需手动配置。

---

## Vite 插件自动导入（WotResolver）

如果使用 `@uni-helper/vite-plugin-uni-components` 自动导入，需更新 resolver：

```ts
// vite.config.ts
import type { ComponentResolver } from '@uni-helper/vite-plugin-uni-components'
import { kebabCase } from '@uni-helper/vite-plugin-uni-components'

export function WotResolver(): ComponentResolver {
  return {
    type: 'component',
    resolve: (name: string) => {
      if (name.match(/^Wd[A-Z]/)) {
        const compName = kebabCase(name)
        return {
          name,
          from: `@wot-ui/ui/components/${compName}/${compName}.vue`
        }
      }
    }
  }
}
```

---

## 国际化路径迁移

```ts
// npm 安装
import { Locale } from '@wot-ui/ui'
import enUS from '@wot-ui/ui/locale/lang/en-US'

// uni_modules 安装
import { Locale } from '@/uni_modules/wot-ui/locale'
import enUS from '@/uni_modules/wot-ui/locale/lang/en-US'
```

---

## Vite 预构建排除

如在 `vite.config.ts` 中配置了 `optimizeDeps.exclude`，替换包名：

```ts
export default defineConfig({
  optimizeDeps: {
    exclude: ['@wot-ui/ui']   // 旧: 'wot-design-uni'
  }
})
```

---

## CommonUtil 工具函数命名空间

v2 将旧的分散工具函数统一到 `CommonUtil` 命名空间下，直接从包入口导入：

```ts
// npm 安装
import { CommonUtil } from '@wot-ui/ui'

// uni_modules 安装
import { CommonUtil } from '@/uni_modules/wot-ui'
```

常用方法：

```ts
CommonUtil.isArray([])          // 判断是否为数组
CommonUtil.isString('')         // 判断是否为字符串
CommonUtil.isDef(value)         // 判断是否为 defined（非 null、undefined）
CommonUtil.getRect(el, ctx)     // 获取元素尺寸信息（返回 Promise<UniApp.NodeInfo>）
CommonUtil.pause(ms)            // 延迟 ms 毫秒（返回 Promise）
```

如果项目中直接从内部路径引用了工具函数，统一迁移到 `CommonUtil`：

```
旧: from '@/uni_modules/wot-design-uni/components/common/util'
新: import { CommonUtil } from '@/uni_modules/wot-ui'
```
