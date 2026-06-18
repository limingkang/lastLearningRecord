一个商城不只是“能买”，还要“能运营”：
```text
新用户发券
  -> 活动价
  -> 满减
  -> 优惠券
  -> 运费模板
  -> 首页 Banner
  -> 首页模块
  -> 公告和协议
```

本章重点是理解：

```text
营销配置如何进入订单预览算价。
CMS 配置如何控制小程序首页展示。
```
最终实现这些接口：

```text
小程序优惠券：
GET /api/app/v1/coupons

后台优惠券模板：
GET    /api/admin/v1/coupon-templates
POST   /api/admin/v1/coupon-templates
GET    /api/admin/v1/coupon-templates/:id
PUT    /api/admin/v1/coupon-templates/:id
DELETE /api/admin/v1/coupon-templates/:id

后台促销活动：
GET    /api/admin/v1/promotions
POST   /api/admin/v1/promotions
GET    /api/admin/v1/promotions/:id
PUT    /api/admin/v1/promotions/:id
DELETE /api/admin/v1/promotions/:id

后台运费模板：
GET    /api/admin/v1/freight-templates
POST   /api/admin/v1/freight-templates
GET    /api/admin/v1/freight-templates/:id
PUT    /api/admin/v1/freight-templates/:id
DELETE /api/admin/v1/freight-templates/:id

后台 CMS：
GET/POST/PUT/DELETE /api/admin/v1/cms/banners
GET/POST/PUT/DELETE /api/admin/v1/cms/page-modules
GET/POST/PUT/DELETE /api/admin/v1/cms/notices
GET/POST/PUT/DELETE /api/admin/v1/cms/agreements

建议补充的小程序 CMS：
GET /api/app/v1/cms/home
GET /api/app/v1/cms/agreements/:code
```

真实项目中，对应表和模块主要是：

```text
mk_coupon_template
mk_coupon
mk_promotion
mk_promotion_product
mk_freight_template

cms_banner
cms_page_module
cms_notice
cms_agreement

MarketingModule
CmsModule
OrderModule.preview
AuthService.wechatLogin
```

## 营销和 CMS

前面做完交易后，系统已经能卖货，但还不够像一个真实商城。真实运营会提出这些需求：

- 新用户注册送券。
- 某些商品限时活动价。
- 满 199 减 30。
- 满 99 包邮。
- 首页 Banner 配活动入口。
- 首页配置爆款商品、分类导航。
- 展示用户协议、隐私协议。
- 首页公告通知用户物流延迟或活动规则。

这些需求不应该写死在前端，也不应该每次改活动都发版。所以要做：

```text
后台可配置
小程序按配置展示
订单预览按配置算价
```

营销和 CMS 的区别：

| 模块 | 解决什么问题 | 是否影响订单金额 |
| --- | --- | --- |
| Marketing | 优惠券、促销、运费 | 会影响 |
| CMS | Banner、页面模块、公告、协议 | 通常不直接影响 |

## 优惠券表设计

### 优惠券模板 `mk_coupon_template`

```prisma
model MkCouponTemplate {
  id              BigInt   @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId        BigInt   @map("tenant_id") @db.UnsignedBigInt
  name            String   @db.VarChar(100)
  couponType      String   @default("cash") @map("coupon_type") @db.VarChar(32)
  thresholdAmount Decimal  @default(0) @map("threshold_amount") @db.Decimal(18, 2)
  discountAmount  Decimal  @default(0) @map("discount_amount") @db.Decimal(18, 2)
  validStartAt    DateTime @map("valid_start_at") @db.DateTime(3)
  validEndAt      DateTime @map("valid_end_at") @db.DateTime(3)
  totalQty        Int?     @map("total_qty")
  issuedQty       Int      @default(0) @map("issued_qty")
  status          String   @default("enabled") @db.VarChar(32)

  @@unique([tenantId, name], map: "uk_mk_coupon_template_tenant_name")
  @@index([tenantId, status], map: "idx_mk_coupon_template_tenant_status")
  @@map("mk_coupon_template")
}
```

优惠券模板表示“运营配置的一种券”：

```text
满 99 减 10
有效期 2026-06-01 到 2026-06-30
总共发 1000 张
```

### 会员优惠券 `mk_coupon`

