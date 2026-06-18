通过一个完整的电商ERP商城业务系统来学习nodejs，该服务两个主要前端：

| 前端 | 目录 | 调用接口 | 角色 |
| --- | --- | --- | --- |
| PC 管理后台 | [pc-admin](../../pc-admin) | `/api/admin/v1/*` | 给商家员工使用，管理商品、订单、库存、会员、财务、营销、系统权限 |
| 微信小程序 | [wechat-miniapp](../../wechat-miniapp) | `/api/app/v1/*` | 给消费者使用，浏览商品、加购物车、下单、支付、售后、查看消息 |

```text
PC 后台
    \
     -> Node.js 服务端 -> MySQL / Redis / RabbitMQ / 文件存储 / 微信支付
    /
微信小程序
```

服务端负责的事情不是“简单转发请求”，而是：

- 判断谁能访问接口。
- 校验前端传来的参数。
- 计算价格、优惠、运费。
- 创建订单、锁库存。
- 处理支付和退款回调。
- 管理售后、发货、物流。
- 生成财务账单和报表。
- 维护权限、菜单、配置、审计日志。
- 处理文件上传、导入导出、异步任务。
- 用 MQ、Redis、定时任务保证系统更可靠。

## 1. 服务端整体架构

服务端使用 NestJS 组织代码，核心目录结构：

```text
server/
  src/
    main.ts              # 应用启动入口
    app.module.ts        # 根模块，汇总所有业务模块
    config/              # 配置
    common/              # 通用能力：守卫、拦截器、异常过滤器、装饰器、工具
    modules/             # 业务模块
    openapi.ts           # Swagger/OpenAPI
  prisma/
    schema.prisma        # 数据库模型
    seed.ts              # 初始数据
  scripts/               # 测试、OpenAPI 导出、交易流程检查
  openapi.json           # 导出的接口文档
```

一次请求的大致流转：

```text
HTTP 请求
  -> Fastify 接收
  -> Nest 全局管道校验参数
  -> 限流 Guard
  -> 后台/会员鉴权 Guard
  -> 幂等 Interceptor
  -> 审计 Interceptor
  -> Controller
  -> Service
  -> Prisma / Redis / MQ / 文件存储 / 微信接口
  -> 统一响应 Interceptor
  -> HTTP 响应
```

这个流程说明了一个真实后端项目的分工：

| 层 | 负责什么 |
| --- | --- |
| Controller | 接收 HTTP 请求，读取 path/query/body/header，调用 Service |
| DTO | 描述请求参数，做校验和类型转换 |
| Service | 处理业务规则、状态流转、事务、多表读写 |
| PrismaService | 访问 MySQL |
| Guard | 进入业务前判断能不能访问，比如登录、权限、限流 |
| Interceptor | 请求前后做横切处理，比如幂等、审计、统一响应 |
| Filter | 统一异常响应 |
| Config | 从环境变量读取配置 |

## 2. 技术栈总览

