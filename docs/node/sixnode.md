本章的核心原则`钱、库存、优惠券、订单状态，必须以服务端事务为准。`，创建订单不是简单写一条 `order` 记录，而是一次必须保证一致性的业务事务：

```text
重新读取已勾选购物车
  -> 重新计算订单预览金额
  -> 生成订单号
  -> 创建订单主表
  -> 创建订单地址快照
  -> 创建订单明细
  -> 锁定库存
  -> 锁定优惠券
  -> 清理已结算购物车
  -> 返回订单详情
```
最终实现这些接口：

```text
小程序订单：
POST /api/app/v1/orders
GET  /api/app/v1/orders
GET  /api/app/v1/orders/:id
POST /api/app/v1/orders/:id/cancel

内部能力：
锁库存
释放库存
锁优惠券
释放优惠券
写库存流水
幂等防重复提交
```
真实项目中，对应表和模块主要是：

```text
ec_order
ec_order_item
ec_order_address
ec_stock_balance
ec_stock_lock
ec_stock_movement
ec_cart_item
mk_coupon
sys_idempotency_key

OrderModule
InventoryModule
MarketingModule
IdempotencyInterceptor
```

## 创建订单不能只是 insert 一条订单

如果只写：

```ts
await db.order.create({
  data: {
    memberId,
    totalAmount,
  },
});
```

会立刻遇到这些问题：

- 订单明细没有保存，不知道买了哪些 SKU。
- 地址没有快照，用户修改地址后历史订单会变。
- 前端传来的金额可能被篡改。
- 库存没有锁定，多个用户同时下单可能超卖。
- 优惠券没有锁定，可能被多个订单同时使用。
- 购物车没有清理，用户可能重复下单。
- 创建一半失败时，会留下脏数据。

所以创建订单要放进事务：

```text
事务开始
  -> 创建订单主表
  -> 创建订单地址快照
  -> 创建订单明细
  -> 锁库存
  -> 锁优惠券
  -> 删除购物车已结算项
事务提交
```

如果中间任何一步失败：

```text
事务回滚
  -> 不留下半个订单
  -> 不占用库存
  -> 不锁住优惠券
```

为什么不用“写一步算一步，失败了再手动撤销”：

- 手动撤销容易漏。
- 服务崩溃时撤销代码可能根本没机会执行。
- 并发下很难保证一致。
- 数据库事务就是为这种多表一致性场景准备的。

## 3. 本章目录结构

在前面模块基础上，新增或强化：

```text
src/
  common/
    interceptors/
      idempotency.interceptor.ts

  modules/
    order/
      order.module.ts
      order.controller.ts
      order.service.ts
      dto/
        create-order.dto.ts
        order-address.dto.ts
        order-query.dto.ts

    inventory/
      inventory.service.ts

    marketing/
      marketing.service.ts
```

为什么库存逻辑可以在 `InventoryModule`，但订单创建里仍然调用锁库存：

- 库存模块负责库存余额、锁定、释放、流水。
- 订单模块负责“创建订单时需要锁哪些 SKU”这个业务编排。
- 交易事务里可以调用库存能力，但库存模块不要反过来知道订单页面怎么提交。

## 4. 第一步：理解订单相关表设计

### 4.1 订单主表 `ec_order`

```text
ec_order
  id
  tenant_id
  shop_id
  channel_id
  order_no
  member_id
  status
  pay_status
  delivery_status
  aftersale_status
  goods_amount
  discount_amount
  freight_amount
  payable_amount
  paid_amount
  refund_amount
  coupon_id
  remark
  price_snapshot_json
  paid_at
  cancelled_at
  finished_at
  created_at
  updated_at
```

为什么订单金额要拆这么多字段：

- `goodsAmount`：商品原始金额。
- `discountAmount`：总优惠金额。
- `freightAmount`：运费。
- `payableAmount`：用户应付金额。
- `paidAmount`：实际已支付金额。
- `refundAmount`：已退款金额。

不要只存一个 `totalAmount`，因为后面财务、退款、对账、客服都需要知道金额是怎么来的。

为什么要有 `priceSnapshotJson`：

- 订单预览里有促销、优惠券、运费规则。
- 后面商品价格和营销规则会变化。
- 历史订单必须保留当时的计算依据。

### 4.2 订单明细表 `ec_order_item`

```text
ec_order_item
  id
  tenant_id
  order_id
  product_id
  sku_id
  product_title
  sku_spec_json
  image_url
  sale_price
  qty
  delivered_qty
  refund_qty
  goods_amount
  discount_amount
  payable_amount
  refund_amount
```

