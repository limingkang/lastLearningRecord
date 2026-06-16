一个后台系统的骨架。后面所有商品、订单、库存、支付模块，都是在这个骨架上继续长出来的：

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
    auth/
      auth.module.ts
      auth.controller.ts
      auth.service.ts
      dto/
        register.dto.ts
        login.dto.ts
      session.service.ts
      user.repository.ts
```

| 目录 | 作用 |
| --- | --- |
| `main.ts` | 服务启动入口，挂全局管道、守卫、拦截器、异常过滤器 |
| `app.module.ts` | 根模块，把业务模块组装起来 |
| `modules/health` | 第一个最简单业务模块，用来验证服务可访问 |
| `modules/auth` | 登录注册鉴权模块 |
| `common` | 所有模块都可能用到的通用能力 |

## 启动一个 Nest 服务

需要这些核心依赖：

```bash
npm install @nestjs/common @nestjs/core @nestjs/platform-fastify reflect-metadata rxjs
npm install @nestjs/jwt bcryptjs class-validator class-transformer
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
| `@nestjs/jwt` | 生成和校验 JWT |
| `bcryptjs` | 密码 hash |
| `class-validator` | DTO 参数校验 |
| `class-transformer` | 参数类型转换 |

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
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    HealthModule,
    AuthModule,
  ],
})
export class AppModule {}
```

为什么要有 `AppModule`：

- 它是整个服务端的模块入口。
- 后面商品、订单、库存、支付等模块都加到这里。
- 不建议在 `main.ts` 里直接写业务模块，`main.ts` 只负责启动。

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

## 用户仓储

真实 ERP 项目用 MySQL + Prisma 保存用户。为了聚焦登录鉴权，可以先用内存数组模拟数据库。后面学到 Prisma 后，再把这里替换成真实表。

### `user.repository.ts`

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

export type AdminUser = {
  id: string;
  username: string;
  passwordHash: string;
  realName: string;
  status: 'enabled' | 'disabled';
  createdAt: Date;
};

@Injectable()
export class UserRepository {
  private users: AdminUser[] = [];
  private nextId = 1;

  async create(input: {
    username: string;
    passwordHash: string;
    realName: string;
  }) {
    const existed = this.users.find((item) => item.username === input.username);
    if (existed) {
      throw new ConflictException('username already exists');
    }

    const user: AdminUser = {
      id: String(this.nextId++),
      username: input.username,
      passwordHash: input.passwordHash,
      realName: input.realName,
      status: 'enabled',
      createdAt: new Date(),
    };

    this.users.push(user);
    return user;
  }

  async findByUsername(username: string) {
    return this.users.find((item) => item.username === username) || null;
  }

  async findById(id: string) {
    return this.users.find((item) => item.id === id) || null;
  }

  async getById(id: string) {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('user not found');
    }
    return user;
  }
}
```

为什么先用内存仓储：

- 先理解分层、鉴权、JWT。
- 不被数据库连接、迁移、Prisma 细节打断。
- 仓储接口设计好后，后续替换成 Prisma 更自然。

注意：

- 内存数据重启会丢。
- 不能用于生产。
- 后面真实项目要用 `sys_admin_user` 表保存用户。

## 登录态 Session Service

纯 JWT 有一个问题：签发后到过期前默认都有效。后台系统需要能主动让 token 失效。我们先用内存 Map 模拟 Redis session。

### `session.service.ts`

```ts
import { Injectable } from '@nestjs/common';

type SessionRecord = {
  token: string;
  expiredAt: number;
};

@Injectable()
export class SessionService {
  private sessions = new Map<string, SessionRecord>();

  remember(input: {
    scope: 'admin';
    actorId: string;
    token: string;
    ttlSeconds: number;
  }) {
    const key = this.buildKey(input.scope, input.actorId);
    this.sessions.set(key, {
      token: input.token,
      expiredAt: Date.now() + input.ttlSeconds * 1000,
    });
  }

  hasSession(scope: 'admin', actorId: string, token: string) {
    const key = this.buildKey(scope, actorId);
    const record = this.sessions.get(key);

    if (!record) {
      return false;
    }

    if (record.expiredAt < Date.now()) {
      this.sessions.delete(key);
      return false;
    }

    return record.token === token;
  }

  remove(scope: 'admin', actorId: string) {
    this.sessions.delete(this.buildKey(scope, actorId));
  }

  private buildKey(scope: string, actorId: string) {
    return `${scope}:${actorId}`;
  }
}
```

