前面已经完成：
```text
创建订单
  -> 保存订单主表
  -> 保存订单明细
  -> 保存地址快照
  -> 锁库存
  -> 锁优惠券
  -> 幂等防重复提交
```

现在订单状态是：

```text
status = pending_payment
payStatus = unpaid
```

现在我们要做微信支付，从 mock 支付到预支付、回调验签、支付成功扣库存，那么就得解决：

```text
用户怎么真正支付
支付平台怎么通知服务端支付成功
服务端怎么验证这个通知是真的
支付成功后订单、库存、优惠券、支付流水怎么一起更新
```

最重要的两个概念：

```text
预支付不是支付成功。
支付成功以服务端收到并验证通过的支付回调为准。
```
最终实现这些接口：

```text
小程序支付：
POST /api/app/v1/payments/wechat/prepay

本地学习：
POST /api/app/v1/orders/:id/mock-pay

微信支付回调：
POST /api/webhook/wechat-pay/payment
```

真实项目中，对应表和模块主要是：

```text
pay_transaction
ec_order
ec_stock_lock
ec_stock_balance
ec_stock_movement
mk_coupon
notify_message

PaymentModule
OrderModule.mockPay
MarketingModule.markCouponUsed
common/utils/wechat-pay.ts
```

## 先做 mock 支付

真实微信支付需要：

- 微信商户号。
- 小程序 AppID。
- 商户 API 证书或私钥。
- API v3 key。
- 平台证书或公钥。
- 一个公网可访问的回调地址。
- 小程序端调用 `wx.requestPayment`。

初学时一上来接真实微信支付，很容易被配置、证书、网络、回调公网地址卡住。

所以先做 mock 支付：

```text
订单待支付
  -> 调 mock pay
  -> 服务端直接模拟支付成功
  -> 扣库存
  -> 优惠券 used
  -> 订单 paid
```

为什么 mock 支付不是偷懒：

- 它能先跑通交易闭环。
- 它能验证订单、库存、优惠券状态流转。
- 它能让前后端在没有微信商户配置时继续开发。
- 真正接微信时，只是把“支付成功事件来源”从本地模拟换成微信回调。

本章学习顺序：

```text
mock 支付
  -> 支付流水表
  -> PaymentModule
  -> 微信预支付
  -> 微信支付参数签名
  -> 微信回调验签和解密
  -> 支付成功事务
  -> 常见问题和面试回答
```

## 支付模块要独立

订单模块负责：

```text
订单创建
订单查询
订单取消
订单状态
订单明细
```

支付模块负责：

```text
支付流水
微信预支付请求
支付参数签名
微信支付回调
支付成功落库
退款请求和退款回调
```

为什么不把微信支付都写进 `OrderService`：

- 订单模块会变得过重。
- 后面可能接支付宝、余额支付、银行卡支付。
- 支付回调是外部系统入口，和小程序订单接口不是一类入口。
- 支付流水、退款流水、对账属于支付域。

所以模块边界是：

```text
OrderModule 创建待支付订单
PaymentModule 负责让订单进入已支付
```

## 支付流水表

### `pay_transaction`

```prisma
model PayTransaction {
  id             BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId       BigInt    @map("tenant_id") @db.UnsignedBigInt
  transactionNo  String    @map("transaction_no") @db.VarChar(64)
  outTradeNo     String    @map("out_trade_no") @db.VarChar(64)
  orderId        BigInt    @map("order_id") @db.UnsignedBigInt
  orderNo        String    @map("order_no") @db.VarChar(64)
  memberId       BigInt    @map("member_id") @db.UnsignedBigInt
  channel        String    @default("wechat") @db.VarChar(32)
  mchId          String?   @map("mch_id") @db.VarChar(64)
  appId          String?   @map("app_id") @db.VarChar(128)
  prepayId       String?   @map("prepay_id") @db.VarChar(128)
  channelTradeNo String?   @map("channel_trade_no") @db.VarChar(128)
  payerOpenid    String?   @map("payer_openid") @db.VarChar(128)
  amount         Decimal   @default(0) @db.Decimal(18, 2)
  status         String    @default("pending") @db.VarChar(32)
  tradeState     String?   @map("trade_state") @db.VarChar(32)
  paidAt         DateTime? @map("paid_at") @db.DateTime(3)
  notifyRawJson  Json?     @map("notify_raw_json")

  @@unique([tenantId, transactionNo], map: "uk_pay_transaction_tenant_no")
  @@unique([tenantId, outTradeNo], map: "uk_pay_transaction_tenant_out_trade_no")
  @@index([channelTradeNo], map: "idx_pay_transaction_channel_trade_no")
  @@map("pay_transaction")
}
```

字段解释：

| 字段 | 含义 |
| --- | --- |
| `transactionNo` | 系统自己的支付流水号 |
| `outTradeNo` | 传给微信的商户订单号，通常用订单号 |
| `orderId/orderNo` | 关联业务订单 |
| `channel` | 支付渠道，比如 `wechat`、`mock_wechat` |
| `mchId/appId` | 微信商户号和 AppID |
| `prepayId` | 微信预支付返回的 id |
| `channelTradeNo` | 微信支付成功后的平台交易号 |
| `payerOpenid` | 微信付款用户 openid |
| `amount` | 支付金额 |
| `status` | 支付流水状态 |
| `tradeState` | 微信交易状态 |
| `notifyRawJson` | 回调原始内容，便于排查 |