| 技术 | 在本项目中解决什么问题 | 为什么适合这个项目 |
| --- | --- | --- |
| Node.js 20+ | 运行服务端 API | I/O 密集型业务多，适合接口服务；前后端都能用 TypeScript |
| TypeScript | 给接口、DTO、Service、Prisma 查询提供类型约束 | ERP 字段多、状态多、表多，类型能减少低级错误 |
| NestJS 11 | 模块化组织 Controller、Service、Guard、Interceptor、Filter | 比裸 Express 更适合中大型项目，代码边界清晰 |
| Fastify | HTTP 服务运行时 | 性能好，Nest 适配成熟，业务代码不用直接依赖底层 |
| Prisma | ORM、数据库模型、迁移、类型安全查询 | 初学者能从 `schema.prisma` 看懂表结构，写查询也更安全 |
| MySQL | 保存主业务数据 | 订单、库存、支付、财务强关系、强一致，关系型数据库更合适 |
| Redis | 登录态、缓存、分布式锁、限流 | 高频临时数据不适合都放 MySQL；TTL 和原子操作很有用 |
| RabbitMQ | 领域事件、异步任务、重试、死信 | 支付成功后的通知、账单、同步等动作需要异步解耦 |
| Outbox 模式 | 可靠消息发布 | 解决“数据库事务成功但 MQ 消息丢失”的问题 |
| Swagger/OpenAPI | 接口文档和前后端契约 | 接口很多，必须自动生成和校验，不能靠口头约定 |
| JWT | 后台和小程序登录 token | 适合 API 和多端调用 |
| Redis session | 让 JWT 可以主动失效 | 员工离职、改密码、踢下线时需要服务端撤销登录态 |
| bcryptjs | 密码 hash | 密码不能明文存储，bcrypt 更适合密码场景 |
| class-validator | DTO 参数校验 | 后端不能相信前端传参 |
| class-transformer | query/body 类型转换 | HTTP 参数默认是字符串，需要转 number/boolean |
| MinIO/S3 兼容存储 | 图片、附件、导入导出文件 | 文件不适合放数据库，只保存元数据到 MySQL |
| 微信支付 v3 | 小程序支付和退款 | 电商交易闭环必须接支付通道 |
| mock/local/fake 模式 | 本地开发不用真实微信、Redis、RabbitMQ、MinIO 也能跑 | 降低学习和联调门槛 |


## 3. 为什么项目用 NestJS 分模块

这个项目不是只有几个接口，而是一个完整业务系统。模块按业务域拆分：

```text
auth          登录认证
system        后台用户、角色、权限、菜单、配置、审计
catalog       商品、分类、品牌、SKU、评价
cart          购物车
order         订单
payment       支付和退款回调
inventory     库存
fulfillment   发货和物流
aftersale     售后
member        会员、地址、积分、收藏
marketing     优惠券、促销、运费
cms           Banner、首页模块、公告、协议
finance       财务账单、对账、结算
report        报表
search        商品搜索索引
file          文件中心
data-transfer 导入导出
redis         Redis 运维能力
mq            MQ 和 Outbox
notify        消息通知
scheduler     定时任务
health        健康检查
```

为什么这样拆：

- 每个模块围绕一个业务领域，学习和维护都更清楚。
- Controller、Service、DTO 放在同一个模块里，改某个业务时不用到处找文件。
- 通用能力放 `common/`，避免每个模块重复写登录、异常、响应包装。
- 基础设施模块如 Prisma、Redis、MQ、File 可以被多个业务模块复用。

为什么不按 `controllers/ services/ dto/` 这种技术目录拆：

- 小项目可以这样拆。
- ERP 的业务域很多，如果所有 Controller 放一个目录，所有 Service 放一个目录，改订单时会在多个大目录间跳来跳去。
- 按业务域拆更接近人的思考方式：我要改订单，就进 `modules/order`。

## 4. 进阶
如果想“真正上生产、抗高并发、多人团队长期维护”，还可以再加几个专题：

1. 线上日志、监控、链路追踪、告警
2. 慢查询优化、索引设计、分页优化、压测
3. CI/CD、灰度发布、回滚、数据库迁移策略
4. 密钥管理、HTTPS、CORS、安全加固、OWASP
5. 多租户隔离、数据权限、字段级权限
6. 更完整的测试体系：单测、集成测试、E2E、Testcontainers
7. 真实对象存储直传、文件安全扫描、图片处理
8. 大规模报表：快照表、数据仓库、异步预计算
9. API 版本管理、兼容旧客户端、接口废弃策略
10. 线上故障排查案例：支付异常、库存不一致、MQ 堆积
11. 财务报表

## mysql 和 redis安装启动
#### 将redis安装包文件解压打开，然后终端进入该文件夹并运行对应命令启动
``` ps1
.\redis-server.exe --service-install .\redis.windows.conf
.\redis-server.exe --service-start
```
停止服务
``` ps1
.\redis-server.exe --service-stop
```
卸载服务
``` ps1
.\redis-server.exe --service-uninstall
```

