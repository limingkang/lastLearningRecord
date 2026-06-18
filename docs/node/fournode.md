为什么商品之后要先做会员，而不是直接做购物车和订单：

- 购物车必须知道是谁加的商品，也就是 `memberId`。
- 订单必须知道是谁下的单，也就是 `memberId`。
- 收货地址必须挂在会员下面。
- 收藏、积分、优惠券、售后、支付记录都要挂在会员下面。
- 微信支付时需要小程序用户的 `openid`，而 `openid` 属于会员身份体系。

所以本章的学习顺序是：

```text
先做 mock 登录
  -> 签发小程序会员 token
  -> 写 MemberAuthGuard
  -> 获取会员资料
  -> 接入真实微信 code2Session
  -> 绑定手机号
  -> 收货地址 CRUD
  -> 商品收藏
  -> 积分余额和积分流水
  -> 后台查看会员
```

重点不是“微信 API 背下来”，而是学会一个服务端工程师处理第三方登录的完整思路：

```text
前端拿临时凭证
  -> 服务端换取第三方身份
  -> 服务端建立自己的会员账号
  -> 服务端签发自己的 token
  -> 后续业务都用自己的 memberId
```

最终实现这些接口：

```text
小程序登录：
POST /api/app/v1/auth/mock-login
POST /api/app/v1/auth/wechat-login
POST /api/app/v1/auth/bind-phone

小程序会员：
GET  /api/app/v1/members/me
GET  /api/app/v1/members/points

小程序地址：
GET    /api/app/v1/addresses
POST   /api/app/v1/addresses
PUT    /api/app/v1/addresses/:id
POST   /api/app/v1/addresses/:id/default
DELETE /api/app/v1/addresses/:id

小程序收藏：
GET    /api/app/v1/favorites
POST   /api/app/v1/favorites/:productId
DELETE /api/app/v1/favorites/:productId

后台会员：
GET /api/admin/v1/members
GET /api/admin/v1/members/:id
```

当前项目的会员、地址、收藏、积分都已经使用 MySQL + Prisma 持久化，不再使用内存仓储。对应表主要是：

```text
ec_member
ec_member_wechat
ec_member_address
ec_member_favorite
ec_member_points_log
```

真实代码位置：

```text
server/src/modules/auth/auth.service.ts
server/src/modules/member/member.service.ts
server/src/common/guards/member-auth.guard.ts
server/src/modules/redis/redis.service.ts
server/prisma/schema.prisma
```

小程序登录会写会员表、微信身份表，并把登录态写入 Redis：

```ts
async wechatLogin(dto: MiniappLoginDto, forceMock = false) {
  const tenant = await this.getDefaultTenant();
  const session = await this.resolveWechatSession(dto, forceMock);
  const existingIdentity = await this.prisma.ecMemberWechat.findFirst({
    where: {
      tenantId: tenant.id,
      deletedAt: null,
      OR: [
        { openid: session.openid },
        ...(session.unionid ? [{ unionid: session.unionid }] : []),
      ],
    },
    include: { member: true },
  });

  const now = new Date();
  let member = existingIdentity?.member;

  if (!member || member.deletedAt) {
    member = await this.prisma.ecMember.create({
      data: {
        tenantId: tenant.id,
        nickname: dto.nickname || '微信用户',
        avatarUrl: dto.avatarUrl || null,
        status: 'enabled',
        lastLoginAt: now,
      },
    });
  }

  await this.prisma.ecMemberWechat.upsert({
    where: {
      tenantId_openid: {
        tenantId: tenant.id,
        openid: session.openid,
      },
    },
    create: {
      tenantId: tenant.id,
      memberId: member.id,
      openid: session.openid,
      unionid: session.unionid || null,
      sessionKeyHash: this.hashValue(session.sessionKey),
      lastLoginAt: now,
    },
    update: {
      memberId: member.id,
      unionid: session.unionid || null,
      sessionKeyHash: this.hashValue(session.sessionKey),
      lastLoginAt: now,
      deletedAt: null,
    },
  });

  const token = await this.jwtService.signAsync({
    sub: member.id.toString(),
    tenantId: tenant.id.toString(),
    openid: session.openid,
    type: 'member',
  });

  await this.redisService.rememberLoginSession({
    scope: 'member',
    tenantId: tenant.id.toString(),
    actorId: member.id.toString(),
    token,
    ttlSeconds: this.resolveJwtTtlSeconds(),
  });

  return { token, member: await this.getProfile({ memberId: member.id, tenantId: tenant.id, openid: session.openid }) };
}
```

会员接口每次请求会通过 `MemberAuthGuard` 校验 JWT 和 Redis 登录态：

```ts
const payload = await this.jwtService.verifyAsync<MemberTokenPayload>(token, {
  secret: this.configService.get<string>('jwt.accessSecret') || 'dev-access-secret',
});

if (payload.type !== 'member') {
  throw new UnauthorizedException('会员身份无效');
}

if (!(await this.redisService.hasLoginSession('member', payload.tenantId, payload.sub))) {
  throw new UnauthorizedException('登录态已失效，请重新登录');
}

request.member = {
  memberId: BigInt(payload.sub),
  tenantId: BigInt(payload.tenantId),
  openid: payload.openid,
};
```

## 目录结构

新增或扩展：

```text
src/
  common/
    decorators/
      current-member.decorator.ts
    guards/
      member-auth.guard.ts

  modules/
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      wechat-miniapp.gateway.ts
      dto/
        miniapp-login.dto.ts
        bind-phone.dto.ts

    member/
      member.module.ts
      member.controller.ts
      member.service.ts
      member.repository.ts
      member.types.ts
      dto/
        address-mutation.dto.ts
        member-favorite-query.dto.ts
        member-points-query.dto.ts
        member-query.dto.ts
```

为什么登录还放在 `auth` 模块，会员资料放在 `member` 模块：

