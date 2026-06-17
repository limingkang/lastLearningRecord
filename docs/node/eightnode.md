现在要继续处理支付后的交易后半段，也是履约和售后：

```text
商家发货
  -> 生成发货单
  -> 写发货明细
  -> 更新订单发货状态
  -> 写物流轨迹
  -> 用户确认收货
  -> 用户申请售后
  -> 商家审核
  -> 发起退款
  -> 退款成功更新订单和售后
```

最终实现这些接口：

```text
后台发货：
POST /api/admin/v1/orders/:id/ship
POST /api/admin/v1/deliveries
GET  /api/admin/v1/deliveries
GET  /api/admin/v1/deliveries/:id

物流回调：
POST /api/webhook/logistics/track

小程序订单：
POST /api/app/v1/orders/:id/confirm-receipt

小程序售后：
POST /api/app/v1/aftersales
GET  /api/app/v1/aftersales
GET  /api/app/v1/aftersales/:id

后台售后：
GET  /api/admin/v1/aftersales
GET  /api/admin/v1/aftersales/:id
POST /api/admin/v1/aftersales/:id/approve
POST /api/admin/v1/aftersales/:id/reject

退款回调：
POST /api/webhook/wechat-pay/refund
```

真实项目中，对应表和模块主要是：

```text
ec_delivery
ec_delivery_item
ec_logistics_company
ec_logistics_track
ec_aftersale
ec_aftersale_item
pay_refund
ec_order
ec_order_item

FulfillmentModule
AftersaleModule
PaymentModule
OrderModule
```

分成两个大阶段：

```text
阶段一：履约
  paid 订单
    -> 后台发货
    -> 发货单
    -> 物流轨迹
    -> 用户确认收货
    -> completed

阶段二：售后
  paid/shipped/completed 订单
    -> 用户申请售后
    -> 商家审核
    -> 同意退款
    -> 支付模块退款
    -> 退款成功
```

为什么要先学发货再学售后：

- 售后可能发生在已支付、已发货、已完成订单。
- 不同阶段售后规则不同。
- 先理解订单履约状态，再理解售后状态更自然。

## 发货相关表

### 发货单 `ec_delivery`

```text
ec_delivery
  id
  tenant_id
  delivery_no
  order_id
  order_no
  warehouse_id
  logistics_company
  logistics_code
  tracking_no
  status
  shipped_at
  created_at
```

为什么不直接在订单表上写物流单号：

- 一个订单可能拆成多个包裹。
- 一个订单可能从多个仓库发货。
- 后续可能部分发货、补发、换货。
- 发货单有自己的状态和物流轨迹。

第一版可以一个订单只发一次货，但表设计要能扩展到多包裹。

### 发货明细 `ec_delivery_item`

```text
ec_delivery_item
  id
  tenant_id
  delivery_id
  order_item_id
  sku_id
  qty
  delivered_qty
```

为什么发货要有明细：

- 订单里可能有多个 SKU。
- 部分发货时要知道这次发了哪些 SKU。
- 售后和物流追踪时也需要知道包裹里有哪些商品。

### 物流轨迹 `ec_logistics_track`

```text
ec_logistics_track
  id
  tenant_id
  delivery_id
  tracking_no
  content
  occurred_at
  raw_json
```

为什么物流轨迹要单独表：

- 一个物流单号有多条轨迹。
- 物流平台可能多次回调。
- 用户订单详情要展示时间线。
- `rawJson` 方便排查第三方物流回调。

## 定义发货 DTO

### `ship-order.dto.ts`

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class ShipOrderDto {
  @IsString()
  @IsNotEmpty()
  logisticsCompany!: string;

  @IsString()
  @IsNotEmpty()
  trackingNo!: string;
}
```

### `create-delivery.dto.ts`

```ts
import { IsNotEmpty, IsString } from 'class-validator';
import { ShipOrderDto } from './ship-order.dto';

export class CreateDeliveryDto extends ShipOrderDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;
}
```

为什么发货 DTO 第一版只要物流公司和单号：

- 先做整单发货，复杂度低。
- 订单商品全部发出。
- 后续再升级为部分发货时，再传发货明细数组。

升级版 DTO 可以是：

```ts
export class ShipOrderItemDto {
  orderItemId!: string;
  qty!: number;
}