#### 接下来解压缩`mysql-8.0.36-winx64.zip`，第一次还要做一次“初始化数据目录”。在 Windows 上最省心的方式是把它注册成服务来启动,假设你把 MySQL 解压到了 D:\mysql-8.0.36-winx64，可以按下面做:
1. 先建一个 my.ini
放到 MySQL 根目录，比如 D:\mysql-8.0.36-winx64\my.ini
``` ini
[mysqld]
basedir=D:/mysql-8.0.36-winx64
datadir=D:/mysql-8.0.36-winx64/data
port=3306
character-set-server=utf8mb4
default-storage-engine=INNODB

[client]
port=3306
default-character-set=utf8mb4
```
2. 第一次初始化的时候，用管理员身份打开PowerShell，这一步只需要跑一次。如果你更想让 MySQL 自动生成一个临时 root 密码，可以把`--initialize-insecure`改成 `--initialize`：
``` ps1
.\bin\mysqld --defaults-file="D:\mysql-8.0.36-winx64\my.ini" --initialize-insecure --console
```
3. 注册成 Windows 服务并启动，还是在管理员 PowerShell 里执行：
``` ps1
.\bin\mysqld --install MySQL80 --defaults-file="D:\mysql-8.0.36-winx64\my.ini"
```
4. 之后可以一直使用以下命令启动和停止服务
``` ps1
net start MySQL80
net stop MySQL80
```
5. 登录 MySQL，设置 root 密码，创建项目数据库,如果你刚才用的是`--initialize-insecure`, root 初始是空密码：
``` ps1
.\bin\mysql -u root
```
进MySQL后,一行行的执行，来创建密码和数据库vue_template_backend：
``` sql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
FLUSH PRIVILEGES;
CREATE DATABASE vue_template_backend CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```
之后退出`\q`,接着再输入以下命令，然后输入密码，登录进去试试
``` sql
.\bin\mysql -u root -p
```
6. 创建可视化MySQL软件Navicat，运行里面的navicat.exe文件，然后注册随便写个名字，注册码在全栈模板项目里面，即可破解，然后自己建立个连接即可，之后双击我们自己的数据库vue_template_backend

## 容易混淆的命令
1. `prisma:generate` 让代码认识数据库模型，根据 `server/prisma/schema.prisma`生成 Prisma Client，比如你在 schema.prisma 里新增了一个字段：
``` prisma
phone String?
```
运行 prisma:generate 后，代码里才能正常写：
``` ts
prisma.ecMember.findMany({
  select: { phone: true },
});

大概关系就是schema.prisma
  -> prisma generate
  -> node_modules/.prisma/client 生成代码到这里
  -> @prisma/client 暴露给项目使用
  -> PrismaService 继承 PrismaClient
  -> 业务 Service 调用 this.prisma.xxx
```

2. `prisma:migrate` 把 schema.prisma 里的表结构变化同步到 MySQL，你对表进行增删改查，或者改字段类型等、字段约束，都需要执行这个命令。它会：
- 对比 schema.prisma 和当前数据库结构
- 生成迁移改动点 SQL 文件到 server/prisma/migrations/
- 执行 SQL，真正修改 MySQL 表结构
- 注意：这个命令需要 .env.local 里的 DATABASE_URL 能连上 MySQL。
- 如果改字段类型，则会值自动转换，有些转换不了，最好先检查数据重置，或者写迁移sql

3. `prisma:seed` 让数据库里有能跑通业务闭环的基础数据。如果后面还想加点其他基础数据，可以直接用 SQL 插入，或者写一个单独的小脚本

4. `prisma:seed-extra`如果后面还想额外加点测试字段值进去，可以单独运行小脚本，最好都在seed里面好维护

### 某个接口临时写入另一个数据库