为什么订单表有支付状态，还要有支付流水表：

- 一个订单可能多次发起预支付。
- 支付平台有自己的交易号。
- 支付、退款、对账需要独立记录。
- 支付回调排查不能只靠订单状态。

为什么 `tenantId + outTradeNo` 要唯一：

- 微信回调里主要通过 `out_trade_no` 找本地支付单。
- 同一个租户下一个订单号只能对应一条当前支付流水。
- 重复预支付时可以更新同一条流水，而不是创建多条混乱记录。

## 实现 mock 支付闭环

### mock 支付流程

```text
用户点击支付
  -> 调 POST /api/app/v1/orders/:id/mock-pay
  -> 校验订单属于当前会员
  -> 校验订单 pending_payment
  -> 找到库存锁
  -> lockedQty 减少
  -> onHandQty 减少
  -> stock_lock.status = deducted
  -> 写支付流水
  -> 优惠券 locked -> used
  -> 订单 status/payStatus = paid
```

为什么支付成功后扣 `onHandQty`，而创建订单时只扣 `availableQty`：

- 创建订单只是占用库存，用户还没付款。
- 支付成功代表交易成立，实物库存才真正减少。
- 如果用户取消或超时未支付，要释放锁定库存回可售库存。

库存变化：

```text
创建订单：
availableQty -= qty
lockedQty += qty

支付成功：
onHandQty -= qty
lockedQty -= qty

取消订单：
availableQty += qty
lockedQty -= qty
```

### `order.service.ts` 教学版 mockPay

```ts
import { BadRequestException, NotFoundException } from '@nestjs/common';

async mockPay(member: CurrentMemberPayload, orderId: string) {
  const order = await this.prisma.ecOrder.findFirst({
    where: {
      id: BigInt(orderId),
      tenantId: member.tenantId,
      memberId: member.memberId,
      deletedAt: null,
    },
  });

  if (!order) {
    throw new NotFoundException('订单不存在');
  }

  if (order.status !== 'pending_payment' || order.payStatus !== 'unpaid') {
    throw new BadRequestException('当前订单不可支付');
  }

  await this.prisma.$transaction(async (tx) => {
    const locks = await tx.ecStockLock.findMany({
      where: {
        tenantId: member.tenantId,
        orderId: order.id,
        status: 'locked',
        deletedAt: null,
      },
    });

    for (const lock of locks) {
      const balance = await tx.ecStockBalance.findUnique({
        where: {
          tenantId_warehouseId_skuId: {
            tenantId: lock.tenantId,
            warehouseId: lock.warehouseId,
            skuId: lock.skuId,
          },
        },
      });

      if (!balance) {
        throw new NotFoundException('库存余额不存在');
      }

      const beforeOnHandQty = Number(balance.onHandQty);
      const nextOnHandQty = beforeOnHandQty - Number(lock.qty);

      if (nextOnHandQty < 0) {
        throw new BadRequestException('库存不足');
      }

      await tx.ecStockBalance.update({
        where: {
          tenantId_warehouseId_skuId: {
            tenantId: lock.tenantId,
            warehouseId: lock.warehouseId,
            skuId: lock.skuId,
          },
        },
        data: {
          onHandQty: String(nextOnHandQty),
          lockedQty: {
            decrement: lock.qty,
          },
        },
      });

      await tx.ecStockMovement.create({
        data: {
          tenantId: lock.tenantId,
          warehouseId: lock.warehouseId,
          skuId: lock.skuId,
          movementNo: this.createMovementNo(),
          bizType: 'order_paid_deduct',
          bizId: order.id,
          direction: 'out',
          qty: lock.qty,
          beforeQty: beforeOnHandQty,
          afterQty: nextOnHandQty,
          remark: `支付成功扣减库存 ${order.orderNo}`,
        },
      });

      await tx.ecStockLock.update({
        where: {
          id: lock.id,
        },
        data: {
          status: 'deducted',
          releasedAt: new Date(),
        },
      });
    }

    await tx.payTransaction.create({
      data: {
        tenantId: order.tenantId,
        transactionNo: `PT${order.orderNo}`,
        outTradeNo: order.orderNo,
        orderId: order.id,
        orderNo: order.orderNo,
        memberId: order.memberId,
        channel: 'mock_wechat',
        amount: order.payableAmount,
        status: 'succeeded',
        tradeState: 'SUCCESS',
        paidAt: new Date(),
      },
    });

    if (order.couponId) {
      await this.marketingService.markCouponUsed(tx, {
        tenantId: order.tenantId,
        memberId: order.memberId,
        couponId: order.couponId,
        orderId: order.id,
      });
    }

    await tx.ecOrder.update({
      where: {
        id: order.id,
      },
      data: {
        status: 'paid',
        payStatus: 'paid',
        paidAmount: order.payableAmount,
        paidAt: new Date(),
      },
    });
  });

  return this.detail(member, orderId);
}
```

