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

## 加密算法
加密算法的种类大概分成三类我们逐个了解下基础知识
### 单向加密算法（Hash算法、摘要算法）
Hash算法特别的地方在于它是一种单向算法，用户可以通过hash算法对目标信息生成一段特定长度的唯一hash值，却不能通过这个hash值重新获得目标信息。因此Hash算法常用在不
可还原的密码存储、信息完整性校验等，常见的Hash算法有MD2、MD4、MD5、HAVAL、SHA
### 对称加密算法
对称加密采用了对称密码编码技术，它的特点是文件加密和解密使用相同的密钥加密，也就是密钥也可以用作解密密钥，这种方法在密码学中叫做对称加密算法，对称加密算法使用起来简单快捷，密钥较短，且破译困难，除了数据加密标准（DES），另一个对称密钥加密系统是国际数据加密算法（IDEA），它比DES的加密性好，而且对计算机功能要求也没有那么高
- 优点是简单快捷，密钥较短，且破译困难
- 缺点是如果用户一旦多的话，管理密钥也是一种困难。不方便直接沟通的两个用户之间怎么确定密钥也需要考虑，这其中就会有密钥泄露的风险，以及存在更换密钥的需求
- 常见的对称加密算法有DES、3DES、Blowfish、IDEA、RC4、RC5、RC6和AES

加解密必须使用相同的模式和填充方式，常见的模式如下
1. ECB：最基本的加密模式，也就是通常理解的加密，相同的明文将永远加密成相同的密文，无初始向量，容易受到密码本重放攻击，一般情况下很少用。
2. CBC：明文被加密前要与前面的密文进行异或运算后再加密，因此只要选择不同的初始向量，相同的密文加密后会形成不同的密文，这是目前应用最广泛的模式。CBC加密后的密文是上下文相关的，但明文的错误不会传递到后续分组，但如果一个分组丢失，后面的分组将全部作废(同步错误)。
3. CFB：类似于自同步序列密码，分组加密后，按8位分组将密文和明文进行移位异或后得到输出同时反馈回移位寄存器，优点最小可以按字节进行加解密，也可以是n位的，CFB也是上下文相关的，CFB模式下，明文的一个错误会影响后面的密文(错误扩散)。
4. OFB：将分组密码作为同步序列密码运行，和CFB相似，不过OFB用的是前一个n位密文输出分组反馈回移位寄存器，OFB没有错误扩散问题。
### 非对称加密算法
非对称加密算法需要两个密钥：公开密钥（publickey）和私有密钥（privatekey）。公开密钥与私有密钥是一对，如果用公开密钥对数据进行加密，只有用对应的私有密钥才能解密；如果用私有密钥对数据进行加密，那么只有用对应的公开密钥才能解密。因为加密和解密使用的是两个不同的密钥，所以这种算法叫作非对称加密算法
- 缺点是加解密比对称加密耗时，优点是比对称加密安全
- 非对称加密算法实现机密信息交换的基本过程是：甲方生成一对密钥并将其中的一把作为公用密钥向其它方公开；得到该公用密钥的乙方使用该密钥对机密信息进行加密后再发送给甲方；甲方再用自己保存的另一把专用密钥对加密后的信息进行解密。甲方只能用其专用密钥解密由其公用密钥加密后的任何信息，非对称加密的典型应用是数字签名（http中间人攻击）
- 常见的非对称加密算法有：RSA、ECC（移动设备用）、Diffie-Hellman、El Gamal、DSA（数字签名用）

