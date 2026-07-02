## 自动骨架屏
无论使用什么框架，最终页面都是要解析js运行各种依赖收集等，最终才会替换页面dom，我们才能看到对应的页面，这中间就有一段白屏时间，同时页面数据加载中也无法像原生app那样有个骨架屏
一样的加载中样式，体验很差，当然我们可以有一些服务端渲染等，自动化骨架屏理论上也能通过服务端直接渲染来完成，这消耗服务性能，最好可以在构建文件时候，自动生成骨架屏

注意不是所有的页面都适合这样，对那些页面结构变化不大的，只是数据变动的就十分适合这种形式，生成文件关键的步骤主要是如下
1. 给每个页面加入配置来确定是否需要预渲染，不需要则不进入这个插件，找到需要预渲染的所有页面的合集
2. 资源到输出目录后，在编译的afterEmit阶段，使用express本地起服务，同时使用puppeteer启动一个无头浏览器
3. 遍历页面集合，用服务打开本地页面(就是对所有dist文件夹伺服即可)，例如http://locallhost/test.html
4. 模拟移动端设备
5. 静态资源请求拦截，因为构建好的html中依赖的资源指向远端，得改成指向本地才能打开该页面，例如http://prdip/js/test.3a1s2.js，改为http://localhost/dist/js/test.3a1s2.js
6. 拦截请求，收集首屏渲染请求的样式
7. 将收集到的首屏样式转换为AST
8. 将生成骨架屏的脚本插入到页面中
9. 脚本内部会监听页面渲染完成事件，1s后执行生成骨架屏方法，并返回骨架屏的样式
10. 将骨架屏的样式转换为AST
11. 对首屏样式表和骨架屏样式表中所有的样式做清理，清理未使用的样式
12. 获取页面主容器内的html，即id=app内的元素
13. 读取构建好的页面的html文件，对占位的dom以及占位样式做替换
14. 关闭当前页面，重复执行4-14步，完成所有页面骨架屏的生成
15. 关闭浏览器；
16. 关闭node服务

生成骨架屏的脚步大概步骤如下,大概原理就是对特定的dom类型添加新的样式，移除没有必要的dom以及样式
1. 遍历dom，视窗外或者隐藏元素添加至待移除元素列表
2. 判断是否有子元素并且当前元素类型是ul或者ol，若是，删除所有的子元素，并将 li 所有兄弟元素设置成相同的元素，保证生成的页面骨架整齐；
3. 判断是否是文本元素，若是，则将文本设置为透明，设置灰色背景色；宽度小于50的设置为透明；
4. 判断是否是图片，若是，将图片的src替换为透明gif图，设置灰色背景色，移除其他非必要属性
5. 判断是否是视频，若是，找到其父节点，移除父节点下的所有子节点，设置灰色背景色
6. 如果是小图标，直接删除
7. 如果是按钮，移除子节点，移除其他非必要属性
8. 以上每一步均需为节点添加class及对应的样式，并且收集样式规则