为什么 mock 支付也要写支付流水：

- 保持和真实支付一样的数据结构。
- 后台财务列表可以看到支付记录。
- 后续退款、对账、报表都依赖支付流水。

为什么 mock 支付也要用事务：

- 支付成功后要同时更新库存、库存锁、优惠券、订单、支付流水。
- 任一步失败都不能留下半支付状态。

## 支付能力抽到 PaymentModule

mock 支付跑通后，下一步是独立支付模块。

目录：

```text
src/modules/payment/
  payment.module.ts
  payment.controller.ts
  payment.service.ts
  dto/
    wechat-prepay.dto.ts
```

### `wechat-prepay.dto.ts`

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class WechatPrepayDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}
```

为什么预支付只传 `orderId`：

- 金额从订单表读取。
- 订单号从订单表读取。
- 会员身份从 token 读取。
- 微信付款 openid 从会员微信身份读取。
- 前端不能传金额。

### `payment.controller.ts`

```ts
import { Body, Controller, Post, Req, Res, UseGuards } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { WechatPrepayDto } from './dto/wechat-prepay.dto';
import { PaymentService } from './payment.service';

@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/payments')
export class AppPaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('/wechat/prepay')
  prepay(@CurrentMember() member, @Body() dto: WechatPrepayDto) {
    return this.paymentService.createWechatPrepay(member, dto);
  }
}

@Controller('/api/webhook/wechat-pay')
export class WechatPayWebhookController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('/payment')
  async paymentNotify(
    @Req() request: FastifyRequest & { rawBody?: Buffer },
    @Body() body: unknown,
    @Res() reply: FastifyReply,
  ) {
    try {
      const result = await this.paymentService.handleWechatPaymentNotify({
        body,
        rawBody: request.rawBody,
        headers: request.headers,
      });
      return reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'payment notify failed';
      return reply.status(400).send({
        code: 'FAIL',
        message,
      });
    }
  }
}
```

为什么支付回调接口不加 `MemberAuthGuard`：

- 回调不是小程序用户调用的。
- 回调是微信支付平台调用服务端。
- 它不能带会员 JWT。
- 它靠微信签名、证书、密文解密来保证可信。

为什么回调接口要返回微信要求的格式：

```json
{
  "code": "SUCCESS",
  "message": "成功"
}
```

如果返回失败，微信会重试通知。

## 支付配置设计

### 环境变量

```text
WECHAT_APP_ID=小程序 AppID
WECHAT_PAY_MCH_ID=微信商户号
WECHAT_PAY_SERIAL_NO=商户证书序列号
WECHAT_PAY_API_V3_KEY=API v3 key
WECHAT_PAY_PRIVATE_KEY_PATH=商户私钥路径
WECHAT_PAY_PLATFORM_CERT_PATH=微信支付平台证书路径
WECHAT_PAY_NOTIFY_URL=https://你的域名/api/webhook/wechat-pay/payment
WECHAT_PAY_MOCK=true
```

为什么这些配置不能写死在代码里：

- 不同环境配置不同。
- 私钥和 API key 是敏感信息。
- 代码仓库不应该保存生产密钥。

为什么保留 `WECHAT_PAY_MOCK`：

- 本地开发无需真实商户号。
- CI 或演示环境可跑通支付闭环。
- 真实环境关闭 mock 后走微信接口。

### `resolveWechatPayConfig`

```ts
type PaymentConfig = {
  appId: string;
  mchId: string;
  serialNo: string;
  privateKeyPem: string;
  publicKeyPem: string;
  apiV3Key: string;
  notifyUrl: string;
  mock: boolean;
};

private resolveWechatPayConfig(): PaymentConfig {
  const appId = this.configService.get<string>('WECHAT_APP_ID') || '';
  const mchId = this.configService.get<string>('WECHAT_PAY_MCH_ID') || '';
  const serialNo = this.configService.get<string>('WECHAT_PAY_SERIAL_NO') || '';
  const apiV3Key = this.configService.get<string>('WECHAT_PAY_API_V3_KEY') || '';
  const privateKeyPem = loadSecretValue(
    this.configService.get<string>('WECHAT_PAY_PRIVATE_KEY') || '',
    this.configService.get<string>('WECHAT_PAY_PRIVATE_KEY_PATH') || '',
  );
  const publicKeyPem = loadSecretValue(
    this.configService.get<string>('WECHAT_PAY_PLATFORM_PUBLIC_KEY') || '',
    this.configService.get<string>('WECHAT_PAY_PLATFORM_CERT_PATH') || '',
  );

  const notifyUrl =
    this.configService.get<string>('WECHAT_PAY_NOTIFY_URL') ||
    `${this.configService.get<string>('APP_PUBLIC_URL')}/api/webhook/wechat-pay/payment`;

  const mock =
    this.configService.get<string>('WECHAT_PAY_MOCK') === 'true' ||
    !appId ||
    !mchId ||
    !serialNo ||
    !apiV3Key ||
    !privateKeyPem;

  return {
    appId,
    mchId,
    serialNo,
    privateKeyPem,
    publicKeyPem,
    apiV3Key,
    notifyUrl,
    mock,
  };
}
```

为什么缺配置时自动 mock：

- 本地启动更友好。
- 初学者不用先准备微信商户环境。
- 但生产环境要显式校验配置，避免误用 mock。

## 创建微信预支付

### 预支付流程
createWechatPrepay 成功，不代表用户支付成功，它只代表微信创建了一次支付会话
```text
小程序调用 /payments/wechat/prepay
  -> 服务端校验订单属于当前会员
  -> 校验订单待支付
  -> 找到会员 openid
  -> 创建或更新支付流水
  -> 请求微信 JSAPI 预支付
  -> 微信返回 prepay_id
  -> 服务端生成小程序支付参数
  -> 小程序调用 wx.requestPayment