```prisma
model MkCoupon {
  id              BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId        BigInt    @map("tenant_id") @db.UnsignedBigInt
  templateId      BigInt?   @map("template_id") @db.UnsignedBigInt
  memberId        BigInt    @map("member_id") @db.UnsignedBigInt
  couponNo        String    @map("coupon_no") @db.VarChar(64)
  name            String    @db.VarChar(100)
  couponType      String    @default("cash") @map("coupon_type") @db.VarChar(32)
  thresholdAmount Decimal   @default(0) @map("threshold_amount") @db.Decimal(18, 2)
  discountAmount  Decimal   @default(0) @map("discount_amount") @db.Decimal(18, 2)
  status          String    @default("available") @db.VarChar(32)
  receivedAt      DateTime  @default(now()) @map("received_at") @db.DateTime(3)
  usedAt          DateTime? @map("used_at") @db.DateTime(3)
  expiredAt       DateTime  @map("expired_at") @db.DateTime(3)
  lockedOrderId   BigInt?   @map("locked_order_id") @db.UnsignedBigInt
  lockedAt        DateTime? @map("locked_at") @db.DateTime(3)

  @@unique([tenantId, couponNo], map: "uk_mk_coupon_tenant_no")
  @@index([tenantId, memberId, status], map: "idx_mk_coupon_tenant_member_status")
  @@index([tenantId, expiredAt], map: "idx_mk_coupon_tenant_expired")
  @@map("mk_coupon")
}
```

会员优惠券表示“某个会员实际拥有的一张券”。为什么要拆模板和会员券：

- 模板是运营配置。
- 会员券是用户资产。
- 一个模板可以发给很多会员。
- 用户券需要自己的状态：`available / locked / used / expired`。
- 模板修改后，已发出的券通常应该保持当时的金额和有效期。

为什么 `mk_coupon` 要冗余 `name/thresholdAmount/discountAmount`：

- 已发券要保留快照。
- 模板后续可能被修改或删除。
- 用户资产和订单使用记录不能被运营配置变化影响。

## 定义优惠券 DTO

### `coupon-template-mutation.dto.ts`

```ts
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CouponTemplateMutationDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  couponType?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  thresholdAmount!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount!: number;

  @IsDateString()
  validStartAt!: string;

  @IsDateString()
  validEndAt!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalQty?: number;
}
```

为什么要校验结束时间晚于开始时间：

- 防止配置出一张永远不可用的券。
- 后面发券和使用券都依赖有效期。

为什么 `discountAmount` 必须大于 0：

- 0 元优惠券没有意义。
- 如果需要“免运费券”，应该用单独类型和规则。

## 创建优惠券模板

### 5.1 `marketing.service.ts`

```ts
async createCouponTemplate(dto: CouponTemplateMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  const name = this.normalizeText(dto.name);
  const couponType = dto.couponType || 'cash';
  const thresholdAmount = Number(dto.thresholdAmount);
  const discountAmount = Number(dto.discountAmount);
  const validStartAt = new Date(dto.validStartAt);
  const validEndAt = new Date(dto.validEndAt);

  if (discountAmount <= 0) {
    throw new BadRequestException('优惠金额必须大于 0');
  }

  if (validEndAt.getTime() <= validStartAt.getTime()) {
    throw new BadRequestException('结束时间必须晚于开始时间');
  }

  await this.ensureCouponTemplateNameAvailable(tenantId, name);

  const template = await this.prisma.mkCouponTemplate.create({
    data: {
      tenantId,
      name,
      couponType,
      thresholdAmount: String(thresholdAmount),
      discountAmount: String(discountAmount),
      validStartAt,
      validEndAt,
      totalQty: dto.totalQty,
      issuedQty: 0,
      status: 'enabled',
    },
  });

  return this.toCouponTemplate(template);
}
```

为什么模板名称要唯一：

- 后台运营容易识别。
- 防止创建一堆同名活动，后续发券混乱。

为什么删除模板可以硬删或软删要谨慎：

- 如果模板已发券，硬删会影响追溯。
- 第一版可以物理删除未发券模板。
- 更稳妥做法是软删除或禁用。

## 给新会员发券和积分
会员登录时提到：

```text
新会员注册
  -> 发新手券
  -> 发欢迎积分
```
现在把它补完整。

### 发新手券

```ts
async issueStarterCoupons(tenantId: bigint, memberId: bigint) {
  const templates = await this.prisma.mkCouponTemplate.findMany({
    where: {
      tenantId,
      status: 'enabled',
      deletedAt: null,
      validStartAt: {
        lte: new Date(),
      },
      validEndAt: {
        gt: new Date(),
      },
    },
    take: 2,
    orderBy: {
      discountAmount: 'asc',
    },
  });

  for (const template of templates) {
    const existed = await this.prisma.mkCoupon.findFirst({
      where: {
        tenantId,
        memberId,
        templateId: template.id,
        deletedAt: null,
      },
    });

    if (existed) continue;

    if (template.totalQty !== null && template.issuedQty >= template.totalQty) {
      continue;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mkCoupon.create({
        data: {
          tenantId,
          templateId: template.id,
          memberId,
          couponNo: await this.createCouponNo(tx, tenantId),
          name: template.name,
          couponType: template.couponType,
          thresholdAmount: template.thresholdAmount,
          discountAmount: template.discountAmount,
          status: 'available',
          expiredAt: template.validEndAt,
        },
      });

      await tx.mkCouponTemplate.update({
        where: { id: template.id },
        data: {
          issuedQty: {
            increment: 1,
          },
        },
      });
    });
  }
}
```