### 加解密库crypto-js，提供如AES，SHA256，base64，md5加密方式
从IE10+开始，浏览器就原生提供Base64编码解码方法，base64加密解密
``` js
//Base64编码
let data = window.btoa(stringToEncode);
//Base64解码
let data = window.atob(encodedData);

如果是汉字，就需要先对其进行编码，
下面的编码函数最开始 是因为URL只能使用英文字母、阿拉伯数字和某些标点符号，不能使用其他文字
和符号，所以汉字等其他国家字符都需要先编码。
//汉字base64编码
let data = window.btoa(window.encodeURIComponent('啦啦啦'));
//汉字解码   
let data =  window.decodeURIComponent(window.atob(JUU1JTk1JUE2JUU1JTk1JUE2JUU1JTk1JUE2));
```
``` js
import CryptoJS from 'crypto-js'  //引用AES源码js   
const key = CryptoJS.enc.Utf8.parse("1234123412ABCDEF");  //十六位十六进制数作为密钥
const iv = CryptoJS.enc.Utf8.parse('ABCDEF1234123412'); //十六位十六进制数作为密钥偏移量
//解密方法
function Decrypt(word) {
    let encryptedHexStr = CryptoJS.enc.Hex.parse(word);
    let srcs = CryptoJS.enc.Base64.stringify(encryptedHexStr);
    let decrypt = CryptoJS.AES.decrypt(srcs, key, 
        { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 
    });
    let decryptedStr = decrypt.toString(CryptoJS.enc.Utf8);
    return decryptedStr.toString();
}
//加密方法
function Encrypt(word) {
    let srcs = CryptoJS.enc.Utf8.parse(word);
    let encrypted = CryptoJS.AES.encrypt(srcs, key, 
        { iv: iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 
    });
    return encrypted.ciphertext.toString().toUpperCase();
}
export default {
    Decrypt ,
    Encrypt
}
```
- AES分为几种模式，比如ECB，CBC，CFB等等，这些模式除了ECB由于没有使用IV而不太安全，其他模式差别并没有太明显，大部分的区别在IV和KEY来计算密文的方法略有区别。具体可参考WIKI的说明。
另外，AES分为AES128，AES256等，表示期待秘钥的长度，比如AES256秘钥的长度应该是256/8的32字节，一些语言的库会进行自动截取，让人以为任何长度的秘钥都可以。而这其实是有区别的
- IV称为初始向量，不同的IV加密后的字符串是不同的，加密和解密需要相同的IV，既然IV看起来和key一样，却还要多一个IV的目的，对于每个块来说，key是不变的，但是只有第一个块的IV是用户提供的，其他块IV都是自动生成。IV的长度为16字节。超过或者不足，可能实现的库都会进行补齐或截断。但是由于块的长度是16字节，所以一般可以认为需要的IV是16字节
- AES通过秘钥加解密，支持128位,192位，256位秘钥长度，也就是平时说的AES128，AES192，AES256，秘钥越长效率越低，保密性越强
- AES块加密说过，PADDING是用来填充最后一块使得变成一整块，所以对于加密解密两端需要使用同一的PADDING模式，大部分PADDING模式为PKCS5, PKCS7, NOPADDING；AES算法加密时会将明文拆分成128bit的数据块，分别进行加密，也就是如果明文长度非128bit的整数倍则必出现不满128bit的数据块，填充就是在此时起作用的，填充方式如下
NoPadding:不做任何填充，但是要求明文必须是16字节的整数倍
PKCS5（默认):如果明文块少于16个字节（128bit），在明文块末尾补足相应数量的字符，且每个字节的值等于缺少的字符数 
ISO10126：如果明文块少于16个字节（128bit），在明文块末尾补足相应数量的字节，最后一个字符值等于缺少的字符数，其他字符填充随机数