为什么订单明细要保存商品标题、规格、图片、成交价：

- 商品后面可能改标题。
- SKU 后面可能改规格名。
- 商品图片可能下架或替换。
- 历史订单应该展示下单时的样子。

为什么订单明细还要关联 `productId` 和 `skuId`：

- 售后、发货、库存、报表仍然需要追溯商品。
- 快照负责展示，关联 id 负责业务追踪。

### 4.3 订单地址表 `ec_order_address`

```text
ec_order_address
  id
  tenant_id
  order_id
  receiver_name
  receiver_phone
  province
  city
  district
  detail
  postal_code
```

为什么订单不能只存 `memberAddressId`：

- 用户下单后可能修改地址。
- 用户可能删除地址。
- 历史订单必须保留下单时地址。
- 物流、售后、客服要看的都是当时订单地址。

### 4.4 库存余额表 `ec_stock_balance`

```text
ec_stock_balance
  tenant_id
  warehouse_id
  sku_id
  on_hand_qty
  available_qty
  locked_qty
```

三个库存字段的含义：

| 字段 | 含义 | 例子 |
| --- | --- | --- |
| `onHandQty` | 实物库存 | 仓库里有 100 件 |
| `availableQty` | 可售库存 | 其中 80 件还能卖 |
| `lockedQty` | 已锁库存 | 20 件被未支付订单占用 |

关系通常是：

```text
onHandQty = availableQty + lockedQty + 其他不可售库存
```

教学阶段可以先理解为：

```text
onHandQty = availableQty + lockedQty
```

### 4.5 库存锁表 `ec_stock_lock`

```text
ec_stock_lock
  id
  tenant_id
  warehouse_id
  sku_id
  order_id
  order_no
  qty
  status
  locked_at
  released_at
```

为什么锁库存还要单独建表：

- 订单取消时要知道释放哪些 SKU、多少数量。
- 支付成功时要知道哪些锁定库存要转为真实扣减。
- 超时关单任务要批量释放库存。
- 出现库存问题时可以追溯订单和 SKU。

### 4.6 库存流水表 `ec_stock_movement`

```text
ec_stock_movement
  id
  tenant_id
  warehouse_id
  sku_id
  movement_no
  biz_type
  biz_id
  direction
  qty
  before_qty
  after_qty
  remark
```

为什么要有库存流水：

- 只看库存余额，不知道为什么变化。
- 下单锁库存、取消释放、支付扣减、后台调整都要可追溯。
- 库存问题通常需要按 SKU 和业务单据反查。

## 5. 第二步：订单状态怎么设计

本章先用最小状态：

```text
status:
  pending_payment  待支付
  cancelled        已取消
  paid             已支付

payStatus:
  unpaid           未支付
  paid             已支付

deliveryStatus:
  undelivered      未发货
```

真实项目会更多：

```text
pending_payment
paid
shipped
completed
cancelled
after_sale
```

为什么 `status` 和 `payStatus` 分开：

- 订单主状态描述业务阶段。
- 支付状态描述支付结果。
- 有些订单可能已支付但未发货，有些可能已取消但支付中回调刚到。
- 分开后状态表达更精确。

第一版不要设计太复杂。状态越多，状态流转校验越复杂。

## 6. 第三步：定义 DTO

### 6.1 `order-address.dto.ts`

```ts
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class OrderAddressDto {
  @IsString()
  @Length(1, 64)
  receiverName!: string;

  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  receiverPhone!: string;

  @IsString()
  @Length(1, 64)
  province!: string;

  @IsString()
  @Length(1, 64)
  city!: string;

  @IsString()
  @Length(1, 64)
  district!: string;

  @IsString()
  @Length(1, 255)
  detail!: string;

  @IsOptional()
  @IsString()
  @Length(1, 16)
  postalCode?: string;
}
```

### 6.2 `create-order.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsOptional, IsString, ValidateNested } from 'class-validator';
import { OrderAddressDto } from './order-address.dto';

export class CreateOrderDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderAddressDto)
  address?: OrderAddressDto;

  @IsOptional()
  @IsString()
  couponId?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
