现在小程序端已经能看到商品，也知道当前用户是谁。下一步就是用户真正产生购买意图：

```text
选择 SKU
  -> 加入购物车
  -> 修改数量
  -> 勾选结算商品
  -> 服务端重新读取商品价格和库存
  -> 计算优惠、优惠券、运费
  -> 返回订单预览
```

本章只做到“订单预览”，不真正创建订单。真正创建订单、事务、锁库存、幂等，要把“订单预览”和“创建订单”拆开学习：

- 订单预览只负责计算，不落订单。
- 创建订单会涉及事务、库存锁定、优惠券锁定、订单号、支付状态，复杂度更高。
- 先把算价规则学清楚，下一章做交易事务才不会混乱。
- 前端展示的价格只能用于显示，订单预览和下单金额必须由服务端重新计算

本章目标最终实现这些接口：

```text
购物车：
GET    /api/app/v1/cart
POST   /api/app/v1/cart/items
PUT    /api/app/v1/cart/items/:id
DELETE /api/app/v1/cart/items/:id

订单预览：
GET  /api/app/v1/orders/preview
POST /api/app/v1/orders/preview
```

本章会实现：

- 加入购物车。
- 同一个 SKU 重复加购时累加数量。
- 修改购物车数量。
- 勾选和取消勾选购物车商品。
- 删除购物车商品。
- 读取已勾选商品生成订单预览。
- 服务端重新读取 SKU 价格、商品状态和库存。
- 计算商品金额、促销优惠、优惠券优惠、运费、应付金额。
- 返回地址、优惠券和价格明细。

真实 ERP 项目中，对应表和模块主要是：

```text
ec_cart_item
ec_product
ec_sku
ec_stock_balance
ec_member_address
mk_coupon
mk_promotion
mk_freight_template

CartModule
OrderModule.preview
MarketingModule.previewOrderAdjustments
```

## 先做购物车，再做订单预览

你可能会问：用户点“立即购买”，能不能直接创建订单？可以，但真实商城通常仍然需要一个结算预览步骤。原因是：

- 用户看到商品详情页价格后，价格可能已经变化。
- SKU 可能下架。
- 库存可能不足。
- 用户可能选择优惠券。
- 用户地址不同，运费可能不同。
- 促销规则可能按订单总额计算。
- 创建订单之前，要让用户确认“最终应付金额”。

所以完整流程更像：

```text
商品详情页价格
  -> 只是展示

购物车金额
  -> 只是当前购物车粗略汇总

订单预览金额
  -> 服务端正式计算

订单创建金额
  -> 再算一次，并作为订单金额快照保存
```

为什么创建订单时还要再算一次：

- 用户可能在预览后停留很久。
- 商品价格、库存、优惠券状态可能已经变化。
- 前端提交的金额不能被信任。
- 创建订单必须以服务端最新计算结果为准。

## 购物车表设计

初学者可能会设计：

```text
cart
  id
  memberId
  productId
  qty
```

这会很快遇到问题：

- 用户买的是 SKU，不是 SPU。
- 同一个商品有多个规格，不同 SKU 价格和库存不同。
- 购物车要记录是否勾选。
- 用户删除购物车后，可能还要保留历史排查数据。
- 同一个会员同一个 SKU 不应该出现多行。

所以真实项目的购物车表更像：

```text
ec_cart_item
  id
  tenant_id
  member_id
  product_id
  sku_id
  qty
  checked
  added_at
  created_at
  updated_at
  deleted_at
```

关键唯一约束：

```text
tenant_id + member_id + sku_id 唯一
```

为什么唯一约束不用 `productId`：

- 同一个商品下可以买不同规格。
- 例如同一个 T 恤，黑色 M 和白色 L 是两个 SKU。
- 购物车应该允许两个 SKU 同时存在。

为什么购物车里同时存 `productId` 和 `skuId`：

- `skuId` 表示买哪个具体规格。
- `productId` 方便关联商品标题、主图、上下架状态。
- 查询购物车时可以少绕一层关系。

为什么购物车数量用 `Decimal`，教学版可以先用 `number`：

- 普通电商按件卖，`number` 整数足够。
- ERP 可能卖称重商品、散装商品、长度商品，比如 1.5kg、2.25m。
- 真实表用 Decimal 更通用。
- 教学版先限制 `qty >= 1`，降低理解成本。

为什么购物车删除用软删除：

- 用户删除后重新加购同一个 SKU，可以恢复旧记录。
- 便于排查用户行为。
- 真实业务里也可以用于运营分析。

## 定义类型

### `cart.types.ts`