为什么发券和 `issuedQty + 1` 要在同一个事务：

- 创建会员券成功，模板已发数量也要增加。
- 如果只创建券不增加数量，可能超发。
- 如果只增加数量不创建券，用户资产丢失。

并发下还要更严格：

```text
UPDATE template
SET issued_qty = issued_qty + 1
WHERE id = ?
  AND issued_qty < total_qty
```

第一版先理解事务，后续再升级条件更新防超发。

### 发欢迎积分

```ts
async issueStarterPoints(tenantId: bigint, memberId: bigint) {
  const bonusPoints = 50;

  await this.prisma.$transaction(async (tx) => {
    const existed = await tx.ecMemberPointsLog.findFirst({
      where: {
        tenantId,
        memberId,
        bizType: 'welcome_bonus',
        deletedAt: null,
      },
    });

    if (existed) {
      return;
    }

    const member = await tx.ecMember.update({
      where: { id: memberId },
      data: {
        points: {
          increment: bonusPoints,
        },
      },
    });

    await tx.ecMemberPointsLog.create({
      data: {
        tenantId,
        memberId,
        bizType: 'welcome_bonus',
        direction: 'increase',
        points: bonusPoints,
        balanceAfter: member.points,
        remark: '新会员欢迎积分',
      },
    });
  });
}
```

为什么要查 `welcome_bonus` 是否已存在：

- 登录接口可能重试。
- 用户可能重复触发初始化流程。
- 发积分必须幂等。

## 小程序查看自己的优惠券

### `marketing.controller.ts`

```ts
@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/coupons')
export class AppCouponController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get()
  list(@CurrentMember() member: CurrentMemberPayload) {
    return this.marketingService.listMemberCoupons(member);
  }
}
```

### `marketing.service.ts`

```ts
async listMemberCoupons(member: CurrentMemberPayload) {
  await this.expireMemberCoupons(member);

  const coupons = await this.prisma.mkCoupon.findMany({
    where: {
      tenantId: member.tenantId,
      memberId: member.memberId,
      deletedAt: null,
    },
    orderBy: [
      { status: 'asc' },
      { expiredAt: 'asc' },
    ],
  });

  return coupons.map((coupon) => this.toCoupon(coupon));
}

private async expireMemberCoupons(member: CurrentMemberPayload) {
  await this.prisma.mkCoupon.updateMany({
    where: {
      tenantId: member.tenantId,
      memberId: member.memberId,
      status: 'available',
      expiredAt: {
        lte: new Date(),
      },
    },
    data: {
      status: 'expired',
    },
  });
}
```

为什么查询优惠券前先过期处理：

- 避免前端看到已经过期但状态仍是 available 的券。
- 第一版可以查询时顺便更新。
- 数据量大后可以改成定时任务批量过期。

## 订单预览使用优惠券
订单预览已经接入了 `previewCoupon`。
### `previewCoupon`

```ts
async previewCoupon(
  member: CurrentMemberPayload,
  couponId: string | undefined,
  goodsAmount: number,
) {
  if (!couponId) {
    return null;
  }

  const coupon = await this.prisma.mkCoupon.findFirst({
    where: {
      id: BigInt(couponId),
      tenantId: member.tenantId,
      memberId: member.memberId,
      status: 'available',
      deletedAt: null,
    },
  });

  if (!coupon) {
    throw new BadRequestException('优惠券不可用');
  }

  if (coupon.expiredAt.getTime() <= Date.now()) {
    throw new BadRequestException('优惠券已过期');
  }

  if (goodsAmount < Number(coupon.thresholdAmount)) {
    throw new BadRequestException('订单金额未达到优惠券使用门槛');
  }

  return {
    id: coupon.id.toString(),
    name: coupon.name,
    thresholdAmount: Number(coupon.thresholdAmount),
    discountAmount: Math.min(Number(coupon.discountAmount), goodsAmount),
  };
}
```

为什么订单预览只预览优惠券，不锁定优惠券：

- 用户可能只是试算价格。
- 切换优惠券会频繁预览。
- 真正锁券应该在创建订单事务里做。

创建订单时：

```text
available -> locked
```

支付成功时：

```text
locked -> used
```

取消或超时时：

```text
locked -> available
```

## 促销活动表

### 促销主表 `mk_promotion`

