## 什么是区块链
``区块链``这个概念是由一个网名为中本聪的人在2008年发表的《比特币：一种点对点的电子现金系统》中提出的。随后他实现了一个比特币系统，并发布了加密数字货币—比特币。接下来出现了以太坊和超级账本这样的大型区块链项目

区块链是计算机网络节点之间共享的分布式数据库或分类帐。它们以其在加密货币系统中维护安全和去中心化交易记录的关键作用而闻名，但它们并不局限于加密货币的用途。区块链可用于使任何行业的数据不可变——该术语用于描述无法更改的情况

#### 特点
1. 区块链是一种共享数据库，它与典型数据库的不同之处在于它存储信息的方式；区块链将数据存储在通过密码学链接在一起的块中。
2. 不同类型的信息可以存储在区块链上，但交易最常见的用途是作为分类账。 
3. 就比特币而言，区块链是去中心化的，因此没有任何个人或团体拥有控制权，相反，所有用户共同保留控制权。
4. 去中心化区块链是不可变的，这意味着输入的数据是不可逆转的。对于比特币来说，交易被永久记录并可供任何人查看。

#### 运行原理
区块链就是一个链表，而这个链表就是由一个个区块组成的，这些区块依次连接，形成一个不可篡改的链条，那么其中的运行过程我们也可以由此推出：
1. 首先构成区块链的去中心化网络中的第一个节点，生成一个 创世区块
2. 然后通过 挖矿 生成新的区块添加到区块链中
3. 新的节点加入到去中心化网络中会先生成一个最新的区块链数据
4. 随后每个节点生成的区块都会向网络中的其他节点进行广播
5. 其他节点收到广播后会判断自己是否已经收到该区块，是的话就忽略，否的话会先校验该区块是否有效，如果是有效的区块则会添加到自己的区块链中

区块链主要由三个核心技术构成，分别是 共识机制、智能合约、去中心化网络

- 共识机制是区块链中的重要机制，不同的区块链项目可能使用不同的共识机制。网络中的各个节点根据共识机制达成共识，共同维护整个区块链网络
- 智能合约不是区块链的必要组成，它是区块链 2.0 之后出现的技术。如果把区块链比作一个公司，智能合约相当于公司中的规章制度，员工工作的时候会依据规章制度形式，而在有智能合约的区块链中，链上的节点会依据智能合约进行工作
- 去中心化网络不同于中心化网络。在中心化网络中，需要中心服务器，是一种星型的辐射结构

随着区块链的快速发展、区块链的应用范围越来越广，不同的区块链应用之间也有了比较大的差异
1. 公有链是对外公开、任何人都可以参与的区块链。公有链是真正意义上的完全无中心化的区块链。它通过加密技术保证交易不可篡改，在不可信的网络环境中建立共识，从而形成去中心化的信用机制。公有链使用于数字货币、电子商务、互联网金融、知识产权等应用场景
2. 联盟链仅限于联盟成员使用，因其只针对成员开放全部或部分功能，所以联盟链上的读写权限、以及记账规则都按联盟链规则来控制。联盟链适用于机构间的交易、结算、清算等B2B场景。超级账本项目即属于联盟链
3. 私有链对单独的个人或实体开放，仅供在私有组织，比如公司内部使用，私有链上的读写权限，参与记账的权限都由私有组织来决定。私有链适用于企业、组织内部
4. 侧链的概念最早产生于比特币的应用过程中，侧链实质上是指遵守侧链协议的所有区块链。侧链协议是一种可以让比特币安全地从比特币主链转移到其他区块链，又可以从其他区块链安全地比特币主链的协议;
侧链本质上是一种跨区块链解决方案。通过这种解决方案，可以实现数字资产从第一个区块链到第二个区块链的转移，又可以在稍后的时间点从第二个区块链安全返回到第一个区块链

## web3智能合约概览
web3.0这个概念我听说过，核心特征是去中心化、开放性、隐私保护和数据所有权回归个人。Web 1.0是信息浏览时代，Web 2.0是用户参与和社交网络时代，Web 3.0是去中心化与智能化时代。在Web3.0这一新的互联网架构下，用户不再仅仅是内容的消费者，更是自己数字身份和数据的拥有者。Web 3.0旨在构建一个更加透明、安全且高效的信息网络。我对Web3.0的了解是一些比较宽泛的东西，这次想比较详细的了解一下web3中的智能合约

智能合约是部署在区块链上的自动执行程序，它们在去中心化的网络中运行，确保交易的安全、透明且不可篡改。智能合约的核心优势在于能够在没有第三方中介的情况下，执行合同条款，降低信任成本和交易成本。在以太坊这样的区块链平台上，智能合约一旦部署，就无法修改，这保证了合约规则的不变性和执行的确定性。

Web3智能合约没有特定的“类型”，因为智能合约本身是一种灵活的编程模型，可以根据具体需求定制开发。然而，根据它们的应用场景和功能，我们可以将智能合约分为几种常见的类别或用途。以下是一些典型和广为人知的智能合约应用案例：
1. 身份与认证合约:实现去中心化身份管理，如DID（Decentralized Identifiers）和可验证凭证，用于安全验证用户身份
2. 供应链管理合约:跟踪产品从生产到交付的整个生命周期，确保透明度和防伪

每个合约都是根据特定业务逻辑定制编写的，使用Solidity、Vyper等语言编写，并部署在以太坊、EOS、波卡等区块链平台上。因此，智能合约的具体实现形式多种多样，几乎可以覆盖任何需要信任、透明度和自动化执行的场景