```ts
export type CartItem = {
  id: string;
  tenantId: string;
  memberId: string;
  productId: string;
  skuId: string;
  qty: number;
  checked: boolean;
  addedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type ProductSkuSnapshot = {
  productId: string;
  skuId: string;
  title: string;
  subTitle?: string;
  imageUrl?: string;
  skuNo: string;
  spec: Record<string, string>;
  salePrice: number;
  stockQty: number;
  saleStatus: 'on_sale' | 'off_sale' | 'draft';
  skuStatus: 'enabled' | 'disabled';
};

export type CartItemView = {
  id: string;
  productId: string;
  skuId: string;
  title: string;
  subTitle?: string;
  imageUrl?: string;
  skuNo: string;
  spec: Record<string, string>;
  salePrice: string;
  qty: number;
  checked: boolean;
  stockQty: number;
  goodsAmount: string;
  saleStatus: string;
  skuStatus: string;
};

export type CurrentMemberPayload = {
  tenantId: string;
  memberId: string;
  openid?: string;
};
```

为什么定义 `ProductSkuSnapshot`：

- 购物车展示需要商品标题、图片、SKU 规格、价格、库存。
- 这些信息来自商品中心，不应该直接写死在购物车模块里。
- 用一个快照类型表达“购物车模块需要从商品模块读取什么”。

注意：这里的 `Snapshot` 是查询时的展示快照，不是订单快照。订单快照会在后面保存到：

```text
ec_order.price_snapshot_json
ec_order_item.product_title
ec_order_item.sku_spec_json
ec_order_item.sale_price
ec_order_address
```

## 定义 DTO

### `add-cart-item.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsInt, IsString, Min } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  skuId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty!: number;
}
```

为什么加购物车传 `skuId`，不是 `productId`：

- 买的是具体规格。
- SKU 才有明确价格。
- SKU 才有明确库存。
- 商品详情页必须让用户选择规格后才能加购。

### `update-cart-item.dto.ts`

```ts
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

export class UpdateCartItemDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;

  @IsOptional()
  @IsBoolean()
  checked?: boolean;
}
```

为什么修改购物车时 `qty` 和 `checked` 都是可选：

- 用户可能只改数量。
- 用户可能只勾选或取消勾选。
- 一个接口可以覆盖两种轻量操作。

为什么 `qty` 最小是 1，而不是允许 0：

- 数量为 0 的语义不清晰。
- 要删除就调用 `DELETE /cart/items/:id`。
- 修改数量和删除分开，接口更清楚。

### `preview-order.dto.ts`

```ts
import { IsOptional, IsString } from 'class-validator';

export class PreviewOrderDto {
  @IsOptional()
  @IsString()
  couponId?: string;

  @IsOptional()
  @IsString()
  addressId?: string;
}
```

真实项目当前预览 DTO 主要有 `couponId`。教学版可以先把 `addressId` 也写进去，帮助理解运费和地址选择。

为什么订单预览传 `couponId`，不传优惠金额：

- 优惠金额必须由服务端根据优惠券状态、门槛、有效期计算。
- 前端传优惠金额很容易被篡改。
- 前端只告诉服务端“用户想用哪张券”。

为什么订单预览可以传 `addressId`：

- 运费可能和地址有关。
- 第一版可以只按订单金额算运费，后续可以扩展到地区运费。
- 订单创建时仍然要保存地址快照。

## 定义商品读取接口

购物车模块需要读商品和 SKU，但不应该知道商品模块内部怎么存。

### `catalog-reader.ts`

```ts
import { ProductSkuSnapshot } from '../cart/cart.types';