```

为什么创建订单不接收金额字段：

- 不接收 `goodsAmount`。
- 不接收 `discountAmount`。
- 不接收 `payableAmount`。

因为金额必须由服务端重新计算。前端只提交：

```text
用户选择了哪张优惠券
用户填写或选择了什么地址
用户备注
```

购物车里哪些商品被勾选，也从服务端购物车读取。

为什么地址可以直接传对象：

- 小程序可能允许用户在结算页临时编辑地址。
- 服务端创建订单时直接保存地址快照。
- 如果用 `addressId`，也要先查会员地址，再复制成订单地址快照。

## 7. 第四步：生成订单号

订单号不能直接用数据库自增 id。

原因：

- 自增 id 会暴露订单量。
- 多租户、多渠道、多系统对接时需要业务可读单号。
- 支付、物流、客服都常用订单号。

教学版订单号：

```ts
import { randomInt } from 'crypto';

export function createOrderNo() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const random = String(randomInt(0, 999999)).padStart(6, '0');

  return `O${yyyy}${mm}${dd}${hh}${mi}${ss}${random}`;
}
```

真实项目还要加唯一索引兜底：

```text
tenant_id + order_no 唯一
```

为什么订单号生成后还需要唯一索引：

- 再低概率也可能重复。
- 多实例并发下更要靠数据库兜底。
- 如果插入时唯一冲突，可以重新生成订单号再试一次。

## 8. 第五步：库存锁定的核心算法

库存防超卖的关键不是先查再更新：

```ts
const stock = await db.stock.findUnique(...);
if (stock.availableQty >= qty) {
  await db.stock.update(...);
}
```

这个写法在并发下可能出问题：

```text
用户 A 查到库存 1
用户 B 查到库存 1
用户 A 扣减成功
用户 B 也扣减成功
结果卖出 2 件
```

正确思路是条件更新：

```text
UPDATE stock
SET available_qty = available_qty - qty,
    locked_qty = locked_qty + qty
WHERE sku_id = ?
  AND available_qty >= qty
```

数据库保证这条更新是原子的。

### 8.1 `inventory.service.ts`

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

type Tx = Prisma.TransactionClient;

@Injectable()
export class InventoryService {
  async lockStock(
    tx: Tx,
    input: {
      tenantId: bigint;
      warehouseId: bigint;
      skuId: bigint;
      orderId: bigint;
      orderNo: string;
      qty: number;
    },
  ) {
    const updated = await tx.ecStockBalance.updateMany({
      where: {
        tenantId: input.tenantId,
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        availableQty: {
          gte: input.qty,
        },
      },
      data: {
        availableQty: {
          decrement: input.qty,
        },
        lockedQty: {
          increment: input.qty,
        },
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException('库存不足');
    }

    const balance = await tx.ecStockBalance.findUnique({
      where: {
        tenantId_warehouseId_skuId: {
          tenantId: input.tenantId,
          warehouseId: input.warehouseId,
          skuId: input.skuId,
        },
      },
    });

    const afterQty = Number(balance?.availableQty ?? 0);

    await tx.ecStockMovement.create({
      data: {
        tenantId: input.tenantId,
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        movementNo: this.createStockMovementNo(),
        bizType: 'order_create_lock',
        bizId: input.orderId,
        direction: 'out',
        qty: input.qty,
        beforeQty: afterQty + input.qty,
        afterQty,
        remark: `创建订单锁定库存 ${input.orderNo}`,
      },
    });

    await tx.ecStockLock.create({
      data: {
        tenantId: input.tenantId,
        warehouseId: input.warehouseId,
        skuId: input.skuId,
        orderId: input.orderId,
        orderNo: input.orderNo,
        qty: input.qty,
        status: 'locked',
      },
    });
  }

  private createStockMovementNo() {
    return `SM${Date.now()}${Math.floor(Math.random() * 100000)}`;
  }
}
```

为什么要把 `tx` 传进库存方法：

- 锁库存必须和创建订单处于同一个事务。
- 如果订单创建成功但库存锁定失败，事务要整体回滚。
- 如果库存锁定成功但订单明细创建失败，事务也要整体回滚。

为什么不能在事务外先锁库存：

- 订单后续步骤失败时，库存可能被白白占用。
- 服务崩溃时释放逻辑可能没执行。
- 放进同一个事务最可靠。

## 9. 第六步：优惠券锁定

优惠券和库存一样，也会遇到并发问题。

错误写法：

```ts
const coupon = await db.coupon.findFirst({ status: 'available' });
await db.coupon.update({ status: 'locked' });
```

两个请求可能同时查到可用。

正确思路仍然是条件更新：

```text
UPDATE coupon
SET status = 'locked',
    locked_order_id = ?
WHERE id = ?
  AND member_id = ?
  AND status = 'available'
  AND expired_at > now()
```

### 9.1 `marketing.service.ts`

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

