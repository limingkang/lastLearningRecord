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
应用和证书这一步不要放到最后做，因为包名、appid、证书指纹会影响微信登录、支付、推送、地图、广告、应用市场上架等后续能力。

#### 1. 创建 DCloud 应用
1. 登录[DCloud 开发者中心](https://dev.dcloud.net.cn/pages/common/login)
2. 创建应用，选择对应的 uni-app 项目
3. 记录应用的 `appid`，一般是类似 `__UNI__XXXXXXX` 的值
4. 在 HBuilderX 中打开 `manifest.json`，确认基础配置里的应用标识和开发者中心一致
5. 在开发者中心申请 Android 平台的 AppKey，本地离线打包时需要写入原生工程

`manifest.json` 中常见需要保持一致的字段：
``` json
{
  "appid": "__UNI__XXXXXXX",
  "name": "testapp",
  "versionName": "1.0.0",
  "versionCode": 100
}
```

#### 2. 创建 Android 包名
包名建议一开始就定好，不要上线后再改。常见写法是反向域名：
``` text
com.company.project
com.example.testapp
```

包名需要同时保持这些地方一致：
1. `manifest.json` 里的 Android 包名
2. Android Studio 工程里的 `applicationId`
3. DCloud 开发者中心 Android 平台配置
4. 微信、支付宝、地图、推送、广告等第三方后台配置
5. 应用市场后台创建应用时填写的包名

#### 3. 生成签名证书
如果使用本地证书，可以用 JDK 自带的 `keytool` 生成：
``` bash
keytool -genkeypair -v \
  -keystore testapp-release.keystore \
  -alias testapp \
  -keyalg RSA \
  -keysize 2048 \
  -validity 36500
```

查看证书指纹：
``` bash
keytool -list -v -keystore testapp-release.keystore
```

需要保存好的信息：
``` text
keystore 文件
storePassword
keyAlias
keyPassword
SHA1
SHA256
MD5
```

证书一定要备份，后续应用市场升级必须使用同一个签名证书。证书丢了，很多市场会认为你上传的是另一个应用。

#### 4. 配置 AppKey
Android 离线工程需要在 `AndroidManifest.xml` 的 `application` 节点中配置 DCloud AppKey：
``` xml
<application
    android:allowBackup="false"
    android:icon="@drawable/icon"
    android:label="@string/app_name">

    <meta-data
        android:name="dcloud_appkey"
        android:value="这里替换成DCloud开发者中心申请的Android AppKey" />
</application>
```

AppKey 校验依赖 `appid + 包名 + 签名证书`。如果运行时提示 appkey 不正确，优先检查这三个值是否和开发者中心完全一致。

### 本地离线打包
离线打包的核心是：先用 HBuilderX 生成 uni-app 的前端资源，再把资源放进 Android 原生壳工程，最后用 Android Studio 编译 APK 或 AAB。

#### 1. 下载并导入离线 SDK
1. 下载和 HBuilderX 版本一致的 Android 离线 SDK，版本不一致容易出现运行时能力缺失或启动报错
2. 解压 SDK，里面常见目录如下：
``` text
HBuilder-Hello          App离线打包演示应用
HBuilder-Integrate-AS   集成uni-app的最简Android Studio示例
SDK                     SDK库文件目录
Feature-Android.xls     各模块需要依赖的库和配置说明
UniPlugin-Hello-AS      原生插件开发示例
```
3. 用 Android Studio 打开 `HBuilder-Integrate-AS` 或官方示例工程
4. 等 Gradle 同步完成，如果缺少 SDK、build tools 或 Gradle 版本，按 Android Studio 提示安装

#### 2. 生成本地打包资源
在 HBuilderX 中操作：
1. 打开 uni-app 项目
2. 点击 `发行` -> `原生App-本地打包` -> `生成本地打包App资源`
3. 生成后会得到类似下面的目录：
``` text
unpackage/resources/__UNI__XXXXXXX/www
```

把整个 `__UNI__XXXXXXX` 目录复制到 Android 工程：
``` text
app/src/main/assets/apps/__UNI__XXXXXXX/www
```

同时确认 `app/src/main/assets/data/dcloud_control.xml` 中的 appid 和资源目录名一致：
``` xml
<?xml version="1.0" encoding="utf-8"?>
<hbuilder>
    <apps>
        <app appid="__UNI__XXXXXXX" appver=""/>
    </apps>
</hbuilder>
```

#### 3. 配置 Gradle
`app/build.gradle` 中需要重点确认 `applicationId`、版本号、SDK 版本、签名配置：
``` gradle
android {
    namespace "com.example.testapp"
    compileSdk 35

    defaultConfig {
        applicationId "com.example.testapp"
        minSdk 21
        targetSdk 35
        versionCode 100
        versionName "1.0.0"
        multiDexEnabled true

        ndk {
            abiFilters "armeabi-v7a", "arm64-v8a", "x86"
        }
    }

    signingConfigs {
        release {
            storeFile file("../keystore/testapp-release.keystore")
            storePassword "你的storePassword"
            keyAlias "testapp"
            keyPassword "你的keyPassword"
        }
    }

    buildTypes {
        debug {
            signingConfig signingConfigs.release
        }
        release {
            minifyEnabled false
            signingConfig signingConfigs.release
            proguardFiles getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro"
        }
    }

    aaptOptions {
        additionalParameters "--auto-add-overlay"
        ignoreAssetsPattern "!.svn:!.git:.*:!CVS:!thumbs.db:!picasa.ini:!*.scc:*~"
    }
}
```

如果 `targetSdkVersion` 设置到 34 及以上，部分离线 SDK 版本还需要保持 so 的传统打包方式：
``` gradle
android {
    packagingOptions {
        jniLibs {
            useLegacyPackaging true
        }
    }
}
```

#### 4. 配置 AndroidManifest
核心入口 Activity 通常使用 DCloud 提供的 `PandoraEntry` 和 `PandoraEntryActivity`。如果用官方示例工程，一般已经配置好，只需要检查包名、AppKey、scheme、权限即可：
``` xml
<activity
    android:name="io.dcloud.PandoraEntry"
    android:configChanges="orientation|keyboardHidden|keyboard|navigation"
    android:hardwareAccelerated="true"
    android:label="@string/app_name"
    android:launchMode="singleTask"
    android:screenOrientation="user"
    android:theme="@style/TranslucentTheme"
    android:windowSoftInputMode="adjustResize">
    <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="android.intent.category.LAUNCHER" />
    </intent-filter>
    <intent-filter>
        <action android:name="android.intent.action.VIEW" />
        <category android:name="android.intent.category.DEFAULT" />
        <category android:name="android.intent.category.BROWSABLE" />
        <data android:scheme="testapp" />
    </intent-filter>
</activity>

<activity
    android:name="io.dcloud.PandoraEntryActivity"
    android:configChanges="orientation|keyboardHidden|screenSize|mcc|mnc|fontScale|keyboard|smallestScreenSize|screenLayout|uiMode"
    android:hardwareAccelerated="true"
    android:launchMode="singleTask"
    android:screenOrientation="user"
    android:theme="@style/DCloudTheme"
    android:windowSoftInputMode="adjustResize" />
```

需要注意：
1. 新建 Android 工程默认生成的 `MainActivity` 入口不要和 DCloud 入口冲突
2. 如果自己写 `Application`，要继承 DCloud 要求的基类或按官方方式接入，否则 SDK 初始化可能异常
3. 图标、启动图、隐私协议、权限说明需要在原生工程和 `manifest.json` 中同时检查

#### 5. 编译安装
开发调试时点击 Android Studio 的 Run 即可安装到手机。正式发包时：
1. 选择 `Build` -> `Generate Signed Bundle / APK`
2. 国内安卓市场一般上传 APK，Google Play 一般上传 AAB
3. 选择 release 证书
4. 打包完成后先在真机安装测试一遍

常见问题排查：
1. 启动白屏：检查 `assets/apps/__UNI__XXXXXXX/www` 是否复制完整
2. 提示 appid 不一致：检查 `dcloud_control.xml`、资源目录、`manifest.json` 的 appid
3. 提示 AppKey 错误：检查包名、签名证书、DCloud 后台 AppKey
4. 某个 API 不存在：检查离线 SDK 是否包含对应模块，以及 `Feature-Android.xls` 要求的依赖是否加全
5. 能 debug 不能 release：检查混淆、签名、so 架构和权限配置

### 上传到应用市场
安卓市场分为：第三方市场（如：应用宝、360手机助手、豌豆荚），和手机厂商市场（如：华为、OPPO、VIVO、小米等）,我们只分发主流的几个即可
1. [vivo应用商店](https://dev.vivo.com.cn/promote/appStore)
2. [华为应用商店](https://developer.honor.com/cn/doc/guides/100882?navation=dh41628589245440589826%2F1)
3. [oppo应用商店](https://open.oppomobile.com/new/developmentDoc/info?id=10035)
4. [小米应用商店](https://dev.mi.com/xiaomihyperos/app-distribute)

具体更详细的app上架流程以及需要准备的东西，可以[参考](https://www.zhihu.com/tardis/bd/art/721651240)

### 本地调试
uni-app 的调试一般分三层：HBuilderX 真机调试、原生工程调试、线上包问题排查。

#### 1. HBuilderX 真机运行
适合调页面、接口、样式、普通业务逻辑：
1. 手机开启 USB 调试
2. 数据线连接电脑
3. HBuilderX 点击 `运行` -> `运行到手机或模拟器`
4. 控制台查看 `console.log`

如果项目使用了推送、支付、地图、广告、原生插件等模块，标准基座可能不包含这些能力，需要制作自定义调试基座。

#### 2. 自定义调试基座
适合调原生能力和离线 SDK：
1. 在 HBuilderX 中选择 `发行` -> `原生App-云打包`
2. 勾选 `制作自定义调试基座`
3. 选择需要的模块和证书
4. 打出基座后，选择 `运行` -> `运行到手机或模拟器` -> `使用自定义基座运行`

如果采用离线工程，也可以直接用 Android Studio 编译 debug 包安装到手机，然后看 Logcat。

#### 3. Android Studio 调试
重点看这几类日志：
``` text
AndroidRuntime   原生崩溃
System.err       Java异常
chromium         WebView相关错误
DCLOUD           DCloud运行时日志
uni-app          前端输出
```

可以在代码中加平台条件编译，避免调试代码进入正式包：
``` js
// #ifdef APP-PLUS
console.log('当前运行在App端')
console.log(plus.runtime.appid)
console.log(plus.runtime.version)
// #endif
```

#### 4. 调试 scheme 唤起
安卓配置 scheme 后，可以用 adb 直接测试唤起：
``` bash
adb shell am start -a android.intent.action.VIEW -d "testapp://abc?id=100"
```

App 中获取参数：
``` js
// #ifdef APP-PLUS
export function getLaunchArgs() {
  const args = plus.runtime.arguments
  if (!args) return {}

  const url = args.replace('testapp://abc?', '')
  return Object.fromEntries(new URLSearchParams(url))
}
// #endif
```

#### 5. 线上问题排查建议
1. 打包前记录本次 HBuilderX 版本、离线 SDK 版本、appid、包名、versionCode
2. 发版前安装 release 包测试，不要只测 debug 包
3. 上架前用应用市场的隐私合规检测工具扫一遍
4. 涉及支付、登录、推送、广告的功能，必须用正式签名包测试

### 参考文件
1. [android原生工程配置](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/android.html)
2. [证书生成](https://blog.csdn.net/weixin_46001736/article/details/131936047)

## ios开发
iOS 打包比 Android 更依赖苹果开发者后台，核心是 Bundle ID、证书、描述文件、AppKey、隐私权限、资源导入这几项保持一致。

### 前置准备
1. 一台 macOS 电脑
2. 安装 Xcode
3. 注册 Apple Developer Program
4. 下载和 HBuilderX 版本一致的 iOS 离线 SDK
5. 在 DCloud 开发者中心申请 iOS AppKey
6. 在 Apple Developer 后台创建 Bundle ID、证书和描述文件

iOS 里的几个概念：
``` text
Bundle ID       类似 Android 包名，例如 com.example.testapp
Certificate     打包证书，分开发证书和发布证书
Profile         描述文件，绑定 Bundle ID、证书、设备、能力
AppKey          DCloud 对 appid + Bundle ID + 证书能力的校验
```

### iOS 原生工程配置
1. 解压 iOS 离线 SDK
2. 打开 `HBuilder-Hello` 工程
3. 修改 Xcode 的 `Bundle Identifier`
4. 修改 `Version` 和 `Build`，建议和 `manifest.json` 中的版本保持一致
5. 在 `Info.plist` 中添加 `dcloud_appkey`
6. 配置图标、启动页、权限描述
7. 导入 HBuilderX 生成的本地打包资源

`Info.plist` 核心配置：
``` xml
<key>dcloud_appkey</key>
<string>这里替换成DCloud开发者中心申请的iOS AppKey</string>

<key>CFBundleDisplayName</key>
<string>应用名称</string>

<key>NSCameraUsageDescription</key>
<string>用于拍照或扫码</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>用于选择或保存图片</string>
<key>NSLocationWhenInUseUsageDescription</key>
<string>用于获取当前位置</string>
```

HBuilderX 生成资源：
``` text
unpackage/resources/__UNI__XXXXXXX/www
```

复制到 iOS 工程时，通常需要确保：
``` text
Pandora/apps/__UNI__XXXXXXX/www
Pandora/control.xml
```

`control.xml` 中 appid 也要和资源目录一致：
``` xml
<?xml version="1.0" encoding="utf-8"?>
<hbuilder>
    <apps>
        <app appid="__UNI__XXXXXXX" appver=""/>
    </apps>
</hbuilder>
```

### iOS 打包和上架
1. Xcode 选择真机或 `Any iOS Device`
2. `Product` -> `Archive`
3. 归档完成后在 Organizer 中选择 `Distribute App`
4. 上传到 App Store Connect
5. 在 App Store Connect 填写隐私政策、截图、App 隐私、出口合规、广告标识等信息
6. 提交 TestFlight 或正式审核

如果使用了广告、统计或可能访问 IDFA 的 SDK，需要在 `Info.plist` 增加：
``` xml
<key>NSUserTrackingUsageDescription</key>
<string>用于提供更合适的广告和统计服务</string>
```

还需要在 App Store Connect 的 App 隐私中如实填写数据收集项。苹果审核对隐私描述很敏感，权限描述不要写得太空，例如“需要使用权限”，最好明确说明用途。

### iOS 本地调试
1. 用 Xcode 连接真机运行
2. 控制台看崩溃日志和 JS 输出
3. Safari 开启开发菜单后，可以调试 iOS WebView
4. 推送、支付、登录等能力必须用真机，模拟器经常无法完整验证

常见问题：
1. AppKey 错误：检查 appid、Bundle ID、证书和 DCloud 后台配置
2. 安装失败：检查描述文件是否包含当前设备
3. 审核被拒：重点看隐私权限、支付方式、隐藏功能、第三方登录是否符合规则
4. 启动白屏：检查 `Pandora/apps` 资源目录和 `control.xml`

[ios原生工程配置](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/ios.html)
[ios打包上架](https://juejin.cn/post/7544237599173197833)

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
注意你认证的网站如果被风控到，就是进入微信提示页面“不确认网站内容是否打开”，那么挑战就会被阻断，就不能再进入小程序，而是会被用浏览器打开

注意这种链接必须使用微信直接扫码，如果想通过h5页面来微信扫码中转到这个链接是不行的，因为h5打开后是使用浏览器打开的，所有链接都会被当做网页打开，如果想在h5页面内部调整到某个微信小程序页面，则得接入jssdk来实现，可以参考开发文档, [微信公众号接入文档](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html#63)
``` js
// 注意这是指的是h5内嵌在微信小程序webview内部的页面，如果内嵌则可以通过wx.miniProgram访问到小程序的方法,如果不是内嵌，则只能看上面文档支持哪些api调用了
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
对于外部任意h5页面可以使用标签跳转的sdk接入方式可以参考[sdk文档](https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/Wechat_Open_Tag.html#21)
需要接入使用云服务，其实就是文件传到微信服务器云托管[文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/staticstorage/jump-miniprogram.html)

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

### android推送
uni-app 现在优先使用 `uni-push 2.0`。它的好处是在线推送、离线厂商推送、服务端推送接口都被统一了一层，不需要你分别对接华为、小米、OPPO、vivo、个推等多个 SDK。

#### 接入步骤
1. 在 DCloud 开发者中心开通 `uni-push 2.0`
2. 在 `manifest.json` -> `App模块配置` 中勾选 `uniPush 2.0`
3. 如果只需要 App 在线时收消息，可以先不开厂商推送
4. 如果需要 App 被杀后还能收到通知，需要配置各安卓厂商推送参数
5. 打正式包或自定义基座测试，标准基座不一定包含完整推送能力

#### 客户端获取 cid
`cid` 是设备在 uni-push 中的客户端标识，服务端推送经常会用到。
``` js
// #ifdef APP-PLUS
export function initPush() {
  uni.getPushClientId({
    success(res) {
      console.log('push cid:', res.cid)
      // 一般这里要把 cid 上报到自己的服务端，和 userId 绑定
      uni.request({
        url: 'https://api.example.com/user/push-cid',
        method: 'POST',
        data: {
          cid: res.cid
        }
      })
    },
    fail(err) {
      console.log('getPushClientId fail:', err)
    }
  })
}
// #endif
```

可以在 `App.vue` 中初始化：
``` js
import { initPush } from '@/utils/push.js'

export default {
  onLaunch() {
    // #ifdef APP-PLUS
    initPush()
    // #endif
  }
}
```

#### 监听推送消息
``` js
// #ifdef APP-PLUS
plus.push.addEventListener('receive', function(message) {
  console.log('收到在线推送:', message)

  // 如果应用在线时也想展示系统通知，可以创建本地通知
  plus.push.createMessage(message.content || '你有一条新消息', message.payload || {}, {
    title: message.title || '消息通知'
  })
})

plus.push.addEventListener('click', function(message) {
  console.log('点击通知:', message)
  const payload = typeof message.payload === 'string'
    ? JSON.parse(message.payload || '{}')
    : message.payload || {}

  if (payload.path) {
    uni.navigateTo({
      url: payload.path
    })
  }
})
// #endif
```

#### 服务端推送思路
如果使用 uniCloud，可以在云函数里调用 uni-push 的服务端 API。实际项目里不要在客户端直接写推送密钥。
``` js
// uniCloud 云函数示意
'use strict'

exports.main = async (event, context) => {
  const uniPush = uniCloud.getPushManager({
    appId: '__UNI__XXXXXXX'
  })

  return uniPush.sendMessage({
    push_clientid: event.cid,
    title: '订单通知',
    content: '你的订单状态已更新',
    payload: {
      path: '/pages/order/detail?id=' + event.orderId
    },
    request_id: Date.now() + ''
  })
}
```

#### Android 厂商推送注意点
1. 厂商推送要用正式包名和正式签名，debug 包经常收不到
2. 华为、小米、OPPO、vivo 后台都需要分别创建应用并填写参数
3. 用户关闭通知权限后，推送接口成功也不会展示通知栏
4. Android 13 及以上需要通知权限，首次进入时最好主动引导用户开启
5. 离线推送点击后才能把 payload 交给 App，应用未被唤起时前端监听不到消息体

### ios推送
iOS 推送同样可以走 `uni-push 2.0`，但需要额外配置 Apple Push Notification service，也就是 APNs。

#### 接入步骤
1. Apple Developer 后台给 Bundle ID 开启 Push Notifications 能力
2. 创建 APNs Auth Key 或推送证书
3. 在 DCloud 开发者中心的 uni-push 配置中上传 iOS 推送配置
4. Xcode 工程 `Signing & Capabilities` 添加 `Push Notifications`
5. 如需要后台静默推送，添加 `Background Modes` -> `Remote notifications`
6. 打自定义基座或正式包到真机测试

#### 手动申请通知权限
如果不想一启动就弹通知授权，可以在 iOS 离线工程 `Info.plist` 中配置手动注册模式：
``` xml
<key>dcloud_push_register_mode</key>
<string>manual</string>
```

然后在合适的业务时机触发：
``` js
// #ifdef APP-PLUS
export function requestPushPermission() {
  if (plus.os.name !== 'iOS') return

  plus.push.getClientInfoAsync((info) => {
    console.log('iOS push info:', info)
  }, (err) => {
    console.log('get push info fail:', err)
  })
}
// #endif
```

#### iOS 点击通知跳转
``` js
// #ifdef APP-PLUS
plus.push.addEventListener('click', function(message) {
  const payload = typeof message.payload === 'string'
    ? JSON.parse(message.payload || '{}')
    : message.payload || {}

  if (payload.path) {
    uni.navigateTo({
      url: payload.path
    })
  }
})
// #endif
```

#### iOS 推送常见问题
1. 模拟器不能完整测试 APNs，必须用真机
2. 开发环境和生产环境的 APNs token 不一样，测试包和正式包要区分
3. TestFlight 包更接近生产环境，最终一定要用 TestFlight 测一次
4. 用户首次拒绝通知后，App 内无法再次弹系统授权，只能引导用户去系统设置打开
5. 如果 App 被强杀，部分静默推送和在线逻辑不会执行，只能依赖通知栏点击唤起

### 广告接入
uni-app 广告主要有三类常见场景：信息流/banner、激励视频、开屏/插屏。App 端一般走 DCloud 的 `uni-ad` 后台，小程序端很多时候走对应小程序平台自己的广告位。

#### 接入步骤
1. 登录 [uni-ad 后台](https://uniad.dcloud.net.cn/)
2. 创建媒体和广告位，拿到 `adpid`
3. 在 `manifest.json` -> `App模块配置` 中勾选 `uni-AD`
4. Android/iOS 离线打包时按广告模块要求补齐 SDK、权限、IDFA、隐私配置
5. 使用测试广告位验证展示和回调
6. 正式上线前替换为自己的广告位 ID

#### 信息流广告
适合文章详情、列表中部、页面顶部等位置。
``` vue
<template>
  <!-- #ifdef APP-PLUS || H5 || MP-WEIXIN -->
  <ad
    adpid="你的信息流广告位adpid"
    @load="onAdLoad"
    @error="onAdError"
    @close="onAdClose"
  />
  <!-- #endif -->
</template>

<script>
export default {
  methods: {
    onAdLoad(e) {
      console.log('广告加载成功', e)
    },
    onAdError(e) {
      console.log('广告加载失败', e)
    },
    onAdClose(e) {
      console.log('广告关闭', e)
    }
  }
}
</script>
```

#### 激励视频广告
激励视频适合“看广告得积分、解锁内容、领取次数”这类场景。核心点是必须判断用户是否完整看完，不能只要打开广告就发奖励。
``` js
let rewardedVideoAd = null
let rewardedVideoLoaded = false

export function createRewardedVideoAd() {
  // #ifdef APP-PLUS
  rewardedVideoAd = uni.createRewardedVideoAd({
    adpid: '你的激励视频广告位adpid'
  })

  rewardedVideoAd.onLoad(() => {
    rewardedVideoLoaded = true
    console.log('激励视频加载完成')
  })

  rewardedVideoAd.onError((err) => {
    rewardedVideoLoaded = false
    console.log('激励视频加载失败', err)
  })

  rewardedVideoAd.onClose((res) => {
    rewardedVideoLoaded = false
    if (res && res.isEnded) {
      // 正常播放结束，这里再调用服务端发奖励
      grantReward()
    } else {
      uni.showToast({
        title: '完整观看后才能领取奖励',
        icon: 'none'
      })
    }
  })
  // #endif
}

export function showRewardedVideoAd() {
  // #ifdef APP-PLUS
  if (!rewardedVideoAd) {
    createRewardedVideoAd()
  }

  if (rewardedVideoLoaded) {
    rewardedVideoAd.show()
    return
  }

  rewardedVideoAd.load()
    .then(() => rewardedVideoAd.show())
    .catch((err) => {
      console.log('激励视频展示失败', err)
    })
  // #endif
}

function grantReward() {
  uni.request({
    url: 'https://api.example.com/reward/ad',
    method: 'POST',
    data: {
      scene: 'watch_ad_unlock'
    },
    success() {
      uni.showToast({
        title: '奖励已发放'
      })
    }
  })
}
```

#### 广告合规注意点
1. 激励奖励必须由服务端校验和发放，前端只能作为触发入口
2. 广告位不要影响主流程操作，不要诱导误点
3. iOS 使用广告标识时要配置 IDFA 权限和 App Store 隐私说明
4. Android 要在隐私协议中说明广告 SDK、设备信息、OAID 等使用情况
5. 离线打包时广告模块依赖要和当前 SDK 版本匹配，升级 SDK 后要重新核对 `Feature-Android.xls`

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