export interface CatalogReader {
  findSkuForCart(tenantId: string, skuId: string): Promise<ProductSkuSnapshot | null>;
}
```

为什么不直接在 `CartService` 里写商品查询：

- 商品中心未来可能从 MySQL 换成搜索服务加缓存。
- 购物车只关心“这个 SKU 能不能买、价格多少、库存多少”。
- 依赖接口比依赖具体表结构更稳定。

第一版可以由 `CatalogService` 实现：

```ts
export class CatalogService implements CatalogReader {
  async findSkuForCart(tenantId: string, skuId: string) {
    const sku = await this.findSkuById(tenantId, skuId);
    if (!sku) return null;

    return {
      productId: sku.productId,
      skuId: sku.id,
      title: sku.productTitle,
      imageUrl: sku.imageUrl || sku.productMainImageUrl,
      skuNo: sku.skuNo,
      spec: sku.spec,
      salePrice: sku.salePrice,
      stockQty: sku.stockQty,
      saleStatus: sku.productSaleStatus,
      skuStatus: sku.status,
    };
  }
}
```

## 购物车存储：Prisma + MySQL

当前项目没有 `cart.repository.ts`。购物车直接由 `CartService` 注入 `PrismaService` 读写 `ec_cart_item`，同一个会员同一个 SKU 通过数据库唯一键合并。

### 真实唯一键

```prisma
model EcCartItem {
  tenantId  BigInt @map("tenant_id")
  memberId  BigInt @map("member_id")
  skuId     BigInt @map("sku_id")
  qty       Decimal
  checked   Boolean
  deletedAt DateTime? @map("deleted_at")

  @@unique([tenantId, memberId, skuId], map: "uk_cart_member_sku")
  @@map("ec_cart_item")
}
```

为什么加购要围绕这个唯一键：

- 用户删除过某 SKU 后重新加购，可以恢复原记录。
- 用户重复加购同一 SKU，要累加数量。
- 这两个行为都围绕“同一个会员同一个 SKU 只有一行”。
- 并发情况下，业务层先查仍然不够，还要靠数据库唯一约束兜底。

## 实现 CartService

### `cart.service.ts`

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentMemberPayload } from '../../common/decorators/current-member.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async getCart(member: CurrentMemberPayload) {
    const items = await this.prisma.ecCartItem.findMany({
      where: {
        tenantId: member.tenantId,
        memberId: member.memberId,
        deletedAt: null,
      },
      include: {
        product: true,
        sku: {
          include: {
            balances: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        addedAt: 'desc',
      },
    });

    const mappedItems = items.map((item) => this.toCartItem(item));
    const checkedItems = mappedItems.filter((item) => item.checked);
    const totalQty = mappedItems.reduce((sum, item) => sum + item.qty, 0);
    const checkedQty = checkedItems.reduce((sum, item) => sum + item.qty, 0);
    const checkedAmount = checkedItems.reduce(
      (sum, item) => sum + item.qty * Number(item.salePrice),
      0,
    );

    return {
      items: mappedItems,
      totalQty,
      checkedQty,
      checkedAmount: checkedAmount.toFixed(2),
    };
  }

  async addItem(member: CurrentMemberPayload, dto: AddCartItemDto) {
    const sku = await this.prisma.ecSku.findFirst({
      where: {
        id: BigInt(dto.skuId),
        tenantId: member.tenantId,
        deletedAt: null,
        status: 'enabled',
        product: {
          deletedAt: null,
          saleStatus: 'on_sale',
        },
      },
      include: {
        product: true,
        balances: {
          where: {
            deletedAt: null,
          },
        },
      },
    });
    if (!sku) {
      throw new NotFoundException('SKU 不存在或未上架');
    }

    const availableQty = sku.balances.reduce(
      (sum, balance) => sum + Number(balance.availableQty),
      0,
    );
    if (availableQty < dto.qty) {
      throw new BadRequestException('库存不足');
    }

    const existingItem = await this.prisma.ecCartItem.findUnique({
      where: {
        tenantId_memberId_skuId: {
          tenantId: member.tenantId,
          memberId: member.memberId,
          skuId: sku.id,
        },
      },
    });

    if (existingItem && !existingItem.deletedAt) {
      await this.prisma.ecCartItem.update({
        where: {
          id: existingItem.id,
        },
        data: {
          qty: new Prisma.Decimal(existingItem.qty).plus(dto.qty),
          checked: true,
        },
      });
    } else if (existingItem) {
      await this.prisma.ecCartItem.update({
        where: {
          id: existingItem.id,
        },
        data: {
          productId: sku.productId,
          qty: dto.qty,
          checked: true,
          deletedAt: null,
          addedAt: new Date(),
        },
      });
    } else {
      await this.prisma.ecCartItem.create({
        data: {
          tenantId: member.tenantId,
          memberId: member.memberId,
          productId: sku.productId,
          skuId: sku.id,
          qty: dto.qty,
          checked: true,
        },
      });
    }

    return this.getCart(member);
  }

  async updateItem(
    member: CurrentMemberPayload,
    id: string,
    dto: UpdateCartItemDto,
  ) {
    const item = await this.getMemberCartItem(member, id);
    const data: Prisma.EcCartItemUpdateInput = {};
    if (dto.qty !== undefined) {
      data.qty = dto.qty;
    }
    if (dto.checked !== undefined) {
      data.checked = dto.checked;
    }

    await this.prisma.ecCartItem.update({
      where: {
        id: item.id,
      },
      data,
    });

    return this.getCart(member);
  }

  async deleteItem(member: CurrentMemberPayload, id: string) {
    const item = await this.getMemberCartItem(member, id);
    await this.prisma.ecCartItem.update({
      where: {
        id: item.id,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    return this.getCart(member);
  }

  private async getMemberCartItem(member: CurrentMemberPayload, id: string) {
    const item = await this.prisma.ecCartItem.findFirst({
      where: {
        id: BigInt(id),
        tenantId: member.tenantId,
        memberId: member.memberId,
        deletedAt: null,
      },
    });
    if (!item) {
      throw new NotFoundException('购物车商品不存在');
    }
    return item;
  }

  private toCartItem(item: Prisma.EcCartItemGetPayload<{
    include: {
      product: true;
      sku: {
        include: {
          balances: true;
        };
      };
    };
  }>) {
    const stockQty = item.sku.balances.reduce(
      (sum, balance) => sum + Number(balance.availableQty),
      0,
    );

    return {
      id: item.id.toString(),
      productId: item.productId.toString(),
      skuId: item.skuId.toString(),
      title: item.product.title,
      subTitle: item.product.subTitle,
      imageUrl: item.sku.imageUrl || item.product.mainImageUrl,
      skuNo: item.sku.skuNo,
      specJson: item.sku.specJson,
      salePrice: Number(item.sku.salePrice).toFixed(2),
      qty: Number(item.qty),
      checked: item.checked,
      stockQty,
      saleStatus: item.product.saleStatus,
      skuStatus: item.sku.status,
    };
  }
}
```