总体方式如上，接下来我们一步步使用代码实现该功能，我们来编写一个webpack插件
``` js
// 使用如下，就是生成环境时候使用该插件即可
if (process.env.NODE_ENV === 'production') {
    plugins.push(new WebpackPluginSkeleton({
        params: 'selftest',
    }));
}
// 编写插件我们利用afterEmit钩子
class WebpackPluginSkeleton {
  constructor(params) {
    this.renderParams = params;
  }
  apply(compiler) {
    compiler.hooks.afterEmit.tapAsync(
      this.constructor.name,
      (compilation, done) => {
        afterEmit(this.renderParams, done);
      }
    );
  }
}
async function afterEmit(renderParams, stopFn) {
  // 构建完成后，本地起服务
  const server = new Server({
    server: {
      port,
    },
    staticDir: 'dist',
  });
  server.initialize();
  // 获取生成骨架屏的脚本，该脚本可以是个类似jq的自执行函数，挂载到全局变量供使用，我们这里会设计成这样，其实就是一堆
  // js代码，最后使用rollup打包成iife即可，可以挂载到全局变量上供后续用来调用生成骨架屏
  const scriptContent = await genScriptContent();
  // 启动无头浏览器
  const browser = await puppeteer.launch({
    // headless: false,
    args: [
      '--disable-web-security',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });
  // 关闭函数
  const quitFn = (needAlarm, pageName, reason) => {
    if (needAlarm) {
      // 提示构建失败
    }
    browser.close();
    server.destroy();
    stopFn();
    stop && clearTimeout(stop);
  };
  // 超时直接停止
  const stop = setTimeout(() => {
    quitFn(true);
  }, 60000);
  // 收集所有需要预渲染的页面，每个页面搞个json配置，里面存有页面信息例如页面名称，页面打开链接上需要带的参数等
  const allNeedRenderPages = ['可以直接读取每个页面的配置，各自实现即可，这里只要找到页面就行'];
  for (let i = 0; i < allNeedRenderPages.length; ++i) {
    const current = { ...allNeedRenderPages[i], ...renderParams };
    // 浏览器打开页面
    const page = await browser.newPage();
    // 插入骨架屏代码
    await openPageAndGenSkeleton(page, current, scriptContent, quitFn);
  }
  quitFn();
}
module.exports = WebpackPluginSkeleton;
```
如上大概得结构功能代码就这样，现在我们来编写每个函数的实现
``` js
// 首先实现使用express启动服务，本质就是dist文件进行伺服
const express = require('express');
class Server {
  constructor(options) {
    this._options = options;
    this._expressServer = express();
    this._nativeServer = null;
  }
  initialize() {
    const server = this._expressServer;
    server.get(
      '*',
      express.static(this._options.staticDir, {
        dotfiles: 'allow',
      })
    );
    return new Promise((resolve, reject) => {
      this._nativeServer = server.listen(this._options.server.port, () => {
        resolve();
      });
    });
  }
  destroy() {
    this._nativeServer.close();
  }
}
module.exports = Server;
```
接下来执行插入骨架屏代码的方法
``` js
async function openPageAndGenSkeleton(page, pageInfo, scriptContent, quitFn) {
  const { pageName, linkQuery, ...options } = pageInfo;
  // 模拟设备
  await page.emulate({
    name: 'M2010J19SC',
    userAgent:
      'Dalvik/2.1.0 (Linux; U; Android 11; M2010J19SC Build/RKQ1.201004.002)',
    viewport: {
      width: 360,
      height: 640, // 首屏组件的模拟高度
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      isLandscape: true,
    },
  });
  // 这里就是express服务器的地址
  const host = 'http://localhost:8888';
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    let newUrl = request.url();
    if (newUrl.includes('http')) {
      // 捕获到特定链接，将其替换改成访问本地express静态伺服地址
      request.continue({
        url: newUrl.replace(publicPath, host),
      });
    } else {
      request.continue();
    }
  });
  page.on('response', (response) => {
    // 接口问题导致无响应则停止生成
    const status = String(response.status());
    if (status.startsWith('4') || status.startsWith('5')) {
      quitFn(true, pageName, `请求：${response.url()}\n状态：${status}`);
    }
  });
  // 打开页面
  await page.goto(
    `${host}/cdn-${pageName}.html${linkQuery ? '?' + linkQuery : ''}`
  );
  // 将骨架屏生成脚本插入到页面中
  await page.addScriptTag({ content: scriptContent });
  // 生成骨架屏
  const styleCache = await page.evaluate((options) => {
    return new Promise((resolve, reject) => {
      // 我们可以传递特定事件时候触发构建
      if (options.params) {
        document.addEventListener(options.params, () => {
          setTimeout(() => {
            const { rules } = Skeleton.genSkeleton(options);
            resolve(rules);
          }, 1000);
        });
      } else { // 也可以默认一个等待一定时间开始构建
        setTimeout(() => {
          const { rules } = Skeleton.genSkeleton(options);
          resolve(rules);
        }, options.renderAfterTime || 5000);
      }
    });
  }, options);

  // 生成html和style
  const { cleanedHtml } = await page.evaluate(() => Skeleton.getHtmlAndStyle());
  // 这就是将样式解析成ast，下面分析
  const stylesheetAstArray = getStylesheetAstArray([styleCache]);
  // stylesheetAstObjects可以先不管，这个可以来解决异步chunk中css不处理问题
  const cleanedCSS = await page.evaluate(
    async (stylesheetAstObjects, stylesheetAstArray) => {
      return Skeleton.cleanedCSS(stylesheetAstObjects, stylesheetAstArray);
    },
    stylesheetAstObjects,
    stylesheetAstArray
  );
  // 重写index.html，先看这个方法，其他Skeleton相关的都是骨架屏生成方法，即插入的scriptContent内容
  await outputSkeletonScreen(cleanedCSS, cleanedHtml, {
    outputDir: 'dist',
    htmlName: 'cdn-' + pageName + '.html',
  });
  await page.close();
}
```
这里我们主要看下上面的两个方法，`getStylesheetAstArray`和`outputSkeletonScreen`
``` js
// 就是将骨架屏生成的样式进行解析转换成ast数组
const { parse, toPlainObject } = require('css-tree');
const getStylesheetAstArray = (styles) => {
  return styles.map((style) => {
    // 注意这里的解析方式可以看下面参考链接这几个参数的意义，可以让我们解析的时候结构简单很多
    // https://github.com/csstree/csstree/blob/master/docs/parsing.md#parseruleprelude
    // 例如我们可以很容易根据prelude.value直接取到当前class
    const ast = parse(style, {
      parseValue: false,
      parseRulePrelude: false,
    });
    return toPlainObject(ast);
  });
};
// 收集样式中的一些注释等
const collectImportantComments = (css) => {
  const once = new Set();
  const cleaned = css.replace(/(\/\*![\s\S]*?\*\/)\n*/gm, (match, p1) => {
    once.add(p1);
    return '';
  });
  const combined = Array.from(once);
  combined.push(cleaned);
  return combined.join('\n');
};
// 主要的生成页面的逻辑，就是将html和样式打入即可
const fs = require('fs');
const path = require('path');
const { fromPlainObject, generate } = require('css-tree');
const outputSkeletonScreen = (cleanedCSS, cleanedHtml, options) => {
  const { outputDir, htmlName } = options;
  const htmlPath = path.join(outputDir, htmlName);
  fs.readFile(htmlPath, 'utf8', (err, data) => {
    if (err) return;
    const allCleanedCSS = cleanedCSS.map((ast) => {
        const cleanedAst = fromPlainObject(ast);
        return generate(cleanedAst);
    }).join('\n');
    const finalCss = collectImportantComments(allCleanedCSS);
    // 这里可以加一些自定义样式，每个class都是我们在dom清洗时候会加上的特定classname
    const selfsty = '.sk-image {};.sk-button {}';
    const finalHtml = data
      .replace('.skeleton-html{}', finalCss + selfsty)
      .replace('<div id="skeleton"></div>', ' <div id="skeleton">' + cleanedHtml + '</div>');
    fs.writeFile(htmlPath, minify(finalHtml, minifyOptions), (err) => {
      if (err) throw err;
      console.log('The file has been saved!');
    });
  });
};
```
---

