在项目开发阶段我们需要确定以下即可做到很好的管理
``` text
项目能一键启动
README 写清楚启动、构建、部署
Node 版本固定
包管理器统一
ESLint / Prettier 配好
提交前有自动检查
路径别名配置好
请求层统一封装
环境变量不写死
目录结构清晰
```

## 编译打包阶段

编译打包阶段优化关注的是：

``` text
构建速度
构建产物大小
资源缓存
按需加载
生产环境安全
```

### 1. 先分析包体积

不要凭感觉删依赖，先看谁最大。

Vite 安装：

``` bash
npm i -D rollup-plugin-visualizer
```

`vite.config.ts`：

``` ts
import { defineConfig } from 'vite'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  plugins: [
    visualizer({
      filename: 'dist/stats.html',
      gzipSize: true,
      brotliSize: true,
      open: false
    })
  ]
})
```

构建后打开：

``` text
dist/stats.html
```

重点看：
1. 是否引入了过大的 UI 库
2. echarts、monaco-editor、xlsx、moment 是否全量打包
3. 是否有重复依赖
4. 业务代码是否被打进首页包

解决方法
1. 路由懒加载
2. 第三方库按需加载
3. Vite 手动分包
``` ts
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('vue') || id.includes('react')) {
              return 'framework'
            }

            if (id.includes('echarts')) {
              return 'echarts'
            }

            if (id.includes('element-plus') || id.includes('antd')) {
              return 'ui'
            }

            return 'vendor'
          }
        }
      }
    }
  }
})
```
分包不是越碎越好，太碎会增加请求数量。目标是把大而稳定的依赖拆出来，方便浏览器缓存。

4. 移除生产环境 console，Vite 简单配置：

``` ts
export default {
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : []
  }
}
```
如果想保留 `console.error`，使用 terser：
``` bash
npm i -D terser
```

``` ts
export default {
  build: {
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info']
      }
    }
  }
}
```
5. gzip / brotli 压缩

前端构建时生成压缩文件：

``` bash
npm i -D vite-plugin-compression
```

``` ts
import viteCompression from 'vite-plugin-compression'

export default {
  plugins: [
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz'
    }),
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br'
    })
  ]
}
```

Nginx 也要开启：

``` nginx
gzip on;
gzip_min_length 1024;
gzip_types text/plain text/css application/javascript application/json image/svg+xml;
```

6. 静态资源缓存策略

推荐：

``` text
index.html：不强缓存
JS/CSS：文件名带 hash，强缓存
图片/字体：文件名带 hash，强缓存
```

Nginx：

``` nginx
location / {
  try_files $uri $uri/ /index.html;
  add_header Cache-Control "no-cache";
}

location ~* \.(js|css|png|jpg|jpeg|gif|svg|webp|woff2)$ {
  expires 365d;
  add_header Cache-Control "public, immutable";
}
```

7. source map 策略

生产环境不要直接公开 source map。

``` ts
export default {
  build: {
    sourcemap: process.env.SOURCE_MAP === 'true'
  }
}
```

如果接入 Sentry，可以构建时上传 source map 到监控平台，然后不要把 `.map` 文件发布到公网。


## 页面响应

页面响应优化关注的是：用户已经看到页面后，点击、搜索、切换、提交时，页面是否能快速响应。

常见问题：

``` text
接口慢
重复请求
一次渲染太多 DOM
搜索输入频繁请求
复杂计算阻塞主线程
列表数据过大
状态更新导致整页重渲染
```
对应解决方法
``` text
互不依赖的接口并发请求
低频数据有缓存
搜索类请求会取消旧请求
输入搜索做防抖
滚动和 resize 做节流
长列表使用虚拟列表
大计算放到 Worker
避免不必要的响应式和重渲染
```

## 页面交互

页面交互优化关注的是：用户是否知道当前状态，是否容易误操作，失败后是否能继续。很多项目功能没问题，但体验差，通常就是交互状态没处理。

