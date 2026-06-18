一个后台系统的骨架。后面所有商品、订单、库存、支付模块，都是在这个骨架上继续长出来的，其中定时任务在最后面统一加上：

```text
启动服务
  -> 健康检查
  -> Controller / Service / Module 分层
  -> DTO 参数校验
  -> 统一响应
  -> 统一异常
  -> 注册管理员
  -> bcrypt 保存密码
  -> 登录返回 JWT
  -> Guard 鉴权
  -> Redis/session 思想的简化版登录态
  -> /auth/me 获取当前用户
```

## 目录结构

```text
src/
  main.ts
  app.module.ts
  common/
    decorators/
      current-admin.decorator.ts
    filters/
      all-exceptions.filter.ts
    guards/
      admin-auth.guard.ts
    interceptors/
      response-transform.interceptor.ts
    utils/
      api-response.ts
  modules/
    health/
      health.module.ts
      health.controller.ts
      health.service.ts
    prisma/
      prisma.module.ts
      prisma.service.ts
    redis/
      redis.module.ts
      redis.service.ts
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      dto/
        register.dto.ts
        login.dto.ts
```

| 目录 | 作用 |
| --- | --- |
| `main.ts` | 服务启动入口，挂全局管道、守卫、拦截器、异常过滤器 |
| `app.module.ts` | 根模块，把业务模块组装起来 |
| `modules/health` | 第一个最简单业务模块，用来验证服务可访问 |
| `modules/prisma` | MySQL 连接模块，封装 `PrismaService` |
| `modules/redis` | Redis 连接模块，保存登录态、缓存、锁等临时数据 |
| `modules/auth` | 登录注册鉴权模块 |
| `common` | 所有模块都可能用到的通用能力 |

## 启动一个 Nest 服务

需要这些核心依赖：

```bash
npm install @nestjs/common @nestjs/core @nestjs/platform-fastify reflect-metadata rxjs
npm install @nestjs/config @nestjs/jwt bcryptjs class-validator class-transformer
npm install @prisma/client prisma redis
npm install -D typescript ts-node @types/node @types/bcryptjs
```

为什么需要这些：

| 依赖 | 作用 |
| --- | --- |
| `@nestjs/common` | Controller、Module、Injectable、Guard、Interceptor 等基础能力 |
| `@nestjs/core` | Nest 应用核心 |
| `@nestjs/platform-fastify` | 使用 Fastify 作为 HTTP 运行时 |
| `reflect-metadata` | Nest 装饰器依赖 |
| `rxjs` | Nest Interceptor 使用 Observable |
| `@nestjs/config` | 读取 `.env` 里的 MySQL、Redis、JWT 配置 |
| `@prisma/client` / `prisma` | 连接 MySQL 并读写 `schema.prisma` 里的业务表 |
| `redis` | 连接 Redis，保存登录态、缓存、锁等临时数据 |
| `@nestjs/jwt` | 生成和校验 JWT |
| `bcryptjs` | 密码 hash |
| `class-validator` | DTO 参数校验 |
| `class-transformer` | 参数类型转换 |

最小环境变量可以先这样配：

```env
APP_PORT=3000
DATABASE_URL="mysql://root:password@127.0.0.1:3306/erp?connection_limit=10"
REDIS_MODE=redis
REDIS_URL="redis://127.0.0.1:6379/0"
JWT_ACCESS_SECRET="dev-access-secret"
```

### 创建 `main.ts`

```ts
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseTransformInterceptor } from './common/interceptors/response-transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  app.useGlobalInterceptors(new ResponseTransformInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(process.env.APP_PORT || 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
```

为什么这样写：

- `NestFactory.create()` 创建应用。
- `FastifyAdapter` 是 HTTP 运行时，性能好，Nest 屏蔽底层细节。
- `enableCors()` 允许 PC 后台、小程序开发环境跨域请求。
- `ValidationPipe` 统一处理 DTO 校验。
- `ResponseTransformInterceptor` 统一成功响应。
- `AllExceptionsFilter` 统一错误响应。
- `APP_PORT` 从环境变量读取，避免端口写死。

这里先挂全局响应和异常，是为了从第一天就形成正确习惯：接口不要各返回各的格式。