```
代码里，微信预支付的调用链是：
```text
小程序订单详情页 payOrder()
  -> paymentApi.createWechatPrepay({ orderId })
  -> POST /api/app/v1/payments/wechat/prepay
  -> AppPaymentController.prepay()
  -> PaymentService.createWechatPrepay()
    -> getMemberOrder()
       校验订单属于当前会员，并读取订单、明细、库存锁
    -> 校验 order.status = pending_payment
       校验 order.payStatus = unpaid
    -> resolveWechatPayConfig()
       读取 appId、mchId、serialNo、apiV3Key、商户私钥、平台公钥、回调地址、mock 开关
    -> resolveMemberOpenid()
       从 token 或 ec_member_wechat 找付款人的 openid
    -> upsertPaymentTransaction()
       创建或更新 pay_transaction，状态为 pending
```

如果是 mock 模式，真实代码会继续：

```text
    -> buildMockPaymentParams()
       生成本地模拟 payment 参数
    -> applyPaymentSuccess()
       直接模拟支付成功，走同一套扣库存、改订单、改流水逻辑
    -> 返回 mock payment 参数
```

如果是真实微信模式，会继续：

```text
    -> requestWechatJsapiPrepay()
      -> amountToCents()
         把订单应付金额从元转换成分
      -> callWechatApi()
        -> JSON.stringify(body)
           固定本次请求体字符串，后面签名和发送都用它
        -> buildWechatPayAuthorization()
          -> randomNonce()
          -> signWechatMessage()
             用商户私钥 RSA-SHA256 签名：
             METHOD + URL + timestamp + nonce + body
        -> fetch https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi
        -> JSON.parse(responseText)
      -> 返回微信 prepay_id
    -> prisma.payTransaction.update()
       把 prepayId 保存到 pay_transaction
    -> buildWechatJsapiPaymentParams()
      -> randomNonce()
      -> signWechatMessage()
         用商户私钥 RSA-SHA256 签名：
         appId + timeStamp + nonceStr + package
    -> 返回给小程序 wx.requestPayment 需要的参数
```

这里有两个不同的签名，不要混在一起：

| 签名 | 方法 | 给谁用 | 作用 |
| --- | --- | --- | --- |
| 微信 API 请求签名 | `buildWechatPayAuthorization` -> `signWechatMessage` | 服务端请求微信 `/v3/pay/transactions/jsapi` | 证明这次请求来自商户服务端 |
| 小程序支付参数签名 | `buildWechatJsapiPaymentParams` -> `signWechatMessage` | 小程序 `wx.requestPayment` | 让微信客户端校验这组支付参数可信 |

预支付阶段没有业务数据解密。请求体通过 HTTPS 传输，服务端主要做的是签名，不是加密。
### `payment.service.ts`

```ts
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WechatPrepayDto } from './dto/wechat-prepay.dto';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async createWechatPrepay(member: CurrentMemberPayload, dto: WechatPrepayDto) {
    const order = await this.getMemberOrder(member.tenantId, member.memberId, dto.orderId);

    if (order.status !== 'pending_payment' || order.payStatus !== 'unpaid') {
      throw new BadRequestException('当前订单不可支付');
    }

    const config = this.resolveWechatPayConfig();
    const openid = await this.resolveMemberOpenid(member);

    if (!config.mock && !openid) {
      throw new UnauthorizedException('缺少微信 openid，无法发起支付');
    }

    const transaction = await this.upsertPaymentTransaction(order, config);

    if (config.mock) {
      const payment = this.buildMockPaymentParams(order.orderNo);

      return {
        orderId: order.id.toString(),
        orderNo: order.orderNo,
        mock: true,
        payment,
      };
    }

    const prepayId = await this.requestWechatJsapiPrepay({
      config,
      order,
      openid,
    });

    await this.prisma.payTransaction.update({
      where: {
        tenantId_outTradeNo: {
          tenantId: order.tenantId,
          outTradeNo: order.orderNo,
        },
      },
      data: {
        status: 'pending',
        prepayId,
      },
    });

    return {
      orderId: order.id.toString(),
      orderNo: order.orderNo,
      mock: false,
      payment: {
        appId: config.appId,
        prepayId,
        ...buildWechatJsapiPaymentParams({
          appId: config.appId,
          prepayId,
          privateKeyPem: config.privateKeyPem,
        }),
      },
    };
  }
}
```

为什么预支付前要校验订单归属：

- 用户只能支付自己的订单。
- 不能只传 `orderId` 就发起支付。
- 查询条件必须带 `tenantId + memberId + orderId`。

为什么真实微信支付需要 openid：

- 小程序 JSAPI 支付需要指定付款用户。
- openid 来自小程序登录。
- 所以第 4 章会员微信身份是支付的前置条件。

为什么重复发起预支付要 upsert 支付流水：

- 用户可能退出支付后再次点击支付。
- 订单仍然待支付，可以重新发起预支付。
- 同一个订单只保留当前支付流水，避免支付记录混乱。

## 请求微信 JSAPI 预支付

### 请求体

```ts
private async requestWechatJsapiPrepay(input: {
  config: PaymentConfig;
  order: PaymentOrderRow;
  openid: string;
}) {
  const body = {
    appid: input.config.appId,
    mchid: input.config.mchId,
    description: `订单 ${input.order.orderNo}`,
    out_trade_no: input.order.orderNo,
    notify_url: input.config.notifyUrl,
    amount: {
      total: this.amountToCents(input.order.payableAmount),
      currency: 'CNY',
    },
    payer: {
      openid: input.openid,
    },
    attach: JSON.stringify({
      orderId: input.order.id.toString(),
      tenantId: input.order.tenantId.toString(),
    }),
  };

  const response = await this.callWechatApi<{
    prepay_id?: string;
    code?: string;
    message?: string;
  }>({
    config: input.config,
    method: 'POST',
    urlPath: '/v3/pay/transactions/jsapi',
    body,
  });

  if (!response.prepay_id) {
    throw new BadRequestException(response.message || response.code || '微信预支付失败');
  }

  return response.prepay_id;
}
```

为什么金额要转成分：

- 微信支付金额单位是分。
- 本地订单金额通常是元。
- `99.99` 元要转成 `9999` 分。

```ts
private amountToCents(amount: string | number | Prisma.Decimal) {
  return Math.round(Number(amount) * 100);
}
```

生产环境建议用 Decimal 或整数分，避免浮点误差。

### 微信 API 签名

请求微信支付 API 需要 Authorization 签名。

```ts
import { createSign, randomBytes } from 'crypto';

