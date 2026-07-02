前端测试不是为了追求 100% 覆盖率，而是为了保证核心逻辑和关键用户流程以后改代码时不容易坏。一个项目里通常会搭配三类测试：

``` text
Vitest/Jest        单元测试
Testing Library   组件交互测试
Playwright        端到端测试
```

可以按风险来判断要不要写：

| 场景 | 推荐测试 | 原因 |
| --- | --- | --- |
| 金额计算、时间格式化、表单校验、权限判断 | 单元测试 | 输入输出明确，最适合快速验证 |
| hooks、composables、store、状态流转 | 单元测试 | 状态逻辑容易被后续重构改坏 |
| 登录表单、搜索筛选、弹窗、上传组件 | 组件交互测试 | 需要验证用户点击、输入、错误提示、loading 状态 |
| 下单、支付、注册、创建内容、钱包连接 | 端到端测试 | 这些是用户真实流程，坏了影响最大 |
| 纯展示卡片、简单静态页面、无逻辑按钮 | 可以不测或少测 | 测试收益低，容易变成维护负担 |


一个上线项目，优先覆盖这些内容：

1. 登录、注册、鉴权、权限路由
2. 表单提交、文件上传、重复提交拦截
3. 金额、积分、库存、订单状态等业务计算
4. 接口失败、空数据、弱网、未登录、无权限
5. 支付、下单、提现、链上交易等高风险流程

测试的细化程度可以这样理解：

``` text
单元测试：测函数和状态逻辑是否正确
组件测试：测用户在一个组件里操作后，界面反馈是否正确
E2E测试：测用户从进入页面到完成业务流程是否走得通
```

## 测试目录结构
常见目录可以这样放：

``` text
src/
  utils/
    price.ts
    price.test.ts
  components/
    LoginForm.vue
    LoginForm.test.ts
  test/
    setup.ts
e2e/
  login.spec.ts
  order.spec.ts
vitest.config.ts
playwright.config.ts
```

也可以把测试集中放到 `__tests__` 目录，但我更推荐测试文件跟源码放近一点，后续维护方便。

## 单元测试：Vitest / Jest
单元测试主要测试“没有页面也能独立运行”的逻辑，例如：

1. 工具函数
2. 表单校验函数
3. 金额、时间、数量计算
4. store、hooks、composables
5. 接口参数组装
6. 错误码转换文案

现在 Vite 项目更推荐 Vitest，老项目、CRA 项目、Node 项目里常见 Jest。二者语法非常接近，核心都是 `describe`、`it/test`、`expect`。

### 使用 Vitest
安装依赖：

``` bash
npm i -D vitest jsdom @vitest/ui @vitest/coverage-v8 @testing-library/jest-dom
```

如果项目是 Vue/React 项目，通常已经有 `vite.config.ts`，把下面的 `test` 配置合并进去即可，原来的 `plugins` 不要删。也可以单独新建 `vitest.config.ts`：

``` ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx,vue}'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.{js,ts,vue}'],
      exclude: ['src/main.ts', 'src/router/**']
    }
  }
})
```

新建 `src/test/setup.ts`：

``` ts
import '@testing-library/jest-dom/vitest'
```

`package.json` 增加脚本：

``` json
{
  "scripts": {
    "test:unit": "vitest",
    "test:unit:run": "vitest run",
    "test:unit:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

### 单元测试示例：金额计算
业务代码 `src/utils/price.ts`：

``` ts
export function calcPayAmount(price: number, count: number, discount = 0) {
  if (price < 0 || count < 0 || discount < 0) {
    throw new Error('金额、数量、优惠不能小于0')
  }

  const total = price * count - discount
  return Math.max(total, 0)
}

export function formatMoney(value: number) {
  return `¥${value.toFixed(2)}`
}
```

测试代码 `src/utils/price.test.ts`：

``` ts
import { describe, expect, it } from 'vitest'
import { calcPayAmount, formatMoney } from './price'

describe('price utils', () => {
  it('计算应付金额', () => {
    expect(calcPayAmount(100, 2, 30)).toBe(170)
  })

  it('优惠不能把金额减成负数', () => {
    expect(calcPayAmount(20, 1, 50)).toBe(0)
  })

  it('非法金额直接抛错', () => {
    expect(() => calcPayAmount(-1, 1)).toThrow('金额、数量、优惠不能小于0')
  })

  it('格式化金额', () => {
    expect(formatMoney(12)).toBe('¥12.00')
  })
})
```

运行：

``` bash
npm run test:unit
```

### 单元测试示例：接口参数组装
``` ts
export function buildListParams(query: {
  keyword?: string
  page?: number
  pageSize?: number
}) {
  return {
    keyword: query.keyword?.trim() || '',
    page: query.page || 1,
    pageSize: query.pageSize || 20
  }
}
```

``` ts
import { expect, it } from 'vitest'
import { buildListParams } from './buildListParams'