## 根模块 `AppModule`

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    PrismaModule,
    RedisModule,
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
```

为什么要有 `AppModule`：

- 它是整个服务端的模块入口。
- 后面商品、订单、库存、支付等模块都加到这里。
- `PrismaModule` 负责 MySQL 连接，`RedisModule` 负责 Redis 连接和登录态。
- 不建议在 `main.ts` 里直接写业务模块，`main.ts` 只负责启动。

### MySQL 连接代码

Prisma 通过 `DATABASE_URL` 连接 MySQL。服务启动时连接，服务关闭时断开。

```ts
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    if (process.env.PRISMA_SKIP_CONNECT === 'true') {
      return;
    }
    await this.$connect();
  }

  async onModuleDestroy() {
    if (process.env.PRISMA_SKIP_CONNECT === 'true') {
      return;
    }
    await this.$disconnect();
  }
}
```

```ts
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

### Redis 连接代码

Redis 用来保存登录态、缓存、锁和限流计数。开发环境可以用 memory 兜底，真实 Redis 模式由 `REDIS_MODE=redis` 开启。

```ts
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client?: ReturnType<typeof createClient>;
  private redisReady = false;
  private redisLastError: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    if ((this.configService.get<string>('REDIS_MODE') || 'memory') !== 'redis') {
      return;
    }

    const url = this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379/0';
    this.client = createClient({ url });
    this.client.on('error', (error) => {
      this.redisReady = false;
      this.redisLastError = error instanceof Error ? error.message : String(error);
    });

    try {
      await this.client.connect();
      this.redisReady = true;
      this.redisLastError = null;
    } catch (error) {
      this.redisReady = false;
      this.redisLastError = error instanceof Error ? error.message : String(error);
    }
  }

  async onModuleDestroy() {
    if (this.client?.isOpen) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
```

```ts
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
```

当前项目里的 `RedisService` 不只是连接 Redis，它统一提供四类能力：

| 能力 | 用途 | 真实使用位置 |
| --- | --- | --- |
| 登录态 session | JWT 之外再保存服务端认可的登录状态 | 后台登录、小程序登录、AdminAuthGuard、MemberAuthGuard |
| 缓存 key/value | 后台 Redis 运维页查看、写入、删除临时缓存 | RedisController |
| 分布式锁 | 防止定时任务在多个进程里重复执行 | SchedulerService |
| 限流计数 | 按 IP、方法、路径统计请求次数 | RateLimitGuard |

核心 key 的命名也集中在 `RedisService` 内：

```ts
private sessionKey(scope: 'admin' | 'member', tenantId: string, actorId: string) {
  return `session:${scope}:${tenantId}:${actorId}`;
}

private cacheRedisKey(key: string) {
  return `cache:${key}`;
}

private lockRedisKey(key: string) {
  return `lock:${key}`;
}

private rateRedisKey(key: string) {
  return `rate:${key}`;
}
```

为什么要统一封装：

- 业务代码不直接拼 Redis 命令，后面切换 key 规则更容易。
- 开发环境可以用本地内存兜底，线上用真实 Redis。
- 登录态、锁、限流都有过期时间，适合放 Redis，不适合放 MySQL。

## 健康检查模块

健康检查是第一个功能，用来确认服务能访问`health.service.ts`

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  check() {
    return {
      status: 'ok',
      service: 'erp-server-learning',
      time: new Date().toISOString(),
    };
  }
}
```

### `health.controller.ts`

```ts
import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('/health')
  check() {
    return this.healthService.check();
  }
}
```

### `health.module.ts`

```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
```

为什么健康检查也要分 Controller 和 Service：

- 目前可以直接在 Controller 返回 `{ status: 'ok' }`。
- 但真实项目里健康检查可能要检查数据库、Redis、MQ。
- 从一开始练分层，后面扩展不会乱。

访问：

```text
GET http://localhost:3000/health
```

预期响应会被统一响应拦截器包装：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "status": "ok",
    "service": "erp-server-learning",
    "time": "2026-06-12T00:00:00.000Z"
  },
  "traceId": "..."
}
```

## 统一响应

### `api-response.ts`