function randomNonce(length = 16) {
  return randomBytes(length).toString('hex');
}

function signWechatMessage(message: string, privateKeyPem: string) {
  const signer = createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

function buildWechatPayAuthorization(input: {
  method: string;
  urlPath: string;
  body: string;
  mchId: string;
  serialNo: string;
  privateKeyPem: string;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomNonce(16);
  const message = [
    input.method.toUpperCase(),
    input.urlPath,
    timestamp,
    nonceStr,
    input.body,
    '',
  ].join('\n');

  const signature = signWechatMessage(message, input.privateKeyPem);

  return `WECHATPAY2-SHA256-RSA2048 mchid="${input.mchId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${input.serialNo}",signature="${signature}"`;
}
```

为什么签名逻辑要封装到工具函数：

- 支付请求、退款请求都要签名。
- 签名拼接格式容易写错。
- 单独工具函数方便测试和复用。

## 返回小程序支付参数

微信返回 `prepay_id` 后，服务端还要生成给小程序的支付参数：

```ts
function buildWechatJsapiPaymentParams(input: {
  appId: string;
  prepayId: string;
  privateKeyPem: string;
}) {
  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = randomNonce(16);
  const packageValue = `prepay_id=${input.prepayId}`;
  const message = [
    input.appId,
    timeStamp,
    nonceStr,
    packageValue,
    '',
  ].join('\n');

  return {
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign: signWechatMessage(message, input.privateKeyPem),
  };
}
```

返回给小程序：

```json
{
  "orderId": "1",
  "orderNo": "O20260612120000123456",
  "mock": false,
  "payment": {
    "appId": "wx...",
    "prepayId": "wx...",
    "timeStamp": "1781234567",
    "nonceStr": "...",
    "package": "prepay_id=wx...",
    "signType": "RSA",
    "paySign": "..."
  }
}
```

小程序端再调用：

```text
wx.requestPayment(payment)
```

为什么服务端不直接把订单改成已支付：

- 用户可能取消支付。
- 用户可能支付失败。
- 小程序端支付弹窗成功也不能完全作为服务端最终依据。
- 服务端最终以微信支付回调为准。

## 处理微信支付回调
本项目真实代码里，支付回调的调用链是：

```text
微信支付平台
  -> POST /api/webhook/wechat-pay/payment
  -> WechatPayWebhookController.paymentNotify()
  -> PaymentService.handleWechatPaymentNotify()
    -> resolveWechatPayConfig()
       读取商户号、AppID、API v3 key、平台公钥等配置
    -> normalizeNotifyPayload()
       把 body 统一整理成对象，方便后续读取字段
    -> verifyWechatNotifySignature()
       真实模式才执行验签；mock 模式跳过
      -> normalizeHeaders()
         读取 wechatpay-signature、wechatpay-timestamp、wechatpay-nonce
      -> 用 rawBody 拼验签串：
         timestamp + "\n" + nonce + "\n" + rawBody + "\n"
      -> createVerify('RSA-SHA256')
      -> 用微信支付平台公钥或平台证书验签
    -> extractPaymentNotifyData()
      -> decryptWechatPayResource() 解密
         真实模式下，如果 body.resource 存在，用 API v3 key 做 AES-256-GCM 解密
      -> 提取 appid、mchid、out_trade_no、trade_state、amount.total、transaction_id、payer.openid
    -> prisma.payTransaction.findFirst()
       用 outTradeNo 找本地支付流水
    -> 判断 tradeState 是否成功
       如果不是 SUCCESS / PAY_SUCCESS：
         -> payTransaction.update(status = failed, tradeState, notifyRawJson)
         -> buildWechatAck()
    -> assertPaymentNotifyMatches()
       校验 mchId、appId、支付金额是否和本地支付流水一致
    -> applyPaymentSuccess()
       在数据库事务里真正推进本地订单状态
    -> buildWechatAck()
       返回 { code: 'SUCCESS', message: '成功' }
```

这段顺序里最容易记混的是：**先验签，再解密，再查流水，再校验金额和商户信息，最后才改订单**。

原因是：

- 验签用的是微信回调原始请求体 `rawBody`，证明这个请求确实来自微信支付平台。
- 解密用的是商户 API v3 key，拿到 `resource` 里的真实交易数据。
- 查流水要靠解密后的 `out_trade_no`。
- 金额、商户号、AppID 校验通过后，才能进入 `applyPaymentSuccess()`。

当前真实代码没有单独验证微信预支付响应签名；它是检查 HTTP 状态后解析 JSON，并读取 `prepay_id`。回调安全主要靠 `verifyWechatNotifySignature()` 和 `decryptWechatPayResource()`。
### 回调流程

```text
微信支付成功
  -> 微信请求 /api/webhook/wechat-pay/payment
  -> 服务端验签
  -> 解密 resource
  -> 提取 out_trade_no、transaction_id、amount、payer.openid
  -> 找本地支付流水
  -> 校验金额、商户号、AppID
  -> 幂等处理支付成功
  -> 返回 SUCCESS
```

### 回调要验签

支付回调是公网接口。任何人都可能向它发请求。

如果不验签，攻击者可以伪造：

```json
{
  "out_trade_no": "某订单号",
  "trade_state": "SUCCESS"
}
```

然后把订单改成已支付。

所以必须：

- 校验微信回调签名。
- 解密微信回调资源。
- 校验商户号。
- 校验 AppID。
- 校验订单金额。
- 校验支付流水存在。

### 回调验签

```ts
import { createVerify } from 'crypto';

function verifyWechatNotifySignature(input: {
  rawBody: Buffer | string;
  headers: Record<string, unknown>;
  publicKeyPem: string;
}) {
  const headers = normalizeHeaders(input.headers);
  const signature = headers['wechatpay-signature'];
  const timestamp = headers['wechatpay-timestamp'];
  const nonce = headers['wechatpay-nonce'];

  if (!signature || !timestamp || !nonce) {
    return false;
  }

  const rawBodyText = Buffer.isBuffer(input.rawBody)
    ? input.rawBody.toString('utf8')
    : input.rawBody;

  const message = `${timestamp}\n${nonce}\n${rawBodyText}\n`;
  const verifier = createVerify('RSA-SHA256');
  verifier.update(message);
  verifier.end();

  return verifier.verify(input.publicKeyPem, signature, 'base64');
}
```

为什么要用 `rawBody`：

- 签名是对原始请求体做的。
- 如果框架先把 JSON 解析再重新 stringify，字段顺序和空格可能变化。
- 变化后验签会失败。

所以 Fastify/NestJS 要保留支付回调原始 body。

### 回调解密

微信支付 v3 回调里的 `resource` 是加密的。

```ts
import { createDecipheriv } from 'crypto';

function decryptWechatPayResource(
  apiV3Key: string,
  resource: {
    associated_data?: string;
    nonce: string;
    ciphertext: string;
  },
) {
  const ciphertext = Buffer.from(resource.ciphertext, 'base64');
  const content = ciphertext.subarray(0, ciphertext.length - 16);
  const authTag = ciphertext.subarray(ciphertext.length - 16);

  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(apiV3Key, 'utf8'),
    Buffer.from(resource.nonce, 'utf8'),
    { authTagLength: 16 },
  );

  if (resource.associated_data) {
    decipher.setAAD(Buffer.from(resource.associated_data, 'utf8'));
  }

  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);

  return JSON.parse(decrypted.toString('utf8'));
}
```

为什么验签和解密都要做：

- 验签证明请求确实来自微信。
- 解密拿到真实交易数据。
- 两者解决的问题不同。

## 支付成功事务

支付成功后，服务端要做：

```text
查支付流水
  -> 如果已成功，直接返回
  -> 查订单
  -> 如果订单已支付，补全流水后返回
  -> 如果订单不是待支付，关闭流水
  -> 扣减锁定库存
  -> 优惠券 locked -> used
  -> 支付流水 succeeded
  -> 订单 paid
  -> 写站内通知