export class ShipOrderDto {
  logisticsCompany!: string;
  trackingNo!: string;
  items!: ShipOrderItemDto[];
}
```

## 实现后台发货

### 发货流程

```text
后台选择已支付订单
  -> 填物流公司和物流单号
  -> 校验订单 status=paid
  -> 创建发货单
  -> 创建发货明细
  -> 更新订单明细 deliveredQty
  -> 更新订单 status=shipped
  -> 更新订单 deliveryStatus=shipped
  -> 写站内通知
```

### `fulfillment.service.ts`

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ShipOrderDto } from '../order/dto/ship-order.dto';

@Injectable()
export class FulfillmentService {
  constructor(private readonly prisma: PrismaService) {}

  async shipOrder(orderId: string, dto: ShipOrderDto) {
    const tenantId = await this.getDefaultTenantId();
    const order = await this.getShippableOrder(tenantId, orderId);
    const shop = await this.getOrderShop(order.shopId);

    if (!shop.defaultWarehouseId) {
      throw new BadRequestException('店铺未配置默认仓库');
    }

    const deliveryNo = this.createDeliveryNo();
    const shippedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.ecDelivery.create({
        data: {
          tenantId,
          deliveryNo,
          orderId: order.id,
          orderNo: order.orderNo,
          warehouseId: shop.defaultWarehouseId,
          logisticsCompany: dto.logisticsCompany,
          trackingNo: dto.trackingNo,
          status: 'shipped',
          shippedAt,
        },
      });

      for (const item of order.items) {
        await tx.ecDeliveryItem.create({
          data: {
            tenantId,
            deliveryId: delivery.id,
            orderItemId: item.id,
            skuId: item.skuId,
            qty: item.qty,
            deliveredQty: item.qty,
          },
        });

        await tx.ecOrderItem.update({
          where: {
            id: item.id,
          },
          data: {
            deliveredQty: item.qty,
          },
        });
      }

      await tx.ecOrder.update({
        where: {
          id: order.id,
        },
        data: {
          status: 'shipped',
          deliveryStatus: 'shipped',
          priceSnapshot: this.mergeDeliverySnapshot(order.priceSnapshot, {
            logisticsCompany: dto.logisticsCompany,
            trackingNo: dto.trackingNo,
            shippedAt: shippedAt.toISOString(),
          }),
        },
      });

      await tx.notifyMessage.create({
        data: {
          tenantId,
          receiverType: 'member',
          receiverId: order.memberId,
          channel: 'station',
          title: '订单已发货',
          content: `订单 ${order.orderNo} 已发货，物流单号 ${dto.trackingNo}。`,
          bizType: 'order',
          bizId: order.id,
          status: 'unread',
          sentAt: shippedAt,
        },
      });
    });

    return {
      orderId: order.id.toString(),
      orderNo: order.orderNo,
      deliveryNo,
      shippedAt: shippedAt.toISOString(),
    };
  }

  private async getShippableOrder(tenantId: bigint, orderId: string) {
    const order = await this.prisma.ecOrder.findFirst({
      where: {
        id: BigInt(orderId),
        tenantId,
        status: 'paid',
        payStatus: 'paid',
        deletedAt: null,
      },
      include: {
        items: {
          where: {
            deletedAt: null,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('可发货订单不存在');
    }

    return order;
  }
}
```

为什么发货也要用事务：

- 发货单、发货明细、订单状态必须一致。
- 如果发货单创建了，但订单没改成 shipped，会造成后台状态混乱。
- 如果订单改成 shipped，但发货明细没写，后续售后无法判断发货数量。

为什么发货后写 `priceSnapshot.delivery`：

- 订单详情常需要快速展示物流公司、物流单号、发货时间。
- 历史订单展示不应该只依赖发货单实时查询。
- 但正式的物流记录仍然以 `ec_delivery` 和 `ec_logistics_track` 为准。

## 物流轨迹回调

### 物流回调 DTO

```ts
import { IsOptional, IsString } from 'class-validator';

export class LogisticsTrackWebhookDto {
  @IsString()
  trackingNo!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  raw?: unknown;
}
```

### `fulfillment.service.ts`