这段代码里的关键规则：

```text
加购前检查 SKU 是否存在
  -> 检查商品是否上架、SKU 是否启用
  -> 汇总库存余额 availableQty
  -> 检查库存是否够
  -> 按 tenantId_memberId_skuId 唯一键查购物车
  -> 未删除则累加数量
  -> 已软删除则恢复
  -> 不存在则新建
```

为什么购物车展示时还要重新查商品：

- 商品标题、图片、价格可能变化。
- 商品可能下架。
- 库存可能变化。
- 购物车不应该长期保存旧价格当作最终价格。

为什么购物车里可以显示“商品已下架”，而不是直接删除：

- 用户体验更清楚。
- 用户知道之前加购的商品为什么不能买。
- 删除应该由用户主动操作，或者后端定时清理。

为什么加购时检查库存，但下单时还要再检查：

- 加购时库存够，不代表下单时还够。
- 购物车不是库存占用。
- 真正占库存要等创建订单时锁库存

## 实现 CartController

### `cart.controller.ts`

```ts
import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { CartService } from './cart.service';
import { CurrentMemberPayload } from './cart.types';

@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  getCart(@CurrentMember() member: CurrentMemberPayload) {
    return this.cartService.getCart(member);
  }

  @Post('/items')
  addItem(
    @CurrentMember() member: CurrentMemberPayload,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(member, dto);
  }

  @Put('/items/:id')
  updateItem(
    @CurrentMember() member: CurrentMemberPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(member, id, dto);
  }

  @Delete('/items/:id')
  deleteItem(
    @CurrentMember() member: CurrentMemberPayload,
    @Param('id') id: string,
  ) {
    return this.cartService.deleteItem(member, id);
  }
}
```

为什么购物车接口全部需要 `MemberAuthGuard`：

- 购物车是会员私有数据。
- 未登录用户没有稳定 `memberId`。
- 如果要做游客购物车，可以先存在前端本地，登录后合并到服务端购物车。

游客购物车为什么不建议第一版就做：

- 会多出本地购物车合并逻辑。
- 会遇到 SKU 下架、重复合并、数量冲突。
- 初学阶段先做登录会员购物车，主链路更清楚。

## 订单预览要独立成 OrderModule

购物车只回答：

```text
我现在想买哪些 SKU，每个买几个，哪些被勾选
```

订单预览回答：

```text
这些 SKU 现在能不能结算
商品金额是多少
促销优惠是多少
优惠券能不能用
运费是多少
最后应付是多少
默认地址是什么
```

所以订单预览更适合放在 `OrderModule`。

原因：

- 订单预览是订单创建的前置步骤。
- 预览和创建订单应该复用同一套算价逻辑。
- 后面创建订单时会把预览结果变成订单价格快照。

## 定义订单预览类型

### `order-preview.types.ts`

```ts
export type PreviewItem = {
  cartItemId: string;
  productId: string;
  skuId: string;
  title: string;
  imageUrl?: string;
  spec: Record<string, string>;
  salePrice: string;
  qty: number;
  stockQty: number;
  goodsAmount: string;
  promotionDiscountAmount: string;
  payableAmount: string;
  promotion?: {
    id: string;
    name: string;
    activityPrice?: string;
  } | null;
};

export type PreviewCoupon = {
  id: string;
  name: string;
  thresholdAmount: string;
  discountAmount: string;
} | null;

export type OrderPreview = {
  items: PreviewItem[];
  goodsAmount: string;
  promotionDiscountAmount: string;
  couponDiscountAmount: string;
  discountAmount: string;
  freightAmount: string;
  payableAmount: string;
  coupon: PreviewCoupon;
  address?: {
    id: string;
    receiverName: string;
    receiverPhone: string;
    province: string;
    city: string;
    district: string;
    detail: string;
  } | null;
};
```