```prisma
model MkPromotion {
  id        BigInt   @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId  BigInt   @map("tenant_id") @db.UnsignedBigInt
  shopId    BigInt?  @map("shop_id") @db.UnsignedBigInt
  channelId BigInt?  @map("channel_id") @db.UnsignedBigInt
  name      String   @db.VarChar(128)
  type      String   @db.VarChar(32)
  ruleJson  Json?    @map("rule_json")
  startAt   DateTime @map("start_at") @db.DateTime(3)
  endAt     DateTime @map("end_at") @db.DateTime(3)
  status    String   @default("enabled") @db.VarChar(32)

  @@index([tenantId, type, status, startAt, endAt], map: "idx_mk_promotion_tenant_type_status_time")
  @@index([tenantId, shopId, channelId], map: "idx_mk_promotion_tenant_scope")
  @@map("mk_promotion")
}
```

### 促销商品表 `mk_promotion_product`

```prisma
model MkPromotionProduct {
  id            BigInt   @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId      BigInt   @map("tenant_id") @db.UnsignedBigInt
  promotionId   BigInt   @map("promotion_id") @db.UnsignedBigInt
  productId     BigInt   @map("product_id") @db.UnsignedBigInt
  skuId         BigInt?  @map("sku_id") @db.UnsignedBigInt
  activityPrice Decimal? @map("activity_price") @db.Decimal(18, 2)
  limitQty      Int?     @map("limit_qty")

  @@unique([tenantId, promotionId, productId, skuId], map: "uk_mk_promotion_product_tenant_target")
  @@index([tenantId, promotionId], map: "idx_mk_promotion_product_tenant_promotion")
  @@index([tenantId, productId], map: "idx_mk_promotion_product_tenant_product")
  @@map("mk_promotion_product")
}
```

为什么促销要拆主表和商品表：

- 活动有自己的时间、状态、规则、渠道范围。
- 一个活动可以作用于多个商品。
- 某些活动只作用于商品 SPU。
- 某些活动只作用于指定 SKU。

为什么有 `shopId/channelId`：

- 同一个租户可能有多个店铺。
- 同一个店铺可能有小程序、App、线下渠道。
- 活动可能只在小程序生效。

## 创建促销活动

### `promotion-mutation.dto.ts`

```ts
export class PromotionProductDto {
  productId!: string;
  skuId?: string | null;
  activityPrice?: number | null;
  limitQty?: number | null;
}

export class PromotionMutationDto {
  name!: string;
  type!: string;
  rule?: Record<string, unknown> | null;
  startAt!: string;
  endAt!: string;
  shopId?: string | null;
  channelId?: string | null;
  status?: string;
  products?: PromotionProductDto[];
}
```

### `marketing.service.ts`

```ts
async createPromotion(dto: PromotionMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  const startAt = new Date(dto.startAt);
  const endAt = new Date(dto.endAt);

  if (endAt.getTime() <= startAt.getTime()) {
    throw new BadRequestException('活动结束时间必须晚于开始时间');
  }

  const promotion = await this.prisma.$transaction(async (tx) => {
    const created = await tx.mkPromotion.create({
      data: {
        tenantId,
        shopId: dto.shopId ? BigInt(dto.shopId) : null,
        channelId: dto.channelId ? BigInt(dto.channelId) : null,
        name: dto.name.trim(),
        type: dto.type.trim(),
        ruleJson: dto.rule ?? {},
        startAt,
        endAt,
        status: dto.status || 'enabled',
      },
    });

    for (const product of dto.products || []) {
      await tx.mkPromotionProduct.create({
        data: {
          tenantId,
          promotionId: created.id,
          productId: BigInt(product.productId),
          skuId: product.skuId ? BigInt(product.skuId) : null,
          activityPrice: product.activityPrice ?? null,
          limitQty: product.limitQty ?? null,
        },
      });
    }

    return created;
  });

  return this.getPromotion(promotion.id.toString());
}
```

为什么创建促销要用事务：

- 促销主表和促销商品明细必须一起成功。
- 如果主表成功、商品明细失败，活动会变成无效配置。
- 更新促销时通常要先删旧商品范围，再写新范围，也需要事务。

## 促销如何进入订单预览
订单预览中调用：
```text
MarketingService.previewOrderAdjustments
```

这个方法做三件事：

```text
查当前有效促销
  -> 计算单品活动价优惠
  -> 计算整单满减
  -> 计算运费
```

### 查询当前有效促销

```ts
const activePromotions = await this.prisma.mkPromotion.findMany({
  where: {
    tenantId: input.tenantId,
    status: 'enabled',
    deletedAt: null,
    startAt: { lte: now },
    endAt: { gt: now },
    AND: [
      { OR: [{ shopId: null }, { shopId: input.shopId }] },
      { OR: [{ channelId: null }, { channelId: input.channelId }] },
    ],
  },
  include: {
    products: {
      where: {
        deletedAt: null,
        productId: { in: productIds },
      },
    },
  },
});
```

为什么要按时间和渠道过滤：

