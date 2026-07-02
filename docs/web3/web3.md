## 什么是区块链
`区块链`这个概念是由中本聪在 2008 年发表的《比特币：一种点对点的电子现金系统》中提出的。随后比特币系统出现，后来又出现了以太坊、超级账本等区块链项目。

区块链可以理解为一套由很多节点共同维护的分布式账本。它和普通数据库最大的不同是：数据按区块组织，每个新区块会通过密码学方式链接到前一个区块上，形成一条很难被篡改的链。

#### 特点
1. 去中心化：数据不是只放在一个中心服务器，而是由多个节点共同维护。
2. 不可篡改：区块一旦被确认，修改成本非常高。
3. 可追溯：链上交易和状态变更可以被追踪。
4. 公开透明：公链上的数据大多可以被任何人查看。
5. 自动执行：智能合约可以按照代码规则自动执行。

#### 运行原理
早期比特币通过挖矿产生新区块；以太坊现在已经从 PoW 转向 PoS，不再使用传统挖矿。为了学习 Web3，先理解这个过程即可：

1. 用户发起一笔交易，例如转账、调用合约。
2. 钱包对交易进行签名。
3. 交易被广播到区块链网络。
4. 验证者或矿工根据共识机制打包交易。
5. 区块被确认后，链上状态发生变化。
6. 前端通过 RPC、区块浏览器或索引服务读取最新状态。

区块链主要由这些核心部分构成：

``` text
共识机制：决定谁来记账、如何确认区块
账户系统：管理地址、余额、签名
交易系统：用户发起链上操作
智能合约：部署在链上的程序
虚拟机：执行智能合约，例如 EVM
节点网络：负责传播交易和区块
```

#### 区块链类型
1. 公有链：任何人都可以参与，例如 Ethereum、Bitcoin。
2. 联盟链：由多个机构共同维护，常用于机构间业务。
3. 私有链：由某个组织内部控制，常用于企业内部场景。
4. Layer2：建立在主链之上的扩容网络，例如 Optimistic Rollup、ZK Rollup。
5. 侧链：独立运行，但可以和主链进行资产或消息跨链。

对前端开发者来说，最常接触的是 `EVM 公链` 和 `Layer2`，例如 Ethereum、Sepolia、Polygon、Arbitrum、Optimism、Base 等。

## Web3 学习路线
如果从前端角度学习 Web3，不建议一开始就陷入各种币、交易所、复杂金融概念。更实用的路线是：

``` text
钱包和地址 -> RPC 和链 ID -> 智能合约 -> ABI -> 前端读合约 -> 前端写合约 -> 交易状态 -> 安全和测试
```

建议按这个顺序学：

1. 先理解钱包、地址、私钥、公钥、助记词。
2. 学会使用 MetaMask 连接测试网。
3. 学会使用 Remix 部署一个简单合约。
4. 理解 ABI、合约地址、RPC 节点。
5. 前端用 viem / ethers / wagmi 调用合约。
6. 学会处理链切换、账户切换、用户拒签、交易 pending/success/fail。
7. 了解 ERC-20、ERC-721、ERC-1155 等常见标准。
8. 学会基本的合约安全常识。

## Web3 核心概念

### 钱包、账户和地址
Web3 钱包不是“存币的软件”，更准确地说，它是管理私钥、签名交易、连接 DApp 的工具。

``` text
私钥：控制账户的核心，绝不能泄露
助记词：私钥的恢复方式，绝不能泄露
地址：由公钥推导出来，可以公开
签名：证明你拥有某个地址的控制权
钱包：帮你管理私钥和签名
```

常见钱包：

``` text
MetaMask：浏览器插件和移动端都常见
WalletConnect：让移动端钱包连接网页 DApp
Coinbase Wallet：常见海外钱包
OKX Wallet / Rabby：多链钱包
```

前端绝对不要保存用户私钥，也不要要求用户输入助记词。

### RPC 节点
前端本身不能直接访问区块链网络，通常通过 RPC 节点发请求。

常见 RPC 服务：

``` text
Infura
Alchemy
QuickNode
Ankr
公共 RPC
自建节点
```

RPC 能做什么：

``` text
读取账户余额
读取区块高度
读取交易详情
调用合约只读方法
发送已签名交易
监听链上事件
```

### 链 ID
不同链有不同 Chain ID。前端必须确认用户当前钱包连接的是正确网络。

``` text
Ethereum Mainnet: 1
Sepolia Testnet: 11155111
Polygon: 137
Arbitrum One: 42161
Optimism: 10
Base: 8453
```