```ts
async handleLogisticsTrack(dto: LogisticsTrackWebhookDto) {
  const tenantId = await this.getDefaultTenantId();
  const trackingNo = dto.trackingNo.trim();

  if (!trackingNo) {
    throw new BadRequestException('物流单号不能为空');
  }

  const delivery = await this.prisma.ecDelivery.findFirst({
    where: {
      tenantId,
      trackingNo,
      deletedAt: null,
    },
  });

  if (!delivery) {
    throw new NotFoundException('发货单不存在');
  }

  const occurredAt = dto.occurredAt ? new Date(dto.occurredAt) : new Date();
  const status = dto.status || delivery.status;

  const track = await this.prisma.$transaction(async (tx) => {
    const created = await tx.ecLogisticsTrack.create({
      data: {
        tenantId,
        deliveryId: delivery.id,
        trackingNo,
        content: dto.content,
        occurredAt,
        rawJson: dto.raw ?? {},
      },
    });

    await tx.ecDelivery.update({
      where: { id: delivery.id },
      data: { status },
    });

    if (status === 'delivered') {
      await tx.ecOrder.update({
        where: { id: delivery.orderId },
        data: { deliveryStatus: 'delivered' },
      });
    }

    return created;
  });

  return {
    id: track.id.toString(),
    deliveryId: track.deliveryId.toString(),
    trackingNo: track.trackingNo,
    content: track.content,
    occurredAt: track.occurredAt.toISOString(),
    status,
  };
}
```

为什么物流回调只改 `deliveryStatus=delivered`，不直接完成订单：

- 物流显示签收，不一定等于用户确认收货。
- 有些业务需要用户主动确认。
- 有些业务可以物流签收后 N 天自动确认收货。
- 第一版让确认收货独立处理，状态更清晰。

## 用户确认收货

### 确认收货流程

```text
用户进入订单详情
  -> 点击确认收货
  -> 校验订单属于当前会员
  -> 校验订单 status=shipped
  -> status=completed
  -> deliveryStatus=received
  -> finishedAt=now
```

### `order.service.ts`

```ts
async confirmReceipt(member: CurrentMemberPayload, id: string) {
  const order = await this.prisma.ecOrder.findFirst({
    where: {
      id: BigInt(id),
      tenantId: member.tenantId,
      memberId: member.memberId,
      deletedAt: null,
    },
  });

  if (!order) {
    throw new NotFoundException('订单不存在');
  }

  if (order.status !== 'shipped') {
    throw new BadRequestException('当前订单不可确认收货');
  }

  await this.prisma.ecOrder.update({
    where: {
      id: order.id,
    },
    data: {
      status: 'completed',
      deliveryStatus: 'received',
      finishedAt: new Date(),
    },
  });

  return this.detail(member, id);
}
```

为什么确认收货要校验 `memberId`：

- 用户只能确认自己的订单。
- 不能只按订单 id 更新。

为什么第一版没有事务：

- 这里主要更新订单一张表。
- 如果后面确认收货要发积分、佣金结算、通知，就应该放进事务或事件流程。

## 售后表设计

售后不是订单的一个字段，而是一套独立业务。

### 售后主表 `ec_aftersale`

```text
ec_aftersale
  id
  tenant_id
  aftersale_no
  order_id
  order_no
  member_id
  type
  status
  reason
  description
  evidence_images_json
  apply_refund_amount
  approved_refund_amount
  reject_reason
  approved_at
  rejected_at
  finished_at
```

### 售后明细 `ec_aftersale_item`

```text
ec_aftersale_item
  id
  tenant_id
  aftersale_id
  order_item_id
  sku_id
  product_title
  sku_spec_json
  image_url
  qty
  refund_amount
  received_qty
```

为什么售后要拆主表和明细：

- 一个售后单可能涉及多个订单商品。
- 部分退款、部分退货都要按明细记录。
- 售后主表保存原因、状态、审核结果。
- 售后明细保存具体退哪个 SKU、退多少数量、退多少钱。

为什么售后明细也要保存商品快照：

- 售后处理时商品可能已经改名、下架或删除。
- 客服需要看到申请时对应的订单商品信息。

## 定义售后 DTO

### `create-aftersale.dto.ts`

```ts
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAftersaleItemDto {
  @IsString()
  orderItemId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.0001)
  qty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;
}

export class CreateAftersaleDto {
  @IsString()
  orderId!: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceImages?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateAftersaleItemDto)
  items?: CreateAftersaleItemDto[];
}
```

为什么 `items` 可以选填：

