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