如果链不对，读合约可能读不到，写合约可能发到错误网络。

### Gas 和交易费
用户写入链上状态时需要支付 Gas，例如：

``` text
转账
铸造 NFT
授权 approve
兑换 swap
调用合约写方法
```

只读方法一般不需要用户支付 Gas，例如：

``` text
balanceOf
ownerOf
totalSupply
allowance
读取合约状态变量
```

### ABI 和合约地址
前端调用合约通常需要两个东西：

``` text
合约地址：合约部署到链上的地址
ABI：合约对外暴露的方法、事件、参数、返回值描述
```

可以把 ABI 理解为“前端调用智能合约的接口说明书”。

示例 ABI：

``` json
[
  {
    "type": "function",
    "name": "balanceOf",
    "stateMutability": "view",
    "inputs": [{ "name": "account", "type": "address" }],
    "outputs": [{ "name": "", "type": "uint256" }]
  }
]
```

## 智能合约概览
智能合约是部署在区块链上的自动执行程序。它们在链上运行，规则公开，执行结果可验证。

在以太坊这样的链上，智能合约部署后默认不能像普通后端服务一样直接修改。想升级合约通常需要代理合约等特殊设计。因此智能合约开发比普通业务代码更需要谨慎。

智能合约常见应用：

1. ERC-20 代币
2. NFT
3. 去中心化交易所
4. 借贷协议
5. DAO 治理
6. 链上身份 DID
7. 供应链追踪
8. 游戏资产

### Solidity
Solidity 是目前 EVM 生态最常用的智能合约语言。它的语法受 JavaScript、C++、Python 等语言影响，前端开发者上手不算难，但合约安全要求很高。

一个最简单的合约：

``` solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract Counter {
    uint256 public count;

    event CountChanged(uint256 value);

    function increment() public {
        count += 1;
        emit CountChanged(count);
    }

    function getCount() public view returns (uint256) {
        return count;
    }
}
```

说明：

``` text
count：链上状态变量
increment：写方法，会改变链上状态，需要发交易和支付 Gas
getCount：读方法，不改变链上状态，不需要 Gas
event：链上事件，前端可以监听
```

### Remix 部署合约
Remix 是浏览器里的智能合约 IDE，适合入门学习。

操作步骤：