- 用户可能整单退款。
- 如果不传 items，服务端可以默认申请订单全部可退商品。
- 如果传 items，则表示部分退款。

### `review-aftersale.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class ApproveAftersaleDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  refundAmount?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}

export class RejectAftersaleDto {
  @IsOptional()
  @IsString()
  rejectReason?: string;
}
```

为什么审核通过时还可以传 `refundAmount`：

- 用户申请金额可能不合理。
- 商家可能只同意部分退款。
- 同意退款金额不能超过申请金额，也不能超过订单可退金额。

## 用户申请售后

### 申请售后流程

```text
用户提交售后
  -> 校验订单属于当前会员
  -> 校验订单状态 paid/shipped/completed
  -> 检查没有处理中售后
  -> 计算本次申请退款金额
  -> 校验不超过可退金额
  -> 创建售后主表
  -> 创建售后明细
  -> 订单 aftersaleStatus=processing
  -> 订单 status=aftersale_processing
```

### `aftersale.service.ts`

```ts
async create(member: CurrentMemberPayload, dto: CreateAftersaleDto) {
  const order = await this.prisma.ecOrder.findFirst({
    where: {
      id: BigInt(dto.orderId),
      tenantId: member.tenantId,
      memberId: member.memberId,
      deletedAt: null,
    },
    include: {
      items: {
        where: { deletedAt: null },
        orderBy: { id: 'asc' },
      },
    },
  });

  if (!order) {
    throw new NotFoundException('订单不存在');
  }

  if (!['paid', 'shipped', 'completed'].includes(order.status)) {
    throw new BadRequestException('当前订单不可申请售后');
  }

  const activeAftersale = await this.prisma.ecAftersale.findFirst({
    where: {
      tenantId: member.tenantId,
      orderId: order.id,
      status: {
        in: ['pending_review', 'approved'],
      },
      deletedAt: null,
    },
  });

  if (activeAftersale) {
    throw new BadRequestException('该订单已有处理中售后');
  }

  const selectedItems = this.resolveApplyItems(order.items, dto.items);
  const applyRefundAmount = selectedItems.reduce(
    (sum, item) => sum + item.refundAmount,
    0,
  );
  const refundableAmount = Number(order.paidAmount) - Number(order.refundAmount);

  if (applyRefundAmount <= 0) {
    throw new BadRequestException('退款金额必须大于 0');
  }

  if (applyRefundAmount > refundableAmount) {
    throw new BadRequestException('申请退款金额超过可退金额');
  }

  const aftersaleNo = this.createAftersaleNo();

  const aftersale = await this.prisma.$transaction(async (tx) => {
    const createdAftersale = await tx.ecAftersale.create({
      data: {
        tenantId: member.tenantId,
        aftersaleNo,
        orderId: order.id,
        orderNo: order.orderNo,
        memberId: order.memberId,
        type: dto.type || 'refund',
        status: 'pending_review',
        reason: dto.reason,
        description: dto.description,
        evidenceImages: dto.evidenceImages || [],
        applyRefundAmount: applyRefundAmount.toFixed(2),
        approvedRefundAmount: '0.00',
      },
    });

    for (const item of selectedItems) {
      await tx.ecAftersaleItem.create({
        data: {
          tenantId: member.tenantId,
          aftersaleId: createdAftersale.id,
          orderItemId: item.orderItem.id,
          skuId: item.orderItem.skuId,
          productTitle: item.orderItem.productTitle,
          skuSpecJson: item.orderItem.skuSpecJson,
          imageUrl: item.orderItem.imageUrl,
          qty: item.qty,
          refundAmount: item.refundAmount.toFixed(2),
        },
      });
    }

    await tx.ecOrder.update({
      where: { id: order.id },
      data: {
        aftersaleStatus: 'processing',
        status: 'aftersale_processing',
      },
    });

    return createdAftersale;
  });

  return this.detail(member, aftersale.id.toString());
}
```

为什么只允许一个处理中售后：

- 第一版规则简单，避免多个售后单同时竞争同一笔可退金额。
- 多售后会涉及按订单明细累计已退数量和已退金额。
- 后续可以升级为同一订单允许多个售后，但必须按明细控制额度。

## 计算售后申请明细

### `resolveApplyItems`

```ts
private resolveApplyItems(
  orderItems: Array<{
    id: bigint;
    skuId: bigint;
    qty: Prisma.Decimal;
    refundQty: Prisma.Decimal;
    payableAmount: Prisma.Decimal;
    refundAmount: Prisma.Decimal;
  }>,
  inputItems?: CreateAftersaleItemDto[],
) {
  const targets = inputItems?.length
    ? inputItems
    : orderItems.map((item) => ({
        orderItemId: item.id.toString(),
      }));

  return targets.map((input) => {
    const orderItem = orderItems.find(
      (item) => item.id.toString() === input.orderItemId,
    );

    if (!orderItem) {
      throw new BadRequestException('售后商品不存在');
    }

    const remainingQty = Number(orderItem.qty) - Number(orderItem.refundQty);
    const remainingAmount =
      Number(orderItem.payableAmount) - Number(orderItem.refundAmount);

    const qty = input.qty === undefined ? remainingQty : Number(input.qty);
    const refundAmount =
      input.refundAmount === undefined ? remainingAmount : Number(input.refundAmount);

    if (qty <= 0 || qty > remainingQty) {
      throw new BadRequestException('售后数量超出可退数量');
    }

    if (refundAmount < 0 || refundAmount > remainingAmount) {
      throw new BadRequestException('退款金额超出可退金额');
    }

    return {
      orderItem,
      qty,
      refundAmount,
    };
  });
}
```

为什么要按订单明细控制可退数量和金额：

- 不能超过已购买数量。
- 不能超过已支付金额。
- 部分退款后，下一次售后只能退剩余金额。
- 财务和售后都需要明细级别追踪。

## 后台审核售后

### 审核通过流程

```text
后台打开售后单
  -> 校验售后 pending_review
  -> 校验退款金额
  -> 调 PaymentService 发起退款
  -> 写通知