- `auth` 负责“你是谁、怎么登录、怎么签发 token”。
- `member` 负责“会员资料、地址、收藏、积分”等业务数据。
- 这样后面加支付宝登录、手机号登录、企业微信登录时，身份入口仍然在 `auth`。
- 这样后面订单、售后、营销要用会员资料时，依赖的是 `member` 业务模块。

## 会员表为什么这样设计

初学者可能会先设计一张表：

```text
member
  id
  openid
  phone
  nickname
  avatar
  address
  points
```

一开始看起来简单，但很快会遇到问题：

- 一个会员可能有多个登录身份，比如微信小程序、公众号、App、手机号。
- `openid` 是微信某个应用下的身份，不是整个系统里的会员主键。
- 地址不是一个字段，一个会员可能有多个地址。
- 积分不能只有余额，还要有积分流水，否则无法排查为什么变多或变少。
- 收藏商品需要防重复，也要能快速查询会员收藏了什么。
- 后台查询会员时，不能把登录态、地址、积分流水混在一张表里。

所以真实项目拆成：

```text
ec_member
  会员主表，保存系统自己的会员账号

ec_member_wechat
  微信身份表，保存 openid/unionid 和会员的绑定关系

ec_member_address
  收货地址表，一个会员多个地址

ec_member_favorite
  商品收藏表，一个会员收藏多个商品

ec_member_points_log
  积分流水表，记录积分为什么增加或减少
```

核心关系：

```text
ec_member 1 -> N ec_member_wechat
ec_member 1 -> N ec_member_address
ec_member 1 -> N ec_member_favorite
ec_member 1 -> N ec_member_points_log
```

为什么不直接用微信 `openid` 当会员 id：

- `openid` 只在某个微信应用下唯一。
- 换一个小程序、公众号或 App，`openid` 可能不同。
- 系统内部应该有自己的稳定主键，也就是 `memberId`。
- 订单、售后、优惠券等业务不应该强依赖微信。

为什么所有会员相关表都带 `tenantId`：

- ERP/SaaS 系统可能服务多个商家。
- 同一个手机号或 openid 在不同租户下可能是不同业务身份。
- 查询时必须带 `tenantId`，避免跨租户读写数据。

## 定义会员类型

### `member.types.ts`

```ts
export type MemberStatus = 'enabled' | 'disabled';
export type PointsDirection = 'increase' | 'decrease';

export type Member = {
  id: string;
  tenantId: string;
  nickname?: string;
  avatarUrl?: string;
  phone?: string;
  gender?: string;
  birthday?: string;
  points: number;
  status: MemberStatus;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type MemberWechatIdentity = {
  id: string;
  tenantId: string;
  memberId: string;
  openid: string;
  unionid?: string;
  sessionKeyHash?: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type MemberAddress = {
  id: string;
  tenantId: string;
  memberId: string;
  receiverName: string;
  receiverPhone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  postalCode?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type MemberFavorite = {
  id: string;
  tenantId: string;
  memberId: string;
  productId: string;
  createdAt: Date;
};

export type MemberPointsLog = {
  id: string;
  tenantId: string;
  memberId: string;
  bizType: string;
  bizId?: string;
  direction: PointsDirection;
  points: number;
  balanceAfter: number;
  remark?: string;
  createdAt: Date;
};

export type CurrentMemberPayload = {
  tenantId: string;
  memberId: string;
  openid?: string;
};
```

为什么 `Member` 里只放 `points` 余额，同时还要有 `MemberPointsLog`：

- `points` 是当前余额，查询会员中心时快。
- `MemberPointsLog` 是流水，排查和对账时用。
- 真实系统里余额和流水要放在同一个数据库事务里更新。

为什么教学版 id 用 `string`，真实项目可能用 `BigInt`：

- 教学版更方便直接返回 JSON。
- Node.js 的 `BigInt` 不能直接 `JSON.stringify`，真实项目要转成字符串返回。
- 真实数据库用 `BigInt` 是为了支撑更大的数据量。

## 定义 DTO，让接口输入先变干净

DTO 负责描述接口可以接收什么字段，并做基础校验。

### `miniapp-login.dto.ts`

```ts
import { IsOptional, IsString, Length } from 'class-validator';

export class MiniappLoginDto {
  @IsString()
  @Length(1, 128)
  code!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  nickname?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;
}
```

为什么小程序登录传的是 `code`，不是 `openid`：

- `code` 是小程序端通过微信登录能力拿到的临时凭证。
- `openid` 必须由服务端拿 `code` 去微信服务器换。
- 如果让前端直接传 `openid`，别人可以伪造身份。

### `bind-phone.dto.ts`

教学阶段可以先用明文手机号练习流程：

```ts
import { IsString, Matches } from 'class-validator';

export class BindPhoneDto {
  @IsString()
  @Matches(/^1[3-9]\d{9}$/)
  phone!: string;
}
```

真实微信接入时，建议改成：

```ts
import { IsString } from 'class-validator';

export class BindWechatPhoneDto {
  @IsString()
  phoneCode!: string;
}
```

为什么真实项目不要长期相信前端传来的手机号：

- 前端传什么都可以被抓包篡改。
- 微信手机号能力通常是前端拿一次性 `phoneCode`，服务端再向微信换取手机号。
- 服务端换到手机号后再绑定会员，可信度更高。

### `address-mutation.dto.ts`

```ts
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class AddressMutationDto {
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

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
```

为什么地址用单独 DTO：

- 地址新增和修改的字段基本一致。
- Controller 不需要关心字段是否合法。
- 后面如果加省市区编码，只改 DTO 和 Service，不改接口结构。

### 查询 DTO

```ts
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class MemberFavoriteQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class MemberPointsQueryDto {
  @IsOptional()
  @IsString()
  bizType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class MemberQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  status?: 'enabled' | 'disabled';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}
```

为什么分页参数要限制最大值：

- 不限制 `pageSize`，有人传 `100000` 会压垮数据库。
- 后台列表和小程序列表都应该分页。
- 接口层先限制，可以减少业务层防御成本。

## 实现会员仓储