默认项目启动时只会使用 `DATABASE_URL` 连接主业务库。如果某个接口需要往另一个 MySQL 数据库插入一行数据，不要在接口里修改全局 `DATABASE_URL`，而是单独配置一个连接串并封装一个 Service。

例如 `.env.local` 里增加：

```env
OTHER_DATABASE_URL=mysql://erp:erp_password@localhost:3306/other_db
```

如果另一个数据库和当前 `schema.prisma` 使用同一套表结构，可以复用当前生成的 Prisma Client，只是创建 client 时指定另一个 `datasourceUrl`：

```ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class OtherDbService implements OnModuleDestroy {
  private client?: PrismaClient;

  constructor(private readonly configService: ConfigService) {}

  private getClient() {
    if (!this.client) {
      const datasourceUrl = this.configService.get<string>('OTHER_DATABASE_URL');
      if (!datasourceUrl) {
        throw new Error('OTHER_DATABASE_URL is not configured');
      }
      this.client = new PrismaClient({ datasourceUrl });
    }
    return this.client;
  }

  async insertOneRow() {
    const db = this.getClient();
    return db.sysConfig.create({
      data: {
        tenantId: 1n,
        configKey: 'demo.external.write',
        configValue: 'ok',
        description: '写入另一个数据库的示例',
      },
    });
  }

  async onModuleDestroy() {
    await this.client?.$disconnect();
  }
}
```

Controller 或业务 Service 里直接注入调用：

```ts
@Post('/write-other-db')
writeOtherDb() {
  return this.otherDbService.insertOneRow();
}
```

注意不要每次请求都 `new PrismaClient()` 再 `$disconnect()`，高并发时会频繁创建数据库连接，性能很差。更推荐像上面这样在 Service 里缓存一个 client，应用关闭时统一断开。

如果另一个数据库的表结构和当前 `schema.prisma` 不一样，Prisma Client 里没有对应 model(可以添加model就不用这样)，可以用原生 SQL，service 中用 `$executeRaw` 插入：

```ts
async insertRawRow() {
  const db = this.getClient();
  const name = 'demo';
  const status = 'enabled';

  await db.$executeRaw`
    INSERT INTO other_table_name (name, status)
    VALUES (${name}, ${status})
  `;

  return { success: true };
}
```

## prisma 常用操作命令

> 默认在包含 `schema.prisma` 的目录下执行；如果项目已经把 Prisma 命令封装成 npm script，也可以直接用脚本名替代下面的 CLI 命令。

| 命令 | 作用 | 常见场景 |
| --- | --- | --- |
| `npx prisma validate` | 校验 Prisma schema 是否合法 | 提交前、排查 schema 报错 |
| `npx prisma format` | 格式化 `schema.prisma` | 改完 schema 后整理格式 |
| `npx prisma db pull` | 从数据库反向生成 schema | 接手已有库、对齐线上结构 |
| `npx prisma migrate dev --name <xxx>` | 在开发环境生成并应用迁移 | 新增/修改表结构时 |
| `npx prisma migrate deploy` | 应用已有迁移 | 测试环境、生产发布时 |
| `npx prisma migrate status` | 查看迁移是否和数据库一致 | 排查迁移漏跑、分支冲突 |
| `npx prisma db push` | 直接把 schema 推到数据库 | 原型验证、临时同步结构 |
| `npx prisma db seed` | 执行 seed 脚本 | 初始化基础数据 |
| `npx prisma studio` | 打开可视化数据管理界面 | 查表、临时改数据 |
| `npx prisma migrate reset` | 清空数据库并重跑迁移和 seed | 本地重建开发库 |

常用顺序一般是：

```bash
npx prisma format
npx prisma validate
npx prisma generate
npx prisma migrate dev --name add_xxx
npx prisma db seed
npx prisma studio
```

几个容易混的点：
- `migrate dev` 适合开发环境，会生成迁移文件并应用到本地数据库。
- `migrate deploy` 适合发布环境，只执行已经存在的迁移。
- `db push` 不会生成迁移历史，适合临时同步或原型验证。
- `migrate reset` 会清空数据，只应该在本地开发库使用。