``` text
[ ] 按钮点击后有 loading 和 disabled
[ ] 表单有即时校验
[ ] 危险操作有二次确认
[ ] 页面有 loading / empty / error / success 状态
[ ] 失败后可以重试
[ ] 长时间加载有骨架屏
[ ] 适合的场景使用乐观更新
[ ] 表单、按钮、图片语义正确
```

## 白屏时间

白屏时间指的是用户打开页面后，到页面出现第一个有意义内容之间的时间。白屏时间长，用户会觉得：

``` text
页面打不开
系统很慢
网络坏了
应用崩了
```

白屏优化优先看首屏链路：

``` text
DNS -> TCP/TLS -> HTML -> JS/CSS -> 执行 JS -> 拉接口 -> 渲染内容
```

### 1. 先测量白屏时间
简单统计：
``` ts
export function reportPageTiming() {
  window.addEventListener('load', () => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming

    const timing = {
      dns: navigation.domainLookupEnd - navigation.domainLookupStart,
      tcp: navigation.connectEnd - navigation.connectStart,
      request: navigation.responseStart - navigation.requestStart,
      response: navigation.responseEnd - navigation.responseStart,
      domParse: navigation.domContentLoadedEventEnd - navigation.responseEnd,
      load: navigation.loadEventEnd - navigation.startTime
    }

    console.log('页面性能:', timing)
  })
}
```

统计 FCP / LCP：

``` ts
const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    console.log(entry.name, entry.startTime)
  }
})

observer.observe({
  type: 'paint',
  buffered: true
})
```

### 2. 减少首屏 JS 体积

最有效的白屏优化之一：首屏不要加载不需要的代码。

应该做：

``` text
路由懒加载
大组件懒加载
图表、编辑器、地图按需加载
首屏不需要的弹窗不要提前加载
首屏只不要加载太多接口，能放后的就放后，可以预加载一些非阻塞接口
CSS 不要阻塞太久，尽量首屏小一点
首页骨架屏
```

### 图片不要拖慢首屏

首屏大图要特别小心。优化方式：

``` text
压缩图片
使用 WebP / AVIF
设置 width / height，避免布局抖动
非首屏图片 lazy load
首屏关键图可以 preload
```
图片：
``` html
<img
  src="/images/banner.webp"
  alt="首页横幅"
  width="1200"
  height="400"
  decoding="async"
/>
```
非首屏图片：
``` html
<img
  src="/images/product.webp"
  alt="商品图片"
  loading="lazy"
  decoding="async"
/>
```

首屏关键图预加载：

``` html
<link rel="preload" as="image" href="/images/banner.webp" />
```

### 资源预连接和预加载

如果接口、CDN、字体在不同域名，可以预连接：

``` html
<link rel="preconnect" href="https://api.example.com" />
<link rel="preconnect" href="https://cdn.example.com" crossorigin />
```

预加载关键字体：

``` html
<link
  rel="preload"
  href="/fonts/din.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

字体 CSS：

``` css
@font-face {
  font-family: 'DIN';
  src: url('/fonts/din.woff2') format('woff2');
  font-display: swap;
}
```

### 8. SSR / SSG

如果项目是内容型网站、官网、文档站、营销页，白屏要求高，可以考虑：

``` text
SSR：服务端渲染，适合动态内容
SSG：静态生成，适合文档、博客、官网
```

例如：

``` text
Vue：Nuxt
React：Next.js
文档：VitePress / VuePress
```

后台管理系统通常不一定需要 SSR，先做好分包、接口、骨架屏更实际。

### 白屏检测

简单检测页面中心点是否还是空节点：

``` ts
export function checkWhiteScreen() {
  const points = [
    [window.innerWidth / 2, window.innerHeight / 2],
    [window.innerWidth / 2, window.innerHeight / 4],
    [window.innerWidth / 2, (window.innerHeight * 3) / 4]
  ]

  const emptyTags = ['HTML', 'BODY', 'APP', 'ROOT']

  const isWhite = points.every(([x, y]) => {
    const element = document.elementFromPoint(x, y)
    return element && emptyTags.includes(element.tagName)
  })

  if (isWhite) {
    console.log('可能发生白屏')
    // 上报监控平台
  }
}

setTimeout(checkWhiteScreen, 3000)
```