当前项目没有 `member.repository.ts` 这层内存仓储。会员、微信身份、地址、收藏、积分流水都通过 `MemberService` 直接注入 `PrismaService` 读写 MySQL。

### `member.service.ts` 的存储入口

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentMemberPayload } from '../../common/decorators/current-member.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AddressMutationDto } from './dto/address-mutation.dto';

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  async listAddresses(tenantId: string, memberId: string) {
    return this.prisma.ecMemberAddress.findMany({
      where: {
        tenantId: BigInt(tenantId),
        memberId: BigInt(memberId),
        deletedAt: null,
      },
      orderBy: [
        { isDefault: 'desc' },
        { updatedAt: 'desc' },
      ],
    });
  }

  async createAddress(member: CurrentMemberPayload, dto: AddressMutationDto) {
    await this.ensureAddressLimit(member);
    const shouldSetDefault = dto.isDefault || !(await this.hasAddress(member));

    const address = await this.prisma.$transaction(async (tx) => {
      if (shouldSetDefault) {
        await this.clearDefaultAddress(tx, member);
      }

      return tx.ecMemberAddress.create({
        data: {
          tenantId: member.tenantId,
          memberId: member.memberId,
          receiverName: dto.receiverName,
          receiverPhone: dto.receiverPhone,
          province: dto.province,
          city: dto.city,
          district: dto.district,
          detail: dto.detail,
          postalCode: dto.postalCode,
          isDefault: shouldSetDefault,
        },
      });
    });

    return this.toAddress(address);
  }

  private clearDefaultAddress(
    tx: Prisma.TransactionClient,
    member: CurrentMemberPayload,
  ) {
    return tx.ecMemberAddress.updateMany({
      where: {
        tenantId: member.tenantId,
        memberId: member.memberId,
        deletedAt: null,
        isDefault: true,
      },
      data: {
        isDefault: false,
      },
    });
  }

  private async hasAddress(member: CurrentMemberPayload) {
    const count = await this.prisma.ecMemberAddress.count({
      where: {
        tenantId: member.tenantId,
        memberId: member.memberId,
        deletedAt: null,
      },
    });
    return count > 0;
  }
}
```

### 收藏和积分也是 Prisma

```ts
async addFavorite(member: CurrentMemberPayload, productId: string) {
  const tenantId = member.tenantId;
  const parsedProductId = this.parseBigInt(productId, '商品ID格式错误');
  const product = await this.prisma.ecProduct.findFirst({
    where: {
      id: parsedProductId,
      tenantId,
      deletedAt: null,
    },
    include: {
      category: true,
      brand: true,
      skus: true,
    },
  });
  if (!product) {
    throw new NotFoundException('商品不存在');
  }

  const existing = await this.prisma.ecMemberFavorite.findFirst({
    where: {
      tenantId,
      memberId: member.memberId,
      productId: parsedProductId,
      deletedAt: null,
    },
    include: {
      product: {
        include: {
          category: true,
          brand: true,
          skus: true,
        },
      },
    },
  });
  if (existing) {
    return this.toFavorite(existing);
  }

  await this.prisma.ecMemberFavorite.deleteMany({
    where: {
      tenantId,
      memberId: member.memberId,
      productId: parsedProductId,
    },
  });

  const favorite = await this.prisma.ecMemberFavorite.create({
    data: {
      tenantId,
      memberId: member.memberId,
      productId: parsedProductId,
    },
    include: {
      product: {
        include: {
          category: true,
          brand: true,
          skus: true,
        },
      },
    },
  });

  return this.toFavorite(favorite);
}

async listMemberPoints(member: CurrentMemberPayload, query: MemberPointsQueryDto = {}) {
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const where = {
    tenantId: member.tenantId,
    memberId: member.memberId,
    deletedAt: null,
  };

  const [items, total] = await Promise.all([
    this.prisma.ecMemberPointsLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: {
        createdAt: 'desc',
      },
    }),
    this.prisma.ecMemberPointsLog.count({ where }),
  ]);

  return {
    items: items.map((item) => this.toPointLog(item)),
    page,
    pageSize,
    total,
  };
}
```

这一段里有几个很重要的设计点。

为什么新增第一个地址时自动设为默认地址：

- 下单时通常需要一个默认地址。
- 用户第一次填地址时，如果不自动设默认，后续下单还要多一步选择。

为什么设置默认地址要先清空其他默认地址：

- 一个会员同时只能有一个默认地址。
- 如果不清空，后面下单取默认地址会变得不确定。
- 当前项目用 `prisma.$transaction` 保证“清空旧默认 + 设置新默认”一起成功。

为什么收藏接口重复收藏直接返回已有记录：

- 收藏按钮可能被用户连点。
- 前端也可能重复请求。
- 收藏是天然幂等操作，重复收藏不应该报错影响体验。
- 当前项目先查 `ec_member_favorite`，存在则直接返回；不存在再写入。

为什么积分增加时要同时写流水：

- 只改余额，不知道积分从哪里来的。
- 出现投诉时无法解释。
- 营销、订单、售后都会影响积分，必须可追溯。

## 先做 mock 登录

真实微信登录需要小程序 appid、secret、微信开发者工具和微信接口。学习时一上来就接真实微信，会被环境问题卡住。

所以先做 mock 登录：

```text
POST /api/app/v1/auth/mock-login
```

请求：

```json
{
  "code": "dev-user-001",
  "nickname": "学习用户",
  "avatarUrl": "https://example.com/avatar.png"
}
```

返回：

```json
{
  "accessToken": "jwt token",
  "member": {
    "id": "member id",
    "nickname": "学习用户",
    "points": 10
  }
}
```

为什么一定要先做 mock：

- 不依赖微信环境，服务端自己就能跑通。
- 前端可以先联调会员中心、地址、收藏。
- 真实微信接入只是替换“获取 openid 的方式”，业务主流程不变。

### `wechat-miniapp.gateway.ts`

这一层负责和微信打交道。教学版同时提供 mock 和 real 两种实现。

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type WechatSession = {
  openid: string;
  unionid?: string;
  sessionKey?: string;
};

@Injectable()
export class WechatMiniappGateway {
  constructor(private readonly configService: ConfigService) {}

  async mockCode2Session(code: string): Promise<WechatSession> {
    return {
      openid: `mock_openid_${code}`,
      unionid: `mock_unionid_${code}`,
      sessionKey: `mock_session_key_${code}`,
    };
  }

  async code2Session(code: string): Promise<WechatSession> {
    const appid = this.configService.get<string>('WECHAT_MINIAPP_APPID');
    const secret = this.configService.get<string>('WECHAT_MINIAPP_SECRET');

    if (!appid || !secret) {
      throw new UnauthorizedException('微信小程序配置缺失');
    }

    const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
    url.searchParams.set('appid', appid);
    url.searchParams.set('secret', secret);
    url.searchParams.set('js_code', code);
    url.searchParams.set('grant_type', 'authorization_code');

    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok || data.errcode) {
      throw new UnauthorizedException(data.errmsg || '微信登录失败');
    }

    return {
      openid: data.openid,
      unionid: data.unionid,
      sessionKey: data.session_key,
    };
  }
}
```