it('清理搜索参数并补默认分页', () => {
  expect(buildListParams({ keyword: '  vue  ' })).toEqual({
    keyword: 'vue',
    page: 1,
    pageSize: 20
  })
})
```

### mock 函数
有些逻辑需要传入回调，可以用 `vi.fn()`：

``` ts
import { expect, it, vi } from 'vitest'

function submitForm(onSuccess: () => void) {
  onSuccess()
}

it('提交成功后调用回调', () => {
  const onSuccess = vi.fn()

  submitForm(onSuccess)

  expect(onSuccess).toHaveBeenCalledTimes(1)
})
```

### 使用 Jest
如果是非 Vite 项目，也可以使用 Jest：

``` bash
npm i -D jest jest-environment-jsdom @testing-library/jest-dom
```

`jest.config.js`：

``` js
module.exports = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.js'],
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)']
}
```

`src/test/setupTests.js`：

``` js
import '@testing-library/jest-dom'
```

`package.json`：

``` json
{
  "scripts": {
    "test:unit": "jest",
    "test:unit:watch": "jest --watch"
  }
}
```

如果是新项目，优先选 Vitest；如果公司老项目已经是 Jest，就继续沿用 Jest，不需要为了工具本身迁移。

## 组件交互测试：Testing Library
Testing Library 不是测组件内部实现，而是站在用户角度测试：

1. 用户能不能看到某个文案
2. 用户输入后是否出现正确结果
3. 点击按钮是否触发提交
4. loading、disabled、错误提示是否正确
5. 弹窗、下拉、切换 tab 是否符合预期

它的核心理念是：越接近用户真实操作，测试越有价值。所以优先用这些查询方式：

``` text
getByRole       按按钮、输入框、标题等语义查找
getByLabelText  按表单 label 查找
getByText       按用户能看到的文本查找
getByTestId     兜底方案，不要滥用
```

### Vue 项目安装
``` bash
npm i -D @testing-library/vue @testing-library/user-event @vue/test-utils
```

### React 项目安装
``` bash
npm i -D @testing-library/react @testing-library/user-event
```

### Vue 组件测试示例
组件 `src/components/LoginForm.vue`：

``` vue
<template>
  <form @submit.prevent="handleSubmit">
    <label>
      手机号
      <input v-model="phone" />
    </label>

    <p v-if="error" role="alert">{{ error }}</p>

    <button type="submit">登录</button>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  submit: [phone: string]
}>()

const phone = ref('')
const error = ref('')

function handleSubmit() {
  if (!/^1\d{10}$/.test(phone.value)) {
    error.value = '请输入正确手机号'
    return
  }

  error.value = ''
  emit('submit', phone.value)
}
</script>
```

测试 `src/components/LoginForm.test.ts`：

``` ts
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/vue'
import userEvent from '@testing-library/user-event'
import LoginForm from './LoginForm.vue'

describe('LoginForm', () => {
  it('手机号不合法时显示错误提示', async () => {
    const user = userEvent.setup()

    render(LoginForm)

    await user.type(screen.getByLabelText('手机号'), '123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请输入正确手机号')
  })

  it('手机号合法时触发提交事件', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(LoginForm, {
      props: {
        onSubmit
      }
    })

    await user.type(screen.getByLabelText('手机号'), '13800138000')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(onSubmit).toHaveBeenCalledWith('13800138000')
  })
})
```

### React 组件测试示例
组件 `src/components/LoginForm.tsx`：

``` tsx
import { FormEvent, useState } from 'react'

export function LoginForm(props: { onSubmit: (phone: string) => void }) {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()

    if (!/^1\d{10}$/.test(phone)) {
      setError('请输入正确手机号')
      return
    }

    setError('')
    props.onSubmit(phone)
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        手机号
        <input value={phone} onChange={(event) => setPhone(event.target.value)} />
      </label>

      {error && <p role="alert">{error}</p>}

      <button type="submit">登录</button>
    </form>
  )
}
```

测试 `src/components/LoginForm.test.tsx`：

``` tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('手机号不合法时显示错误提示', async () => {
    const user = userEvent.setup()

    render(<LoginForm onSubmit={vi.fn()} />)

    await user.type(screen.getByLabelText('手机号'), '123')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(screen.getByRole('alert')).toHaveTextContent('请输入正确手机号')
  })
})
```

### mock 接口请求
组件测试里不要真的请求线上接口。简单场景可以 mock 请求函数，复杂项目建议用 MSW 拦截接口。

安装：

``` bash
npm i -D msw
```

测试中拦截接口的思路：

``` ts
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'