为什么金额返回字符串：

- 金额不能用浮点数随意传来传去。
- 数据库通常用 Decimal。
- API 返回字符串可以避免前端出现精度问题。
- 前端展示时按字符串或高精度库处理。

教学版内部为了容易理解会用 `number` 计算，并用 `toFixed(2)` 返回。真实项目建议使用 Decimal 库或数据库 Decimal。

## 实现营销计算服务

为了让订单预览看起来像真实商城，本章加一个简化版 `MarketingService`。

第一版只做三件事：

```text
单品活动价
  -> 优惠券
  -> 运费
```

### 12.1 `marketing.service.ts`

```ts
import { BadRequestException, Injectable } from '@nestjs/common';

type PreviewAdjustmentInput = {
  tenantId: string;
  shopId: string;
  items: Array<{
    cartItemId: string;
    productId: string;
    skuId: string;
    salePrice: number;
    qty: number;
  }>;
  goodsAmount: number;
};

type Coupon = {
  id: string;
  tenantId: string;
  memberId: string;
  name: string;
  thresholdAmount: number;
  discountAmount: number;
  status: 'unused' | 'used' | 'expired';
  expiredAt: Date;
};

@Injectable()
export class MarketingService {
  private coupons: Coupon[] = [];

  async previewOrderAdjustments(input: PreviewAdjustmentInput) {
    const itemDiscounts = new Map<
      string,
      {
        promotionId: string;
        promotionName: string;
        activityPrice: number;
        discountAmount: number;
      }
    >();

    for (const item of input.items) {
      const activityPrice = this.findActivityPrice(item.productId, item.skuId);
      if (activityPrice === null) {
        continue;
      }

      const discountAmount = Math.max(item.salePrice - activityPrice, 0) * item.qty;
      if (discountAmount > 0) {
        itemDiscounts.set(item.cartItemId, {
          promotionId: 'promotion-activity-price',
          promotionName: '限时活动价',
          activityPrice,
          discountAmount: this.roundMoney(discountAmount),
        });
      }
    }

    const promotionDiscountAmount = Array.from(itemDiscounts.values()).reduce(
      (sum, item) => sum + item.discountAmount,
      0,
    );

    const subtotalAfterPromotions = Math.max(
      input.goodsAmount - promotionDiscountAmount,
      0,
    );

    const freightAmount = this.previewFreight(subtotalAfterPromotions);

    return {
      itemDiscounts,
      promotionDiscountAmount: this.roundMoney(promotionDiscountAmount),
      subtotalAfterPromotions: this.roundMoney(subtotalAfterPromotions),
      freightAmount,
      freightRule:
        freightAmount === 0
          ? '满 99 包邮'
          : '未满 99 元收取 10 元运费',
    };
  }

  async previewCoupon(input: {
    tenantId: string;
    memberId: string;
    couponId?: string;
    amountForCoupon: number;
  }) {
    if (!input.couponId) {
      return null;
    }

    const coupon = this.coupons.find(
      (item) =>
        item.id === input.couponId &&
        item.tenantId === input.tenantId &&
        item.memberId === input.memberId,
    );

    if (!coupon) {
      throw new BadRequestException('优惠券不存在');
    }

    if (coupon.status !== 'unused') {
      throw new BadRequestException('优惠券不可用');
    }

    if (coupon.expiredAt.getTime() <= Date.now()) {
      throw new BadRequestException('优惠券已过期');
    }

    if (input.amountForCoupon < coupon.thresholdAmount) {
      throw new BadRequestException('未达到优惠券使用门槛');
    }

    return {
      id: coupon.id,
      name: coupon.name,
      thresholdAmount: coupon.thresholdAmount.toFixed(2),
      discountAmount: Math.min(coupon.discountAmount, input.amountForCoupon).toFixed(2),
    };
  }

  private findActivityPrice(productId: string, skuId: string) {
    if (productId === 'demo-product-1' && skuId === 'demo-sku-1') {
      return 79;
    }

    return null;
  }

  private previewFreight(amount: number) {
    return amount >= 99 ? 0 : 10;
  }

  private roundMoney(value: number) {
    return Number(value.toFixed(2));
  }
}
```

为什么营销计算单独放到 `MarketingService`：

- 订单模块不应该塞满促销规则。
- 促销会越来越复杂：满减、折扣、N 件优惠、指定商品、指定渠道、指定会员等级。
- 运费也可能独立成模板：满额包邮、地区运费、重量运费。
- 单独模块方便后面替换规则引擎或扩展营销玩法。

为什么第一版促销只做活动价：

