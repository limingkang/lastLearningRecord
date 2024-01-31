## babel基础
配置文件介绍，不同的配置文件有不同的功能
- 使用单一仓库（monorepo）模式或者需要编译`node_modules`,那么我们的配置文件就使用`babel.config.json`
- 如果只是想让配置文件适用于项目某个部分则使用`.babelrc.json`

比较特别的是，还可以选择将`.babelrc.json`中的配置信息作为 babel 键（key）的值添加到 package.json 文件中，如下所示：
``` json
{
  "name": "my-package",
  "version": "1.0.0",
  "babel": {
    "presets": [ ... ],
    "plugins": [ ... ],
  }
}
```
插件和预设的关系，代码转换功能以插件的形式出现，插件是小型的 JavaScript 程序，用于指导 Babel 如何对代码进行转换。你甚至可
以编写自己的插件将你所需要的任何代码转换功能应用到你的代码上。例如将 ES2015+ 语法转换为 ES5 语法，我们可以使用诸如`@babel/plugin-transform-arrow-functions`之类的官方插件
``` shell
# 代码中的所有箭头函数（arrow functions）被转换为 ES5 兼容的函数表达式
npm install --save-dev @babel/plugin-transform-arrow-functions
./node_modules/.bin/babel src --out-dir lib --plugins=@babel/plugin-transform-arrow-functions
```
如果我们需要将所有的高级语法进行转换，不用一个个下载插件，只需要使用一组预设即可
``` shell
npm install --save-dev @babel/preset-env
./node_modules/.bin/babel src --out-dir lib --presets=@babel/env
```
如果不进行任何配置，上述 preset 所包含的插件将支持所有最新的 JavaScript （ES2015、ES2016 等）特性，如果加了配置
例如名为 env 的 preset 只会为目标浏览器中没有的功能加载转换插件
``` json
{
  "presets": [
    [
      "@babel/preset-env",
      {
        "targets": {
          "edge": "17",
          "firefox": "60",
          "chrome": "67",
          "safari": "11.1"
        },
        "useBuiltIns": "usage"
      }
    ]
  ]
}
```
从 Babel 7.4.0 版本开始，这个软件包`@babel/polyfill`已经不建议使用了，建议直接包含`core-js/stable`，注意到上面的useBuiltIns参数，Babel 将检查
你的所有代码，以便查找目标环境中缺失的功能，然后只把必须的 polyfill 包含进来
``` js
// 代码
Promise.resolve().finally();
// 转换后
require("core-js/modules/es.promise.finally");
Promise.resolve().finally();
```
如果我们不使用将 "useBuiltIns" 参数设置为 "usage" （默认值是 "false"）的 env 预设的话，那么我们必须在所有代码之前利用require加载一次完整的polyfill
``` js
import "core-js/stable";
```

如上我们引入`babel-polyfill`或`core-js/stable与regenerator-runtime/runtime`来做全局的API补齐。但这样可能有一个问题，那就是对运行环境产生了污染。例
如Promise，我们的polyfill是对浏览器的全局对象进行了重新赋值，我们重写了Promise及其原型链。有时候我们不想改变或补齐浏览器的window.Promise，这个时候我们
就可以使用`@babel/plugin-transform-runtime`它可以对我们代码里ES6的API进行转换。于是babel实现兼容低版本浏览器的方案从：
1. `@babel/preset-env`进行语法转换，即箭头函数转成正常函数等
2. api补齐用`babel-polyfill`或`core-js/stable与regenerator-runtime/runtime`
第一步没有变，主要第二步从垫片补齐变成api转换`@babel/plugin-transform-runtime`，即将用到的某些高阶方法如reduce等，使用其他辅助方法改造，使用方式如下
``` js
// helpers用来设置是否要自动引入辅助函数包，当然要引入了，这是@babel/plugin-transform-runtime
// 的核心用途。该项取值是布尔值，我们设置为true，其默认值也是true，所以也可以省略不填
{
    "presets": [
      "@babel/env"
    ],
    "plugins": [
        [
            "@babel/plugin-transform-runtime",
            {
                "helpers": true,
                "corejs": 3,
            }
        ]
    ]
}
// corejs取值是false、2和3。在前端业务项目里，我们一般对corejs取false，即
// 不对Promise这一类的API进行转换。而在开发JS库的时候设置为2或3
```
值得注意的是，上文我们安装的是@babel/runtime，而这里却是@babel/runtime-corejs3。**在我们不需要开启core-js相关API转换功能的时候，我们只需要安装@babel/runtime就可以了。**
@babel/runtime里存放的是Babel做语法转换的辅助函数。在我们需要开启core-js相关API转换功能的时候，就需要安装@babel/runtime的进化版@babel/runtime-corejs3。这个npm包
里除了包含Babel做语法转换的辅助函数，也包含了core-js的API转换函数，如下就是大概编译后的状态
``` js
"use strict";
var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var Person = /*#__PURE__*/function () {
function Person() {
    (0, _classCallCheck2["default"])(this, Person);
}

(0, _createClass2["default"])(Person, [{
    key: "sayname",
    value: function sayname() {
    return 'name';
    }
}]);
return Person;
}();

var john = new Person();
console.log(john);
```
## babel工具包
`@babel/standalone`可以直接在html中，通过`<script src='...'></script>`方式被引入，它包含了所有Bable标准的plugins和presets，当然，也提供精简（压缩）版
本babel.min.js

通常，我们使用官方或是第三方脚手架or打包工具（Webpack、Browserify、Gulp），通过配置化引入babel-loader，在编译阶段就完成了直接翻译，但是有些场景除外
- 调试React源码；
- 在线实时javascript编辑器网站（如 JSFiddle, JS Bin, REPL on the Babel ）；
- 直接嵌入到应用中，例如：V8 javascript 引擎；
- 其它开发语言

``` html
<div id="output"></div>
<!-- Load Babel -->
<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
<!-- 里面的箭头函数就可以直接使用了，babel会自行转义 -->
<script type="text/babel">
  const getMessage = () => "Hello World";
  document.getElementById("output").innerHTML = getMessage();
</script>

<!-- 当然也支持加一些自定义的配置参数 -->
<script type="text/babel" data-presets="env,react">
<script type="text/babel" data-plugins="transform-class-properties">
<script type="text/babel" src="foo.js"></script>
```

`@babel/register`另一个使用Babel的方法是通过require钩子,将自身绑定到 node 的 require 模块上，并在运行时进行即时编译
``` js
npm install @babel/core @babel/register --save-dev
require("@babel/register");
```

## 参考文档
[babel官网](https://babeljs.io/docs/)

[babel中文网站](https://www.babeljs.cn/docs/)