```

### `applyPaymentSuccess`

```ts
async applyPaymentSuccess(input: {
  tenantId: bigint;
  outTradeNo: string;
  transactionNo: string;
  channelTradeNo?: string;
  payerOpenid?: string;
  prepayId?: string;
  tradeState?: string;
  notifyRawJson?: Prisma.JsonValue;
}) {
  return this.prisma.$transaction(async (tx) => {
    const transaction = await tx.payTransaction.findFirst({
      where: {
        tenantId: input.tenantId,
        outTradeNo: input.outTradeNo,
        deletedAt: null,
      },
    });

    if (!transaction) {
      throw new NotFoundException('支付流水不存在');
    }

    if (transaction.status === 'succeeded') {
      return transaction;
    }

    const order = await tx.ecOrder.findFirst({
      where: {
        id: transaction.orderId,
        tenantId: transaction.tenantId,
        deletedAt: null,
      },
      include: {
        stockLocks: {
          where: {
            deletedAt: null,
            status: 'locked',
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    if (order.payStatus === 'paid') {
      return tx.payTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'succeeded',
          tradeState: input.tradeState || 'SUCCESS',
          channelTradeNo: input.channelTradeNo || transaction.channelTradeNo,
          payerOpenid: input.payerOpenid || transaction.payerOpenid,
          paidAt: transaction.paidAt || new Date(),
          notifyRawJson: input.notifyRawJson ?? transaction.notifyRawJson,
        },
      });
    }

    if (order.status !== 'pending_payment') {
      return tx.payTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'closed',
          tradeState: input.tradeState || 'CLOSED',
          notifyRawJson: input.notifyRawJson ?? transaction.notifyRawJson,
        },
      });
    }

    await this.deductLockedStock(tx, order);

    if (order.couponId) {
      await this.marketingService.markCouponUsed(tx, {
        tenantId: order.tenantId,
        memberId: order.memberId,
        couponId: order.couponId,
        orderId: order.id,
      });
    }

    const paidAt = new Date();

    const updatedTransaction = await tx.payTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'succeeded',
        tradeState: input.tradeState || 'SUCCESS',
        channelTradeNo: input.channelTradeNo || transaction.channelTradeNo,
        prepayId: input.prepayId || transaction.prepayId,
        payerOpenid: input.payerOpenid || transaction.payerOpenid,
        paidAt,
        notifyRawJson: input.notifyRawJson ?? transaction.notifyRawJson,
      },
    });

    await tx.ecOrder.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        payStatus: 'paid',
        paidAmount: order.payableAmount,
        paidAt,
      },
    });

    await tx.notifyMessage.create({
      data: {
        tenantId: order.tenantId,
        receiverType: 'member',
        receiverId: order.memberId,
        channel: 'station',
        title: '订单支付成功',
        content: `订单 ${order.orderNo} 已支付成功，商家将尽快发货。`,
        bizType: 'order',
        bizId: order.id,
        status: 'unread',
        sentAt: paidAt,
      },
    });

    return updatedTransaction;
  });
}
```

为什么支付成功也要用事务：

- 扣库存、改优惠券、改订单、改支付流水必须一致。
- 如果订单改 paid 了但库存没扣，会库存不准。
- 如果库存扣了但支付流水没成功，会对账困难。

### 扣减锁定库存

```ts
private async deductLockedStock(tx: TxClient, order: {
  id: bigint;
  orderNo: string;
  stockLocks: Array<{
    id: bigint;
    tenantId: bigint;
    warehouseId: bigint;
    skuId: bigint;
    qty: Prisma.Decimal;
  }>;
}) {
  for (const lock of order.stockLocks) {
    const balance = await tx.ecStockBalance.findUnique({
      where: {
        tenantId_warehouseId_skuId: {
          tenantId: lock.tenantId,
          warehouseId: lock.warehouseId,
          skuId: lock.skuId,
        },
      },
    });

    if (!balance) {
      throw new NotFoundException('库存余额不存在');
    }

    const beforeOnHandQty = Number(balance.onHandQty);
    const nextOnHandQty = beforeOnHandQty - Number(lock.qty);

    if (nextOnHandQty < 0) {
      throw new BadRequestException('库存不足');
    }

    await tx.ecStockBalance.update({
      where: {
        tenantId_warehouseId_skuId: {
          tenantId: lock.tenantId,
          warehouseId: lock.warehouseId,
          skuId: lock.skuId,
        },
      },
      data: {
        onHandQty: String(nextOnHandQty),
        lockedQty: {
          decrement: lock.qty,
        },
      },
    });

    await tx.ecStockMovement.create({
      data: {
        tenantId: lock.tenantId,
        warehouseId: lock.warehouseId,
        skuId: lock.skuId,
        movementNo: this.createMovementNo(),
        bizType: 'order_paid_deduct',
        bizId: order.id,
        direction: 'out',
        qty: lock.qty,
        beforeQty: beforeOnHandQty,
        afterQty: nextOnHandQty,
        remark: `支付成功扣减库存 ${order.orderNo}`,
      },
    });

    await tx.ecStockLock.update({
      where: { id: lock.id },
      data: {
        status: 'deducted',
        releasedAt: new Date(),
      },
    });
  }
}
```

为什么支付成功只处理 `status = locked` 的库存锁：

- 防止重复回调重复扣库存。
- 已经 `deducted` 的锁不能再扣。
- 已经 `released` 的锁说明订单可能取消或超时，需要特殊处理。

## 回调幂等为什么重要

微信支付回调可能重复发送。

原因：

- 服务端响应超时。
- 网络不稳定。
- 微信没有收到 `SUCCESS`。
- 服务端处理成功但响应失败。

所以回调必须幂等：

```text
如果支付流水已 succeeded
  -> 直接返回 SUCCESS