```

### `aftersale.service.ts`

```ts
async approve(id: string, dto: ApproveAftersaleDto) {
  const tenantId = await this.getDefaultTenantId();
  const aftersale = await this.getAdminAftersale(tenantId, id);

  if (aftersale.status !== 'pending_review') {
    throw new BadRequestException('当前售后单不可审核通过');
  }

  const order = await this.prisma.ecOrder.findFirst({
    where: {
      id: aftersale.orderId,
      tenantId,
      deletedAt: null,
    },
  });

  if (!order) {
    throw new NotFoundException('订单不存在');
  }

  const applyRefundAmount = Number(aftersale.applyRefundAmount);
  const refundAmount =
    dto.refundAmount === undefined ? applyRefundAmount : Number(dto.refundAmount);
  const refundableAmount = Number(order.paidAmount) - Number(order.refundAmount);

  if (refundAmount <= 0) {
    throw new BadRequestException('退款金额必须大于 0');
  }

  if (refundAmount > applyRefundAmount) {
    throw new BadRequestException('同意退款金额不能超过申请金额');
  }

  if (refundAmount > refundableAmount) {
    throw new BadRequestException('同意退款金额不能超过订单可退金额');
  }

  await this.paymentService.requestAftersaleRefund({
    tenantId,
    orderId: order.id,
    orderNo: order.orderNo,
    aftersaleId: aftersale.id,
    aftersaleNo: aftersale.aftersaleNo,
    memberId: order.memberId,
    amount: refundAmount,
    totalAmount: order.paidAmount,
    remark: dto.remark,
  });

  return this.adminDetail(id);
}
```

为什么审核通过不直接改售后完成：

- 真实支付渠道退款可能是异步的。
- 审核通过只代表商家同意。
- 是否真正退款成功，要看支付渠道返回或退款回调。

mock 模式可以立即成功，但真实模式要进入 `processing`。

### 拒绝售后

```ts
async reject(id: string, dto: RejectAftersaleDto) {
  const tenantId = await this.getDefaultTenantId();
  const aftersale = await this.getAdminAftersale(tenantId, id);

  if (aftersale.status !== 'pending_review') {
    throw new BadRequestException('当前售后单不可拒绝');
  }

  await this.prisma.$transaction(async (tx) => {
    await tx.ecAftersale.update({
      where: { id: aftersale.id },
      data: {
        status: 'rejected',
        rejectReason: dto.rejectReason || '商家拒绝售后申请',
        rejectedAt: new Date(),
      },
    });

    await tx.ecOrder.update({
      where: { id: aftersale.orderId },
      data: {
        aftersaleStatus: 'none',
        status: this.resolveOrderStatusAfterReject(aftersale.order.status),
      },
    });
  });

  return this.adminDetail(id);
}
```

为什么拒绝也要恢复订单状态：

- 申请售后时订单可能改成 `aftersale_processing`。
- 拒绝后，订单应该回到原来的可见业务状态，比如 `completed`。
- 否则订单会一直停在售后处理中。

## 退款流水和退款请求

### `pay_refund`

```text
pay_refund
  id
  tenant_id
  refund_no
  order_id
  order_no
  aftersale_id
  member_id
  channel
  amount
  status
  refund_state
  refunded_at
  notify_raw_json