- 未开始的活动不能生效。
- 已结束的活动不能生效。
- 只给 App 的活动不能在小程序生效。
- 只给某店铺的活动不能影响其他店铺。

### 单品活动价

```ts
for (const item of input.items) {
  let bestDiscount = 0;
  let bestPromotion = null;

  for (const promotion of activePromotions) {
    const candidates = promotion.products.filter((product) =>
      product.productId === item.productId &&
      (!product.skuId || product.skuId === item.skuId) &&
      product.activityPrice !== null,
    );

    for (const candidate of candidates) {
      const activityPrice = Number(candidate.activityPrice);
      const discountQty = Math.min(item.qty, Number(candidate.limitQty || item.qty));
      const discount = Math.max((item.salePrice - activityPrice) * discountQty, 0);

      if (discount > bestDiscount) {
        bestDiscount = discount;
        bestPromotion = {
          promotionId: promotion.id.toString(),
          promotionName: promotion.name,
          activityPrice,
        };
      }
    }
  }

  if (bestPromotion && bestDiscount > 0) {
    itemDiscounts.set(item.cartItemId, {
      ...bestPromotion,
      discountAmount: Number(bestDiscount.toFixed(2)),
    });
  }
}
```

为什么选 `bestDiscount`：

- 同一个商品可能命中多个活动。
- 第一版选择优惠最大的一个，规则简单。
- 真实系统要配置活动互斥、叠加优先级。

### 整单满减

```ts
private resolvePromotionRuleDiscount(promotion: PromotionEntity, amount: number) {
  const rule = this.jsonObject(promotion.ruleJson);

  if (promotion.type === 'full_reduction') {
    const threshold = Number(rule.thresholdAmount || rule.threshold || 0);
    const discount = Number(rule.discountAmount || rule.discount || 0);

    if (amount >= threshold) {
      return Number(Math.min(discount, amount).toFixed(2));
    }
  }

  return 0;
}
```

为什么整单满减通常在单品优惠之后算：

- 先算商品级优惠，再算订单级优惠。
- 否则可能出现原价满减和活动价满减冲突。
- 具体顺序要写成清晰的业务规则。

本项目采用的简化顺序：

```text
商品原价金额
  -> 单品活动价优惠
  -> 整单促销优惠
  -> 优惠券
  -> 运费
  -> 应付金额
```

## 运费模板

### 运费模板表 `mk_freight_template`

```prisma
model MkFreightTemplate {
  id                   BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId             BigInt    @map("tenant_id") @db.UnsignedBigInt
  shopId               BigInt?   @map("shop_id") @db.UnsignedBigInt
  name                 String    @db.VarChar(128)
  pricingType          String    @default("flat") @map("pricing_type") @db.VarChar(32)
  ruleJson             Json?     @map("rule_json")
  freeShippingRuleJson Json?     @map("free_shipping_rule_json")
  status               String    @default("enabled") @db.VarChar(32)

  @@index([tenantId, status], map: "idx_mk_freight_template_tenant_status")
  @@index([tenantId, shopId], map: "idx_mk_freight_template_tenant_shop")
  @@map("mk_freight_template")
}
```

为什么运费也放营销模块：

- 运费会影响应付金额。
- 满额包邮本质上是运营规则。
- 不同店铺可能不同运费模板。

### `freight-template-mutation.dto.ts`

```ts
export class FreightTemplateMutationDto {
  name!: string;
  shopId?: string | null;
  pricingType?: string;
  rule?: Record<string, unknown> | null;
  freeShippingRule?: Record<string, unknown> | null;
  status?: string;
}
```

示例配置：

```json
{
  "name": "默认运费模板",
  "pricingType": "flat",
  "rule": {
    "amount": 8
  },
  "freeShippingRule": {
    "thresholdAmount": 99
  },
  "status": "enabled"
}
```

### 预览运费

```ts
private async previewFreight(
  tenantId: bigint,
  shopId: bigint,
  amountForFreight: number,
) {
  const template = await this.prisma.mkFreightTemplate.findFirst({
    where: {
      tenantId,
      status: 'enabled',
      deletedAt: null,
      OR: [{ shopId: null }, { shopId }],
    },
    orderBy: [
      { shopId: 'desc' },
      { updatedAt: 'desc' },
      { id: 'desc' },
    ],
  });

  if (!template) {
    return {
      amount: amountForFreight >= 99 ? 0 : 8,
      rule: {
        source: 'default',
        freeShippingThreshold: 99,
        baseAmount: 8,
      },
    };
  }

  const rule = this.jsonObject(template.ruleJson);
  const freeRule = this.jsonObject(template.freeShippingRuleJson);
  const freeThreshold = Number(freeRule.thresholdAmount || 0);

  if (freeThreshold > 0 && amountForFreight >= freeThreshold) {
    return {
      amount: 0,
      rule: {
        source: 'freight_template',
        templateId: template.id.toString(),
        templateName: template.name,
        freeShippingThreshold: freeThreshold,
      },
    };
  }

  const baseAmount = template.pricingType === 'free'
    ? 0
    : Number(rule.amount || rule.freightAmount || 8);

  return {
    amount: Number(Math.max(baseAmount, 0).toFixed(2)),
    rule: {
      source: 'freight_template',
      templateId: template.id.toString(),
      templateName: template.name,
      pricingType: template.pricingType,
    },
  };
}
```

