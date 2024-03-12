## 跨域携带cookie
- `XMLHttpRequest.withCredentials`属性是一个布尔值，指示是否Access-Control应用 cookie、授权标头或 TLS 客户端证书等凭据进行跨站点请求。设置withCredentials对同站点请求没有影响。

- 此标志还用于指示何时在响应中忽略 cookie。默认值为false;XMLHttpRequest来自不同域的 cookie 不能为自己的域设置 cookie 值，除非在发出请求之前withCredentials设置为true;通过设置为 true 获得的第三方cookiewithCredentials仍将遵循同源策略，因此请求脚本无法通过document.cookie或从响应标头访问

- `Access-Control-Allow-Credentials`响应头用于在请求要求包含 credentials（Request.credentials 的值为 include）时，告诉浏览器是否将响应暴露给前端 JavaScript 代码

- 当请求的 credentials 模式（Request.credentials）为 include 时，浏览器仅在响应标头 Access-Control-Allow-Credentials 的值为 true 的情况下将响应暴露给前端的 JavaScript 代码

- Credentials 可以是 cookies、authorization headers 或 TLS client certificates

#### 具体配置方法
1. 前端请求时在request对象中配置"withCredentials": true；
2. 跨域服务端在response的header中配置"Access-Control-Allow-Origin", “http://xxx:${port}”;
3. 跨域服务端在response的header中配置"Access-Control-Allow-Credentials", “true”

## 箭头函数和this
当使用箭头函数时要注意一下几点：
1. 箭头函数不能用作构造函数，用的话会抛出一个错误
2. 无法使用arguments参数，如果要用的话就用rest
3. 无法使用yield命令，所以箭头函数无法用作Generator函数
4. 因为没有自己的this，所以没法通过bind、call、apply来改变this指向
5. 但是这不代表箭头函数的this指向是静态的，我们可以通过改变它外层代码库的this指向来控制
6. 箭头函数的this从外层代码库继承，所以箭头函数的this是在定义的时候就绑定好了的，而普通函数是在调用的时候确定this指向
7. 字面量对象中直接定义的箭头函数的this不绑定该对象，而是往外找一层，最简单的情况是绑定到window
``` js
const obj = {
  fun1: function () {
    console.log(this);
    return () => {
      console.log(this);
    }
  },
  fun2: function () {
    return function () {
      console.log(this);
      return () => {
        console.log(this);
      }
    }
  },
  fun3: () => {
    console.log(this);
  }
}
 
let f1 = obj.fun1(); // obj
f1() // obj
 
let f2 = obj.fun2();
let f2_2 = f2(); // window
f2_2() // window
obj.fun3(); // window
```
``` js
const obj = {
    name: '张三',
    getName() {
        return this.name
    },
    getName1: () => {
        return this.name
    }
}
obj.__proto__.getName2 = function() {
    return this.name
}
obj.__proto__.getName3 = () => {
    return this.name
}
console.log('普通函数',obj.getName())//张三
console.log('普通函数',obj.getName2())// 张三
console.log('箭头函数',obj.getName1()) // 
console.log('箭头函数',obj.getName3()) //
```

## async/await 遇上 forEach
我们先看下面这个demo，结果是1s后一次性输出1 4 9
``` js
var getNumbers = () => {
  return Promise.resolve([1, 2, 3])
}
var multi = num => {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (num) {
        resolve(num * num)
      } else {
        reject(new Error('num not specified'))
      }
    }, 1000)
  })
}
async function test () {
  var nums = await getNumbers()
  nums.forEach(async x => {
    var res = await multi(x)
    console.log(res)
  })
}
test()
```
之所以会出现上面这个结果是应为forEach的实现造成的，可以看下实现源码
``` js
Array.prototype.forEach = function (callback) {
  // this represents our array
  for (let index = 0; index < this.length; index++) {
    // We call the callback for each entry
    callback(this[index], index, this)
  }
}
```
如此可以像下面这个改造下即可实现，每隔1s输出一个值
``` js
async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}
async function test () {
  var nums = await getNumbers()
  asyncForEach(nums, async x => {
    var res = await multi(x)
    console.log(res)
  })
}
```