```

为什么退款也要独立流水：

- 支付流水记录收款，退款流水记录退款。
- 一个订单可能多次退款。
- 退款平台也有自己的状态和回调。
- 财务对账需要退款流水。

### `PaymentService.requestAftersaleRefund`

```ts
async requestAftersaleRefund(input: {
  tenantId: bigint;
  orderId: bigint;
  orderNo: string;
  aftersaleId?: bigint;
  aftersaleNo?: string;
  memberId: bigint;
  amount: number;
  totalAmount: Prisma.Decimal | string | number;
  remark?: string;
}) {
  const config = this.resolveWechatPayConfig();

  if (config.mock) {
    return this.recordAftersaleRefundSuccess({
      ...input,
      notifyRawJson: {
        source: 'admin_mock_refund',
        remark: input.remark || '',
      },
    });
  }

  const refundNo = input.aftersaleNo
    ? `RF${input.aftersaleNo}`
    : `RF${input.orderNo}`;

  const pendingRefund = await this.prepareWechatRefund(input, refundNo);

  const response = await this.requestWechatRefund({
    config,
    refundNo,
    orderNo: input.orderNo,
    amount: input.amount,
    totalAmount: Number(input.totalAmount),
    reason: input.remark || `售后退款 ${input.aftersaleNo || input.orderNo}`,
  });

  if (response.status === 'SUCCESS') {
    return this.applyRefundSuccess({
      tenantId: input.tenantId,
      refundNo,
      orderId: input.orderId,
      orderNo: input.orderNo,
      memberId: input.memberId,
      aftersaleId: input.aftersaleId,
      amount: input.amount,
      notifyRawJson: {
        source: 'wechat_refund_request_success',
        response,
      },
    });
  }

  return pendingRefund;
}
```

为什么真实退款可能不马上成功：

- 微信退款可能返回处理中。
- 银行处理可能有延迟。
- 退款最终结果可能通过退款回调通知。

所以退款状态要支持：

```text
processing
succeeded
failed
```

## 退款成功落库

退款成功后，需要：

```text
pay_refund.status = succeeded
pay_refund.refundedAt = now
ec_order.refundAmount += refundAmount
ec_order.aftersaleStatus = finished
ec_aftersale.status = finished
ec_aftersale.approvedRefundAmount = refundAmount
ec_aftersale.finishedAt = now
ec_order_item.refundAmount/refundQty 按售后明细分摊
```

### `applyRefundSuccess`

```ts
async applyRefundSuccess(input: {
  tenantId: bigint;
  refundNo: string;
  orderId: bigint;
  orderNo: string;
  memberId: bigint;
  aftersaleId?: bigint;
  amount: number;
  notifyRawJson?: Prisma.JsonValue;
}) {
  return this.prisma.$transaction(async (tx) => {
    const existingRefund = await tx.payRefund.findFirst({
      where: {
        tenantId: input.tenantId,
        refundNo: input.refundNo,
        deletedAt: null,
      },
    });

    if (existingRefund?.status === 'succeeded') {
      return existingRefund;
    }

    const refundedAt = new Date();
    const refund = existingRefund
      ? await tx.payRefund.update({
          where: { id: existingRefund.id },
          data: {
            status: 'succeeded',
            refundState: 'SUCCESS',
            refundedAt,
            notifyRawJson: input.notifyRawJson ?? existingRefund.notifyRawJson,
          },
        })
      : await tx.payRefund.create({
          data: {
            tenantId: input.tenantId,
            refundNo: input.refundNo,
            orderId: input.orderId,
            orderNo: input.orderNo,
            aftersaleId: input.aftersaleId || null,
            memberId: input.memberId,
            channel: 'wechat',
            amount: input.amount,
            status: 'succeeded',
            refundState: 'SUCCESS',
            refundedAt,
            notifyRawJson: input.notifyRawJson ?? {},
          },
        });

    const order = await tx.ecOrder.findFirst({
      where: {
        id: input.orderId,
        tenantId: input.tenantId,
        deletedAt: null,
      },
      include: {
        items: {
          where: { deletedAt: null },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('订单不存在');
    }

    const nextRefundAmount = Number(order.refundAmount) + Number(input.amount);

    await tx.ecOrder.update({
      where: { id: order.id },
      data: {
        refundAmount: nextRefundAmount.toFixed(2),
        aftersaleStatus: 'finished',
        status: 'completed',
      },
    });

    if (input.aftersaleId) {
      const aftersale = await tx.ecAftersale.findFirst({
        where: {
          id: input.aftersaleId,
          tenantId: input.tenantId,
          deletedAt: null,
        },
        include: {
          items: {
            where: { deletedAt: null },
          },
        },
      });

      if (aftersale) {
        await tx.ecAftersale.update({
          where: { id: aftersale.id },
          data: {
            status: 'finished',
            approvedRefundAmount: String(input.amount),
            approvedAt: aftersale.approvedAt || refundedAt,
            finishedAt: refundedAt,
          },
        });

        await this.allocateRefundToItems(
          tx,
          aftersale.items,
          Number(input.amount),
        );
      }
    }

    return refund;
  });
}
```

为什么退款成功要幂等：

- 微信退款回调也可能重复。
- 后台可能重复点击审核。
- 网络超时后可能重试。

关键保护：

```text
refundNo 唯一
pay_refund.status=succeeded 时直接返回
订单 refundAmount 不能重复累加
```

## 退款金额分摊到订单明细

如果一个售后单包含多个商品，要把退款金额分摊回订单明细：

```ts
private async allocateRefundToItems(
  tx: TxClient,
  items: Array<{
    orderItemId: bigint;
    qty: Prisma.Decimal;
    refundAmount: Prisma.Decimal;
  }>,
  approvedRefundAmount: number,
) {
  const totalApplyAmount = items.reduce(
    (sum, item) => sum + Number(item.refundAmount),
    0,
  );

  if (totalApplyAmount <= 0) {
    return;
  }

  let allocatedAmount = 0;

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const refundAmount =
      index === items.length - 1
        ? approvedRefundAmount - allocatedAmount
        : Number(
            (
              (Number(item.refundAmount) / totalApplyAmount) *
              approvedRefundAmount
            ).toFixed(2),
          );

    allocatedAmount += refundAmount;

    await tx.ecOrderItem.update({
      where: {
        id: item.orderItemId,
      },
      data: {
        refundAmount: {
          increment: refundAmount,
        },
        refundQty: {
          increment: item.qty,
        },
      },
    });
  }
}
```

为什么最后一项用剩余金额：

- 金额四舍五入会产生 0.01 的误差。
- 最后一项兜底可以保证分摊总额等于实际退款金额。

## 退款回调

真实微信退款可能异步完成，所以要有退款回调：

```text
POST /api/webhook/wechat-pay/refund
```

流程：

```text
微信退款回调
  -> 验签
  -> 解密 resource
  -> 提取 refundNo/refundState
  -> 找 pay_refund
  -> 如果 SUCCESS
      -> applyRefundSuccess
  -> 返回 SUCCESS
```

为什么退款回调和支付回调分开：

- 语义不同。
- 数据结构不同。
- 处理状态不同。
- 支付成功影响订单付款，退款成功影响售后和退款金额。

## Controller 组织

### `fulfillment.controller.ts`

```ts
@Controller('/api/admin/v1/deliveries')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Get()
  list(@Query() query: DeliveryQueryDto) {
    return this.fulfillmentService.listDeliveries(query);
  }

  @Get('/:id')
  detail(@Param('id') id: string) {
    return this.fulfillmentService.getDelivery(id);
  }

  @Post()
  create(@Body() dto: CreateDeliveryDto) {
    return this.fulfillmentService.shipOrder(dto.orderId, dto);
  }
}

@Controller('/api/webhook/logistics')
export class LogisticsWebhookController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Post('/track')
  track(@Body() dto: LogisticsTrackWebhookDto) {
    return this.fulfillmentService.handleLogisticsTrack(dto);
  }
}
```

### `aftersale.controller.ts`

```ts
@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/aftersales')
export class AftersaleController {
  constructor(private readonly aftersaleService: AftersaleService) {}