为什么优先选择具体店铺模板：

- `shopId = 当前店铺` 比 `shopId = null` 更具体。
- 通用模板作为默认规则。
- 查询排序让具体配置覆盖默认配置。

## CMS 为什么单独成模块

CMS 负责内容配置，不负责交易金额。

常见内容：

```text
首页 Banner
首页商品模块
公告
用户协议
隐私协议
帮助说明
```

为什么不写死在前端：

- 运营随时换 Banner。
- 首页模块经常调整。
- 协议内容会更新版本。
- 不应该每次改文案都重新发布小程序。

为什么 CMS 不放在 MarketingModule：

- Marketing 影响交易金额。
- CMS 影响展示内容。
- 两者生命周期和权限也不同。

## CMS 表设计

### Banner `cms_banner`

```prisma
model CmsBanner {
  id        BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId  BigInt    @map("tenant_id") @db.UnsignedBigInt
  shopId    BigInt?   @map("shop_id") @db.UnsignedBigInt
  channelId BigInt?   @map("channel_id") @db.UnsignedBigInt
  title     String    @db.VarChar(128)
  imageUrl  String    @map("image_url") @db.VarChar(512)
  linkType  String    @default("none") @map("link_type") @db.VarChar(32)
  linkValue String?   @map("link_value") @db.VarChar(255)
  startAt   DateTime? @map("start_at") @db.DateTime(3)
  endAt     DateTime? @map("end_at") @db.DateTime(3)
  sortNo    Int       @default(0) @map("sort_no")
  status    String    @default("enabled") @db.VarChar(32)

  @@index([tenantId, shopId, channelId, status, sortNo], map: "idx_cms_banner_tenant_scope_status_sort")
  @@map("cms_banner")
}
```

为什么 Banner 有时间范围：

- 活动 Banner 到期后自动不展示。
- 节日活动可以提前配置。
- 前端只拿当前有效 Banner。

为什么 Banner 有 `linkType/linkValue`：

- `product + productId` 跳商品详情。
- `category + categoryId` 跳分类。
- `url + path` 跳页面。
- `none` 只展示图片。

### 页面模块 `cms_page_module`

```prisma
model CmsPageModule {
  id         BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId   BigInt    @map("tenant_id") @db.UnsignedBigInt
  shopId     BigInt?   @map("shop_id") @db.UnsignedBigInt
  channelId  BigInt?   @map("channel_id") @db.UnsignedBigInt
  pageCode   String    @map("page_code") @db.VarChar(64)
  moduleType String    @map("module_type") @db.VarChar(64)
  title      String?   @db.VarChar(128)
  configJson Json?     @map("config_json")
  sortNo     Int       @default(0) @map("sort_no")
  status     String    @default("enabled") @db.VarChar(32)

  @@index([tenantId, pageCode, status, sortNo], map: "idx_cms_page_module_tenant_page_status_sort")
  @@map("cms_page_module")
}
```

示例：

```json
{
  "pageCode": "home",
  "moduleType": "product_grid",
  "title": "爆款推荐",
  "config": {
    "productIds": ["1", "2", "3"],
    "columns": 2
  }
}
```

为什么 `configJson` 用 JSON：

- 不同模块配置结构不同。
- Banner、商品网格、分类导航、公告栏需要的字段都不同。
- 用 JSON 可以减少频繁改表。

但 JSON 不是万能的：

- 常查询字段不要藏在 JSON。
- `pageCode/moduleType/sortNo/status` 这类查询字段要单独列。

### 公告和协议

```text
cms_notice
  title
  content
  start_at
  end_at
  sort_no
  status

cms_agreement
  code
  title
  content
  version_no
  status
```

为什么协议要有 `code` 和 `versionNo`：

- `privacy_policy` 隐私协议。
- `user_agreement` 用户协议。
- 版本号方便记录用户同意的是哪个版本。

## CMS DTO

### `cms-banner-mutation.dto.ts`

```ts
export class CmsBannerMutationDto {
  title!: string;
  imageUrl!: string;
  linkType?: string;
  linkValue?: string | null;
  shopId?: string | null;
  channelId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  sortNo?: number;
  status?: string;
}
```