为什么把微信请求封装成 Gateway，而不是写在 `AuthService` 里：

- `AuthService` 关心登录业务，不应该关心微信 URL 怎么拼。
- 后面可以给 Gateway 加超时、重试、日志、mock。
- 测试 `AuthService` 时可以替换 Gateway，不必真的请求微信。

为什么不能把 `session_key` 原样返回给前端：

- `session_key` 是敏感凭证。
- 服务端用它做解密或校验即可。
- 如果需要保存，也应该加密或保存 hash，不要明文扩散。

## AuthService 实现小程序登录

### 登录流程

```text
前端 wx.login 拿到 code
  -> POST /api/app/v1/auth/wechat-login
  -> 服务端 code2Session 换 openid
  -> 查 ec_member_wechat 是否存在
  -> 不存在则创建 ec_member 和 ec_member_wechat
  -> 存在则找到对应 ec_member
  -> 更新 lastLoginAt
  -> 签发 type=member 的 JWT
  -> 记录服务端 session
```

### `auth.service.ts`

```ts
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { MiniappLoginDto } from './dto/miniapp-login.dto';
import { BindPhoneDto } from './dto/bind-phone.dto';
import { CurrentMemberPayload } from '../../common/decorators/current-member.decorator';
import { MarketingService } from '../marketing/marketing.service';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly marketingService: MarketingService,
  ) {}

  async miniappMockLogin(dto: MiniappLoginDto) {
    return this.wechatLogin(dto, true);
  }

  async wechatLogin(dto: MiniappLoginDto, forceMock = false) {
    const tenant = await this.getDefaultTenant();
    const session = await this.resolveWechatSession(dto, forceMock);
    const existingIdentity = await this.prisma.ecMemberWechat.findFirst({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        OR: [
          { openid: session.openid },
          ...(session.unionid ? [{ unionid: session.unionid }] : []),
        ],
      },
      include: {
        member: true,
      },
    });

    const now = new Date();
    let member = existingIdentity?.member;
    let isNewMember = false;

    if (!member || member.deletedAt) {
      member = await this.prisma.ecMember.create({
        data: {
          tenantId: tenant.id,
          nickname: dto.nickname || '微信用户',
          avatarUrl: dto.avatarUrl || null,
          status: 'enabled',
          lastLoginAt: now,
        },
      });
      isNewMember = true;
    } else {
      await this.prisma.ecMember.update({
        where: {
          id: member.id,
        },
        data: {
          lastLoginAt: now,
          nickname: dto.nickname && !member.nickname ? dto.nickname : member.nickname || undefined,
          avatarUrl: dto.avatarUrl && !member.avatarUrl ? dto.avatarUrl : member.avatarUrl || undefined,
        },
      });
    }

    if (member.status !== 'enabled') {
      throw new UnauthorizedException('会员已被禁用');
    }

    await this.prisma.ecMemberWechat.upsert({
      where: {
        tenantId_openid: {
          tenantId: tenant.id,
          openid: session.openid,
        },
      },
      create: {
        tenantId: tenant.id,
        memberId: member.id,
        openid: session.openid,
        unionid: session.unionid || null,
        sessionKeyHash: this.hashValue(session.sessionKey),
        lastLoginAt: now,
      },
      update: {
        memberId: member.id,
        unionid: session.unionid || null,
        sessionKeyHash: this.hashValue(session.sessionKey),
        lastLoginAt: now,
        deletedAt: null,
      },
    });

    if (isNewMember) {
      await this.marketingService.issueStarterCoupons(tenant.id, member.id);
      await this.marketingService.issueStarterPoints(tenant.id, member.id);
    }

    const token = await this.jwtService.signAsync({
      sub: member.id.toString(),
      tenantId: tenant.id.toString(),
      openid: session.openid,
      type: 'member',
    });
    await this.redisService.rememberLoginSession({
      scope: 'member',
      tenantId: tenant.id.toString(),
      actorId: member.id.toString(),
      token,
      ttlSeconds: this.resolveJwtTtlSeconds(),
    });

    return {
      token,
      member: await this.getProfile({
        memberId: member.id,
        tenantId: tenant.id,
        openid: session.openid,
      }),
    };
  }

  async bindPhone(member: CurrentMemberPayload, dto: BindPhoneDto) {
    const currentMember = await this.prisma.ecMember.findFirst({
      where: {
        tenantId: member.tenantId,
        id: member.memberId,
        deletedAt: null,
      },
    });
    if (!currentMember) {
      throw new NotFoundException('会员不存在');
    }

    const phone = await this.resolveWechatPhone(dto);
    const updated = await this.prisma.ecMember.update({
      where: {
        id: currentMember.id,
      },
      data: {
        phone,
      },
    });

    return this.toMemberProfile(updated);
  }
}
```

为什么 JWT payload 里要放 `type: 'member'`：