如果订单已 paid
  -> 补全支付流水后返回 SUCCESS

如果库存锁已 deducted
  -> 不要重复扣库存
```

本项目的关键保护：

```text
pay_transaction.status = succeeded 时直接返回
ec_stock_lock 只查询 status = locked
订单 payStatus = paid 时不重复执行支付成功逻辑
```

为什么支付回调不用第 6 章的 `Idempotency-Key`：

- 回调由微信发起，不会带客户端幂等 key。
- 支付幂等应该基于 `out_trade_no`、微信交易号、支付流水状态。
- 支付回调还必须先验签。

## 校验回调内容

支付成功回调不能只看 `trade_state = SUCCESS`。

还要校验：

```text
mchId 是否等于本系统商户号
appId 是否等于本系统 AppID
outTradeNo 是否存在支付流水
amount 是否等于本地支付流水金额
```

### `assertPaymentNotifyMatches`

```ts
private assertPaymentNotifyMatches(
  notifyData: {
    mchId: string;
    appId: string;
    amountCents: number | null;
  },
  transaction: PayTransaction,
  config: PaymentConfig,
) {
  if (!notifyData.mchId || notifyData.mchId !== config.mchId) {
    throw new BadRequestException('微信支付回调商户号不匹配');
  }

  if (!notifyData.appId || notifyData.appId !== config.appId) {
    throw new BadRequestException('微信支付回调 AppID 不匹配');
  }

  if (notifyData.amountCents === null) {
    throw new BadRequestException('微信支付回调缺少支付金额');
  }

  const expectedCents = this.amountToCents(transaction.amount);
  if (notifyData.amountCents !== expectedCents) {
    throw new BadRequestException('微信支付回调金额不匹配');
  }
}
```

为什么金额必须校验：

- 防止低金额支付冒充高金额订单。
- 防止配置错商户或订单号混乱。
- 对账也依赖本地金额和平台金额一致。

## 支付状态流转

支付前：

```text
ec_order.status = pending_payment
ec_order.payStatus = unpaid
pay_transaction.status = pending
ec_stock_lock.status = locked
mk_coupon.status = locked
```

支付成功后：

```text
ec_order.status = paid
ec_order.payStatus = paid
ec_order.paidAmount = payableAmount
ec_order.paidAt = now