  @Post()
  create(@CurrentMember() member, @Body() dto: CreateAftersaleDto) {
    return this.aftersaleService.create(member, dto);
  }

  @Get()
  list(@CurrentMember() member, @Query() query: AftersaleQueryDto) {
    return this.aftersaleService.list(member, query);
  }

  @Get('/:id')
  detail(@CurrentMember() member, @Param('id') id: string) {
    return this.aftersaleService.detail(member, id);
  }
}

@Controller('/api/admin/v1/aftersales')
export class AdminAftersaleController {
  constructor(private readonly aftersaleService: AftersaleService) {}

  @Get()
  list(@Query() query: AftersaleQueryDto) {
    return this.aftersaleService.adminList(query);
  }

  @Post('/:id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveAftersaleDto) {
    return this.aftersaleService.approve(id, dto);
  }

  @Post('/:id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectAftersaleDto) {
    return this.aftersaleService.reject(id, dto);
  }
}
```

为什么售后有小程序端和后台端：

- 用户提交和查看自己的售后。
- 后台客服审核、同意、拒绝。
- 两端权限完全不同。

## 接口调用顺序

### 支付成功后后台发货

```bash
curl -X POST http://localhost:3000/api/admin/v1/orders/<orderId>/ship \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{\"logisticsCompany\":\"顺丰速运\",\"trackingNo\":\"SF1234567890\"}"
```

### 物流轨迹回调

```bash
curl -X POST http://localhost:3000/api/webhook/logistics/track \
  -H "Content-Type: application/json" \
  -d "{
    \"trackingNo\":\"SF1234567890\",
    \"content\":\"快件已到达深圳转运中心\",
    \"status\":\"shipped\"
  }"