## Prisma 常用 CRUD 语法

一般先注入 `PrismaService`：

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DemoService {
  constructor(private readonly prisma: PrismaService) {}
}
```

### 1. 查一条

`findUnique` 用唯一键查一条，`findFirst` 用条件查第一条。

```ts
const user1 = await this.prisma.sysAdminUser.findUnique({
  where: { id: 1n },
});

const user2 = await this.prisma.sysAdminUser.findFirst({
  where: {
    status: 'enabled',
    username: { contains: keyword },
  },
});
```

如果找不到就直接抛错，可以用 `findUniqueOrThrow` 或 `findFirstOrThrow`。

### 2. 查列表

`findMany` 最常用，适合分页、筛选、排序。

```ts
const list = await this.prisma.sysAdminUser.findMany({
  where: {
    status: 'enabled',
    username: { contains: keyword },
  },
  orderBy: { createdAt: 'desc' },
  skip: (page - 1) * pageSize,
  take: pageSize,
  select: {
    id: true,
    username: true,
    phone: true,
  },
});
```

1n, 2n, 3n 不是占位符，是 BigInt 数值示例 表示 1 2 3 但是如果字段是int 就可以直接写1 2 3, 现在这段选择的意思是：查出 id 属于这几个值，创建时间在指定区间内，并且状态是启用的记录

```ts
where: {
  id: { in: [1n, 2n, 3n] },
  createdAt: { gte: startTime, lt: endTime },
  status: 'enabled',
}
```

### 3. 新增

`create` 插入一条记录。

```ts
await this.prisma.sysAdminUser.create({
  data: {
    username: 'admin',
    password: hashPassword,
    status: 'enabled',
  },
});
```

批量插入可以用 `createMany`：

```ts
await this.prisma.sysPermission.createMany({
  data: [
    { code: 'sys:user:list', name: '用户列表' },
    { code: 'sys:user:create', name: '新增用户' },
  ],
});
```

### 4. 修改

`update` 更新一条，`updateMany` 更新多条。

```ts
await this.prisma.sysAdminUser.update({
  where: { id: 1n },
  data: {
    nickname: '新昵称',
    phone: '13800000000',
  },
});

await this.prisma.sysAdminUser.updateMany({
  where: { status: 'disabled' },
  data: { status: 'enabled' },
});
```

### 5. 删除

`delete` 删除一条，`deleteMany` 删除多条。

```ts
await this.prisma.sysAdminUser.delete({
  where: { id: 1n },
});

await this.prisma.sysAuditLog.deleteMany({
  where: {
    createdAt: { lt: expireTime },
  },
});
```

### 6. 有则改，无则增

`upsert` 适合“存在就更新，不存在就新增”的场景。

```ts
await this.prisma.sysConfig.upsert({
  where: {
    tenantId_configKey: {
      tenantId: 1n,
      configKey: 'demo.key',
    },
  },
  create: {
    tenantId: 1n,
    configKey: 'demo.key',
    configValue: 'on',
  },
  update: {
    configValue: 'on',
  },
});
```

### 7. 统计和事务

`count` 统计数量。

```ts
const total = await this.prisma.sysAdminUser.count({
  where: { status: 'enabled' },
});
```

`$transaction` 保证多个操作一起成功或一起失败。

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.sysAdminUser.create({
    data: { username: 'demo', password: hashPassword, status: 'enabled' },
  });

  await tx.sysAuditLog.create({
    data: {
      action: 'create_user',
      detail: 'created demo user',
    },
  });
});
```

### 8. 原生 SQL

Prisma 不好表达时，可以直接执行原生 SQL。

```ts
await this.prisma.$executeRaw`
  UPDATE sys_admin_user
  SET status = ${'enabled'}
  WHERE id = ${1n}
`;
```