```ts
export type ApiResponse<T = unknown> = {
  code: number;
  message: string;
  data: T;
  traceId: string;
};

export function wrapApiResponse<T>(data: T, traceId: string): ApiResponse<T> {
  return {
    code: 0,
    message: 'ok',
    data,
    traceId,
  };
}

export function isWrappedResponse(value: unknown): value is ApiResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === 'number' &&
    typeof record.message === 'string' &&
    'data' in record
  );
}
```

### `response-transform.interceptor.ts`

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { isWrappedResponse, wrapApiResponse } from '../utils/api-response';

function createTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const traceId = request.headers?.['x-trace-id'] || createTraceId();

    return next.handle().pipe(
      map((data) => {
        if (isWrappedResponse(data)) {
          return data;
        }

        return wrapApiResponse(data, traceId);
      }),
    );
  }
}
```

为什么要统一响应：

- 前端不用每个接口单独适配。
- 后端错误和成功结构更容易调试。
- `traceId` 方便线上排查。

为什么用 Interceptor：

- 它能包住所有 Controller 返回值。
- 不需要每个接口写 `return { code, message, data }`。
- 如果某个接口已经返回包装结构，也可以跳过二次包装。

## 统一异常

### `all-exceptions.filter.ts`

```ts
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

function createTraceId() {
  return `trace_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const traceId = request.headers?.['x-trace-id'] || createTraceId();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const message =
      typeof exceptionResponse === 'object' &&
      exceptionResponse &&
      'message' in exceptionResponse
        ? (exceptionResponse as { message: string | string[] }).message
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    response.status(status).send({
      code: status,
      message: Array.isArray(message) ? message.join('; ') : message,
      details: exceptionResponse,
      traceId,
    });
  }
}
```

为什么要统一异常：

- Service 里可以直接 `throw new UnauthorizedException()`。
- 前端永远拿到 `{ code, message, details, traceId }`。
- 线上排查可以通过 `traceId` 关联日志。

为什么不用每个 Controller `try/catch`：

- 重复。
- 容易漏。
- 错误格式不一致。

## DTO 参数校验

先做注册和登录，所以需要两个 DTO。
### `register.dto.ts`

```ts
import { IsString, Length, Matches } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username only supports letters, numbers and underscore',
  })
  username!: string;

  @IsString()
  @Length(6, 32)
  password!: string;

  @IsString()
  @Length(1, 32)
  realName!: string;
}
```

### `login.dto.ts`

```ts
import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  @Length(3, 32)
  username!: string;

  @IsString()
  @Length(6, 32)
  password!: string;
}
```

为什么用 DTO：

- 明确接口需要什么参数。
- 参数校验在进入 Service 前完成。
- 配合 `ValidationPipe` 可以自动剔除多余字段。

为什么密码要限制长度：

- 太短不安全。
- 太长可能造成无意义计算压力。
- 真实项目可以加入更复杂密码策略。

## 用户存储：MySQL + Prisma

当前项目没有再用内存数组保存后台用户。后台账号保存在 MySQL 的 `sys_admin_user` 表中，通过 `PrismaService` 读写。


后台登录时，`AuthService.adminLogin()` 直接查询 `sysAdminUser`：

```ts
async adminLogin(dto: AdminLoginDto) {
  const user = await this.prisma.sysAdminUser.findFirst({
    where: {
      username: dto.username,
      deletedAt: null,
    },
    include: {
      tenant: true,
    },
  });

  if (!user || user.status !== 'enabled') {
    throw new UnauthorizedException('账号不存在或已停用');
  }

  const passwordMatched = await bcrypt.compare(dto.password, user.passwordHash);
  if (!passwordMatched) {
    throw new UnauthorizedException('账号或密码错误');
  }

  await this.prisma.sysAdminUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = await this.jwtService.signAsync({
    sub: user.id.toString(),
    tenantId: user.tenantId.toString(),
    username: user.username,
    type: 'admin',
  });

  const access = await this.resolveAdminAccess(user);
  await this.redisService.rememberLoginSession({
    scope: 'admin',
    tenantId: user.tenantId.toString(),
    actorId: user.id.toString(),
    token,
    ttlSeconds: this.resolveJwtTtlSeconds(),
  });

  return {
    token,
    menus: access.menus,
    buttonPermissions: access.buttonPermissions,
    user: {
      id: user.id.toString(),
      tenantId: user.tenantId.toString(),
      username: user.username,
      realName: user.realName,
      avatarUrl: user.avatarUrl,
      tenantName: user.tenant.name,
      roles: access.roleCodes,
    },
  };
}
```

为什么这样做：

- 用户、密码 hash、状态、租户关系都必须持久化，不能放内存。
- `deletedAt: null` 支持软删除。
- `status = enabled` 控制账号是否可登录。
- `lastLoginAt` 是后台审计和运营排查常用字段。
- token 里放 `tenantId`，后续所有后台接口都能按租户隔离。

后台用户的新增、修改、删除在 `SystemService` 中完成，例如创建用户：

```ts
async createUser(admin: CurrentAdminPayload, dto: SystemUserMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  const username = this.normalizeText(dto.username);
  const realName = this.normalizeText(dto.realName);
  const roleCodes = this.normalizeStringArray(dto.roleCodes);

  if (!dto.password) {
    throw new BadRequestException('请输入密码');
  }

  await this.validateRoleCodes(tenantId, roleCodes);
  await this.ensureUniqueUserFields(tenantId, {
    username,
    phone: this.normalizeOptionalText(dto.phone),
  });

  const user = await this.prisma.sysAdminUser.create({
    data: {
      tenantId,
      username,
      passwordHash: await bcrypt.hash(dto.password, 10),
      realName,
      roleCodes,
      status: dto.status || 'enabled',
    },
  });

  await this.writeAuditLog(admin, 'create', 'sys_admin_user', user.id, {
    username,
    realName,
    roleCodes,
  });

  return this.getUser(user.id.toString());
}
```

## 登录态：Redis Session

JWT 签发后，在过期前默认都能通过签名校验。后台系统还需要“服务端主动撤销登录态”的能力，所以当前项目会把登录态写到 Redis。


登录成功后写 session：

```ts
async rememberLoginSession(input: {
  scope: 'admin' | 'member';
  tenantId: string;
  actorId: string;
  token: string;
  ttlSeconds?: number;
}) {
  const key = this.sessionKey(input.scope, input.tenantId, input.actorId);
  const expiresAt = input.ttlSeconds
    ? Date.now() + input.ttlSeconds * 1000
    : null;

  const entry = {
    scope: input.scope,
    tenantId: input.tenantId,
    actorId: input.actorId,
    token: input.token,
    expiresAt,
    createdAt: new Date(),
  };

  this.sessions.set(key, entry);
  await this.writeRedisJson(key, entry, input.ttlSeconds);
  await this.setCache(key, {
    scope: input.scope,
    tenantId: input.tenantId,
    actorId: input.actorId,
    tokenPreview: `${input.token.slice(0, 10)}...`,
  }, input.ttlSeconds);

  return key;
}
```

每次请求，Guard 校验 JWT 后，再查 Redis session：

```ts
if (!(await this.redisService.hasLoginSession('admin', payload.tenantId, payload.sub))) {
  throw new UnauthorizedException('登录态已失效，请重新登录');
}
```

`hasLoginSession()` 的真实逻辑：

```ts
async hasLoginSession(scope: 'admin' | 'member', tenantId: string, actorId: string) {
  this.pruneExpired();
  if (!this.isSessionRequired()) {
    return true;
  }

  const key = this.sessionKey(scope, tenantId, actorId);
  if (this.canUseRedis()) {
    const exists = await this.client!.exists(key).catch(() => 0);
    if (exists > 0) {
      return true;
    }
  }

  return this.sessions.has(key);
}
```

注意这里有两种运行方式：

- `REDIS_MODE=redis` 且连接成功时，登录态写真实 Redis。
- 本地学习环境也保留 `Map` 兜底，但它只是开发适配，不是业务主存储。

## AuthService 注册和登录

为什么登录失败统一提示用户名或密码错误：

- 不告诉攻击者到底是账号不存在还是密码错误。
- 降低枚举账号风险。

为什么 token payload 只放必要字段：

- JWT payload 可以被前端解析。
- 不应该放密码、手机号、密钥等敏感信息。
- 这里只放 `sub`、`username`、`type`。

为什么注册接口返回时不返回 `passwordHash`：

- 密码 hash 也是敏感信息。
- API 返回数据只给前端需要的字段。

## AuthController

### `auth.controller.ts`

```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentAdmin } from '../../common/decorators/current-admin.decorator';
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('/api/admin/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('/login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(AdminAuthGuard)
  @Get('/me')
  me(@CurrentAdmin() admin: { adminId: string }) {
    return this.authService.profile(admin.adminId);
  }
}
```

为什么 Controller 里不写密码校验：

- Controller 只负责 HTTP。
- 密码 hash、token、session 属于业务逻辑，放 Service。
- 后面如果 CLI、定时任务、其他接口也要调用登录逻辑，可以复用 Service。

为什么 `/me` 用 Guard：

- `/me` 必须知道当前用户是谁。
- 没 token 不能访问。

## CurrentAdmin 装饰器

Guard 会把当前管理员挂到 `request.admin`，Controller 用装饰器读取。

### `current-admin.decorator.ts`

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export type CurrentAdminPayload = {
  adminId: string;
  username: string;
  realName: string;
};

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): CurrentAdminPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.admin;
  },
);
```

为什么用装饰器：

- Controller 不用直接操作 request。
- 参数更清楚：`@CurrentAdmin() admin`。
- 后续所有后台接口都能复用。

## AdminAuthGuard

### `admin-auth.guard.ts`

```ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../../modules/auth/auth.service';
import { RedisService } from '../../modules/redis/redis.service';
import { ADMIN_PERMISSIONS_KEY } from '../decorators/admin-permissions.decorator';