const server = setupServer(
  http.post('/api/login', () => {
    return HttpResponse.json({
      token: 'mock-token',
      user: {
        id: 1,
        name: '张三'
      }
    })
  })
)

beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

## 端到端测试：Playwright
E2E 测试会启动真实浏览器，模拟用户访问页面。它适合测“整条流程”，不适合拿来测每个小组件。适合写 E2E 的场景：

1. 登录成功后跳转首页
2. 搜索商品并进入详情
3. 创建订单并进入支付页
4. 后台新增、编辑、删除一条数据
5. 关键权限路由是否拦截
6. 多端适配中最核心的页面是否可用

不建议每个页面都写 E2E，因为它运行慢、维护成本高。一般项目写 3-10 条关键路径就很有价值。

### 安装
``` bash
npm i -D @playwright/test
npx playwright install
```

`package.json`：

``` json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

### 配置 Playwright
新建 `playwright.config.ts`：

``` ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile chrome',
      use: { ...devices['Pixel 5'] }
    }
  ]
})
```

### E2E 示例：登录流程
`e2e/login.spec.ts`：

``` ts
import { expect, test } from '@playwright/test'

test('用户可以登录并进入首页', async ({ page }) => {
  await page.route('**/api/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'mock-token',
        user: {
          id: 1,
          name: '张三'
        }
      })
    })
  })

  await page.goto('/login')

  await page.getByLabel('手机号').fill('13800138000')
  await page.getByLabel('密码').fill('123456')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByText('张三')).toBeVisible()
})
```

### E2E 示例：权限路由
``` ts
import { expect, test } from '@playwright/test'

test('未登录访问后台页面会跳转登录页', async ({ page }) => {
  await page.goto('/admin')

  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
})
```

### E2E 常用写法
等待接口响应：

``` ts
const responsePromise = page.waitForResponse('**/api/orders')

await page.getByRole('button', { name: '查询' }).click()

const response = await responsePromise
expect(response.ok()).toBeTruthy()
```

上传文件：

``` ts
await page.getByLabel('上传头像').setInputFiles('e2e/fixtures/avatar.png')
```

检查弹窗：

``` ts
await page.getByRole('button', { name: '删除' }).click()
await expect(page.getByText('确认删除吗')).toBeVisible()
await page.getByRole('button', { name: '确认' }).click()
```

保存登录态，避免每条用例重复登录：

``` ts
import { test as setup } from '@playwright/test'

setup('登录并保存状态', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('手机号').fill('13800138000')
  await page.getByLabel('密码').fill('123456')
  await page.getByRole('button', { name: '登录' }).click()

  await page.context().storageState({
    path: 'e2e/.auth/user.json'
  })
})
```

在配置中使用：

``` ts
{
  name: 'logged-in',
  use: {
    storageState: 'e2e/.auth/user.json'
  }
}
```

## 三种测试怎么搭配
可以按“测试金字塔”来安排：

``` text
单元测试最多：快、稳定、适合覆盖各种边界
组件测试适中：覆盖核心交互和状态变化
E2E测试最少：覆盖最关键的用户路径
```

## 写测试的判断标准
写测试前可以问自己三个问题：

1. 这段代码坏了，会不会造成明显业务损失？
2. 这段代码以后会不会经常改？
3. 这段代码有没有很多边界条件？

如果答案里有两个“会”，就值得写测试。不建议这样写：

``` text
测试一个按钮是否存在，但这个按钮没有任何业务逻辑
测试组件内部变量名
为了覆盖率测试无意义实现细节
每个页面都写一条又慢又脆弱的 E2E
```

建议这样写：

``` text
测试用户能看到什么
测试用户能做什么
测试业务结果是否正确
测试失败场景是否有合理反馈
```

## 常用命令汇总
``` bash
# 单元测试 watch 模式
npm run test:unit

# 单元测试只跑一次，适合 CI
npm run test:unit:run

# 覆盖率
npm run test:coverage

# E2E 测试
npm run test:e2e

# Playwright 可视化调试
npm run test:e2e:ui

# Playwright 逐步调试
npm run test:e2e:debug
```