@Injectable()
export class MarketingService {
  async lockCoupon(
    tx: Tx,
    input: {
      tenantId: bigint;
      memberId: bigint;
      couponId: bigint;
      orderId: bigint;
    },
  ) {
    const updated = await tx.mkCoupon.updateMany({
      where: {
        id: input.couponId,
        tenantId: input.tenantId,
        memberId: input.memberId,
        status: 'available',
        expiredAt: {
          gt: new Date(),
        },
        deletedAt: null,
      },
      data: {
        status: 'locked',
        lockedOrderId: input.orderId,
        lockedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      throw new BadRequestException('优惠券锁定失败');
    }
  }

  async releaseCoupon(
    tx: Tx,
    input: {
      tenantId: bigint;
      memberId: bigint;
      couponId: bigint;
      orderId: bigint;
    },
  ) {
    await tx.mkCoupon.updateMany({
      where: {
        id: input.couponId,
        tenantId: input.tenantId,
        memberId: input.memberId,
        lockedOrderId: input.orderId,
        status: 'locked',
        deletedAt: null,
      },
      data: {
        status: 'available',
        lockedOrderId: null,
        lockedAt: null,
      },
    });
  }

  async markCouponUsed(
    tx: Tx,
    input: {
      tenantId: bigint;
      memberId: bigint;
      couponId: bigint;
      orderId: bigint;
    },
  ) {
    await tx.mkCoupon.updateMany({
      where: {
        id: input.couponId,
        tenantId: input.tenantId,
        memberId: input.memberId,
        lockedOrderId: input.orderId,
        status: 'locked',
        deletedAt: null,
      },
      data: {
        status: 'used',
        usedAt: new Date(),
      },
    });
  }
}
```

为什么创建订单时优惠券状态是 `locked`，不是直接 `used`：

- 订单创建后还没支付。
- 用户可能取消订单。
- 订单可能超时未支付。
- 只有支付成功后，优惠券才应该变成 `used`。

状态流转：

```text
available
  -> 创建订单锁定 -> locked
  -> 支付成功 -> used

locked
  -> 取消订单/超时关单 -> available
```

## 10. 第七步：创建订单 Service

下面是教学版核心代码。它不是直接复制项目代码，而是把真实创建订单的关键动作抽出来。

### 10.1 `order.service.ts`

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { InventoryService } from '../inventory/inventory.service';
import { MarketingService } from '../marketing/marketing.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { createOrderNo } from './order-no';

type CurrentMemberPayload = {
  tenantId: bigint;
  memberId: bigint;
};

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly inventoryService: InventoryService,
    private readonly marketingService: MarketingService,
  ) {}

  async create(member: CurrentMemberPayload, dto: CreateOrderDto) {
    const checkedCartItems = await this.cartService.getCheckedItems(member);
    if (checkedCartItems.length === 0) {
      throw new BadRequestException('请选择要结算的商品');
    }

    const shopChannel = await this.getDefaultShopChannel(member.tenantId);
    const warehouseId = shopChannel.shop.defaultWarehouseId;
    if (!warehouseId) {
      throw new BadRequestException('店铺未配置默认仓库');
    }

    const preview = await this.buildPreviewAgain(member, checkedCartItems, dto.couponId);
    const address = dto.address ?? (await this.getDefaultMemberAddress(member));
    const orderNo = createOrderNo();

    const order = await this.prisma.$transaction(async (tx) => {
      const createdOrder = await tx.ecOrder.create({
        data: {
          tenantId: member.tenantId,
          shopId: shopChannel.shop.id,
          channelId: shopChannel.channel.id,
          orderNo,
          memberId: member.memberId,
          status: 'pending_payment',
          payStatus: 'unpaid',
          deliveryStatus: 'undelivered',
          aftersaleStatus: 'none',
          goodsAmount: preview.goodsAmount,
          discountAmount: preview.discountAmount,
          freightAmount: preview.freightAmount,
          payableAmount: preview.payableAmount,
          paidAmount: '0.00',
          refundAmount: '0.00',
          couponId: dto.couponId ? BigInt(dto.couponId) : null,
          remark: dto.remark,
          priceSnapshot: preview,
        },
      });

      await tx.ecOrderAddress.create({
        data: {
          tenantId: member.tenantId,
          orderId: createdOrder.id,
          receiverName: address.receiverName,
          receiverPhone: address.receiverPhone,
          province: address.province,
          city: address.city,
          district: address.district,
          detail: address.detail,
          postalCode: address.postalCode,
        },
      });

      for (const cartItem of checkedCartItems) {
        const previewItem = preview.items.find(
          (item) => item.cartItemId === cartItem.id.toString(),
        );

        if (!previewItem) {
          throw new BadRequestException('订单预览明细异常');
        }

        await tx.ecOrderItem.create({
          data: {
            tenantId: member.tenantId,
            orderId: createdOrder.id,
            productId: cartItem.productId,
            skuId: cartItem.skuId,
            productTitle: previewItem.title,
            skuSpecJson: previewItem.spec,
            imageUrl: previewItem.imageUrl,
            salePrice: previewItem.salePrice,
            qty: cartItem.qty,
            deliveredQty: 0,
            refundQty: 0,
            goodsAmount: previewItem.goodsAmount,
            discountAmount: previewItem.promotionDiscountAmount,
            payableAmount: previewItem.payableAmount,
            refundAmount: 0,
          },
        });

        await this.inventoryService.lockStock(tx, {
          tenantId: member.tenantId,
          warehouseId,
          skuId: cartItem.skuId,
          orderId: createdOrder.id,
          orderNo,
          qty: Number(cartItem.qty),
        });

        await tx.ecCartItem.update({
          where: {
            id: cartItem.id,
          },
          data: {
            deletedAt: new Date(),
          },
        });
      }

      if (dto.couponId) {
        await this.marketingService.lockCoupon(tx, {
          tenantId: member.tenantId,
          memberId: member.memberId,
          couponId: BigInt(dto.couponId),
          orderId: createdOrder.id,
        });
      }

      return createdOrder;
    });

    return this.detail(member, order.id.toString());
  }
}
```

这段创建订单做了几件大事：

```text
事务外：
  读取购物车
  重新算价
  准备地址
  生成订单号

事务内：
  创建订单
  创建地址快照
  创建订单明细
  锁库存
  清理购物车
  锁优惠券
```

为什么重新算价放在事务外：

- 算价可能需要读取商品、促销、优惠券、运费。
- 事务时间越短越好。
- 真正影响数据一致性的写操作放在事务内。

但要注意：

- 创建订单时仍然要在事务内锁库存和锁优惠券。
- 如果锁库存或锁券失败，说明预览后的状态已经变化，订单创建失败即可。

为什么事务里清理购物车：

- 订单创建成功后，已结算商品不应该还留在购物车。
- 如果清理购物车失败，事务整体回滚，避免“订单有了但购物车还在”的不一致。

为什么不在创建订单接口接收 `cartItemIds`：

- 第一版用“当前会员已勾选购物车商品”作为结算范围。
- 前端只需要控制勾选状态。
- 后端统一读取当前会员、未删除、已勾选购物车。

如果后续要支持“立即购买”，可以新增：

```text
source = cart | buy_now
skuId
qty
```

但第一版先不要混在一起。

## 11. 第八步：订单详情和列表

创建订单后，需要能查看订单。

### 11.1 `order.service.ts`

```ts
async list(
  member: CurrentMemberPayload,
  query: { status?: string; page?: number; pageSize?: number },
) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 20;

  const where = {
    tenantId: member.tenantId,
    memberId: member.memberId,
    status: query.status,
    deletedAt: null,
  };

  const [items, total] = await Promise.all([
    this.prisma.ecOrder.findMany({
      where,
      include: {
        items: {
          where: { deletedAt: null },
          take: 3,
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: 'desc',
      },
    }),
    this.prisma.ecOrder.count({ where }),
  ]);

  return {
    total,
    items: items.map((order) => ({
      id: order.id.toString(),
      orderNo: order.orderNo,
      status: order.status,
      payStatus: order.payStatus,
      payableAmount: order.payableAmount.toString(),
      createdAt: order.createdAt.toISOString(),
      items: order.items.map((item) => ({
        title: item.productTitle,
        imageUrl: item.imageUrl,
        qty: item.qty.toString(),
      })),
    })),
  };
}

async detail(member: CurrentMemberPayload, id: string) {
  const order = await this.prisma.ecOrder.findFirst({
    where: {
      id: BigInt(id),
      tenantId: member.tenantId,
      memberId: member.memberId,
      deletedAt: null,
    },
    include: {
      items: {
        where: { deletedAt: null },
      },
      address: true,
    },
  });

  if (!order) {
    throw new NotFoundException('订单不存在');
  }

  return {
    id: order.id.toString(),
    orderNo: order.orderNo,
    status: order.status,
    payStatus: order.payStatus,
    deliveryStatus: order.deliveryStatus,
    goodsAmount: order.goodsAmount.toString(),
    discountAmount: order.discountAmount.toString(),
    freightAmount: order.freightAmount.toString(),
    payableAmount: order.payableAmount.toString(),
    priceSnapshot: order.priceSnapshot,
    address: order.address,
    items: order.items.map((item) => ({
      id: item.id.toString(),
      productId: item.productId.toString(),
      skuId: item.skuId.toString(),
      productTitle: item.productTitle,
      skuSpecJson: item.skuSpecJson,
      imageUrl: item.imageUrl,
      salePrice: item.salePrice.toString(),
      qty: item.qty.toString(),
      goodsAmount: item.goodsAmount.toString(),
      discountAmount: item.discountAmount.toString(),
      payableAmount: item.payableAmount.toString(),
    })),
  };
}
```

为什么详情查询必须带 `memberId`：

- 小程序用户只能看自己的订单。
- 不能只按订单 id 查询，否则可能越权。
- 后台订单详情才可以按管理员权限查询所有订单。

## 12. 第九步：取消订单释放库存和优惠券

创建订单后，如果用户取消订单，或者订单超时未支付，必须释放资源：

```text
释放库存：
  availableQty += lockedQty
  lockedQty -= lockedQty
  stock_lock.status = released
  写库存流水

释放优惠券：
  locked -> available
  清空 lockedOrderId
```

### 12.1 `inventory.service.ts`

```ts
async releaseOrderStock(
  tx: Tx,
  input: {
    tenantId: bigint;
    orderId: bigint;
    orderNo: string;
    reason: string;
  },
) {
  const locks = await tx.ecStockLock.findMany({
    where: {
      tenantId: input.tenantId,
      orderId: input.orderId,
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

    const beforeAvailableQty = Number(balance?.availableQty ?? 0);
    const nextAvailableQty = beforeAvailableQty + Number(lock.qty);

    await tx.ecStockBalance.update({
      where: {
        tenantId_warehouseId_skuId: {
          tenantId: lock.tenantId,
          warehouseId: lock.warehouseId,
          skuId: lock.skuId,
        },
      },
      data: {
        availableQty: {
          increment: lock.qty,
        },
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
        movementNo: this.createStockMovementNo(),
        bizType: 'order_cancel_release',
        bizId: input.orderId,
        direction: 'in',
        qty: lock.qty,
        beforeQty: beforeAvailableQty,
        afterQty: nextAvailableQty,
        remark: `${input.reason} ${input.orderNo}`,
      },
    });

    await tx.ecStockLock.update({
      where: {
        id: lock.id,
      },
      data: {
        status: 'released',
        releasedAt: new Date(),
      },
    });
  }
}
```

为什么释放库存只处理 `status = locked`：

- 已释放的锁不能重复释放。
- 已支付扣减的锁不能再释放到可售库存。
- 状态过滤是防重复释放的关键。

### 12.2 `order.service.ts`

```ts
async cancel(member: CurrentMemberPayload, id: string) {
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

  if (order.status !== 'pending_payment' || order.payStatus !== 'unpaid') {
    throw new BadRequestException('当前订单不可取消');
  }

  await this.prisma.$transaction(async (tx) => {
    await this.inventoryService.releaseOrderStock(tx, {
      tenantId: order.tenantId,
      orderId: order.id,
      orderNo: order.orderNo,
      reason: '取消订单释放库存',
    });

    if (order.couponId) {
      await this.marketingService.releaseCoupon(tx, {
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
        status: 'cancelled',
        cancelledAt: new Date(),
      },
    });
  });

  return this.detail(member, id);
}
```

为什么取消订单也要用事务：

- 释放库存、释放优惠券、更新订单状态必须一起成功。
- 如果库存释放了但订单没取消，会导致状态不一致。
- 如果订单取消了但库存没释放，会导致库存被永久占用。

## 13. 第十步：超时未支付关单

创建订单锁库存后，用户可能不支付。不能让库存永久锁住。

所以需要定时任务：

```text
每隔一段时间扫描：
  status = pending_payment
  payStatus = unpaid
  createdAt <= 当前时间 - 30 分钟

找到后：
  释放库存
  释放优惠券
  订单改为 cancelled
```

### 13.1 `order-lifecycle.service.ts`

```ts
async closeExpiredUnpaidOrders() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);

  const orders = await this.prisma.ecOrder.findMany({
    where: {
      status: 'pending_payment',
      payStatus: 'unpaid',
      createdAt: {
        lte: cutoff,
      },
      deletedAt: null,
    },
    select: {
      id: true,
      tenantId: true,
      memberId: true,
      orderNo: true,
      couponId: true,
    },
    take: 100,
  });

  for (const order of orders) {
    await this.prisma.$transaction(async (tx) => {
      const latest = await tx.ecOrder.findFirst({
        where: {
          id: order.id,
          status: 'pending_payment',
          payStatus: 'unpaid',
          deletedAt: null,
        },
      });

      if (!latest) {
        return;
      }

      await this.inventoryService.releaseOrderStock(tx, {
        tenantId: latest.tenantId,
        orderId: latest.id,
        orderNo: latest.orderNo,
        reason: '超时关单释放库存',
      });

      if (latest.couponId) {
        await this.marketingService.releaseCoupon(tx, {
          tenantId: latest.tenantId,
          memberId: latest.memberId,
          couponId: latest.couponId,
          orderId: latest.id,
        });
      }

      await tx.ecOrder.update({
        where: { id: latest.id },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
        },
      });
    });
  }

  return {
    affected: orders.length,
  };
}
```

为什么循环里还要重新查一次订单状态：

- 扫描到订单后，用户可能刚好支付成功。
- 如果不二次确认，可能错误关闭已支付订单。
- 事务内再次检查当前状态，是定时任务防误伤的常见写法。

## 14. 第十一步：幂等防重复提交

创建订单接口最怕重复提交：

```text
用户快速双击提交
网络超时后前端重试
小程序重复发请求
网关重放请求
```

如果不做幂等，可能出现：

- 同一个购物车生成多个订单。
- 库存被锁多次。
- 优惠券被重复锁定。
- 用户看到多个待支付订单。

前端禁用按钮有用，但不够：

- 网络重试可能绕过按钮状态。
- 用户可能刷新页面。
- 小程序可能重复触发。
- 服务端必须自己保证幂等。

### 14.1 幂等请求头

客户端创建订单时带：

```text
Idempotency-Key: uuid-from-client
```

同一个用户、同一个接口、同一个 key：

- 请求体一样：返回第一次结果。
- 请求体不同：拒绝，提示 key 冲突。
- 第一次还在处理：拒绝或等待。

### 14.2 幂等表 `sys_idempotency_key`

```text
sys_idempotency_key
  id
  key_hash
  request_hash
  status
  response_json
  expired_at
  created_at
  updated_at
```

为什么不直接保存原始 key：

- key 可能很长。
- key 可能带业务含义。
- hash 后存储更稳定，也方便唯一索引。

为什么 `requestHash` 很重要：

- 同一个 key 只能代表同一个请求。
- 如果同一个 key 换了请求体，说明客户端复用了 key。
- 这时必须拒绝，否则会返回不对应的订单结果。

### 14.3 `idempotency.interceptor.ts`

```ts
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { Observable, from, of, switchMap, map } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const key = request.headers['idempotency-key'];

    if (!key || request.method !== 'POST') {
      return next.handle();
    }

    const principal = this.resolvePrincipal(request);
    const path = request.url.split('?')[0];
    const keyHash = this.hash(
      [principal.scope, principal.tenantId, principal.actorId, path, key].join('|'),
    );
    const requestHash = this.hash(
      JSON.stringify({
        method: request.method,
        path,
        body: request.body,
      }),
    );

    const existing = await this.prisma.sysIdempotencyKey.findUnique({
      where: { keyHash },
    });

    if (existing && existing.expiredAt.getTime() > Date.now()) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException('Idempotency-Key conflict');
      }

      if (existing.status === 'processing') {
        throw new ConflictException('Request is already processing');
      }

      return of(existing.responseJson);
    }

    await this.prisma.sysIdempotencyKey.upsert({
      where: { keyHash },
      create: {
        keyHash,
        requestHash,
        status: 'processing',
        responseJson: {},
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      update: {
        requestHash,
        status: 'processing',
        responseJson: {},
        expiredAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return next.handle().pipe(
      switchMap((response) =>
        from(
          this.prisma.sysIdempotencyKey.update({
            where: { keyHash },
            data: {
              status: 'succeeded',
              responseJson: response,
            },
          }),
        ).pipe(map(() => response)),
      ),
    );
  }

  private resolvePrincipal(request: {
    member?: { tenantId: bigint; memberId: bigint };
    admin?: { tenantId: bigint; adminId: bigint };
  }) {
    if (request.member) {
      return {
        scope: 'member',
        tenantId: request.member.tenantId.toString(),
        actorId: request.member.memberId.toString(),
      };
    }

    if (request.admin) {
      return {
        scope: 'admin',
        tenantId: request.admin.tenantId.toString(),
        actorId: request.admin.adminId.toString(),
      };
    }

    return {
      scope: 'public',
      tenantId: 'public',
      actorId: 'public',
    };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
```

真实项目会更完整：

- 支持 `POST / PUT / PATCH / DELETE`。
- 缓存统一响应格式。
- 失败响应也记录。
- 排除支付回调路径。
- 加入 `traceId`。

为什么支付回调通常不走普通幂等拦截器：

- 支付平台回调有自己的签名和通知 id。
- 回调幂等通常按支付流水号、平台交易号处理。
- 不能简单依赖客户端传的 `Idempotency-Key`。

## 15. 第十二步：Controller 暴露接口

### 15.1 `order.controller.ts`

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderService } from './order.service';

@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post()
  create(@CurrentMember() member, @Body() dto: CreateOrderDto) {
    return this.orderService.create(member, dto);
  }