- 后台管理员 token 和小程序会员 token 必须区分。
- 否则管理员 token 可能误访问小程序接口，或者会员 token 误访问后台接口。
- Guard 可以根据 `type` 做第一层身份隔离。

为什么登录成功还要记录服务端 session：

- 纯 JWT 在过期前通常一直有效。
- 用户被禁用、退出登录、修改关键身份信息时，需要服务端主动让 token 失效。
- Redis session 可以记录当前服务端是否仍然承认这个 token 对应的登录态。

为什么第一次登录赠送积分放在服务端：

- 前端不能决定是否赠送积分。
- 服务端可以保证只在新会员创建时赠送一次。
- 当前项目新会员会调用 `MarketingService.issueStarterCoupons()` 和 `issueStarterPoints()`。

## Controller 暴露登录接口

### `auth.controller.ts`

```ts
import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { MiniappLoginDto } from './dto/miniapp-login.dto';
import { BindPhoneDto } from './dto/bind-phone.dto';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { CurrentMemberPayload } from '../member/member.types';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/api/app/v1/auth/mock-login')
  miniappMockLogin(@Body() dto: MiniappLoginDto) {
    return this.authService.miniappMockLogin(dto);
  }

  @Post('/api/app/v1/auth/wechat-login')
  wechatLogin(@Body() dto: MiniappLoginDto) {
    return this.authService.wechatLogin(dto);
  }

  @UseGuards(MemberAuthGuard)
  @Post('/api/app/v1/auth/bind-phone')
  bindPhone(
    @CurrentMember() member: CurrentMemberPayload,
    @Body() dto: BindPhoneDto,
  ) {
    return this.authService.bindPhone(member, dto);
  }
}
```

为什么 `bind-phone` 要登录后才能调用：

- 绑定手机号是给当前会员绑定，不是创建匿名手机号记录。
- 不登录就不知道手机号要绑定到哪个 `memberId`。
- 真实微信手机号能力也通常建立在当前小程序登录身份上。

为什么 mock 登录和真实微信登录路径分开：

- 本地开发和演示更清楚。
- 真实环境可以禁用 mock 登录。
- 前端联调时可以明确知道自己用的是哪种身份来源。

## 实现 CurrentMember 装饰器

Guard 校验完 token 后，会把会员身份挂到 request 上。Controller 通过装饰器取出来。

### `current-member.decorator.ts`

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentMemberPayload = {
  tenantId: string;
  memberId: string;
  openid?: string;
};

export const CurrentMember = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentMemberPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.member;
  },
);
```

为什么不用每个接口自己解析 token：

- 重复代码太多。
- 容易有接口忘记校验。
- Controller 应该专注参数转发，不应该处理鉴权细节。

## 实现 MemberAuthGuard

### `member-auth.guard.ts`

```ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

type SessionStore = {
  has(scope: 'member', tenantId: string, actorId: string): Promise<boolean>;
};

type MemberTokenPayload = {
  sub: string;
  tenantId: string;
  type: string;
  openid?: string;
};