1. 打开 [Remix](https://remix.ethereum.org/)
2. 新建 `Counter.sol`
3. 复制上面的合约代码
4. 在 Solidity Compiler 中编译
5. 在 Deploy & Run Transactions 中选择环境
6. 初学可以先选 `Remix VM`
7. 熟悉后再选择 `Injected Provider - MetaMask` 连接测试网部署

部署到测试网时要准备：

``` text
MetaMask 钱包
Sepolia 测试网
测试 ETH
合约源码
编译后的 ABI
部署后的合约地址
```

## 前端如何连接钱包
以前很多文章会写：

``` js
await window.ethereum.enable()
```

这个写法已经不推荐继续作为主示例。现在更常用的是 EIP-1193 的 `request` 方法。

### 原生连接 MetaMask

如果 TypeScript 项目里提示 `window.ethereum` 不存在，可以先加类型声明。

`src/types/ethereum.d.ts`：

``` ts
interface Window {
  ethereum?: {
    request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
    on: (event: string, callback: (...args: any[]) => void) => void
    removeListener?: (event: string, callback: (...args: any[]) => void) => void
  }
}
```

``` ts
export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error('请先安装 MetaMask')
  }

  const accounts = await window.ethereum.request({
    method: 'eth_requestAccounts'
  })

  return accounts[0] as string
}
```

获取当前链：

``` ts
export async function getChainId() {
  const chainId = await window.ethereum.request({
    method: 'eth_chainId'
  })

  return Number.parseInt(chainId as string, 16)
}
```

监听账户切换和网络切换：

``` ts
export function listenWalletChange() {
  if (!window.ethereum) return

  window.ethereum.on('accountsChanged', (accounts: string[]) => {
    console.log('账户变化:', accounts)
  })

  window.ethereum.on('chainChanged', (chainId: string) => {
    console.log('网络变化:', Number.parseInt(chainId, 16))
    window.location.reload()
  })
}
```

常见错误码：

``` text
4001：用户拒绝请求
4100：没有授权
4200：钱包不支持该方法
4900：钱包和所有链断开连接
4901：钱包和指定链断开连接
```

### 切换网络

``` ts
export async function switchToSepolia() {
  if (!window.ethereum) {
    throw new Error('请先安装钱包')
  }

  await window.ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [
      {
        chainId: '0xaa36a7'
      }
    ]
  })
}
```

`0xaa36a7` 是 Sepolia 的十六进制 Chain ID，也就是十进制 `11155111`。

## 前端与合约交互

前端和合约交互主要分两类：

``` text
读合约：不改链上状态，不需要用户签名，不消耗 Gas
写合约：改变链上状态，需要用户钱包签名，需要 Gas
```

### 方案选择

现在前端写 Web3，建议了解这些库：

``` text
viem：TypeScript 友好，轻量，适合直接读写链
ethers：生态成熟，资料多，v6 写法和 v5 有差异
wagmi：React Hooks，内部常搭配 viem 和 TanStack Query
web3.js：老牌库，历史资料多，可以了解，但新项目不一定首选
```

如果你是前端学习路线：

``` text
React 项目：wagmi + viem
Vue 项目：viem 或 ethers
只写简单脚本：ethers 或 viem
读老教程：遇到 web3.js 能看懂即可
```

### 使用 viem 读取合约

安装：

``` bash
npm i viem
```

`src/web3/client.ts`：

``` ts
import { createPublicClient, http } from 'viem'
import { sepolia } from 'viem/chains'

export const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(import.meta.env.VITE_SEPOLIA_RPC_URL)
})
```

读取 Counter 合约：

``` ts
import { publicClient } from './client'

const counterAddress = '0x你的合约地址'

const counterAbi = [
  {
    type: 'function',
    name: 'getCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const

export async function readCount() {
  const count = await publicClient.readContract({
    address: counterAddress,
    abi: counterAbi,
    functionName: 'getCount'
  })

  return count
}
```

### 使用 viem 写合约

``` ts
import { createWalletClient, custom } from 'viem'
import { sepolia } from 'viem/chains'
import { publicClient } from './client'

const counterAddress = '0x你的合约地址'

const counterAbi = [
  {
    type: 'function',
    name: 'increment',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: []
  }
] as const

export async function increment() {
  if (!window.ethereum) {
    throw new Error('请先安装钱包')
  }

  const walletClient = createWalletClient({
    chain: sepolia,
    transport: custom(window.ethereum)
  })

  const [account] = await walletClient.requestAddresses()

  const hash = await walletClient.writeContract({
    account,
    address: counterAddress,
    abi: counterAbi,
    functionName: 'increment'
  })

  const receipt = await publicClient.waitForTransactionReceipt({
    hash
  })

  return receipt
}
```

交易流程：

``` text
用户点击按钮
前端调用 writeContract
钱包弹窗
用户确认或拒绝
交易广播到链上
前端拿到 transaction hash
等待交易确认
更新页面状态
```

### 使用 ethers v6

安装：

``` bash
npm i ethers
```

连接钱包：

``` ts
import { BrowserProvider } from 'ethers'

export async function getSigner() {
  if (!window.ethereum) {
    throw new Error('请先安装钱包')
  }

  const provider = new BrowserProvider(window.ethereum)
  await provider.send('eth_requestAccounts', [])

  return provider.getSigner()
}
```

读取和写入合约：

``` ts
import { Contract } from 'ethers'
import { getSigner } from './wallet'

const counterAddress = '0x你的合约地址'
const counterAbi = [
  'function getCount() view returns (uint256)',
  'function increment()'
]

export async function readCountByEthers() {
  const signer = await getSigner()
  const contract = new Contract(counterAddress, counterAbi, signer)
  return contract.getCount()
}

export async function incrementByEthers() {
  const signer = await getSigner()
  const contract = new Contract(counterAddress, counterAbi, signer)
  const tx = await contract.increment()
  return tx.wait()
}
```

### React 项目使用 wagmi

安装：

``` bash
npm i wagmi viem@2.x @tanstack/react-query
```

`src/web3/config.ts`：

``` ts
import { createConfig, http } from 'wagmi'
import { mainnet, sepolia } from 'wagmi/chains'

export const config = createConfig({
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC_URL)
  }
})
```

入口包裹：

``` tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import { config } from './web3/config'

const queryClient = new QueryClient()

export function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        {/* 页面内容 */}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

读取账户：

``` tsx
import { useAccount, useConnect, useDisconnect } from 'wagmi'

export function WalletPanel() {
  const { address, isConnected } = useAccount()
  const { connectors, connect } = useConnect()
  const { disconnect } = useDisconnect()

  if (isConnected) {
    return (
      <div>
        <p>{address}</p>
        <button onClick={() => disconnect()}>断开连接</button>
      </div>
    )
  }

  return (
    <div>
      {connectors.map((connector) => (
        <button key={connector.uid} onClick={() => connect({ connector })}>
          连接 {connector.name}
        </button>
      ))}
    </div>
  )
}
```

## 交易状态处理

Web3 前端一定要认真处理交易状态，否则用户体验会很差。

常见状态：

``` text
idle：未开始
connecting：连接钱包中
wrongNetwork：网络错误
confirming：等待用户在钱包确认
pending：交易已发出，等待链上确认
success：交易成功
failed：交易失败
rejected：用户拒绝签名
```

示例：

``` ts
type TxStatus =
  | 'idle'
  | 'confirming'
  | 'pending'
  | 'success'
  | 'failed'
  | 'rejected'

async function sendTransaction() {
  try {
    status.value = 'confirming'

    const hash = await writeContract()

    status.value = 'pending'

    await waitForReceipt(hash)

    status.value = 'success'
  } catch (error: any) {
    if (error?.code === 4001) {
      status.value = 'rejected'
    } else {
      status.value = 'failed'
    }
  }
}
```

页面提示：

``` text
等待钱包确认：请在钱包中确认交易
交易确认中：交易已提交，正在等待链上确认
交易成功：操作成功
用户拒绝：你取消了本次操作
交易失败：链上交易失败，请稍后重试
```

## 常见代币标准

### ERC-20
ERC-20 是同质化代币标准，例如 USDT、USDC、很多项目代币。

常见方法：

``` text
name
symbol
decimals
totalSupply
balanceOf
transfer
approve
allowance
transferFrom
```

前端特别要注意 `decimals`。链上整数不直接等于用户看到的金额。

``` ts
import { formatUnits, parseUnits } from 'viem'

const rawBalance = 123000000n
const decimals = 6

const displayBalance = formatUnits(rawBalance, decimals)
const transferAmount = parseUnits('1.5', decimals)
```

### ERC-721
ERC-721 是 NFT 标准，每个 token 都是唯一的。

常见方法：

``` text
ownerOf
balanceOf
tokenURI
approve
setApprovalForAll
transferFrom
safeTransferFrom
```

### ERC-1155
ERC-1155 可以同时表示同质化和非同质化资产，常用于游戏道具、批量 NFT 等场景。

## 合约安全和前端安全

Web3 项目安全非常重要，因为很多操作直接和资产相关。

### 合约侧常见风险
1. 重入攻击
2. 权限控制缺失
3. 随机数不安全
4. 整数精度和单位处理错误
5. 未检查外部调用结果
6. 升级合约权限过大
7. 价格预言机被操纵
8. approve 授权过大

### 前端侧常见风险
1. 连接了错误网络还允许交易。
2. 金额精度用普通浮点数计算。
3. 没处理用户拒签。
4. 没展示交易 hash 和链上状态。
5. 合约地址写错或环境混用。
6. 把私钥、助记词、服务端密钥写到前端。
7. 没校验用户输入的地址。
8. 使用了钓鱼 RPC 或不可信脚本。

地址校验：

``` ts
import { isAddress } from 'viem'

export function validateAddress(address: string) {
  if (!isAddress(address)) {
    return '请输入正确的钱包地址'
  }

  return ''
}
```

金额处理不要用浮点数直接算链上金额：

``` ts
import { parseUnits } from 'viem'

const amount = parseUnits('0.01', 18)
```


## 参考文档
[Ethereum 智能合约文档](https://ethereum.org/developers/docs/smart-contracts/)

[MetaMask 开发者文档](https://docs.metamask.io/metamask-connect/)

[EIP-1193 Provider API](https://eips.ethereum.org/EIPS/eip-1193)

[Solidity 官方文档](https://docs.soliditylang.org/)

[Remix 官方文档](https://remix-ide.readthedocs.io/en/latest/)

[viem 官方文档](https://viem.sh/docs/getting-started)

[wagmi 官方文档](https://wagmi.sh/react/getting-started)

[ethers v6 官方文档](https://docs.ethers.org/v6/getting-started/)

[web3.js 官方文档](https://docs.web3js.org/)

[ERC-20 标准](https://eips.ethereum.org/EIPS/eip-20)

[ERC-721 标准](https://eips.ethereum.org/EIPS/eip-721)