- 活动价最容易理解：原价 99，活动价 79，优惠 20。
- 可以先训练“每个订单项有自己的优惠”。
- 后面再扩展整单满减、优惠券叠加、互斥规则。

为什么优惠券按 `amountForCoupon` 校验门槛：

- 优惠券通常不能按原始商品总额直接算。
- 可能要先扣除单品促销，再判断是否满减。
- 具体规则要看业务，这里先采用“促销后金额参与优惠券门槛”。

## 实现订单预览服务

### `order.service.ts`

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { CartService } from '../cart/cart.service';
import { CatalogReader } from '../catalog/catalog-reader';
import { MarketingService } from '../marketing/marketing.service';
import { MemberAddressReader } from '../member/member-address-reader';
import { CurrentMemberPayload } from '../cart/cart.types';
import { PreviewOrderDto } from './dto/preview-order.dto';

@Injectable()
export class OrderService {
  constructor(
    private readonly cartService: CartService,
    private readonly catalogReader: CatalogReader,
    private readonly marketingService: MarketingService,
    private readonly memberAddressReader: MemberAddressReader,
  ) {}

  async preview(member: CurrentMemberPayload, dto: PreviewOrderDto = {}) {
    const checkedCartItems = await this.cartService.getCheckedItems(member);

    if (checkedCartItems.length === 0) {
      throw new BadRequestException('请选择要结算的商品');
    }

    const address = dto.addressId
      ? await this.memberAddressReader.getMemberAddress(
          member.tenantId,
          member.memberId,
          dto.addressId,
        )
      : await this.memberAddressReader.getDefaultAddress(
          member.tenantId,
          member.memberId,
        );

    return this.buildPreview(member, checkedCartItems, dto.couponId, address);
  }

  private async buildPreview(
    member: CurrentMemberPayload,
    checkedCartItems: Array<{
      id: string;
      productId: string;
      skuId: string;
      qty: number;
    }>,
    couponId?: string,
    address?: {
      id: string;
      receiverName: string;
      receiverPhone: string;
      province: string;
      city: string;
      district: string;
      detail: string;
    } | null,
  ) {
    const baseItems = [];

    for (const cartItem of checkedCartItems) {
      const sku = await this.catalogReader.findSkuForCart(
        member.tenantId,
        cartItem.skuId,
      );

      if (!sku || sku.saleStatus !== 'on_sale' || sku.skuStatus !== 'enabled') {
        throw new BadRequestException('存在不可购买商品，请返回购物车处理');
      }

      if (sku.stockQty < cartItem.qty) {
        throw new BadRequestException(`${sku.title} 库存不足`);
      }

      const goodsAmount = sku.salePrice * cartItem.qty;

      baseItems.push({
        cartItemId: cartItem.id,
        productId: cartItem.productId,
        skuId: cartItem.skuId,
        title: sku.title,
        imageUrl: sku.imageUrl,
        spec: sku.spec,
        salePrice: sku.salePrice,
        qty: cartItem.qty,
        stockQty: sku.stockQty,
        goodsAmount,
      });
    }

    const goodsAmount = baseItems.reduce((sum, item) => sum + item.goodsAmount, 0);

    const adjustments = await this.marketingService.previewOrderAdjustments({
      tenantId: member.tenantId,
      shopId: 'default-shop',
      goodsAmount,
      items: baseItems.map((item) => ({
        cartItemId: item.cartItemId,
        productId: item.productId,
        skuId: item.skuId,
        salePrice: item.salePrice,
        qty: item.qty,
      })),
    });

    const items = baseItems.map((item) => {
      const itemDiscount = adjustments.itemDiscounts.get(item.cartItemId);
      const promotionDiscountAmount = itemDiscount?.discountAmount ?? 0;
      const payableAmount = Math.max(item.goodsAmount - promotionDiscountAmount, 0);

      return {
        cartItemId: item.cartItemId,
        productId: item.productId,
        skuId: item.skuId,
        title: item.title,
        imageUrl: item.imageUrl,
        spec: item.spec,
        salePrice: item.salePrice.toFixed(2),
        qty: item.qty,
        stockQty: item.stockQty,
        goodsAmount: item.goodsAmount.toFixed(2),
        promotionDiscountAmount: promotionDiscountAmount.toFixed(2),
        payableAmount: payableAmount.toFixed(2),
        promotion: itemDiscount
          ? {
              id: itemDiscount.promotionId,
              name: itemDiscount.promotionName,
              activityPrice: itemDiscount.activityPrice.toFixed(2),
            }
          : null,
      };
    });

    const coupon = await this.marketingService.previewCoupon({
      tenantId: member.tenantId,
      memberId: member.memberId,
      couponId,
      amountForCoupon: adjustments.subtotalAfterPromotions,
    });

    const couponDiscountAmount = coupon ? Number(coupon.discountAmount) : 0;
    const discountAmount =
      adjustments.promotionDiscountAmount + couponDiscountAmount;
    const payableAmount = Math.max(
      goodsAmount + adjustments.freightAmount - discountAmount,
      0,
    );

    return {
      items,
      goodsAmount: goodsAmount.toFixed(2),
      promotionDiscountAmount: adjustments.promotionDiscountAmount.toFixed(2),
      couponDiscountAmount: couponDiscountAmount.toFixed(2),
      discountAmount: discountAmount.toFixed(2),
      freightAmount: adjustments.freightAmount.toFixed(2),
      payableAmount: payableAmount.toFixed(2),
      freightRule: adjustments.freightRule,
      coupon,
      address: address ?? null,
    };
  }
}
```

这一段是本章最核心的服务端思维。订单预览一定要重新读取：

```text
SKU 当前价格
商品上下架状态
SKU 启用状态
当前库存
优惠券状态
促销规则
运费规则
会员地址
```

为什么不能直接用购物车里的价格：

- 购物车价格可能是旧的。
- 商品调价后，购物车里如果存旧价，就会产生价格争议。
- 真实项目可以在购物车里保存“加入时价格”用于展示变化提示，但结算必须读取当前可售价格。

为什么订单预览不落库：

- 用户可能只是看看价格，不一定下单。
- 每次切换优惠券、地址、勾选商品都会重新预览。
- 如果每次预览都创建订单，会产生大量脏订单。

## 实现 OrderController

### `order.controller.ts`

```ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { CurrentMemberPayload } from '../cart/cart.types';
import { PreviewOrderDto } from './dto/preview-order.dto';
import { OrderService } from './order.service';