@Injectable()
export class MemberAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly sessionStore: SessionStore,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization ?? '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    const payload = await this.verifyToken(token);

    if (payload.type !== 'member') {
      throw new UnauthorizedException('会员身份无效');
    }

    const sessionAlive = await this.sessionStore.has(
      'member',
      payload.tenantId,
      payload.sub,
    );

    if (!sessionAlive) {
      throw new UnauthorizedException('登录态已失效，请重新登录');
    }

    request.member = {
      tenantId: payload.tenantId,
      memberId: payload.sub,
      openid: payload.openid,
    };

    return true;
  }

  private async verifyToken(token: string): Promise<MemberTokenPayload> {
    try {
      return await this.jwtService.verifyAsync<MemberTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('登录已过期，请重新登录');
    }
  }
}
```

为什么要单独有 `MemberAuthGuard`，而不是复用 `AdminAuthGuard`：

- 后台接口检查的是管理员、角色、权限。
- 小程序接口检查的是会员、登录态、会员状态。
- 两类身份的业务含义完全不同。
- 单独 Guard 可以避免后台 token 和会员 token 混用。

为什么 Guard 里要查 session：

- JWT 验签只能证明 token 是服务端签的。
- session 可以证明服务端当前仍然承认这个登录态。
- 会员被禁用、强制下线、修改密码或退出登录时，可以删除 session。

## 实现会员业务服务

### `member.service.ts`

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentMemberPayload } from '../../common/decorators/current-member.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { MemberFavoriteQueryDto } from './dto/member-favorite-query.dto';
import { MemberPointsQueryDto } from './dto/member-points-query.dto';
import { MemberQueryDto } from './dto/member-query.dto';

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(member: CurrentMemberPayload) {
    const profile = await this.prisma.ecMember.findFirst({
      where: {
        tenantId: member.tenantId,
        id: member.memberId,
        deletedAt: null,
      },
    });
    if (!profile) {
      throw new NotFoundException('会员不存在');
    }

    const [couponCount, availableCouponCount, addressCount, favoriteCount] =
      await Promise.all([
        this.prisma.mkCoupon.count({
          where: {
            tenantId: member.tenantId,
            memberId: member.memberId,
            deletedAt: null,
          },
        }),
        this.prisma.mkCoupon.count({
          where: {
            tenantId: member.tenantId,
            memberId: member.memberId,
            deletedAt: null,
            status: 'available',
          },
        }),
        this.prisma.ecMemberAddress.count({
          where: {
            tenantId: member.tenantId,
            memberId: member.memberId,
            deletedAt: null,
          },
        }),
        this.prisma.ecMemberFavorite.count({
          where: {
            tenantId: member.tenantId,
            memberId: member.memberId,
            deletedAt: null,
            product: {
              deletedAt: null,
            },
          },
        }),
      ]);

    return {
      id: profile.id.toString(),
      tenantId: profile.tenantId.toString(),
      nickname: profile.nickname || '',
      avatarUrl: profile.avatarUrl || '',
      phone: profile.phone || '',
      points: profile.points,
      status: profile.status,
      lastLoginAt: profile.lastLoginAt?.toISOString() || null,
      couponCount,
      availableCouponCount,
      addressCount,
      favoriteCount,
    };
  }

  async addFavorite(member: CurrentMemberPayload, productId: string) {
    const tenantId = member.tenantId;
    const parsedProductId = BigInt(productId);
    const product = await this.prisma.ecProduct.findFirst({
      where: {
        id: parsedProductId,
        tenantId,
        deletedAt: null,
      },
      include: {
        category: true,
        brand: true,
        skus: true,
      },
    });
    if (!product) {
      throw new NotFoundException('商品不存在');
    }

    const existing = await this.prisma.ecMemberFavorite.findFirst({
      where: {
        tenantId,
        memberId: member.memberId,
        productId: parsedProductId,
        deletedAt: null,
      },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            skus: true,
          },
        },
      },
    });
    if (existing) {
      return this.toFavorite(existing);
    }

    const favorite = await this.prisma.ecMemberFavorite.create({
      data: {
        tenantId,
        memberId: member.memberId,
        productId: parsedProductId,
      },
      include: {
        product: {
          include: {
            category: true,
            brand: true,
            skus: true,
          },
        },
      },
    });

    return this.toFavorite(favorite);
  }

  async listFavorites(member: CurrentMemberPayload, query: MemberFavoriteQueryDto = {}) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where: Prisma.EcMemberFavoriteWhereInput = {
      tenantId: member.tenantId,
      memberId: member.memberId,
      deletedAt: null,
      product: {
        deletedAt: null,
      },
    };

    const [items, total] = await Promise.all([
      this.prisma.ecMemberFavorite.findMany({
        where,
        include: {
          product: {
            include: {
              category: true,
              brand: true,
              skus: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
      }),
      this.prisma.ecMemberFavorite.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toFavorite(item)),
      page,
      pageSize,
      total,
    };
  }

  async listMemberPoints(member: CurrentMemberPayload, query: MemberPointsQueryDto = {}) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where = {
      tenantId: member.tenantId,
      memberId: member.memberId,
      deletedAt: null,
    };

    const [items, total] = await Promise.all([
      this.prisma.ecMemberPointsLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.ecMemberPointsLog.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toPointLog(item)),
      page,
      pageSize,
      total,
    };
  }

  async adminListMembers(query: MemberQueryDto = {}) {
    const tenantId = await this.getDefaultTenantId();
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const where: Prisma.EcMemberWhereInput = {
      tenantId,
      deletedAt: null,
    };

    if (query.keyword) {
      where.OR = [
        { nickname: { contains: query.keyword } },
        { phone: { contains: query.keyword } },
      ];
    }
    if (query.phone) {
      where.phone = { contains: query.phone };
    }
    if (query.status) {
      where.status = query.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.ecMember.findMany({
        where,
        include: {
          _count: {
            select: {
              addresses: true,
              orders: true,
              aftersales: true,
              wechatIdentities: true,
              favorites: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: {
          createdAt: 'desc',
        },
      }),
      this.prisma.ecMember.count({ where }),
    ]);

    return {
      items: items.map((item) => this.toMemberListItem(item)),
      page,
      pageSize,
      total,
    };
  }

  async adminMemberDetail(id: string) {
    const tenantId = await this.getDefaultTenantId();
    const member = await this.prisma.ecMember.findFirst({
      where: {
        id: BigInt(id),
        tenantId,
        deletedAt: null,
      },
      include: {
        addresses: {
          where: { deletedAt: null },
          orderBy: [
            { isDefault: 'desc' },
            { updatedAt: 'desc' },
          ],
        },
        pointsLogs: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        wechatIdentities: {
          where: { deletedAt: null },
          orderBy: { lastLoginAt: 'desc' },
        },
      },
    });
    if (!member) {
      throw new NotFoundException('会员不存在');
    }

    return this.toMemberDetail(member);
  }
}
```

为什么收藏商品前要查商品是否存在且已上架：

- 不能收藏已经删除的商品。
- 小程序用户不应该收藏未上架商品。
- 后面订单也必须复用类似规则，不能购买未上架 SKU。

为什么 `MemberService` 直接查商品表：

- 当前项目已经没有商品数组，收藏商品时直接通过 Prisma 查 `ec_product`。
- 查询收藏列表时带上 `category`、`brand`、`skus`，返回商品摘要给小程序。
- 如果后面商品搜索换成 Elasticsearch，也应保持会员接口返回结构稳定。

为什么后台查看会员也放在 `MemberService`：

- 后台查看的是同一类会员数据。
- 不要因为入口不同就复制一套业务查询。
- 可以在 Controller 层区分后台路由和小程序路由，在 Service 层复用核心查询。

## 实现会员 Controller

### `member.controller.ts`

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { CurrentMember } from '../../common/decorators/current-member.decorator';
import { CurrentMemberPayload } from './member.types';
import { AddressMutationDto } from './dto/address-mutation.dto';
import { MemberFavoriteQueryDto } from './dto/member-favorite-query.dto';
import { MemberPointsQueryDto } from './dto/member-points-query.dto';
import { MemberQueryDto } from './dto/member-query.dto';
import { MemberService } from './member.service';

@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/members')
export class MemberProfileController {
  constructor(private readonly memberService: MemberService) {}

  @Get('/me')
  profile(@CurrentMember() member: CurrentMemberPayload) {
    return this.memberService.getProfile(member);
  }

  @Get('/points')
  points(
    @CurrentMember() member: CurrentMemberPayload,
    @Query() query: MemberPointsQueryDto,
  ) {
    return this.memberService.listMemberPoints(member, query);
  }
}