接下来主要讲解如何生成骨架屏的代码，从前面分析可知，只要获取到清洗后的css和html结构插入页面即可，单独搞个项目使用rollup打包成iife函数，给上面引入即可
简单`rollup.config`配置如下，我们来编写入口index文件
``` js
export default {
  input: 'index.js',
  output: {
    file: 'dist/index.js',
    format: 'iife',
    name: 'Skeleton'
  }
}
```
由前面分析可以知道，我们需要实现三个方法`genSkeleton` `getHtmlAndStyle` `cleanedCSS`，接下来我们来一个个分析下如何实现
``` js
export const inViewPort = (ele) => {
  const rect = ele.getBoundingClientRect()
  return rect.top < window.innerHeight && rect.left < window.innerWidth
}
export const isBase64Img = (img) => /base64/.test(img.src)
export const removeElement = (ele) => {
  const parent = ele.parentNode
  if (parent) {
    parent.removeChild(ele)
  }
}
// genSkeleton方法也按一定规则去除了不需要的dom节点
// 同时也返回需要处理的骨架屏样式，这里我们只以img标签举例子，其他各种类型标签可以各自实现
function genSkeleton(options) {
  const imgs = []; // 保存所有需要处理的img dom
  let toRemove = []; // 需要移除的dom节点
  (function preTraverse(ele) {
    const styles = window.getComputedStyle(ele);
    if (!inViewPort(ele) || /display:\s*none/.test(ele.getAttribute('style'))
    || styles.getPropertyValue('position')  === 'fixed') {
      return toRemove.push(ele);
    }
    if (ele.tagName === 'IMG' || isBase64Img(ele)) {
      return imgs.push(ele);
    }
  })(document.documentElement);
  imgs.forEach((e) => imgHandler(e));
  toRemove.forEach((e) => removeElement(e));
  let rules = ''; // styleCache存储了我们需要的样式
  for (const [selector, rule] of styleCache) {
    rules += `${selector} ${rule}\n`;
  }
  return { rules }
}
// 图片处理方法
function imgHandler(ele) {
  const { width, height } = ele.getBoundingClientRect();
  const attrs = {
    width,
    height,
    src,
  };
  // 给图片加上属性，方法就不行了，就是原生dom操作方法
  setAttributes(ele, attrs);
  const color = 'red';
  const className = 'sk-image';
  const rule = `{
    background: ${color} !important;
  }`;
  addStyle(`.${className}`, rule);
  // 给dom加上class
  addClassName(ele, [className]);
  // 删除图片上一些不需要的属性
  deleteUnusedAttrs(ele, ['alt', 'aria-label', 'lazy'])
}
// 单独写个文件来保存所有样式，不仅仅是img还有video等，保存好之后导出给genSkeleton方法导出使用
const styleCache = new Map();
export const addStyle = (selector, rule) => {
  if (!styleCache.has(selector)) {
    styleCache.set(selector, rule);
  }
};
export default styleCache;
```
目前我们导出的样式是针对页面上所有元素的，其实有很多元素可能不在首屏内，例如需要滚动到底部的元素等，这些元素是不需要
骨架屏的，我们得对样式表做些清洗，得到首屏需要展示的样式表，还有我们在上面对标签做处理时候，也同时删除了很多dom元素，
必修清洗掉没有用到对应class的样式，也就是实现我们的cleanedCSS方法
``` js
// 判断对应class是否已经没有任何dom节点在使用
const checker = (selector) => {
  try {
    const keep = !!document.querySelector(selector);
    return keep;
  } catch (err) {
    return false;
  }
};
const cleaner = (ast, callback) => {
  const decisionsCache = {};
  const clean = (children, cb) =>
    children.filter((child) => {
      if (child.type === 'Rule') {
        const values = child.prelude.value.split(',').map((x) => x.trim());
        // 这就是上面所说的css-tree参数设置的原因，这里解析就方便了,values就是所有class
        const keepValues = values.filter((selectorString) => {
          if (decisionsCache[selectorString]) {
            return decisionsCache[selectorString];
          }
          const keep = cb(selectorString); // 该class是否能找到dom，找不到就过滤掉
          decisionsCache[selectorString] = keep;
          return keep;
        });
        if (keepValues.length) {
          child.prelude.value = keepValues.join(', ');
          return true;
        }
        return false;
      } else if (child.type === 'Atrule' && child.name === 'media') {
        // 循环处理
        child.block.children = clean(child.block.children, cb);
        return child.block.children.length > 0;
      }
      return true;
    });

  ast.children = clean(ast.children, callback);
  return ast;
};
const cleanedCSS = (stylesheetAstObjects, stylesheetAstArray) => {
  const cleanedStyles = [];
  stylesheetAstArray.forEach((ast) => {
    cleanedStyles.push(
      cleaner(ast, checker)
    );
  });
  return cleanedStyles;
}
```
getHtmlAndStyle方法获取现在处理后的dom节点返回即可
``` js
function getHtmlAndStyle() {
  // 去除一些特别的dom节点，防止样式污染
  const AFTER_REMOVE_TAGS = ['title', 'meta', 'style']
  Array.from($$(AFTER_REMOVE_TAGS.join(','))).forEach((ele) =>
    removeElement(ele)
  );
  // 获取现在的html结构，这里的结构是移除了非首屏节点，和样式处理后的节点
  const cleanedHtml = document
    .getElementById('app')
    .innerHTML.replace(/&quot;/g, "'");
  return {
    cleanedHtml,
  };
}
```
## vw转换
主流的移动端适配方案rem布局和vw布局，对于rem首先需要在html文件头部放入一大段压缩过的js代码来计算不同屏幕下font-size，同时由于rem和根元素font-size值强耦合，系统
字体放大或缩小时，会导致布局错乱，移动端rem布局比vw主流的原因只是因为兼容性vw单位兼容性比rem稍差，ios8、安卓4.4及以上才完全支持