```

### 用户确认收货

```bash
curl -X POST http://localhost:3000/api/app/v1/orders/<orderId>/confirm-receipt \
  -H "Authorization: Bearer <accessToken>"
```

### 用户申请售后

```bash
curl -X POST http://localhost:3000/api/app/v1/aftersales \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{
    \"orderId\":\"<orderId>\",
    \"type\":\"refund\",
    \"reason\":\"不想要了\",
    \"description\":\"商品未拆封，申请退款\"
  }"
```

### 后台审核同意退款

```bash
curl -X POST http://localhost:3000/api/admin/v1/aftersales/<aftersaleId>/approve \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{\"refundAmount\":99,\"remark\":\"同意退款\"}"
```

### 后台拒绝售后

```bash
curl -X POST http://localhost:3000/api/admin/v1/aftersales/<aftersaleId>/reject \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{\"rejectReason\":\"订单已超过售后期\"}"
```

## 本章和真实 ERP 项目的对应关系

真实项目中可以重点看：

```text
server/src/modules/fulfillment/fulfillment.controller.ts
server/src/modules/fulfillment/fulfillment.service.ts
server/src/modules/fulfillment/dto/fulfillment-query.dto.ts
server/src/modules/fulfillment/dto/logistics-track-webhook.dto.ts

server/src/modules/aftersale/aftersale.controller.ts
server/src/modules/aftersale/aftersale.service.ts
server/src/modules/aftersale/dto/create-aftersale.dto.ts
server/src/modules/aftersale/dto/review-aftersale.dto.ts

server/src/modules/payment/payment.service.ts
server/src/modules/order/order.service.ts

server/prisma/schema.prisma
  EcDelivery
  EcDeliveryItem
  EcLogisticsCompany
  EcLogisticsTrack
  EcAftersale
  EcAftersaleItem
  PayRefund
```

教学版和真实项目的区别：

| 能力 | 教学版 | 真实项目 |
| --- | --- | --- |
| 发货 | 整单发货 | 当前项目整单发货，表支持发货明细 |
| 物流 | 简单轨迹回调 | 有物流公司和轨迹表 |
| 确认收货 | 用户手动确认 | 还有自动确认收货任务 |
| 售后申请 | 整单/部分退款 | 按订单明细校验可退金额 |
| 退款 | mock 或微信退款 | `PaymentService` 统一处理 |
| 退款回调 | 教学流程 | 支持微信退款回调 |