### `cms-page-module-mutation.dto.ts`

```ts
export class CmsPageModuleMutationDto {
  pageCode?: string;
  moduleType!: string;
  title?: string | null;
  config?: Record<string, unknown> | null;
  shopId?: string | null;
  channelId?: string | null;
  sortNo?: number;
  status?: string;
}
```

为什么 CMS 配置也要有 `shopId/channelId`：

- 小程序首页和 App 首页可能不同。
- 不同店铺可能有不同活动入口。
- `null` 表示通用配置。

## 实现 CMS Banner

### `cms.service.ts`

```ts
async createBanner(dto: CmsBannerMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  const scope = await this.resolveScope(tenantId, dto.shopId, dto.channelId);

  const banner = await this.prisma.cmsBanner.create({
    data: {
      tenantId,
      ...scope,
      title: dto.title.trim(),
      imageUrl: dto.imageUrl.trim(),
      linkType: dto.linkType || 'none',
      linkValue: dto.linkValue?.trim() || null,
      startAt: dto.startAt ? new Date(dto.startAt) : null,
      endAt: dto.endAt ? new Date(dto.endAt) : null,
      sortNo: dto.sortNo ?? 0,
      status: dto.status || 'enabled',
    },
  });

  return this.toBanner(banner);
}

async listBanners(query: CmsQueryDto = {}) {
  const tenantId = await this.getDefaultTenantId();
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;

  const where: Prisma.CmsBannerWhereInput = {
    tenantId,
    deletedAt: null,
    ...this.buildScopeWhere(query),
  };

  if (query.status) {
    where.status = query.status;
  }

  if (query.keyword) {
    where.title = { contains: query.keyword };
  }

  const [items, total] = await Promise.all([
    this.prisma.cmsBanner.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [
        { sortNo: 'asc' },
        { id: 'desc' },
      ],
    }),
    this.prisma.cmsBanner.count({ where }),
  ]);

  return {
    items: items.map((item) => this.toBanner(item)),
    page,
    pageSize,
    total,
  };
}
```

为什么 CMS 删除用软删除：

- 历史活动配置可追溯。
- 误删可以恢复。
- 后台审计更清楚。

## 补充小程序首页接口

当前项目主要有后台 CMS 管理接口。学习时可以补一个小程序首页聚合接口：

```text
GET /api/app/v1/cms/home
```

返回：

```json
{
  "banners": [],
  "modules": [],
  "notices": []
}
```

### `cms.service.ts`

```ts
async appHome(query: {
  shopId?: string;
  channelId?: string;
}) {
  const tenantId = await this.getDefaultTenantId();
  const now = new Date();
  const scopeWhere = this.buildScopeWhere(query);

  const [banners, modules, notices] = await Promise.all([
    this.prisma.cmsBanner.findMany({
      where: {
        tenantId,
        status: 'enabled',
        deletedAt: null,
        ...scopeWhere,
        OR: [
          { startAt: null },
          { startAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gt: now } },
            ],
          },
        ],
      },
      orderBy: [{ sortNo: 'asc' }, { id: 'desc' }],
      take: 10,
    }),
    this.prisma.cmsPageModule.findMany({
      where: {
        tenantId,
        pageCode: 'home',
        status: 'enabled',
        deletedAt: null,
        ...scopeWhere,
      },
      orderBy: [{ sortNo: 'asc' }, { id: 'asc' }],
    }),
    this.prisma.cmsNotice.findMany({
      where: {
        tenantId,
        status: 'enabled',
        deletedAt: null,
        OR: [
          { startAt: null },
          { startAt: { lte: now } },
        ],
        AND: [
          {
            OR: [
              { endAt: null },
              { endAt: { gt: now } },
            ],
          },
        ],
      },
      orderBy: [{ sortNo: 'asc' }, { id: 'desc' }],
      take: 5,
    }),
  ]);

  return {
    banners: banners.map((item) => this.toBanner(item)),
    modules: modules.map((item) => this.toPageModule(item)),
    notices: notices.map((item) => this.toNotice(item)),
  };
}
```

为什么小程序首页要用聚合接口：

- 前端一次请求拿首页配置，性能更好。
- 服务端统一过滤状态、时间、渠道。
- 前端不用知道每种 CMS 表怎么查。

## Controller 组织

### Marketing Controller

```ts
@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/coupons')
export class AppCouponController {
  constructor(private readonly marketingService: MarketingService) {}

  @Get()
  list(@CurrentMember() member: CurrentMemberPayload) {
    return this.marketingService.listMemberCoupons(member);
  }
}

@Controller('/api/admin/v1/coupon-templates')
export class AdminCouponTemplateController {
  @Get()
  list(@Query() query: CouponTemplateQueryDto) {}

  @Post()
  create(@Body() dto: CouponTemplateMutationDto) {}
}

@Controller('/api/admin/v1/promotions')
export class AdminPromotionController {
  @Get()
  list(@Query() query: PromotionQueryDto) {}

  @Post()
  create(@Body() dto: PromotionMutationDto) {}
}

@Controller('/api/admin/v1/freight-templates')
export class AdminFreightTemplateController {
  @Get()
  list(@Query() query: PromotionQueryDto) {}

  @Post()
  create(@Body() dto: FreightTemplateMutationDto) {}
}
```