## 逻辑位运算符
- 按位取反操作符`~`
- 按位与运算符&是双目运算符。 其功能是将参与运算的两数转成32位二进制后, 各对应的二进位相与。只有对应的两个二进位均为1时，结果位才为1 ，否则为0
- 按位或运算符“|”是双目运算符。 其功能是将参与运算的两数转成32位二进制后, 各对应的二进位相或。只要对应的二个二进位有一个为1时，结果位就为1;取整时候注意三点
1. 无论正数还是负数, parseInt 只是删除数字的小数部分（也就是取整）
2. 对正数, 其运行的结果和Math.floor是一样的（向下取整）
3. 对负数, 其运行结果和Math.ceil是一样的（向上取证）
``` js
// 判断奇数偶数
console.log((10 & 1) == 0);//ture偶数
console.log((9 & 1) == 0);//false奇数
//这个运算符可以用来对数值进行取证, 用起来应该比Math.floor、Math.ceil、parseInt 方便
console.log(8.35 | 0); //输出: 8
console.log(Math.floor(8.35)); //输出: 8
console.log(Math.ceil(8.35)); //输出: 9
console.log(parseInt(8.35)); //输出: 8

console.log(-8.35 | 0); //输出: -8
console.log(Math.floor(-8.35)); //输出: -9
console.log(Math.ceil(-8.35)); //输出: -8
console.log(parseInt(-8.35)); //输出: -8
// 取整这方面位运算符，还是比其他两个方法在性能上还是有较大的差异的，只是代码维护起来比较麻烦
var count = 1000000
var num = 2.58
// ------------ 测试 ~~ 的性能 ------------
console.time('~~');
for (let i = count; i>0; i--) {
    ~~num;
}
console.timeEnd('~~'); 
// ------------ 测试 | 的性能 ------------
console.time('|');
for (let i = count; i>0; i--) {
    num | 0;
}
console.timeEnd('|'); 
// ------------ 测试 Math.floor 的性能 ------------
console.time('Math.floor');
for (let  i = count; i > 0; i--) {
    Math.floor(num);
}
console.timeEnd('Math.floor');
// ------------ 测试 parseInt 的性能 -------------
console.time('parseInt');
for (let i = count; i > 0; i--) {
    parseInt(num);
}
console.timeEnd('parseInt');
```
两个方法同时使用的时候可做权限分级，例如业务场景：
- 我们假设某个管理系统有a, b, c, d四级权限，其中不同帐号分别有不同的权限（可能有1个或多个），例如admin 账户有a + b +c +d 四级权限，guest用户有b + c权限
- 权限分别用0001, 0010, 0100, 1000表示（即最通俗的1，2，4，8），如果admin用户有a, b, c, d四种权限，则admin的权限为 1 | 2 | 4 | 8 = 15，而guest用户权限为 4 | 8 = 12, 则判断用户是否有某种权限可以如下判断
``` js
admin & 4 === 4
admin & 8 === 8
admin & 2 === 2
admin & 1 === 1
```
- 对任一数值 x 进行按位非~操作的结果为 -(x + 1)。例如，~5 结果为 -6
- 按位异或运算符^是双目运算符。 其功能是参与运算的两数各对应的二进位相异或，当两对应的二进位相异(即对应位数值不相同, 也就是其中一个为1,另一个为0)时，结果为1
``` js
// 此运算符可以用来交换两个整型变量的值(不定义中间变量)，如：
var a = 125, b = 10;
a = a ^ b;
b = a ^ b;
a = a ^ b;
console.log("a = "+ a + ", b = " + b); 
//输出: a = 10, b = 125   性能其实不如定义一个中间变量块
```

## 连续赋值的问题
``` js
var a = {n: 1};
var b = a;
a.x = a = {n: 2};

console.log(a.x) 	
console.log(b.x)
// undefined
// {n:2}
```
- a和b同时引用了{n:2}对象，接着执行到`a.x = a = {n：2}`语句，尽管赋值是从右到左的没错，但是.的优先级比=要高，所以这里首先执行a.x，相当于为a（或者b）所指向的{n:1}对象新增了一个
属性x，即此时对象将变为`{n:1;x:undefined}`
- 之后按正常情况，从右到左进行赋值，此时执行a ={n:2}的时候，a的引用改变，指向了新对象{n：2},而b依然指向的是旧对象
- 之后执行a.x = {n：2}的时候，并不会重新解析一遍a，而是沿用最初解析a.x时候的a，也即旧对象，故此时旧对象的x的值为{n：2}，旧对象为`{n:1;x:{n：2}}`它被b引用着