@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/addresses')
export class MemberAddressController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  list(@CurrentMember() member: CurrentMemberPayload) {
    return this.memberService.listAddresses(member);
  }

  @Post()
  create(
    @CurrentMember() member: CurrentMemberPayload,
    @Body() dto: AddressMutationDto,
  ) {
    return this.memberService.createAddress(member, dto);
  }

  @Put('/:id')
  update(
    @CurrentMember() member: CurrentMemberPayload,
    @Param('id') id: string,
    @Body() dto: AddressMutationDto,
  ) {
    return this.memberService.updateAddress(member, id, dto);
  }

  @Post('/:id/default')
  setDefault(
    @CurrentMember() member: CurrentMemberPayload,
    @Param('id') id: string,
  ) {
    return this.memberService.setDefaultAddress(member, id);
  }

  @Delete('/:id')
  delete(
    @CurrentMember() member: CurrentMemberPayload,
    @Param('id') id: string,
  ) {
    return this.memberService.deleteAddress(member, id);
  }
}

@UseGuards(MemberAuthGuard)
@Controller('/api/app/v1/favorites')
export class MemberFavoriteController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  list(
    @CurrentMember() member: CurrentMemberPayload,
    @Query() query: MemberFavoriteQueryDto,
  ) {
    return this.memberService.listFavorites(member, query);
  }

  @Post('/:productId')
  add(
    @CurrentMember() member: CurrentMemberPayload,
    @Param('productId') productId: string,
  ) {
    return this.memberService.addFavorite(member, productId);
  }

  @Delete('/:productId')
  remove(
    @CurrentMember() member: CurrentMemberPayload,
    @Param('productId') productId: string,
  ) {
    return this.memberService.removeFavorite(member, productId);
  }
}

@UseGuards(AdminAuthGuard)
@Controller('/api/admin/v1/members')
export class AdminMemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  list(@Query() query: MemberQueryDto) {
    return this.memberService.adminListMembers(query);
  }

  @Get('/:id')
  detail(@Param('id') id: string) {
    return this.memberService.adminMemberDetail(id);
  }
}
```

为什么地址、收藏、会员资料拆成多个 Controller：

- 路由清晰：`/members` 是会员资料，`/addresses` 是地址，`/favorites` 是收藏。
- Swagger/OpenAPI 分组更清楚。
- 后面地址接口增多时，不会把一个 Controller 撑得太大。

为什么小程序接口用 `MemberAuthGuard`，后台会员列表用 `AdminAuthGuard`：

- 小程序用户只能看自己的资料。
- 后台管理员可以看会员列表和详情。
- 后台接口后续还要加 `member:read` 权限控制。

## 组装 Module

### `member.module.ts`

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { MemberService } from './member.service';
import {
  AdminMemberController,
  MemberAddressController,
  MemberFavoriteController,
  MemberProfileController,
} from './member.controller';

@Module({
  controllers: [
    MemberProfileController,
    MemberAddressController,
    MemberFavoriteController,
    AdminMemberController,
  ],
  providers: [MemberService, MemberAuthGuard],
  exports: [MemberService],
})
export class MemberModule {}
```

### `auth.module.ts`

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MarketingModule } from '../marketing/marketing.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    MarketingModule,
    RedisModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const options = {
          secret: configService.get<string>('jwt.accessSecret') || 'dev-access-secret',
          signOptions: {
            expiresIn: configService.get<string>('jwt.accessExpiresIn') || '2h',
          },
        };

        return options as JwtModuleOptions;
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, MemberAuthGuard],
  exports: [AuthService],
})
export class AuthModule {}
```

为什么 `MemberModule` 只导出 `MemberService`：

- 后面订单模块要读取会员地址。
- 后台会员列表、地址、收藏都应该走 Service 的业务规则。
- 当前项目没有 `MemberRepository`，会员数据由 `PrismaService` 统一读写 MySQL。

真实项目里不要随便导出 Repository，优先导出 Service：

- Repository 太底层，外部模块容易绕过业务规则。
- Service 可以保证“创建会员送积分”“地址数量限制”等规则被执行。

## 真实微信登录如何从 mock 切到 real

教学版 mock 登录：

```text
code -> mock_openid_code
```

真实微信登录：

```text
小程序 wx.login
  -> 拿到临时 code
  -> 服务端请求微信 code2Session
  -> 微信返回 openid/session_key/unionid
  -> 服务端查找或创建会员
```

真实接入时要配置：

```text
WECHAT_MINIAPP_APPID=你的小程序 appid
WECHAT_MINIAPP_SECRET=你的小程序 secret
```

接入时容易犯的错误：

| 问题 | 原因 | 解决 |
| --- | --- | --- |
| `invalid code` | code 已过期或重复使用 | 前端每次登录重新调用 `wx.login` |
| `appid missing` | 环境变量没配置 | 检查 `.env` 和 ConfigModule |
| 登录一直创建新会员 | openid 没有唯一查询 | 给 `tenantId + openid` 加唯一索引 |
| 本地无法请求微信 | 网络或代理问题 | 保留 mock 登录用于本地开发 |
| openid 被伪造 | 相信了前端传 openid | 服务端必须用 code 向微信换 openid |
| session_key 泄露 | 返回给了前端或明文打日志 | 不返回、不打印，必要时加密或 hash |

为什么 `code2Session` 后服务端还要签发自己的 JWT：

- 微信只证明“这是微信里的某个用户”。
- ERP 需要自己的登录态、权限、会员状态、租户信息。
- 后续订单、支付、售后都应该基于系统自己的 `memberId`。

## 绑定手机号怎么设计

学习版可以先直接传手机号：

```text
POST /api/app/v1/auth/bind-phone
Authorization: Bearer token

{
  "phone": "13800138000"
}
```

真实微信版建议改成：

```text
POST /api/app/v1/auth/bind-phone
Authorization: Bearer token

{
  "phoneCode": "微信手机号临时凭证"
}
```

服务端流程：

```text
校验会员 token
  -> 拿 phoneCode 请求微信手机号接口
  -> 得到手机号
  -> 检查当前租户下手机号是否已绑定其他会员
  -> 绑定到当前 member