## 常用的设计模式

### 单例模式
单例模式即一个类只能构造出唯一实例，单例模式的意义在于共享、唯一，Redux/Vuex中的store、JQ的$或者业务场景中的购物车、登录框都是单例模式的应用
``` js
class SingletonLogin {
  constructor(name,password){
    this.name = name
    this.password = password
  }
  static getInstance(name,password){
    //判断对象是否已经被创建,若创建则返回旧对象
    if(!this.instance)this.instance = new SingletonLogin(name,password)
    return this.instance
  }
}
 
let obj1 = SingletonLogin.getInstance('CXK','123')
let obj2 = SingletonLogin.getInstance('CXK','321')
 
console.log(obj1===obj2)    // true
console.log(obj1)           // {name:CXK,password:123}
console.log(obj2)           // 输出的依然是{name:CXK,password:123}
```

### 工厂模式
工厂模式即对创建对象逻辑的封装，或者可以简单理解为对new的封装，这种封装就像创建对象的工厂，故名工厂模式。工厂模式常见于大型项目，比如JQ的$对象，我们创建选择器对象时之所以没有new selector就是因为$()已经是一个工厂方法，其他例子例如React.createElement()、Vue.component()都是工厂模式的实现。工厂模式有多种：简单工厂模式、工厂方法模式、抽象工厂模式，这里只以简单工厂模式为例：
``` js
class User {
  constructor(name, auth) {
    this.name = name
    this.auth = auth
  }
}

class UserFactory {
  static createUser(name, auth) {
    //工厂内部封装了创建对象的逻辑:
    //权限为admin时,auth=1, 权限为user时, auth为2
    //使用者创建对象时,不需要知道各个权限对应哪个字段, 不需要知道赋权逻辑，只要知道创建了一个管理员和用户
    if(auth === 'admin')  new User(name, 1)
    if(auth === 'user')  new User(name, 2)
  }
}

const admin = UserFactory.createUser('cxk', 'admin');
const user = UserFactory.createUser('cxk', 'user');
```

### 观察者模式
观察者模式算是前端最常用的设计模式了，观察者模式概念很简单：观察者监听被观察者的变化，被观察者发生改变时，通知所有的观察者。观察者模式被广泛用于监听事件的实现,有些文章也把观察者模式称为发布订阅模式，其实二者是有所区别的，发布订阅相较于观察者模式多一个调度中心
``` js
//观察者
class Observer {    
  constructor (fn) {      
    this.update = fn    
  }
}
//被观察者
class Subject {    
    constructor() {        
        this.observers = []          //观察者队列    
    }    
    addObserver(observer) {          
        this.observers.push(observer)//往观察者队列添加观察者    
    }    
    notify() {                       //通知所有观察者,实际上是把观察者的update()都执行了一遍       
        this.observers.forEach(observer => {        
            observer.update()            //依次取出观察者,并执行观察者的update方法        
        })    
    }
}

var subject = new Subject()       //被观察者
const update = () => {console.log('被观察者发出通知')}  //收到广播时要执行的方法
var ob1 = new Observer(update)    //观察者1
var ob2 = new Observer(update)    //观察者2
subject.addObserver(ob1)          //观察者1订阅subject的通知
subject.addObserver(ob2)          //观察者2订阅subject的通知
subject.notify()                  //发出广播,执行所有观察者的update方法
```

### 装饰器模式
装饰器模式，可以理解为对类的一个包装，动态地拓展类的功能，ES7的装饰器语法以及React中的高阶组件（HoC）都是这一模式的实现。react-redux的connect()也运用了装饰器模式，这里以ES7的装饰器为例
``` js
function info(target) {
  target.prototype.name = '张三'
  target.prototype.age = 10
}

@info
class Man {}

let man = new Man()
man.name // 张三
```

