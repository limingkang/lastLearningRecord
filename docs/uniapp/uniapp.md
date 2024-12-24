## andriod开发
test

## ios开发
test

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
test

### ios推送
test

### 广告接入
test

## 参考文档
[uniapp官网](https://uniapp.dcloud.net.cn/quickstart-hx.html)

[快应用开发者账号申请汇总](https://www.w3cschool.cn/quickapp/quickapp-isnp3953.html)

[小米快应用平台](https://dev.mi.com/console/app/newapp.html)

[华为快应用平台](https://developer.huawei.com/consumer/cn/)

[OPPO快应用平台](https://open.oppomobile.com/)

[VIVO快应用平台](https://dev.vivo.com.cn/)

[快应用广告接入指南](https://quickapp.vivo.com.cn/quickapp-ad-api-gide/amp/)

[微信小程序](https://developers.weixin.qq.com/miniprogram/dev/devtools/page.html#%E5%90%AF%E5%8A%A8%E9%A1%B5)