@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get('/preview')
  previewByGet(
    @CurrentMember() member: CurrentMemberPayload,
    @Query() query: PreviewOrderDto,
  ) {
    return this.orderService.preview(member, query);
  }

  @Post('/preview')
  previewByPost(
    @CurrentMember() member: CurrentMemberPayload,
    @Body() dto: PreviewOrderDto,
  ) {
    return this.orderService.preview(member, dto);
  }
}
```

为什么同时提供 GET 和 POST：

- GET 适合简单预览，比如只传 `couponId`。
- POST 适合后面扩展复杂参数，比如临时地址、发票、积分抵扣。
- 两个接口可以复用同一个 `OrderService.preview`。

第一版也可以只保留 POST，减少接口数量。真实项目里两者都存在时，要保证行为一致。

## 组装模块

### `cart.module.ts`

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [CartController],
  providers: [CartService, MemberAuthGuard],
  exports: [CartService],
})
export class CartModule {}
```

为什么 `CartModule` 要导出 `CartService`：

- `OrderModule` 需要读取已勾选购物车商品。
- 不应该让订单模块直接读购物车表。
- 当前项目订单创建会在 `OrderService` 内重新读取已勾选购物车，并再次校验商品、库存和价格。

### `order.module.ts`

```ts
import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { CatalogModule } from '../catalog/catalog.module';
import { MarketingModule } from '../marketing/marketing.module';
import { MemberModule } from '../member/member.module';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

@Module({
  imports: [CartModule, CatalogModule, MarketingModule, MemberModule],
  controllers: [OrderController],
  providers: [OrderService],
})
export class OrderModule {}
```

为什么订单预览依赖这么多模块：

- 依赖购物车：知道用户勾选了什么。
- 依赖商品：重新确认商品价格和库存。
- 依赖会员：读取地址和会员身份。
- 依赖营销：计算促销、优惠券、运费。

这也是为什么订单模块通常是业务编排层，而不是单纯 CRUD。

## 接口调用顺序

### 登录

```bash
curl -X POST http://localhost:3000/api/app/v1/auth/mock-login \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"dev-user-001\",\"nickname\":\"学习用户\"}"
```

拿到 `accessToken`。

### 创建地址

```bash
curl -X POST http://localhost:3000/api/app/v1/addresses \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{
    \"receiverName\":\"张三\",
    \"receiverPhone\":\"13800138000\",
    \"province\":\"广东省\",
    \"city\":\"深圳市\",
    \"district\":\"南山区\",
    \"detail\":\"科技园 1 号\",
    \"isDefault\":true
  }"
```

### 加入购物车

```bash
curl -X POST http://localhost:3000/api/app/v1/cart/items \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{\"skuId\":\"1\",\"qty\":2}"
```

### 查看购物车

```bash
curl http://localhost:3000/api/app/v1/cart \
  -H "Authorization: Bearer <accessToken>"
```

### 修改数量或勾选状态

```bash
curl -X PUT http://localhost:3000/api/app/v1/cart/items/<cartItemId> \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{\"qty\":3,\"checked\":true}"
```