### 适配器模式
适配器模式，将一个接口转换成客户希望的另一个接口，使接口不兼容的那些类可以一起工作。我们在生活中就常常有使用适配器的场景，例如出境旅游插头插座不匹配，这时我们就需要使用转换插头，也就是适配器来帮我们解决问题
``` js
class Adaptee {
  test() {
      return '旧接口'
  }
}
 
class Target {
  constructor() {
      this.adaptee = new Adaptee()
  }
  test() {
      let info = this.adaptee.test()
      return `适配${info}`
  }
}
 
let target = new Target()
console.log(target.test())
```

### 代理模式
代理模式，为一个对象找一个替代对象，以便对原对象进行访问。即在访问者与目标对象之间加一层代理，通过代理做授权和控制。最常见的例子是经纪人代理明星业务，假设你作为一个投资者，想联系明星打广告，那么你就需要先经过代理经纪人，经纪人对你的资质进行考察，并通知你明星排期，替明星本人过滤不必要的信息。事件代理、JQuery的$.proxy、ES6的proxy都是这一模式的实现，下面以ES6的proxy为例：
``` js
const idol = {
  name: '蔡x抻',
  phone: 10086,
  price: 1000000  //报价
}

const agent = new Proxy(idol, {
  get: function(target) {
    //拦截明星电话的请求,只提供经纪人电话
    return '经纪人电话:10010'
  },
  set: function(target, key, value) {
    if(key === 'price' ) {
      //经纪人过滤资质
      if(value < target.price) throw new Error('报价过低')
      target.price = value
    }
  }
})


agent.phone        //经纪人电话:10010
agent.price = 100  //Uncaught Error: 报价过低
```

## 继承方式比较
### 原型链继承
原型链继承的原理很简单，直接让子类的原型对象指向父类实例，当子类实例找不到对应的属性和方法时，就会往它的原型对象，也就是父类实例上找，从而实现对父类的属性和方法的继承
``` js
// 示例:
function Parent() {
    this.name = ['写代码像蔡徐抻'] 
}
Parent.prototype.getName = function() {
    return this.name
}
function Child() {}

Child.prototype = new Parent()
Child.prototype.constructor = Child 

// 测试
const child1 = new Child()
const child2 = new Child()
child1.name[0] = 'foo'
console.log(child1.name)          // ['foo']
console.log(child2.name)          
// ['foo'] (预期是['写代码像蔡徐抻'], 对child1.name的修改引起了所有child实例的变化)
```
从上面分析可知，该继承存在两个问题
1. 由于所有Child实例原型都指向同一个Parent实例, 因此对某个Child实例的父类引用类型变量修改会影响所有的Child实例
2. 在创建子类实例时无法向父类构造传参, 即没有实现super()的功能

### 构造函数继承
构造函数继承，即在子类的构造函数中执行父类的构造函数，并为其绑定子类的this，让父类的构造函数把成员属性和方法都挂到子类的this上去，这样既能避免实例之间共享一个原型实例，又能向父类构造方法传参，缺点就是继承不到父类原型上的属性和方法
``` js
function Parent(name) {
    this.name = [name]
}
Parent.prototype.getName = function() {
    return this.name
}
function Child() {
    Parent.call(this, 'zhangsan')   
// 执行父类构造方法并绑定子类的this, 使得父类中的属性能够赋到子类的this上
}

//测试
const child1 = new Child()
const child2 = new Child()
child1.name[0] = 'foo'
console.log(child1.name)          // ['foo']
console.log(child2.name)          // ['zhangsan']
child2.getName()                  
// 报错,找不到getName(), 构造函数继承的方式继承不到父类原型上的属性和方法
```