pay_transaction.status = succeeded
pay_transaction.tradeState = SUCCESS
pay_transaction.channelTradeNo = 微信交易号
pay_transaction.paidAt = now

ec_stock_lock.status = deducted
ec_stock_balance.lockedQty -= qty
ec_stock_balance.onHandQty -= qty

mk_coupon.status = used
```

为什么支付成功后不再释放到 `availableQty`：

- 用户已经付款，库存应真实扣减。
- 锁定库存不是释放回可售，而是转成实物库存减少。

## 接口调用顺序

### 本地 mock 支付

```bash
curl -X POST http://localhost:3000/api/app/v1/orders/<orderId>/mock-pay \
  -H "Authorization: Bearer <accessToken>" \
  -H "Idempotency-Key: mock-pay-001"
```

### 微信预支付

```bash
curl -X POST http://localhost:3000/api/app/v1/payments/wechat/prepay \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"<orderId>\"}"
```

返回后，小程序端调用：

```text
wx.requestPayment(payment)
```

### 微信支付回调

真实支付成功后，微信请求：

```text
POST https://你的域名/api/webhook/wechat-pay/payment
```

服务端处理成功后返回：

```json
{
  "code": "SUCCESS",
  "message": "成功"
}
```

## 本章和真实 ERP 项目的对应关系

真实项目中可以重点看：

```text








  PayTransaction
  EcOrder
  EcStockBalance
  EcStockLock
  EcStockMovement
  MkCoupon
```

教学版和真实项目的区别：

| 能力 | 教学版 | 真实项目 |
| --- | --- | --- |
| 本地支付 | mock pay | `mock-pay` 和 `WECHAT_PAY_MOCK` |
| 预支付 | 核心流程示例 | 微信 JSAPI v3 |
| 签名 | 核心工具函数 | `common/utils/wechat-pay.ts` |
| 回调 | 验签、解密、落库 | 支付和退款回调都支持 |
| 支付成功 | 扣库存、改订单 | `applyPaymentSuccess` 事务 |
| 回调幂等 | 状态判断 | 支付流水 + 订单状态 + 库存锁状态 |
| 退款 | 下一章强化 | 已有退款请求和退款回调 |