  @Get()
  list(@CurrentMember() member, @Query() query) {
    return this.orderService.list(member, query);
  }

  @Get('/:id')
  detail(@CurrentMember() member, @Param('id') id: string) {
    return this.orderService.detail(member, id);
  }

  @Post('/:id/cancel')
  cancel(@CurrentMember() member, @Param('id') id: string) {
    return this.orderService.cancel(member, id);
  }
}
```

为什么取消订单用 `POST`，不是 `DELETE`：

- 取消订单不是删除订单。
- 它是一个状态流转动作。
- 还会释放库存、释放优惠券、写流水。
- 用 `POST /:id/cancel` 更能表达业务动作。

## 16. 第十三步：接口调用顺序

### 16.1 登录

```bash
curl -X POST http://localhost:3000/api/app/v1/auth/mock-login \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"dev-user-001\",\"nickname\":\"学习用户\"}"
```

### 16.2 加购并勾选商品

```bash
curl -X POST http://localhost:3000/api/app/v1/cart/items \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{\"skuId\":\"1\",\"qty\":2}"
```

### 16.3 订单预览

```bash
curl -X POST http://localhost:3000/api/app/v1/orders/preview \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{\"couponId\":\"1\"}"
```

### 16.4 创建订单

```bash
curl -X POST http://localhost:3000/api/app/v1/orders \
  -H "Authorization: Bearer <accessToken>" \
  -H "Idempotency-Key: 7fe8f1a9-6c9d-4d1e-9b2e-order-create-001" \
  -H "Content-Type: application/json" \
  -d "{
    \"couponId\":\"1\",
    \"remark\":\"请尽快发货\",
    \"address\": {
      \"receiverName\":\"张三\",
      \"receiverPhone\":\"13800138000\",
      \"province\":\"广东省\",
      \"city\":\"深圳市\",
      \"district\":\"南山区\",
      \"detail\":\"科技园 1 号\",
      \"postalCode\":\"518000\"
    }
  }"