### 订单预览

```bash
curl -X POST http://localhost:3000/api/app/v1/orders/preview \
  -H "Authorization: Bearer <accessToken>" \
  -H "Content-Type: application/json" \
  -d "{\"couponId\":\"1\"}"
```

返回示例：

```json
{
  "items": [
    {
      "cartItemId": "cart-1",
      "productId": "product-1",
      "skuId": "sku-1",
      "title": "示例商品",
      "salePrice": "99.00",
      "qty": 2,
      "goodsAmount": "198.00",
      "promotionDiscountAmount": "20.00",
      "payableAmount": "178.00"
    }
  ],
  "goodsAmount": "198.00",
  "promotionDiscountAmount": "20.00",
  "couponDiscountAmount": "10.00",
  "discountAmount": "30.00",
  "freightAmount": "0.00",
  "payableAmount": "168.00"
}
```

## 本章和真实 ERP 项目的对应关系

真实项目中可以重点看：

```text
server/src/modules/cart/cart.controller.ts
server/src/modules/cart/cart.service.ts
server/src/modules/cart/dto/add-cart-item.dto.ts
server/src/modules/cart/dto/update-cart-item.dto.ts

server/src/modules/order/order.controller.ts
server/src/modules/order/order.service.ts
server/src/modules/order/dto/preview-order.dto.ts
server/src/modules/order/dto/create-order.dto.ts

server/src/modules/marketing/marketing.service.ts

server/prisma/schema.prisma
  EcCartItem
  EcOrder
  EcOrderAddress
  EcOrderItem
  MkCoupon
  MkPromotion
  MkFreightTemplate
```

教学版和真实项目的区别：

| 能力 | 教学版 | 真实项目 |
| --- | --- | --- |
| 购物车存储 | Prisma + MySQL | 当前项目真实实现 |
| SKU 库存 | 简化 `stockQty` | `ec_stock_balance` 多仓库存 |
| 加购防重复 | 唯一索引 `tenantId + memberId + skuId` | 当前项目真实实现 |
| 金额计算 | number + `toFixed` | Decimal |
| 营销规则 | 活动价 + 优惠券 + 简单运费 | 促销、优惠券、运费模板 |
| 订单预览 | 不落库 | 不落订单，但读取真实商品/库存/营销 |
| 创建订单 | 下一章实现 | 事务创建订单、明细、地址、锁库存 |

当前项目购物车真实代码在：

```text
server/src/modules/cart/cart.service.ts
server/src/modules/order/order.service.ts
server/prisma/schema.prisma
```

加购时不是写内存数组，而是先查 SKU，再用 `tenantId_memberId_skuId` 唯一键合并购物车：

```ts
async addItem(member: CurrentMemberPayload, dto: AddCartItemDto) {
  const sku = await this.prisma.ecSku.findFirst({
    where: {
      id: BigInt(dto.skuId),
      tenantId: member.tenantId,
      deletedAt: null,
      product: {
        deletedAt: null,
        saleStatus: 'on_sale',
      },
    },
    include: {
      product: true,
    },
  });

  if (!sku) {
    throw new NotFoundException('SKU不存在或已下架');
  }

  const existingItem = await this.prisma.ecCartItem.findUnique({
    where: {
      tenantId_memberId_skuId: {
        tenantId: member.tenantId,
        memberId: member.memberId,
        skuId: sku.id,
      },
    },
  });

  if (existingItem && existingItem.deletedAt) {
    await this.prisma.ecCartItem.update({
      where: { id: existingItem.id },
      data: {
        qty: dto.qty,
        checked: true,
        deletedAt: null,
      },
    });
  } else if (existingItem) {
    await this.prisma.ecCartItem.update({
      where: { id: existingItem.id },
      data: {
        qty: new Prisma.Decimal(existingItem.qty).plus(dto.qty),
        checked: true,
      },
    });
  } else {
    await this.prisma.ecCartItem.create({
      data: {
        tenantId: member.tenantId,
        memberId: member.memberId,
        productId: sku.productId,
        skuId: sku.id,
        qty: dto.qty,
        checked: true,
      },
    });
  }

  return this.getCart(member);
}
```

订单预览也不是读前端金额，而是读取已勾选购物车、商品、SKU、库存余额和营销规则后重新计算：

```ts
async preview(member: CurrentMemberPayload, dto: PreviewOrderDto = {}) {
  const cartItems = await this.getCheckedCartItems(member);
  if (cartItems.length === 0) {
    throw new BadRequestException('请选择要结算的商品');
  }

  const shopChannel = await this.getDefaultShopChannel(member.tenantId);
  return this.buildPreview(member, shopChannel, cartItems, dto.couponId);
}
```
