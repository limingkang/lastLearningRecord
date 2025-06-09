## 介绍
UniApp 编译后的 Android 项目代码默认是基于 Java 的，而不是 Kotlin。这是因为 UniApp 使用的是 Apache Cordova 和其插件体系来构建跨平台应用，而 Cordova 的原生 Android 支持主要
是围绕 Java 构建的。不过，从技术角度来说，Cordova 和 UniApp 并不阻止你在项目中使用 Kotlin

UniApp 编译后的 iOS 项目默认是基于 Objective-C (OC) 的，而不是 Swift。这是因为 UniApp 使用的是 Apache Cordova 和其插件体系来构建跨平台应用，而 Cordova 的原生 iOS 支持主
要是围绕 Objective-C 构建的。然而，这并不意味着你不能在编译后的项目中使用 Swift。实际上，在编译后的 Xcode 项目中，你可以混合使用 Objective-C 和 Swift，并且可以逐步将部
分代码转换为 Swift

1. 有些页面使用nvue书写，专门给app使用，使用基于weex改进的原生渲染引擎，提供原生渲染能力，[参考](https://zh.uniapp.dcloud.io/tutorial/nvue-outline.html)
2. 差异化编译的时候，我们看到app-plus和app两种，app-plus其实是提供了更多多原生系统交互工具，如调用拍照能，而app只是说是app平台编译，性能上其实app更强
3. 在不同屏幕大小，可以选择性动态添加一些页面显示，来做大屏幕适配，可[参考](https://uniapp.dcloud.net.cn/collocation/pages.html#leftwindow)
4. components文件夹内部组件自动注册到全局，是一种[easycom模式](https://uniapp.dcloud.net.cn/component/#easycom)
5. static静态资源目录，可以选择性给不同平台打入不同资源，[参考](https://uniapp.dcloud.net.cn/tutorial/platform.html#static)
6. uni-ui组件一定慎用，该组件在不同端小程序、app端等差异过大，只有在h5上才和文档上表现型一样
7. manifest.json文件是整体多端配置文件，我们可以使用hbuilder打卡，可以进行可视化配置或者直接编辑器打开，改参数，例如改掉微信appid即可使用

### 自定义字体和图标引入
如果我们想使用自定义图标，首先我们可以使用自己的图标例如ttf文件等使用时候直接用css类名即可'customicons youxi'
``` css
@font-face {
  font-family: "customicons"; /* Project id 2878519 */
  src:url('/static/customicons.ttf') format('truetype');
}

.customicons {
  font-family: "customicons" !important;
}

.youxi:before {
  content: "\e60e";
}
```
但是如果我们想使用自定义字体文件，小程序提供wx.loadFontFace加载第三方字体，或者直接加载本地字体，由于小程序不能使用font-face加载到自
定义字体，得使用转码成css的[网站](https://transfonter.org/)，将转码后的css文件复制到项目，页面引入后，写好字体名称即可使用，注意转码时候选择打开
Base64 encode，[参考文档](https://www.weingxing.cn/archives/105/comment-page-1)

最新版本好像已经支持本地引入，只是你生成的ttf文件，需要选择支持web端的

## android开发
首先android打包需要证书签名，证书大概会有以下四种方式生成，这里我们采用第四种
1. [Android平台签名证书(.keystore)生成指南](https://ask.dcloud.net.cn/article/35777)
2. 使用香蕉云编实现自定义证书，其实就是第一种方式网页端的实现[地址](https://www.yunedit.com/login)
3. 使用公共测试证书，大家都在用，有隐患不安全
4. 使用unicloud云端证书，需要我们先注册[申请](https://dev.dcloud.net.cn/pages/common/login)

uniapp打包的方式有两种，一种是云打包，一种是本地离线打包，我采用离线打包
1. 云打包由于会上传代码及证书，很多人怕不安全，现在有一种新的云打包[安心打包](https://ask.dcloud.net.cn/article/37979)方式，不用传代码及证书，云打包远端配置下一键打包很方便，但是有次数限制
现在是一天5次，超过需要交费排队
2. 离线打包配置繁琐，但是可以随便打几次

### 前置配置
1. 隐私政策[androidPrivacy.json](https://uniapp.dcloud.net.cn/tutorial/app-privacy-android.html)配置
2. 按照大小要求，完成app图标配置
3. app的权限配置，[参考](https://uniapp.dcloud.net.cn/tutorial/app-permission-android.html)
4. schema的配置，看需要，如果有需要通过h5直接唤起这个app则需要，[参考](https://uniapp.dcloud.net.cn/tutorial/app-android-schemes.html)
``` js
// 其实就是增加个配置
"app-plus": {
    "distribute": {
      "android": {
        "schemes": "testapp"
        //...
      },
      //...
    },
    //...
},
// h5页面
// <a href="testapp://abc">test:<a>
// 获取参数
onShow: function() {
	var args= plus.runtime.arguments;
	if(args){
		// 处理args参数，如直达到某新页面等
	}
}
```
5. 安装[android studio](https://developer.android.google.cn/studio?hl=zh-cn)
6. 下载官方给的包，里面包含框架壳子、离线[SDK](https://nativesupport.dcloud.net.cn/AppDocs/download/android.html)

### 应用和证书创建
...

### 本地离线打包
...

### 上传到应用市场
安卓市场分为：第三方市场（如：应用宝、360手机助手、豌豆荚），和手机厂商市场（如：华为、OPPO、VIVO、小米等）,我们只分发主流的几个即可
1. [vivo应用商店](https://dev.vivo.com.cn/promote/appStore)
2. [华为应用商店](https://developer.honor.com/cn/doc/guides/100882?navation=dh41628589245440589826%2F1)
3. [oppo应用商店](https://open.oppomobile.com/new/developmentDoc/info?id=10035)
4. [小米应用商店](https://dev.mi.com/xiaomihyperos/app-distribute)

具体更详细的app上架流程以及需要准备的东西，可以[参考](https://www.zhihu.com/tardis/bd/art/721651240)

### 本地调试
...

### 参考文件
1. [android原生工程配置](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/android.html)
2. [证书生成](https://blog.csdn.net/weixin_46001736/article/details/131936047)

## ios开发
[ios原生工程配置](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/ios.html)

## 进阶使用
本文主要介绍基础功能的使用方法，小程序和快应用相关的不再介绍，比较简单，只需要按要求生成相应包体，通过小程序工具或者快应用工具上传到对应目标载体上，发布上线即可
### 微信小程序分享
对于微信的分享我们主要通过五种方式分享，每种都是特定的链接并对应不同配置
1. 短信上的链接、浏览器直接打开、系统的扫码直接扫描的链接
2. 微信直接扫一扫直接扫描一个链接，微信内部点击一个链接、微信长按识别的二维码
3. 小程序三个点分享到朋友圈
4. 小程序通过右上角三个点分享出来的小程序
5. 生成一种动态的小程序码，通过微信扫码

第一种我们通过生成schema链接即可实现，可参考[schema](https://developers.weixin.qq.com/miniprogram/dev/framework/open-ability/url-scheme.html#%E5%8A%A0%E5%AF%86-URL-Scheme),需要注意的是在ios端没问题，在android不识别可能无法跳转，最好是两端都通过一个h5页面实现唤起，注意需要在该小程序后台设置明文拉起此小程序
``` js
let result = `weixin://dl/business/?appid=${appid}&path=pages/index/index&query=`
result = result + encodeURIComponent('a=value1&b=value2')
window.location.href = result;

// 取值方式在对应页面生命周期上的q参数
onLoad: function(options) {
    console.log(decodeURIComponent(options.q))
}
```

第二种其实是内部打开小程序，可[参考](https://developers.weixin.qq.com/miniprogram/introduction/qrcode.html#%E5%8A%9F%E8%83%BD%E4%BB%8B%E7%BB%8D)，值得注意的是需要在微信后台开发管理-开发设置-扫普通链接二维码打开小程序上配置规则和自己域名根目录上设置校验文件，取参方式如下
``` js
Page({
  onLoad(query) {
    const q = decodeURIComponent(query.q) // 获取到二维码原始链接内容
    const scancode_time = parseInt(query.scancode_time) // 获取用户扫码时间 UNIX 时间戳
  }
})
```
注意这种链接必须使用微信直接扫码，如果想通过h5页面来微信扫码中转到这个链接是不行的，因为h5打开后是使用浏览器打开的，所有链接都会被当做网页打开，如果想在h5页面内部调整到某个微信小程序页面，则得接入jssdk来实现，可以参考开发文档, [微信公众号接入文档](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html#63)
``` js
<script src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js">
document.getElementById('jumpButton').addEventListener('click', function() {
  wx.miniProgram.navigateToMiniProgram({
    appId: '目标小程序的AppID',
    path: '目标页面的路径?参数=值',
    extraData: {
      foo: 'bar'
    },
    envVersion: 'release', // 可选值 develop（开发版），trial（体验版），release（正式版）
    success(res) {
      // 跳转成功
    },
    fail(res) {
      // 跳转失败
    }
  });
});
```
也可以使用标签跳转的sdk接入方式可以参考[sdk文档](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_Open_Tag.html#21)


第三种分享到朋友圈其实就是调用对应生命周期配置即可，唯一值得注意的是，这个分享出去的小程序其实是个类似静态图片的小程序，在朋友圈点击直接进入查看，一旦操作则提示进入原小程序，同样内部的页面，例如relaunch等方法都会失效
``` js
onShareTimeline: function(e) {
    return {
        query: `station_id=${currenstationId}`
    }
}
onLoad: function(options) {
    console.log(options.station_id)
}
```

第四种通过微信设置生命周期，分享出去即可
``` js
onShareAppMessage: function(e) {
    return {
        path: `/pages/index/index?station_id=${currenstationId}`
    }
}
onLoad: function(options) {
    console.log(options.station_id)
}
```

第五种需要动态生成一个带有参数的小程序二维码，我们可以通过调用[微信api](https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/qr-code/getUnlimitedQRCode.html)来实现，文档中有三种接口，应对不同场景，详细阅读文档即可

### andriod推送
...

### ios推送
...

### 广告接入
...

## 参考文档
[uniapp官网](https://uniapp.dcloud.net.cn/quickstart-hx.html)

[快应用开发者账号申请汇总](https://www.w3cschool.cn/quickapp/quickapp-isnp3953.html)

[小米快应用平台](https://dev.mi.com/console/app/newapp.html)

[华为快应用平台](https://developer.huawei.com/consumer/cn/)

[OPPO快应用平台](https://open.oppomobile.com/)

[VIVO快应用开发指南](https://dev.vivo.com.cn/documentCenter/doc/631)

[VIVO快应用广告SDK接入指南](https://quickapp-sdk.vivo.com.cn/site/quickstart.html)

[快应用广告接入指南](https://quickapp.vivo.com.cn/quickapp-ad-api-gide/amp/)

[微信小程序](https://developers.weixin.qq.com/miniprogram/dev/devtools/page.html#%E5%90%AF%E5%8A%A8%E9%A1%B5)