```

### 16.5 查看订单详情

```bash
curl http://localhost:3000/api/app/v1/orders/<orderId> \
  -H "Authorization: Bearer <accessToken>"
```

### 16.6 取消订单

```bash
curl -X POST http://localhost:3000/api/app/v1/orders/<orderId>/cancel \
  -H "Authorization: Bearer <accessToken>" \
  -H "Idempotency-Key: cancel-order-001"
```

## 17. 本章和真实 ERP 项目的对应关系

真实项目中可以重点看：

```text
server/src/modules/order/order.controller.ts
server/src/modules/order/order.service.ts
server/src/modules/order/dto/create-order.dto.ts
server/src/modules/order/dto/order-address.dto.ts

server/src/modules/inventory/inventory.service.ts
server/src/modules/marketing/marketing.service.ts
server/src/common/interceptors/idempotency.interceptor.ts

server/prisma/schema.prisma
  SysIdempotencyKey
  EcStockBalance
  EcStockMovement
  EcStockLock
  EcCartItem
  EcOrder
  EcOrderAddress
  EcOrderItem
  MkCoupon
```

简易版和真实项目的区别：

| 能力 | 教学版 | 真实项目 |
| --- | --- | --- |
| 事务 | Prisma 风格示例 | `prisma.$transaction` |
| 金额 | 简化字符串/number | Decimal |
| 库存 | 单仓锁库存 | 默认仓库 + 库存余额 |
| 防超卖 | 条件更新 | `updateMany availableQty >= qty` |
| 优惠券 | 锁定/释放/使用 | `available/locked/used` 状态 |
| 幂等 | 教学版拦截器 | 全局 `IdempotencyInterceptor` |
| 超时关单 | 示例定时任务 | OrderService 生命周期扫描 |
| 支付扣库存 | 下一章强化 | mock pay 已有闭环 |