interface AdminTokenPayload {
  sub: string;
  tenantId: string;
  username: string;
  type: string;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  private readonly jwtService: JwtService;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {
    this.jwtService = new JwtService({
      secret: this.configService.get<string>('jwt.accessSecret') || 'dev-access-secret',
    });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const url = String(request?.url || '');
    const method = String(request?.method || '').toUpperCase();
    const path = url.split('?')[0];

    if (!path.startsWith('/api/admin/')) {
      return true;
    }
    if (path === '/api/admin/v1/auth/login') {
      return true;
    }

    const authHeader = request.headers?.authorization || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice('Bearer '.length)
      : '';

    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    let payload: AdminTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('登录已失效，请重新登录');
    }

    if (payload.type !== 'admin') {
      throw new UnauthorizedException('管理员身份无效');
    }

    if (!(await this.redisService.hasLoginSession('admin', payload.tenantId, payload.sub))) {
      throw new UnauthorizedException('登录态已失效，请重新登录');
    }

    const adminUser = await this.authService.getAdminUserForAccess({
      adminId: BigInt(payload.sub),
      tenantId: BigInt(payload.tenantId),
      username: payload.username,
    });
    if (!adminUser) {
      throw new UnauthorizedException('管理员不存在或已停用');
    }

    const access = await this.authService.resolveAdminAccess(adminUser);
    request.admin = {
      adminId: adminUser.id,
      tenantId: adminUser.tenantId,
      username: adminUser.username,
      realName: adminUser.realName,
      avatarUrl: adminUser.avatarUrl,
      tenantName: adminUser.tenant.name,
      ...access,
    };

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(ADMIN_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || this.resolvePermissionsByRoute(method, path);

    if (requiredPermissions.length > 0 && !access.isSuperAdmin) {
      const granted = new Set(access.permissionCodes);
      const allowed = requiredPermissions.every((permission) => granted.has(permission));
      if (!allowed) {
        throw new ForbiddenException('无权访问');
      }
    }

    return true;
  }
}
```

Guard 的职责：

```text
有没有 token
token 是否有效
token 类型是否 admin
Redis 登录态是否仍有效
数据库里的管理员是否仍存在且启用
解析 RBAC 菜单、权限、按钮
把管理员身份和权限快照挂到 request
```

为什么还要查用户：

- token 里有用户 id，但用户可能被停用。
- 后台权限和状态应该以数据库当前状态为准。
- Redis session 允许服务端主动让登录态失效，不能只靠 JWT 过期时间。

## AuthModule

### `auth.module.ts`

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MemberAuthGuard } from '../../common/guards/member-auth.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
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