### 组合式继承
既然原型链继承和构造函数继承各有互补的优缺点, 那么我们为什么不组合起来使用呢, 所以就有了综合二者的组合式继承
``` js
function Parent(name) {
    this.name = [name]
}
Parent.prototype.getName = function() {
    return this.name
}
function Child() {
    // 构造函数继承
    Parent.call(this, 'zhangsan') 
}
//原型链继承
Child.prototype = new Parent()
Child.prototype.constructor = Child

//测试
const child1 = new Child()
const child2 = new Child()
child1.name[0] = 'foo'
console.log(child1.name)          // ['foo']
console.log(child2.name)          // ['zhangsan']
child2.getName()                  // ['zhangsan']
```
每次创建子类实例都执行了两次构造函数(Parent.call()和new Parent())，虽然这并不影响对父类的继承，但子类创建实例时，原型中会存在两份相同的属性和方法，这并不优雅

### 寄生式组合继承
为了解决构造函数被执行两次的问题, 我们将指向父类实例改为指向父类原型, 减去一次构造函数的执行
``` js
function Parent(name) {
    this.name = [name]
}
Parent.prototype.getName = function() {
    return this.name
}
function Child() {
    // 构造函数继承
    Parent.call(this, 'zhangsan') 
}
Child.prototype = Parent.prototype  //将`指向父类实例`改为`指向父类原型`
// 但这种方式存在一个问题，由于子类原型和父类原型指向同一个对象，我们对子类原型的操作会影响到父类原型，例如给Child.prototype增加一个getName()方法，
// 那么会导致Parent.prototype也增加或被覆盖一个getName()方法，为了解决这个问题，我们给Parent.prototype做一个浅拷贝
Child.prototype = Object.create(Parent.prototype)
Child.prototype.constructor = Child

//测试
const child1 = new Child()
const child2 = new Child()
child1.name[0] = 'foo'
console.log(child1.name)          // ['foo']
console.log(child2.name)          // ['zhangsan']
child2.getName()                  // ['zhangsan']
```

## 判断 0.1 + 0.2 与 0.3 相等
设置一个误差范围值，通常称为”机器精度“，而对于Javascript来说，这个值通常是2^-52
- 在JavaScript中的二进制的浮点数0.1和0.2并不是十分精确，在他们相加的结果并非正好等于0.3，而是一个比较接近的数字 0.30000000000000004 ，所以并不相等，这个是二进制浮点数最大的问题（不仅JavaScript，所有遵循IEEE 754 二进制浮点数算术 标准规范的语言都是如此）
- 对于JS中的Number类型, 不区分整数和浮点数, 浮点数的精度远远不如整数
``` js
Number.EPSILON=(function(){
//在chrome中支持这个属性，但是IE并不支持(笔者的版本是IE10不兼容)
        return Number.EPSILON?Number.EPSILON:Math.pow(2,-52);
})();
//上面是一个自调用函数，当JS文件刚加载到内存中，就会去判断并返回一个结果，相比if(!Number.EPSILON){
//   Number.EPSILON=Math.pow(2,-52);
//}这种代码更节约性能，也更美观。
function numbersequal(a,b){ 
    return Math.abs(a-b)<Number.EPSILON;
}
```

## ['1', '2', '3'].map(parseInt)
map函数的第一个函数参数callback可以接收三个参数，其中第一个参数代表当前被处理的元素，而第二个参数代表该元素的索引
- parseInt是用来解析字符串的，使字符串成为指定基数的整数。parseInt(string, radix)接收两个参数，第一个表示被处理的值（字符串），第二个表示为解析时的
基数radix 一个介于2和36之间的整数(数学系统的基础)，表示上述字符串的基数。默认为10。返回值 返回一个整数或NaN

- 在radix为 undefined，或者radix为 0 或者没有指定的情况下，JavaScript 作如下处理：
1. 如果字符串 string 以"0x"或者"0X"开头, 则基数是16 (16进制).
2. 如果字符串 string 以"0"开头, 基数是8（八进制）或者10（十进制），那么具体是哪个基数由实现环境决定。ECMAScript 5 规定使用10，但是并不是所有的浏览器
都遵循这个规定。因此，永远都要明确给出radix参数的值
3. 如果字符串 string 以其它任何值开头，则基数是10 (十进制)