我们可以使用`px2vw-view-loader`来转换，但是如果支持一些特别功能可以自己开发下，需要支持某些元素不转换，并且也支持系统缩放比例重置，这里可以自己简单写个小转换功能
``` js
// 使用上大概如下
config.resolveLoader.alias.set("px2vw", resolve("./px2vw"));
config.module
  .rule("less")
  .test(/\.less$/)
  .enforce("pre")
  .use("px2vw")
  .loader("px2vw")
  .tap(() => {
    return {
      viewportWidth: 1080,
      viewportUnit: "vw",
      minPixelValue: 1,
      decimal: 3,
    };
  })
  .end();
```
接下来我们来编写px2vw.js文件
``` js
module.exports = function (source) {
  if (!this.cacheable || !this.query) {
    return source;
  }
  this.cacheable();
  var query = Object.assign(
    {},
    {
      viewportWidth: 750,
      viewportUnit: 'vw',
      minPixelValue: 1,
      decimal: 3,
    },
    this.query
  );
  // 主要来解决任何一个属性只要后面加上 /*keep*/就不用被转换，例如width: 676px/*keep*/
  var matchPXExp = /(\-?[0-9.]+px)([\s]*\/\*keep\*\/|[;,| |}|'|")\r|\n])/g;
  return source.replace(matchPXExp, function (match, m1, m2) {
    var pixels = parseFloat(m1.slice(0, m1.length - 2));
    if (Math.abs(pixels) <= query.minPixelValue || /\/\*keep\*\//.test(m2)) {
      return match;
    }
    var result = createPxReplace(
        pixels,
        query.viewportWidth,
        query.decimal,
        query.viewportUnit
      ) + m2;
    return result;
  });
};
function createPxReplace(
  pixels,
  viewportSize,
  unitPrecision,
  viewportUnit
) {
  return `calc(${((pixels / viewportSize) * 100).toFixed(
    unitPrecision
  )}${viewportUnit} * var(--scale))`;
}
```
注意上面这个值`var(--scale)`,这个可以是一个比例系数，可以监听当系统字体设置大小变化时候，来重新调整这个值，以达到适配的目的
`:root {--scale: 0.8;}`