Solidity是一种专为编写智能合约而设计的高级编程语言，用于编写、编译并最终部署智能合约到区块链上。它是目前以太坊生态中最广泛使用的智能合约语言。Solidity是Web3智能合约开发的主要工具之一，智能合约使用Solidity编写后，编译成字节码，部署在以太坊等区块链平台的EVM上执行，Solidity的语法受到了C++、Python和JavaScript等语言的影响，对于熟悉这些语言的开发者来说，学习曲线相对平缓。

在前端，Web3.js这样的JavaScript库常用于与以太坊区块链和部署在上面的智能合约进行交互，而这些智能合约通常是用Solidity编写的。Web3.js提供了一系列API，使前端开发者能够与以太坊区块链进行交互，包括调用智能合约、发送交易、读取账户余额、监听事件等。

#### web3钱包MetaMask
web3钱包是一种数字钱包，方便用户安全的管理加密货币、非同质化代币(NFT)和其他数字资产，降低了用户与区块链网络和Dapp交互的难度。 本篇选择 MetaMask 作为钱包。优势：为浏览器插件交互简单，开源，用户基数大。使用之前可以得安装谷歌扩展程序MetaMask
可以按照如下链接开始创建[地址](https://juejin.cn/post/7353075407761915916)

#### 部署一个合约
Remix是一个专门编写智能合约的 WebIDE(web集成环境)，支持Solidity和Vyper，可从浏览器直接访问，并且连接到 MetaMask从而发布交易。
所以我们只需要编写智能合约的代码，Remix会自动帮我们编译为EVM字节码，发布到区块链中。
[跳转Remix](https://remix.ethereum.org/)在自动帮我们创建好的contracts目录下新建Lottery.sol

[可以参考该链接](https://juejin.cn/post/7352877037127057444)

#### 使用Web3.js与以太坊智能合约进行交互
首先，你需要连接到一个以太坊节点。这可以是本地节点、也可以是Infura（Infura是ConsenSys开发的一个以太坊基础设施服务提供商，旨在让开发人员能够轻松地与以太坊网络交互，而无需自己运行和维
护一个完整的以太坊节点）提供的节点或者其他任何公开的节点
``` js
const Web3 = require('web3');
let web3Obj;
// 使用HTTPProvider连接到Infura节点
if (window.ethereum) {
  // 使用MetaMask等浏览器插件钱包
  window.web3Obj = new Web3(window.ethereum);
  try {
    // 请求用户授权
    await window.ethereum.enable();
    web3Obj = window.web3Obj;
  } catch (error) {
    console.error("User denied account access...");
  }
} else if (typeof Web3 !== 'undefined') {
  // 已有注入的Web3实例，例如 Mist 或 MetaMask
  web3Obj = new Web3(Web3.currentProvider);
} else {
  // 作为最后手段，使用本地节点或公共节点
  const provider = new Web3.providers.HttpProvider('https://mainnet.infura.io/v3/YOUR_INFURA_PROJECT_ID');
  web3Obj = new Web3(provider);
}
console.log("Connected to Ethereum node:", web3Obj.version.api);
```
假设你已经有一个智能合约的ABI（Application Binary Interface）和合约地址，你可以创建一个合约实例来调用它的方法。
``` js
// 合约ABI
const contractABI = [...]; // ABI数组，从合约编译得到

// 合约地址
const contractAddress = '0x...'; // 你的智能合约地址

// 创建合约实例
const myContract = new web3Obj.eth.Contract(contractABI, contractAddress);

// 调用智能合约的读取方法（不需要交易）
myContract.methods.totalSupply().call()
  .then(console.log)
  .catch(console.error);

// 发送交易调用智能合约的修改状态方法
async function callContractMethod() {
  const accounts = await web3Obj.eth.getAccounts(); // 获取用户账户
  const sender = accounts[0];

  // 假设智能合约有一个名为transfer的方法，需要两个参数：接收者地址和转移的数量
  const txOptions = {
    from: sender,
    gasPrice: '0x09184e72a000', // 默认的gas价格
    gas: 21000, // 默认的gas limit
  };
  
  // RecipientAddress-接收地址
  myContract.methods.transfer('0xRecipientAddress', web3Obj.utils.toWei('1', 'ether'))
    .send(txOptions)
    .on('transactionHash', hash => console.log(`Transaction hash: ${hash}`))
    .on('confirmation', (confirmationNumber, receipt) => {
      console.log(`Confirmation #${confirmationNumber}`);
    })
    .on('error', error => {
      console.error('Error during transaction:', error);
    });
}
```
发起转账操作完成之后，可以使用智能合约来监控区块链上的状态变化，并进行后续处理
``` js
myContract.events.MyEventName({ filter: { someFilterKey: someValue }, fromBlock: 0 }, function(error, event) { 
  if (error) console.log(error)
  console.log(event.returnValues);
})
.on('data', event => {
  console.log(event); // 处理事件数据
})
.on('changed', changed => console.log(changed))
.on('error', err => console.error(err));
```
## web3.js

## 参考文档
[以太坊中文社区](https://ethfans.org/)
[区块链中文社区](https://learnblockchain.cn/)
[solidity中文文档](https://learnblockchain.cn/docs/solidity/)
[web3js官方文档](https://web3js.readthedocs.io/en/v1.10.0/)