```

为什么手机号不是会员登录的第一步：

- 小程序里通常先通过微信身份建立会员。
- 手机号属于补充资料和强联系信息。
- 有些用户可能只浏览商品，不一定立刻授权手机号。
- 到下单、售后、发货通知等场景再引导绑定手机号更自然。

为什么手机号要加唯一索引：

```text
tenantId + phone 唯一
```

- 一个租户内同一个手机号通常只能对应一个会员。
- 避免用户资产、积分、优惠券被分散到多个账号。
- 如果业务允许一个手机号多个账号，也必须明确写出合并账号规则。

账号合并怎么处理：

```text
会员 A：微信 openid 登录，有订单
会员 B：手机号登录，有积分
现在发现是同一个人
```

简单项目先不做自动合并。真实项目建议：

- 后台提供会员合并工具。
- 合并前展示订单、积分、优惠券、售后风险。
- 合并过程用事务。
- 合并后保留合并日志，便于追溯。

## 地址模块为什么要认真设计

地址看起来只是 CRUD，但下单时非常关键。

地址表核心字段：

```text
ec_member_address
  id
  tenant_id
  member_id
  receiver_name
  receiver_phone
  province
  city
  district
  detail
  postal_code
  is_default
  created_at
  updated_at
  deleted_at
```

为什么订单不能只保存 `addressId`：

- 用户下单后可能修改地址。
- 历史订单必须保留当时的收货信息。
- 所以下单时要把会员地址快照复制到订单地址表。

先做会员地址 CRUD，后面做订单时再引入：

```text
ec_order_address
```

地址接口调用顺序：

```text
1. 登录得到 token
2. POST /api/app/v1/addresses 创建地址
3. GET /api/app/v1/addresses 查看地址列表
4. POST /api/app/v1/addresses/:id/default 设置默认地址
5. 下单预览时读取默认地址
```

为什么删除地址用软删除更合适：

- 地址可能已经被历史订单引用。
- 删除后仍然可能需要后台排查。
- 用户看不到即可，数据库里可以保留 `deletedAt`。

## 收藏模块为什么放在会员下

收藏是会员行为，不是商品主数据。

收藏表：

```text
ec_member_favorite
  id
  tenant_id
  member_id
  product_id
  created_at
```

唯一约束：

```text
tenant_id + member_id + product_id
```

为什么收藏不放在商品表的一个 JSON 字段里：

- 商品可能被很多会员收藏。
- 会员要查询“我的收藏”。
- 商品也可能需要统计收藏数。
- 用独立表可以支持分页、索引、统计。

为什么收藏的是 `productId`，不是 `skuId`：

- 收藏通常是收藏商品整体。
- SKU 是购买时才选择的具体规格。
- 如果业务需要收藏某个具体规格，可以另加 `skuId`，但第一版不需要。

## 积分模块为什么要有流水

只保存会员积分余额：

```text
ec_member.points = 100
```

问题是：

- 不知道这 100 分从哪里来。
- 不知道什么时候扣过。
- 用户投诉时无法解释。
- 财务或运营无法对账。

所以要有积分流水：

```text
ec_member_points_log
  id
  tenant_id
  member_id
  biz_type
  biz_id
  direction
  points
  balance_after
  remark
  created_at
```

常见 `bizType`：

```text
register       注册赠送
order_pay      下单支付赠送
order_refund   订单退款扣回
manual_adjust  后台人工调整
campaign       营销活动赠送
```

真实项目里积分变动必须满足：

```text
更新会员积分余额
  + 写积分流水
  + 防止余额变负
  + 幂等防重复发放
```

为什么要记录 `balanceAfter`：

- 单看某条流水的 `points` 不知道变化后的余额。
- 排查时可以顺着流水核对余额是否连续。
- 对账、审计、客服解释都更方便。

## 接口测试顺序

### mock 登录

```bash
curl -X POST http://localhost:3000/api/app/v1/auth/mock-login \
  -H "Content-Type: application/json" \
  -d "{\"code\":\"dev-user-001\",\"nickname\":\"学习用户\"}"
```

拿到返回里的 `accessToken`。

### 查看会员资料

```bash
curl http://localhost:3000/api/app/v1/members/me \
  -H "Authorization: Bearer <accessToken>"
```

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

### 收藏商品

```bash
curl -X POST http://localhost:3000/api/app/v1/favorites/<productId> \
  -H "Authorization: Bearer <accessToken>"
```

### 查看积分流水

```bash
curl http://localhost:3000/api/app/v1/members/points \
  -H "Authorization: Bearer <accessToken>"
```

## 本章和真实 ERP 项目的对应关系

真实项目中可以重点看：

```text
server/src/modules/auth/auth.controller.ts
server/src/modules/auth/auth.service.ts
server/src/modules/auth/dto/miniapp-login.dto.ts
server/src/modules/auth/dto/bind-phone.dto.ts
server/src/common/guards/member-auth.guard.ts
server/src/common/decorators/current-member.decorator.ts

server/src/modules/member/member.controller.ts
server/src/modules/member/member.service.ts
server/src/modules/member/dto/address-mutation.dto.ts
server/src/modules/member/dto/member-favorite-query.dto.ts
server/src/modules/member/dto/member-points-query.dto.ts
server/src/modules/member/dto/member-query.dto.ts

server/prisma/schema.prisma
  EcMember
  EcMemberWechat
  EcMemberAddress
  EcMemberFavorite
  EcMemberPointsLog
```

简单版和真实项目的区别：

| 能力 | 简单版 | 真实项目 |
| --- | --- | --- |
| 数据保存 | Prisma + MySQL | 当前项目真实实现 |
| 登录 session | Redis 登录态 | 当前项目真实实现 |
| 微信登录 | mock + fetch 示例 | 配置化 mock/real |
| 积分赠送 | 注册时简单赠送 | 营销模块统一发券发积分 |
| 地址默认 | 数据库事务 | 当前项目真实实现 |
| 收藏防重复 | 唯一索引/条件查询 | 当前项目真实实现 |
| 后台权限 | 示例 AdminAuthGuard | RBAC 权限点 |