### CMS Controller

```ts
@Controller()
export class CmsController {
  @Get('/api/admin/v1/cms/banners')
  listBanners(@Query() query: CmsQueryDto) {}

  @Post('/api/admin/v1/cms/banners')
  createBanner(@Body() dto: CmsBannerMutationDto) {}

  @Get('/api/admin/v1/cms/page-modules')
  listPageModules(@Query() query: CmsQueryDto) {}

  @Post('/api/admin/v1/cms/page-modules')
  createPageModule(@Body() dto: CmsPageModuleMutationDto) {}

  @Get('/api/app/v1/cms/home')
  appHome(@Query() query: CmsQueryDto) {}
}
```

为什么后台配置接口和小程序展示接口分开：

- 后台需要 CRUD。
- 小程序只需要读取已启用、当前有效配置。
- 后台能看到禁用、过期、未开始配置。
- 小程序不能看到这些配置。

## 接口调用顺序

### 创建优惠券模板

```bash
curl -X POST http://localhost:3000/api/admin/v1/coupon-templates \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"满99减10\",
    \"couponType\":\"cash\",
    \"thresholdAmount\":99,
    \"discountAmount\":10,
    \"validStartAt\":\"2026-06-01T00:00:00.000Z\",
    \"validEndAt\":\"2026-07-01T00:00:00.000Z\",
    \"totalQty\":1000
  }"
```

### 会员登录后查看优惠券

```bash
curl http://localhost:3000/api/app/v1/coupons \
  -H "Authorization: Bearer <accessToken>"
```

### 创建活动价促销

```bash
curl -X POST http://localhost:3000/api/admin/v1/promotions \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"指定商品活动价\",
    \"type\":\"activity_price\",
    \"startAt\":\"2026-06-01T00:00:00.000Z\",
    \"endAt\":\"2026-07-01T00:00:00.000Z\",
    \"products\":[
      {
        \"productId\":\"1\",
        \"skuId\":\"1\",
        \"activityPrice\":79,
        \"limitQty\":2
      }
    ]
  }"
```

### 创建满减促销

```bash
curl -X POST http://localhost:3000/api/admin/v1/promotions \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"满199减30\",
    \"type\":\"full_reduction\",
    \"rule\": {
      \"thresholdAmount\":199,
      \"discountAmount\":30
    },
    \"startAt\":\"2026-06-01T00:00:00.000Z\",
    \"endAt\":\"2026-07-01T00:00:00.000Z\"
  }"
```

### 创建运费模板

```bash
curl -X POST http://localhost:3000/api/admin/v1/freight-templates \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\":\"默认运费模板\",
    \"pricingType\":\"flat\",
    \"rule\": { \"amount\": 8 },
    \"freeShippingRule\": { \"thresholdAmount\": 99 },
    \"status\":\"enabled\"
  }"
```

### 创建首页 Banner

```bash
curl -X POST http://localhost:3000/api/admin/v1/cms/banners \
  -H "Authorization: Bearer <adminToken>" \
  -H "Content-Type: application/json" \
  -d "{
    \"title\":\"618 活动\",
    \"imageUrl\":\"https://example.com/banner.png\",
    \"linkType\":\"promotion\",
    \"linkValue\":\"1\",
    \"sortNo\":10,
    \"status\":\"enabled\"
  }"
```

## 本章和真实 ERP 项目的对应关系

真实项目中可以重点看：

```text










  MkCouponTemplate
  MkCoupon
  MkPromotion
  MkPromotionProduct
  MkFreightTemplate
  CmsBanner
  CmsPageModule
  CmsNotice
  CmsAgreement
```

教学版和真实项目的区别：

| 能力 | 教学版 | 真实项目 |
| --- | --- | --- |
| 优惠券 | 模板 + 会员券 | 已有模板、会员券、锁券、用券 |
| 发券 | 新会员发券 | `issueStarterCoupons` |
| 促销 | 活动价、满减 | 商品活动价 + 规则 JSON |
| 运费 | 固定运费、满额包邮 | 运费模板 JSON |
| CMS | Banner + 页面模块 | Banner、PageModule、Notice、Agreement |
| 小程序 CMS | 建议补充聚合接口 | 当前主要是后台 CRUD |
| 算价 | 订单预览调用营销服务 | `previewOrderAdjustments` |