## 对象key覆盖问题
1. 对象的键名只能是字符串和 Symbol 类型
2. 其他类型的键名会被转换成字符串类型
3. 对象转字符串默认会调用 toString 方法
``` js
// example 1
var a={}, b='123', c=123;
a[b]='b';
a[c]='c';  
console.log(a[b]); // 输出 c

// example 2
var a={}, b=Symbol('123'), c=Symbol('123');  
a[b]='b';
a[c]='c';
console.log(a[b]);// 输出 b

// example 3
var a={}, b={key:'123'}, c={key:'456'};  
// b 不是字符串也不是 Symbol 类型，需要转换成字符串。
// 对象类型会调用 toString 方法转换成字符串 [object Object]。
a[b]='b';
a[c]='c';  
console.log(a[b]);// 输出 c
```

## 重绘和回流
浏览器会把HTML解析成DOM，把CSS解析成CSSOM，DOM和CSSOM合并就产生了渲染树（Render Tree）,由于浏览器使用流式布局，对Render Tree的计算通常只需要遍历一次就可以完成，但table及其内部元素除外，他们可能需要多次计算，通常要花3倍于同等元素的时间，这也是为什么要避免使用table布局的原因之一
- 重绘：由于节点的几何属性发生改变或者由于样式发生改变而不会影响布局的，称为重绘，例如outline, visibility, color、background-color等，重绘的代价是高昂的，因为浏览器必须验证DOM树上其他节点元素的可见性
- 回流：局或者几何属性需要改变就称为回流。回流是影响浏览器性能的关键因素，因为其变化涉及到部分页面（或是整个页面）的布局更新。一个元素的回流可能会导致了其所有子元素以及DOM中紧随其后的节点、祖先节点元素的随后的回流

现代浏览器大多都是通过队列机制来批量更新布局，浏览器会把修改操作放在队列中，至少一个浏览器刷新（即16.6ms）才会清空队列，但当你获取布局信息的时候，队列中可能有会影响这些属性或方法返回值的操作，即使没有，浏览器也会强制清空队列，触发回流与重绘来确保返回正确的值主要包括以下属性或方法,所以，我们应该避免频繁的使用上述的属性，他们都会强制渲染刷新队列：
- `offsetTop `、`offsetLeft`、`offsetWidth`、`offsetHeight`
- `scrollTop`、`scrollLeft`、`scrollWidth`、`scrollHeight`
- `clientTop`、`clientLeft`、`clientWidth`、`clientHeight`
- `width`、`height`
- `getComputedStyle()`
- `getBoundingClientRect()`
### 减少重绘和回流
- 使用 transform 替代 top
- 使用 visibility 替换 display: none ，因为前者只会引起重绘，后者会引发回流（改变了布局）
- 避免使用table布局，可能很小的一个小改动会造成整个 table 的重新布局
- 尽可能在DOM树的最末端改变class，可以限制了回流的范围，使其影响尽可能少的节点
- 避免设置多层内联样式，CSS 选择符从右往左匹配查找，避免节点层级过多
- 将动画效果应用到position属性为absolute或fixed的元素上，避免影响其他元素的布局，这样只是一个重绘，而不是回流，同时，控制动画速度可以选择 requestAnimationFrame
- 避免使用CSS表达式，可能会引发回流
- 将频繁重绘或者回流的节点设置为图层，图层能够阻止该节点的渲染行为影响别的节点，例如will-change、video、iframe等标签，浏览器会自动将该节点变为图层
- CSS3 硬件加速（GPU加速），使用css3硬件加速，可以让transform、opacity、filters这些动画不会引起回流重绘 。但是对于动画的其它属性，比如background-color这些，还是会引起回流重绘的，不过它还是可以提升这些动画的性能
- 避免频繁操作样式，最好一次性重写style属性，或者将样式列表定义为class并一次性更改class属性
- 避免频繁操作DOM，创建一个documentFragment，在它上面应用所有DOM操作，最后再把它添加到文档中
- 避免频繁读取会引发回流/重绘的属性，如果确实需要多次使用，就用一个变量缓存起来
- 对具有复杂动画的元素使用绝对定位，使它脱离文档流，否则会引起父元素及后续元素频繁回流