## 加载优化
与浏览器不同，App 打开 H5 页面的第一步并不是建立页面请求连接，而是初始化 Webview；初始化 Webview 包括创建 Webview 实例，对
于 App 冷启后的首次 Webview 初始化，还需要初始化浏览器内核。因此，对于冷启或者全新安装的 App ，首次初始化 Webview 耗时相对
较长，大概在数百 ms ；而二次打开就较快了，大概在数十 ms，所以我们需要**容器预建**

**容器预建**得考虑到什么时候建立容器，一般在线程空闲时候创建，还得考虑建立个数，一般建立一个，当容器被用掉时候再预创建，也可以
复用一个容器，即页面销毁，不回收webviwe容器，而是继续常驻，这得考虑内存状态，当然这部分工作主要是原生开发来完成
***

静态资源地址可以和app请求接口地址一个域名，来节省域名解析时间，同时如果页面需要加载某个核心接口，也可以预先让app先加载调用好，这
要求所有接口都是利用app原生方法发出

可以让部分不经常更新的页面直接写入app缓存，使用方式就是app进入页面之后可以调用一个接口来确定静态资源包是否更新，如果更新或者无缓存则拉取最新
资源包加载到缓存，如果没更新则继续使用缓存，同时我们的页面打包时候支持配置哪些页面成为资源包上传到服务器，publickPath设置为特定格式
例如`file://`这种形式，当页面加载时候app可以判断这种链接资源直接拿本地资源包即可

有了这种静态资源包缓存的形式，我们还可以粗略实现灰度发布，不用瞬间跟新所有用户，只要控制接口返回值即可控制谁来更新
***
对于发布我们可以将每个路由都打包成page，这样的好处就是每次只发布需要改动的页面，剩下就是正常控制打包资源的大小，资源prefech等常用方法

## 参考链接
[美团CDN容灾方案](https://tech.meituan.com/2022/01/13/phoenix-cdn.html)

[webview优化](https://zhuanlan.zhihu.com/p/650304306)

[css-tree](https://github.com/csstree/csstree)

[css-ast](https://forum.juejin.cn/youthcamp/post/7054101680580722724?from=1)