为什么 JWT 还要 session：

- JWT 解决“请求是谁发的”。
- session 解决“服务端现在还认不认可这个登录态”。
- 员工离职、改密码、强制下线，都需要服务端可撤销。

真实项目中：

```text
SessionService -> RedisService
Map -> Redis key
expiredAt -> Redis TTL
```

## AuthService 注册和登录

### `auth.service.ts`

```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { SessionService } from './session.service';
import { UserRepository } from './user.repository';

export type AdminTokenPayload = {
  sub: string;
  username: string;
  type: 'admin';
};

@Injectable()
export class AuthService {
  private readonly tokenTtlSeconds = 2 * 60 * 60;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly jwtService: JwtService,
    private readonly sessionService: SessionService,
  ) {}

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.userRepository.create({
      username: dto.username,
      realName: dto.realName,
      passwordHash,
    });

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      status: user.status,
      createdAt: user.createdAt,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userRepository.findByUsername(dto.username);

    if (!user || user.status !== 'enabled') {
      throw new UnauthorizedException('username or password is incorrect');
    }

    const passwordMatched = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatched) {
      throw new UnauthorizedException('username or password is incorrect');
    }

    const token = await this.jwtService.signAsync({
      sub: user.id,
      username: user.username,
      type: 'admin',
    } satisfies AdminTokenPayload);

    this.sessionService.remember({
      scope: 'admin',
      actorId: user.id,
      token,
      ttlSeconds: this.tokenTtlSeconds,
    });

    return {
      token,
      expiresIn: this.tokenTtlSeconds,
      user: {
        id: user.id,
        username: user.username,
        realName: user.realName,
      },
    };
  }

  async getAdminForAccess(input: { adminId: string }) {
    const user = await this.userRepository.findById(input.adminId);
    if (!user || user.status !== 'enabled') {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
    };
  }

  async profile(adminId: string) {
    const user = await this.userRepository.getById(adminId);
    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      status: user.status,
    };
  }
}
```

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
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService, AdminTokenPayload } from '../../modules/auth/auth.service';
import { SessionService } from '../../modules/auth/session.service';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.resolveBearerToken(request.headers?.authorization);

    if (!token) {
      throw new UnauthorizedException('please login first');
    }

    let payload: AdminTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AdminTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('login expired');
    }

    if (payload.type !== 'admin') {
      throw new UnauthorizedException('invalid admin token');
    }

    const sessionValid = this.sessionService.hasSession('admin', payload.sub, token);
    if (!sessionValid) {
      throw new UnauthorizedException('login session expired');
    }

    const admin = await this.authService.getAdminForAccess({
      adminId: payload.sub,
    });
    if (!admin) {
      throw new UnauthorizedException('admin disabled or not found');
    }

    request.admin = {
      adminId: admin.id,
      username: admin.username,
      realName: admin.realName,
    };

    return true;
  }

  private resolveBearerToken(authorization: unknown) {
    const value = Array.isArray(authorization)
      ? authorization[0]
      : String(authorization || '');

    if (!value.startsWith('Bearer ')) {
      return '';
    }

    return value.slice('Bearer '.length);
  }
}
```

Guard 的职责：

```text
有没有 token
token 是否有效
token 类型是否 admin
session 是否仍有效
用户是否仍存在且启用
把用户身份挂到 request
```

为什么还要查用户：

- token 里有用户 id，但用户可能被停用。
- 后台权限和状态应该以数据库当前状态为准。

目前只做登录态，后面再加 RBAC 权限判断。

## AuthModule

### `auth.module.ts`

```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { UserRepository } from './user.repository';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
      signOptions: {
        expiresIn: '2h',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    UserRepository,
    SessionService,
  ],
  exports: [
    AuthService,
    SessionService,
    JwtModule,
  ],
})
export class AuthModule {}
```

为什么要 `exports`：

- `AdminAuthGuard` 依赖 `AuthService`、`SessionService`、`JwtService`。
- 如果 Guard 放在别的模块或全局使用，需要从 AuthModule 暴露这些能力。

真实项目里还会有：

```text
PrismaModule
RedisModule
ConfigModule
```