- 了解这两个函数后，我们可以模拟一下运行情况
1. parseInt('1', 0) //radix为0且string参数不以“0x”和“0”开头时，按照10为基数处理。这个时候返回1
2. parseInt('2', 1) //基数为1（1进制）表示的数中，最大值小于2，所以无法解析，返回NaN
3. parseInt('3', 2) //基数为2（2进制）表示的数中，最大值小于3，所以无法解析，返回NaN
4. map函数返回的是一个数组，所以最后结果为[1, NaN, NaN]

## 操作符问题
首先对于操作符，我们先看下对应规律
- 加性操作符：如果只有一个操作数是字符串，则将另一个操作数转换为字符串，然后再将两个字符串拼接起来
- 乘性操作符：如果有一个操作数不是数值，则在后台调用 Number()将其转换为数值
- Javascript中所有对象基本都是先调用valueOf方法，如果不是数值，再调用toString方法。
- 后边的“+”将作为一元操作符，如果操作数是字符串，将调用Number方法将该操作数转为数值，如果操作数无法转为数值，则为NaN
``` js
1 + "1"           // 11
2 * "2"           // 4
[1, 2] + [2, 1]   // 1,22,1
"a" + + "b"       // aNaN
```

## input中文输入事件
input框在输入切换中文输入法时的输入事件
- compositionstart事件只有在输入中文时才会触发，触发事件在input事件之前
- compositionend表示结束中文输入时触发的事件，不管最后输入的是不是中文都会触发
- input事件就是最后输入到输入框的事件
``` js
$(() => {
  let typing = false;
  // 输入中文之前
  $('#ahri').on('compositionstart',function(event) {
    console.log('compositionstart');
    typing = true;
  })
  // 输入中文之后
  $('#ahri').on('compositionend',function(event) {
    console.log('compositionend');
    typing = false;
    input(event);
  })
  // 真正输入文字
  $('#ahri').on('input',input)
  function input(event) {
    // 正在输入中文时就不执行后面的代码
    if(typing) return;
    console.log(event.target.value);
  }
})
```

## 埋点发送gif图
工作中，用于前端监控，比如曝光、点击、热点、心跳等等，谷歌和百度的都是用的1x1 像素的透明 gif 图片能够完成整个 - HTTP 请求+响应（尽管不需要响应内容）

- 触发 GET 请求之后不需要获取和处理数据、服务器也不需要发送数据
- 跨域友好
- 不会阻塞页面加载，影响用户的体验，只要new Image对象就好了，一般情况下也不需要append到DOM中，通过它的onerror和onload事件来检测发送状态
- 相比 XMLHttpRequest 对象发送 GET 请求，性能上更好
- GIF的最低合法体积最小（最小的BMP文件需要74个字节，PNG需要67个字节，而合法的GIF，只需要43个字节）
- 图片请求不占用 Ajax 请求限额
``` js
<script type="text/javascript">
 var thisPage = location.href;
 var referringPage = (document.referrer) ? document.referrer : "none";
 var beacon = new Image();
 beacon.src = "http://www.example.com/logger/beacon.gif?page=" + encodeURI(thisPage)
 + "&ref=" + encodeURI(referringPage);
</script>
```

## 数组push用到obj
``` js
var obj = {
    '2': 3,
    '3': 4,
    'length': 2,
    'splice': Array.prototype.splice,
    'push': Array.prototype.push
}
obj.push(1)
obj.push(2)
console.log(obj) 
// 结果：[,,1,2], length为4
// 伪数组（ArrayLike）
```
MDN解释说push方法应该是根据数组的length来根据参数给数组创建一个下标为length的属性:
- 使用第一次push，obj对象的push方法设置 obj[2]=1; obj.length+=1
- 使用第二次push，obj对象的push方法设置 obj[3]=2; obj.length+=1
- 使用console.log输出的时候，因为obj具有 length 属性和 splice 方法，故将其作为数组进行打印
- 打印时因为数组未设置下标为 0 1 处的值，故打印为empty，主动 obj[0] 获取为 undefined









