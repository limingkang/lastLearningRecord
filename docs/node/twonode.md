一个管理后台不是“登录后所有人都能操作”，而是需要用户、角色、权限、菜单和审计，这就设计到RBAC(Role-Based Access Control)，中文叫 基于角色的访问控制。核心思路是：不是直接给每个用户分配权限，而是先给角色分配权限，再把角色分配给用户
```text
后台用户管理
  -> 角色管理
  -> 权限点管理
  -> 菜单管理
  -> 用户绑定角色
  -> 角色绑定权限和菜单
  -> Guard 校验接口权限
  -> /auth/me 返回菜单和按钮权限
  -> 后台写操作记录审计日志
```
最终实现这些接口：
```text
后台用户：
GET    /api/admin/v1/system/users
POST   /api/admin/v1/system/users
GET    /api/admin/v1/system/users/:id
PUT    /api/admin/v1/system/users/:id
DELETE /api/admin/v1/system/users/:id

角色：
GET    /api/admin/v1/system/roles
POST   /api/admin/v1/system/roles
PUT    /api/admin/v1/system/roles/:id
DELETE /api/admin/v1/system/roles/:id

权限点：
GET    /api/admin/v1/system/permissions
POST   /api/admin/v1/system/permissions

菜单：
GET    /api/admin/v1/system/menus
POST   /api/admin/v1/system/menus

审计日志：
GET    /api/admin/v1/system/audit-logs
```
当前项目已经使用 MySQL + Prisma 保存这些系统管理数据，不再使用内存仓储。对应模型主要是：
```text
sys_admin_user
sys_role
sys_permission
sys_menu
sys_audit_log
```

这些表以 `schema.prisma` 为准，核心模型示例：

```prisma
model SysAdminUser {
  id            BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId      BigInt    @map("tenant_id") @db.UnsignedBigInt
  username      String    @db.VarChar(64)
  passwordHash  String    @map("password_hash") @db.VarChar(255)
  realName      String    @map("real_name") @db.VarChar(64)
  phone         String?   @db.VarChar(32)
  roleCodesJson Json?     @map("role_codes_json")
  status        String    @default("enabled") @db.VarChar(32)
  lastLoginAt   DateTime? @map("last_login_at") @db.DateTime(3)
  deletedAt     DateTime? @map("deleted_at") @db.DateTime(3)

  @@unique([tenantId, username], map: "uk_sys_admin_user_tenant_username")
  @@unique([tenantId, phone], map: "uk_sys_admin_user_tenant_phone")
  @@map("sys_admin_user")
}

model SysRole {
  id                  BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId            BigInt    @map("tenant_id") @db.UnsignedBigInt
  name                String    @db.VarChar(64)
  code                String    @db.VarChar(64)
  dataScope           String    @default("all") @map("data_scope") @db.VarChar(32)
  permissionCodesJson Json?     @map("permission_codes_json")
  menuIdsJson         Json?     @map("menu_ids_json")
  status              String    @default("enabled") @db.VarChar(32)
  deletedAt           DateTime? @map("deleted_at") @db.DateTime(3)

  @@unique([tenantId, code], map: "uk_sys_role_tenant_code")
  @@map("sys_role")
}

model SysPermission {
  id           BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId     BigInt    @map("tenant_id") @db.UnsignedBigInt
  code         String    @db.VarChar(128)
  name         String    @db.VarChar(64)
  resourceType String    @map("resource_type") @db.VarChar(32)
  resourcePath String?   @map("resource_path") @db.VarChar(255)
  status       String    @default("enabled") @db.VarChar(32)
  deletedAt    DateTime? @map("deleted_at") @db.DateTime(3)

  @@unique([tenantId, code], map: "uk_sys_permission_tenant_code")
  @@map("sys_permission")
}
```


例如后台用户列表不是读数组，而是通过 Prisma 分页查询：

```ts
async listUsers(query: SystemUserQueryDto = {}) {
  const tenantId = await this.getDefaultTenantId();
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const where: Prisma.SysAdminUserWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (query.keyword) {
    where.OR = [
      { username: { contains: query.keyword } },
      { realName: { contains: query.keyword } },
      { phone: { contains: query.keyword } },
      { email: { contains: query.keyword } },
    ];
  }

  if (query.status) {
    where.status = query.status;
  }

  const [items, total, roleMap] = await Promise.all([
    this.prisma.sysAdminUser.findMany({
      where,
      include: { tenant: { select: { id: true, name: true, code: true } } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    this.prisma.sysAdminUser.count({ where }),
    this.loadRoleMap(tenantId),
  ]);

  return {
    items: items.map((item) => this.toUserRow(item, roleMap)),
    page,
    pageSize,
    total,
  };
}
```

审计日志也不是写内存，而是由全局拦截器写 `sys_audit_log`。这样后台写操作能追溯到管理员、模块、目标 id、请求摘要和响应状态。

## 最终目录结构

在之前的基础上新增：

```text
src/
  common/
    decorators/
      current-admin.decorator.ts
      require-permissions.decorator.ts
    guards/
      admin-auth.guard.ts
    interceptors/
      audit-log.interceptor.ts
  modules/
    auth/
      auth.service.ts              # 增加 resolveAdminAccess
    system/
      system.module.ts
      system.controller.ts
      system.service.ts
      dto/
        user.dto.ts
        role.dto.ts
        permission.dto.ts
        menu.dto.ts
```

为什么单独建 `SystemModule`：

- `AuthModule` 负责登录、token、当前用户。
- `SystemModule` 负责后台用户、角色、权限、菜单、审计。
- 登录和系统管理相关，但职责不同，分开更清楚。

真实项目也是这样拆：

```text
auth 负责认证
system 负责用户角色权限菜单配置
common/guards 负责统一鉴权
common/interceptors 负责审计
```

## RBAC

RBAC 是 Role-Based Access Control，基于角色的访问控制。最简单后台：

```text
管理员登录后，所有接口都能访问
```

很快会遇到问题：

- 客服可以看订单，但不能改价。
- 仓库可以发货，但不能看财务。
- 运营可以改商品和活动，但不能改系统权限。
- 财务可以看账单，但不能删除商品。

于是引入：

```text
用户 User
  -> 绑定多个角色 Role
角色 Role
  -> 拥有多个权限 Permission
  -> 拥有多个菜单 Menu
接口访问
  -> Guard 判断当前用户角色是否拥有该接口需要的权限
```

关系：

```text
AdminUser.roleCodes
  -> Role.permissionCodes
  -> Permission.code
```

菜单和权限为什么分开：

| 概念 | 作用 |
| --- | --- |
| 菜单 | 前端左侧导航、页面入口 |
| 权限 | 后端接口能不能访问、按钮能不能点击 |

只隐藏菜单不安全。用户可以绕过页面，直接用接口工具请求后端。所以接口权限必须在后端 Guard 中校验。

## 定义数据模型

### 系统管理基础类型

```ts
export type UserStatus = 'enabled' | 'disabled';
export type ResourceType = 'menu' | 'button' | 'api';

export type SystemUser = {
  id: string;
  username: string;
  passwordHash: string;
  realName: string;
  phone?: string;
  roleCodes: string[];
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type SystemRole = {
  id: string;
  name: string;
  code: string;
  permissionCodes: string[];
  menuIds: string[];
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type SystemPermission = {
  id: string;
  code: string;
  name: string;
  resourceType: ResourceType;
  resourcePath?: string;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type SystemMenu = {
  id: string;
  parentId?: string;
  name: string;
  path: string;
  icon?: string;
  permissionCode?: string;
  sortNo: number;
  visible: boolean;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
};

export type AuditLog = {
  id: string;
  operatorId: string;
  operator: string;
  module: string;
  action: string;
  path: string;
  method: string;
  targetId?: string;
  status: 'succeeded' | 'failed';
  durationMs: number;
  raw: unknown;
  createdAt: Date;
};
```

角色里先用数组保存权限和菜单：对应表中的这些字段来存放 `role_codes_json`、`permission_codes_json`、`menu_ids_json`。

如果项目变大，也可以演进成中间表：

```text
sys_user_role
sys_role_permission
sys_role_menu
```

## DTO 设计

### `user.dto.ts`

```ts
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class UserQueryDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsIn(['enabled', 'disabled'])
  status?: 'enabled' | 'disabled';
}

export class CreateUserDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username!: string;

  @IsString()
  @Length(6, 32)
  password!: string;

  @IsString()
  @Length(1, 32)
  realName!: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  phone?: string;

  @IsArray()
  @ArrayMaxSize(20)
  roleCodes!: string[];

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Length(6, 32)
  password?: string;

  @IsString()
  @Length(1, 32)
  realName!: string;

  @IsOptional()
  @IsString()
  @Length(6, 32)
  phone?: string;

  @IsArray()
  @ArrayMaxSize(20)
  roleCodes!: string[];

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}
```

为什么更新用户时 `username` 不允许改：

- 用户名通常作为登录标识，修改会影响审计和登录习惯。
- 如果一定要支持改用户名，需要额外考虑唯一校验、审计、历史记录。

为什么 `password` 更新时可选：

- 修改用户资料不一定要改密码。
- 只有传了新密码才重新 hash。

### `role.dto.ts`

```ts
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class RoleMutationDto {
  @IsString()
  @Length(1, 32)
  name!: string;

  @IsString()
  @Length(2, 64)
  @Matches(/^[a-zA-Z0-9:_-]+$/)
  code!: string;

  @IsArray()
  @ArrayMaxSize(200)
  permissionCodes!: string[];

  @IsArray()
  @ArrayMaxSize(200)
  menuIds!: string[];

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}
```

为什么角色有 `permissionCodes` 和 `menuIds`：

- 权限控制后端接口和按钮。
- 菜单控制前端导航。
- 同一个角色既要知道能看哪些页面，也要知道能调用哪些接口。

### `permission.dto.ts`

```ts
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';

export class PermissionMutationDto {
  @IsString()
  @Length(3, 100)
  @Matches(/^[a-zA-Z0-9:_-]+$/)
  code!: string;

  @IsString()
  @Length(1, 50)
  name!: string;

  @IsIn(['menu', 'button', 'api'])
  resourceType!: 'menu' | 'button' | 'api';

  @IsOptional()
  @IsString()
  @Length(1, 200)
  resourcePath?: string;

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}
```

权限码建议格式：

```text
system:user:read
system:user:write
catalog:read
catalog:write
order:read
order:write
finance:read
```

为什么权限码用字符串：

- 代码里好判断。
- 前端按钮也可以用同一套权限码。
- 比数据库自增 id 更稳定。

### `menu.dto.ts`

```ts
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MenuMutationDto {
  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  @Length(1, 50)
  name!: string;

  @IsString()
  @Length(1, 200)
  path!: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  permissionCode?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortNo!: number;

  @IsBoolean()
  visible!: boolean;

  @IsIn(['enabled', 'disabled'])
  status!: 'enabled' | 'disabled';
}
```

为什么菜单要有 `parentId`：

- 后台菜单通常是树结构。
- 顶级菜单如“系统管理”，子菜单如“用户管理”“角色管理”。

为什么菜单上也可以挂 `permissionCode`：

- 前端渲染菜单时，可以根据权限决定是否显示。
- 但最终接口访问仍由后端 Guard 判断。

## Prisma数据读写

RBAC数据读写逻辑。用户、角色、权限、菜单和审计日志都由 `SystemService` 直接注入 `PrismaService` 读写 MySQL。

### Prisma 入口

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  private async getDefaultTenantId(): Promise<bigint> {
    const tenant = await this.prisma.sysTenant.findFirst({
      where: { code: 'default', deletedAt: null },
    });
    if (!tenant) {
      throw new NotFoundException('默认商户不存在，请先执行 seed');
    }
    return tenant.id;
  }
}
```

实际代码里的类型主要来自 `@prisma/client`，持久化结构以 `schema.prisma` 为准。

### 用户相关方法

```ts
async listUsers(query: { keyword?: string; status?: string; page?: number; pageSize?: number }) {
  const tenantId = await this.getDefaultTenantId();
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const where: Prisma.SysAdminUserWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (query.keyword) {
    where.OR = [
      { username: { contains: query.keyword } },
      { realName: { contains: query.keyword } },
      { phone: { contains: query.keyword } },
      { email: { contains: query.keyword } },
    ];
  }

  if (query.status) {
    where.status = query.status;
  }

  const [items, total] = await Promise.all([
    this.prisma.sysAdminUser.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    this.prisma.sysAdminUser.count({ where }),
  ]);

  return {
    items: items.map((item) => this.toUserRow(item)),
    page,
    pageSize,
    total,
  };
}

async findUserById(id: string) {
  const tenantId = await this.getDefaultTenantId();
  return this.prisma.sysAdminUser.findFirst({
    where: {
      id: BigInt(id),
      tenantId,
      deletedAt: null,
    },
  });
}

async findUserByUsername(username: string) {
  const tenantId = await this.getDefaultTenantId();
  return this.prisma.sysAdminUser.findFirst({
    where: {
      tenantId,
      username,
      deletedAt: null,
    },
  });
}

async createUser(input: {
  username: string;
  passwordHash: string;
  realName: string;
  phone?: string;
  email?: string;
  roleCodes: string[];
  status?: string;
  operatorId: bigint;
}) {
  const tenantId = await this.getDefaultTenantId();
  const existed = await this.findUserByUsername(input.username);
  if (existed) {
    throw new BadRequestException('账号已存在');
  }

  const user = await this.prisma.sysAdminUser.create({
    data: {
      tenantId,
      username: input.username,
      passwordHash: input.passwordHash,
      realName: input.realName,
      phone: input.phone,
      email: input.email,
      roleCodesJson: input.roleCodes,
      status: input.status || 'enabled',
      createdBy: input.operatorId,
      updatedBy: input.operatorId,
    },
  });

  return this.toUserRow(user);
}

async updateUser(id: string, patch: {
  realName?: string;
  phone?: string;
  email?: string;
  roleCodes?: string[];
  status?: string;
  passwordHash?: string;
  operatorId: bigint;
}) {
  const user = await this.findUserById(id);
  if (!user) {
    throw new NotFoundException('员工不存在');
  }

  const updated = await this.prisma.sysAdminUser.update({
    where: { id: user.id },
    data: {
      realName: patch.realName ?? user.realName,
      phone: patch.phone ?? user.phone,
      email: patch.email ?? user.email,
      roleCodesJson: patch.roleCodes ?? user.roleCodesJson,
      status: patch.status ?? user.status,
      updatedBy: patch.operatorId,
      ...(patch.passwordHash ? { passwordHash: patch.passwordHash } : {}),
    },
  });

  return this.toUserRow(updated);
}

async deleteUser(id: string, operatorId: bigint) {
  const user = await this.findUserById(id);
  if (!user) {
    throw new NotFoundException('员工不存在');
  }

  await this.prisma.sysAdminUser.update({
    where: { id: user.id },
    data: {
      status: 'disabled',
      deletedAt: new Date(),
      updatedBy: operatorId,
    },
  });

  return { success: true };
}
```

为什么删除用 `deletedAt`：

- 后台用户涉及审计和历史操作，不应该轻易物理删除。
- 用户删除后，历史审计日志仍然要知道是谁操作的。

### 角色、权限、菜单方法

核心写法类似，这里摘关键代码：

```ts
async listRoles(query: { keyword?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const tenantId = await this.getDefaultTenantId();
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const where: Prisma.SysRoleWhereInput = {
    tenantId,
    deletedAt: null,
  };

  if (query.keyword) {
    where.OR = [
      { name: { contains: query.keyword } },
      { code: { contains: query.keyword } },
    ];
  }
  if (query.status) {
    where.status = query.status;
  }

  const [items, total] = await Promise.all([
    this.prisma.sysRole.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    this.prisma.sysRole.count({ where }),
  ]);

  return { items, page, pageSize, total };
}

async findRoleByCode(code: string) {
  const tenantId = await this.getDefaultTenantId();
  return this.prisma.sysRole.findFirst({
    where: { tenantId, code, deletedAt: null },
  });
}

async createRole(input: {
  name: string;
  code: string;
  permissionCodes: string[];
  menuIds: string[];
  status?: string;
}) {
  const tenantId = await this.getDefaultTenantId();
  const existed = await this.findRoleByCode(input.code);
  if (existed) {
    throw new BadRequestException('角色编码已存在');
  }

  await this.validatePermissionCodes(tenantId, input.permissionCodes);
  await this.validateMenuIds(tenantId, input.menuIds);

  return this.prisma.sysRole.create({
    data: {
      tenantId,
      name: input.name,
      code: input.code,
      permissionCodesJson: input.permissionCodes,
      menuIdsJson: input.menuIds,
      status: input.status || 'enabled',
    },
  });
}

async listPermissions(query: { keyword?: string; status?: string; page?: number; pageSize?: number } = {}) {
  const tenantId = await this.getDefaultTenantId();
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const where: Prisma.SysPermissionWhereInput = {
    tenantId,
    deletedAt: null,
  };
  if (query.keyword) {
    where.OR = [
      { code: { contains: query.keyword } },
      { name: { contains: query.keyword } },
    ];
  }
  if (query.status) {
    where.status = query.status;
  }

  const [items, total] = await Promise.all([
    this.prisma.sysPermission.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    this.prisma.sysPermission.count({ where }),
  ]);

  return { items, page, pageSize, total };
}

async findPermissionByCode(code: string) {
  const tenantId = await this.getDefaultTenantId();
  return this.prisma.sysPermission.findFirst({
    where: { tenantId, code, deletedAt: null },
  });
}

async createPermission(
  input: {
    code: string;
    name: string;
    resourceType: string;
    resourcePath?: string;
    status?: string;
  },
) {
  const tenantId = await this.getDefaultTenantId();
  const existed = await this.findPermissionByCode(input.code);
  if (existed) {
    throw new BadRequestException('权限编码已存在');
  }

  return this.prisma.sysPermission.create({
    data: {
      tenantId,
      code: input.code,
      name: input.name,
      resourceType: input.resourceType,
      resourcePath: input.resourcePath,
      status: input.status || 'enabled',
    },
  });
}

async listMenus(query: { keyword?: string; status?: string } = {}) {
  const tenantId = await this.getDefaultTenantId();
  const menus = await this.prisma.sysMenu.findMany({
    where: {
      tenantId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: [{ sortNo: 'asc' }, { id: 'asc' }],
  });

  const filtered = query.keyword
    ? menus.filter((menu) => menu.name.includes(query.keyword!) || menu.path.includes(query.keyword!))
    : menus;
  return this.buildMenuTree(filtered, new Set(filtered.map((menu) => menu.id)));
}

async createMenu(input: {
  parentId?: string;
  name: string;
  path: string;
  icon?: string;
  permissionCode?: string;
  sortNo?: number;
  visible?: boolean;
  status?: string;
}) {
  const tenantId = await this.getDefaultTenantId();
  const parentId = input.parentId ? BigInt(input.parentId) : null;
  if (input.permissionCode) {
    await this.findPermissionByCode(input.permissionCode);
  }

  return this.prisma.sysMenu.create({
    data: {
      tenantId,
      parentId,
      name: input.name,
      path: input.path,
      icon: input.icon,
      permissionCode: input.permissionCode,
      sortNo: input.sortNo || 0,
      visible: input.visible ?? true,
      status: input.status || 'enabled',
    },
  });
}
```

为什么角色和权限要校验 code 唯一：

- 权限判断靠 code。
- 如果重复，Guard 无法确定真正含义。
- 菜单可以不按 path 唯一，真实项目里可根据业务需求加约束。

### 审计日志方法

```ts
async createAuditLog(
  admin: { adminId: bigint; username: string; realName?: string },
  input: {
    module: string;
    action: string;
    targetType?: string;
    targetId?: string;
    content?: string;
    raw?: Record<string, unknown>;
  },
) {
  const tenantId = await this.getDefaultTenantId();
  return this.prisma.sysAuditLog.create({
    data: {
      tenantId,
      operatorId: admin.adminId,
      operator: admin.realName || admin.username,
      module: input.module,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      content: input.content,
      rawJson: input.raw || {},
    },
  });
}

async listAuditLogs(query: { module?: string; action?: string; keyword?: string; page?: number; pageSize?: number } = {}) {
  const tenantId = await this.getDefaultTenantId();
  const page = query.page || 1;
  const pageSize = query.pageSize || 20;
  const where: Prisma.SysAuditLogWhereInput = {
    tenantId,
    deletedAt: null,
  };
  if (query.module) where.module = query.module;
  if (query.action) where.action = query.action;
  if (query.keyword) {
    where.OR = [
      { operator: { contains: query.keyword } },
      { targetId: { contains: query.keyword } },
      { content: { contains: query.keyword } },
    ];
  }

  const [items, total] = await Promise.all([
    this.prisma.sysAuditLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }),
    this.prisma.sysAuditLog.count({ where }),
  ]);

  return { items, page, pageSize, total };
}
```

为什么审计日志只追加：

- 审计记录应尽量不可变。
- 用来追溯后台操作，不应该随意修改。
- 真实项目可以限制只有超级管理员可查看。

## SystemService

Service 负责业务规则。

### 创建用户

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
import { RoleMutationDto } from './dto/role.dto';
import { PermissionMutationDto } from './dto/permission.dto';
import { MenuMutationDto } from './dto/menu.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(query: UserQueryDto) {
    const tenantId = await this.getDefaultTenantId();
    return this.prisma.sysAdminUser.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(query.status ? { status: query.status } : {}),
        ...(query.keyword
          ? {
              OR: [
                { username: { contains: query.keyword } },
                { realName: { contains: query.keyword } },
                { phone: { contains: query.keyword } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async createUser(operatorId: bigint, dto: CreateUserDto) {
    await this.ensureRoleCodesExist(dto.roleCodes);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.sysAdminUser.create({
      data: {
        tenantId: await this.getDefaultTenantId(),
        username: dto.username,
        passwordHash,
        realName: dto.realName,
        phone: dto.phone,
        roleCodesJson: dto.roleCodes,
        status: dto.status,
        createdBy: operatorId,
        updatedBy: operatorId,
      },
    });

    return this.sanitizeUser(user);
  }

  async updateUser(operatorId: bigint, id: string, dto: UpdateUserDto) {
    await this.ensureRoleCodesExist(dto.roleCodes);

    const user = await this.prisma.sysAdminUser.update({
      where: { id: BigInt(id) },
      data: {
        realName: dto.realName,
        phone: dto.phone,
        roleCodesJson: dto.roleCodes,
        status: dto.status,
        updatedBy: operatorId,
        ...(dto.password
          ? { passwordHash: await bcrypt.hash(dto.password, 10) }
          : {}),
      },
    });

    return this.sanitizeUser(user);
  }

  async deleteUser(operatorId: bigint, id: string) {
    await this.prisma.sysAdminUser.update({
      where: { id: BigInt(id) },
      data: {
        status: 'disabled',
        deletedAt: new Date(),
        updatedBy: operatorId,
      },
    });
    return { success: true };
  }

  private sanitizeUser(user: {
    id: bigint;
    username: string;
    realName: string;
    phone?: string | null;
    roleCodesJson: unknown;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id.toString(),
      username: user.username,
      realName: user.realName,
      phone: user.phone,
      roleCodes: Array.isArray(user.roleCodesJson) ? user.roleCodesJson : [],
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async ensureRoleCodesExist(roleCodes: string[]) {
    const roles = await this.prisma.sysRole.findMany({
      where: {
        code: { in: roleCodes },
        deletedAt: null,
        status: 'enabled',
      },
    });
    const roleCodeSet = new Set(roles.map((role) => role.code));

    const missing = roleCodes.filter((code) => !roleCodeSet.has(code));
    if (missing.length > 0) {
      throw new BadRequestException(`role not found: ${missing.join(', ')}`);
    }
  }
}
```

为什么 Service 里要校验角色是否存在：

- DTO 只能校验格式。
- 角色是否存在属于业务校验，要查系统数据。
- 如果不校验，用户可能绑定一个不存在的角色，后续权限解析会出问题。

为什么返回用户时要去掉 `passwordHash`：

- 密码 hash 也是敏感信息。
- API 只返回前端需要的字段。

### 创建权限和菜单

```ts
async listPermissions() {
  const tenantId = await this.getDefaultTenantId();
  return this.prisma.sysPermission.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

async createPermission(dto: PermissionMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  await this.ensurePermissionCodeAvailable(tenantId, dto.code);

  return this.prisma.sysPermission.create({
    data: {
      tenantId,
      code: dto.code,
      name: dto.name,
      resourceType: dto.resourceType,
      resourcePath: dto.resourcePath,
      status: dto.status || 'enabled',
    },
  });
}

async listMenus() {
  const tenantId = await this.getDefaultTenantId();
  const menus = await this.prisma.sysMenu.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ sortNo: 'asc' }, { id: 'asc' }],
  });
  return this.buildMenuTree(menus, new Set(menus.map((menu) => menu.id)));
}

async createMenu(dto: MenuMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  if (dto.permissionCode) {
    await this.ensurePermissionCodesExist([dto.permissionCode]);
  }

  return this.prisma.sysMenu.create({
    data: {
      tenantId,
      parentId: dto.parentId ? BigInt(dto.parentId) : null,
      name: dto.name,
      path: dto.path,
      icon: dto.icon,
      permissionCode: dto.permissionCode,
      sortNo: dto.sortNo,
      visible: dto.visible,
      status: dto.status || 'enabled',
    },
  });
}

private buildMenuTree(menus: Array<{
  id: bigint;
  parentId?: bigint | null;
  sortNo: number;
}>, visibleIds: Set<bigint>) {
  const cloned = menus
    .map((menu) => ({ ...menu, children: [] as unknown[] }))
    .sort((a, b) => a.sortNo - b.sortNo);

  const map = new Map(cloned.map((menu) => [menu.id, menu]));
  const roots: unknown[] = [];

  for (const menu of cloned) {
    if (menu.parentId && visibleIds.has(menu.parentId) && map.has(menu.parentId)) {
      map.get(menu.parentId)!.children.push(menu);
    } else {
      roots.push(menu);
    }
  }

  return roots;
}

private async ensurePermissionCodesExist(permissionCodes: string[]) {
  const tenantId = await this.getDefaultTenantId();
  const permissions = await this.prisma.sysPermission.findMany({
    where: {
      tenantId,
      code: { in: permissionCodes },
      deletedAt: null,
      status: 'enabled',
    },
  });
  const permissionCodeSet = new Set(permissions.map((item) => item.code));

  const missing = permissionCodes.filter((code) => !permissionCodeSet.has(code));
  if (missing.length > 0) {
    throw new BadRequestException(`permission not found: ${missing.join(', ')}`);
  }
}
```

为什么菜单列表返回树：

- 前端侧边栏通常是多级结构。
- 后端直接返回树，前端渲染更简单。

为什么菜单绑定权限码时要校验：

- 防止菜单配置了不存在的权限。
- 避免前端拿到无效权限码。

### 创建角色

```ts
async listRoles() {
  const tenantId = await this.getDefaultTenantId();
  return this.prisma.sysRole.findMany({
    where: { tenantId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

async createRole(dto: RoleMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  await this.ensurePermissionCodesExist(dto.permissionCodes);
  await this.ensureMenuIdsExist(dto.menuIds);

  return this.prisma.sysRole.create({
    data: {
      tenantId,
      name: dto.name,
      code: dto.code,
      permissionCodesJson: dto.permissionCodes,
      menuIdsJson: dto.menuIds,
      status: dto.status || 'enabled',
    },
  });
}

async updateRole(id: string, dto: RoleMutationDto) {
  await this.ensurePermissionCodesExist(dto.permissionCodes);
  await this.ensureMenuIdsExist(dto.menuIds);

  return this.prisma.sysRole.update({
    where: { id: BigInt(id) },
    data: {
      name: dto.name,
      code: dto.code,
      permissionCodesJson: dto.permissionCodes,
      menuIdsJson: dto.menuIds,
      status: dto.status,
    },
  });
}

private async ensureMenuIdsExist(menuIds: string[]) {
  const tenantId = await this.getDefaultTenantId();
  const ids = menuIds.map((id) => BigInt(id));
  const menus = await this.prisma.sysMenu.findMany({
    where: {
      tenantId,
      id: { in: ids },
      deletedAt: null,
      status: 'enabled',
    },
  });
  const menuIdSet = new Set(menus.map((menu) => menu.id.toString()));

  const missing = menuIds.filter((id) => !menuIdSet.has(id));
  if (missing.length > 0) {
    throw new BadRequestException(`menu not found: ${missing.join(', ')}`);
  }
}
```

如果更新角色方法尚未实现，可以按 `updateUser` 同样方式实现。

为什么创建角色前要校验权限和菜单：

- 角色是权限组合。
- 组合里的权限和菜单必须真实存在。
- 不校验会让 `/auth/me` 返回脏数据。

## SystemController

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
import { AdminAuthGuard } from '../../common/guards/admin-auth.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from './dto/user.dto';
import { RoleMutationDto } from './dto/role.dto';
import { PermissionMutationDto } from './dto/permission.dto';
import { MenuMutationDto } from './dto/menu.dto';
import { SystemService } from './system.service';

@UseGuards(AdminAuthGuard)
@Controller('/api/admin/v1/system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @RequirePermissions('system:user:read')
  @Get('/users')
  listUsers(@Query() query: UserQueryDto) {
    return this.systemService.listUsers(query);
  }

  @RequirePermissions('system:user:write')
  @Post('/users')
  createUser(@Body() dto: CreateUserDto) {
    return this.systemService.createUser(dto);
  }

  @RequirePermissions('system:user:write')
  @Put('/users/:id')
  updateUser(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.systemService.updateUser(id, dto);
  }

  @RequirePermissions('system:user:write')
  @Delete('/users/:id')
  deleteUser(@Param('id') id: string) {
    return this.systemService.deleteUser(id);
  }

  @RequirePermissions('system:role:read')
  @Get('/roles')
  listRoles() {
    return this.systemService.listRoles();
  }

  @RequirePermissions('system:role:write')
  @Post('/roles')
  createRole(@Body() dto: RoleMutationDto) {
    return this.systemService.createRole(dto);
  }

  @RequirePermissions('system:permission:read')
  @Get('/permissions')
  listPermissions() {
    return this.systemService.listPermissions();
  }

  @RequirePermissions('system:permission:write')
  @Post('/permissions')
  createPermission(@Body() dto: PermissionMutationDto) {
    return this.systemService.createPermission(dto);
  }

  @RequirePermissions('system:menu:read')
  @Get('/menus')
  listMenus() {
    return this.systemService.listMenus();
  }

  @RequirePermissions('system:menu:write')
  @Post('/menus')
  createMenu(@Body() dto: MenuMutationDto) {
    return this.systemService.createMenu(dto);
  }

  @RequirePermissions('system:audit:read')
  @Get('/audit-logs')
  listAuditLogs() {
    return this.systemService.listAuditLogs();
  }
}
```

为什么 Controller 上整体加 `@UseGuards(AdminAuthGuard)`：

- 系统管理接口全部是后台接口。
- 都需要先登录。
- 每个方法再用 `@RequirePermissions()` 细化权限。

为什么读写分不同权限：

- 有些用户可以查看，不一定能修改。
- 比如审计员能看权限配置，但不能改权限。

## 权限装饰器

### `require-permissions.decorator.ts`

```ts
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'required_permissions';

export function RequirePermissions(...permissions: string[]) {
  return SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
}
```

为什么用装饰器：

- 权限声明跟接口写在一起，清楚。
- Guard 可以统一读取 metadata。
- 比在 Service 里手写权限判断更干净。

真实项目里也可以根据路由自动推导权限，减少重复标注。本教学版先用显式装饰器，便于理解。

## AuthService 增加权限解析

`AuthService` 负责登录。现在要让它能解析当前管理员的角色、权限和菜单。

### 新增访问快照类型

```ts
export type AdminAccessSnapshot = {
  roleCodes: string[];
  permissionCodes: string[];
  menus: unknown[];
  buttonPermissions: string[];
  isSuperAdmin: boolean;
};
```

### `resolveAdminAccess`

```ts
async resolveAdminAccess(user: {
  tenantId: bigint;
  username: string;
  roleCodesJson: unknown;
}): Promise<AdminAccessSnapshot> {
  const roleCodes = this.normalizeStringArray(user.roleCodesJson);
  const isSuperAdmin =
    user.username === 'admin' || roleCodes.includes('SUPER_ADMIN');

  if (isSuperAdmin) {
    return {
      roleCodes: roleCodes.includes('SUPER_ADMIN') ? roleCodes : ['SUPER_ADMIN'],
      permissionCodes: this.getDefaultAdminPermissionCodes(),
      menus: this.getDefaultAdminMenus(),
      buttonPermissions: this.getDefaultAdminPermissionCodes(),
      isSuperAdmin: true,
    };
  }

  const roles = roleCodes.length
    ? await this.prisma.sysRole.findMany({
        where: {
          tenantId: user.tenantId,
          code: { in: roleCodes },
          deletedAt: null,
          status: 'enabled',
        },
      })
    : [];

  const permissionCodeSet = new Set<string>();
  const menuIdSet = new Set<bigint>();

  for (const role of roles) {
    this.normalizeStringArray(role.permissionCodesJson).forEach((code) => {
      permissionCodeSet.add(code);
    });
    this.normalizeStringArray(role.menuIdsJson).forEach((menuId) => {
      menuIdSet.add(BigInt(menuId));
    });
  }

  const [permissions, menus] = await Promise.all([
    permissionCodeSet.size
      ? this.prisma.sysPermission.findMany({
          where: {
            tenantId: user.tenantId,
            code: { in: Array.from(permissionCodeSet) },
            deletedAt: null,
            status: 'enabled',
          },
        })
      : Promise.resolve([]),
    menuIdSet.size
      ? this.prisma.sysMenu.findMany({
          where: {
            tenantId: user.tenantId,
            id: { in: Array.from(menuIdSet) },
            deletedAt: null,
            status: 'enabled',
            visible: true,
          },
          orderBy: [{ sortNo: 'asc' }, { id: 'asc' }],
        })
      : Promise.resolve([]),
  ]);

  const mergedPermissionCodes = new Set<string>([
    ...Array.from(permissionCodeSet),
    ...permissions.map((permission) => permission.code),
    ...menus
      .filter((menu) => menu.permissionCode)
      .map((menu) => menu.permissionCode as string),
  ]);

  return {
    roleCodes,
    permissionCodes: Array.from(mergedPermissionCodes),
    menus: this.buildMenuTree(menus, menuIdSet),
    buttonPermissions: Array.from(mergedPermissionCodes),
    isSuperAdmin: false,
  };
}
```

这里的 `AuthService` 直接注入 `PrismaService`，权限快照从 `sys_role`、`sys_permission`、`sys_menu` 读取。

为什么返回 access snapshot：

- Guard 判断权限需要 `permissionCodes`。
- 前端渲染菜单需要 `menus`。
- 前端按钮控制需要 `buttonPermissions`。
- 超级管理员可以绕过普通权限。

### 登录和 `/me` 返回权限信息

登录返回可以变成：

```ts
const access = await this.resolveAdminAccess(user);

return {
  token,
  user: {
    id: user.id,
    username: user.username,
    realName: user.realName,
    roles: access.roleCodes,
  },
  menus: access.menus,
  buttonPermissions: access.buttonPermissions,
};
```

为什么登录后返回菜单：

- PC 后台登录成功后要渲染侧边栏。
- 前端按钮也需要知道哪些可显示。

为什么后端仍要 Guard 校验：

- 前端菜单只是展示层。
- 用户可以直接调用接口。
- 后端必须兜底。

### 后台登录态为什么写 Redis

后台登录时，JWT 负责“这个 token 是不是服务端签发的”，Redis 负责“服务端现在还承不承认这次登录”。当前项目在 `AuthService.adminLogin()` 里登录成功后写入 Redis session：

```ts
const token = await this.jwtService.signAsync({
  sub: user.id.toString(),
  tenantId: user.tenantId.toString(),
  username: user.username,
  type: 'admin',
});

await this.redisService.rememberLoginSession({
  scope: 'admin',
  tenantId: user.tenantId.toString(),
  actorId: user.id.toString(),
  token,
  ttlSeconds: this.resolveJwtTtlSeconds(),
});
```

`RedisService` 里会把登录态写到 `session:admin:{tenantId}:{actorId}`：

```ts
async rememberLoginSession(input: {
  scope: 'admin' | 'member';
  tenantId: string;
  actorId: string;
  token: string;
  ttlSeconds?: number;
}) {
  const key = this.sessionKey(input.scope, input.tenantId, input.actorId);
  const entry = {
    scope: input.scope,
    tenantId: input.tenantId,
    actorId: input.actorId,
    token: input.token,
    expiresAt: input.ttlSeconds ? Date.now() + input.ttlSeconds * 1000 : null,
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

为什么不只靠 JWT：

- JWT 在过期前通常一直有效，服务端很难主动撤销。
- Redis session 可以支持强制下线、禁用账号后立即失效。
- Redis 只保存临时登录态，不保存用户、角色、权限主数据。

## AdminAuthGuard 加权限校验

### 核心代码

```ts
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../modules/redis/redis.service';
import { AuthService } from '../../modules/auth/auth.service';
import { ADMIN_PERMISSIONS_KEY } from '../decorators/admin-permissions.decorator';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const token = this.resolveBearerToken(request.headers?.authorization);
    const payload = await this.verifyToken(token);

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
      tenantName: adminUser.tenant.name,
      ...access,
    };

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(ADMIN_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) || [];

    if (requiredPermissions.length > 0 && !access.isSuperAdmin) {
      const granted = new Set(access.permissionCodes);
      const allowed = requiredPermissions.every((code) => granted.has(code));

      if (!allowed) {
        throw new ForbiddenException('permission denied');
      }
    }

    return true;
  }
}
```

为什么要用 `Reflector`：

- `@RequirePermissions()` 写的是 metadata。
- Guard 需要通过 Reflector 读取当前 Controller 方法上的 metadata。

为什么超级管理员可以绕过：

- 系统初始化阶段需要一个最高权限账号。
- 否则可能出现没有人能配置权限的死锁。
- 但真实项目里超级管理员也要谨慎使用并记录审计。

## Redis 限流 Guard

当前项目启动时会把 `RateLimitGuard` 挂成全局守卫，而且顺序在 `AdminAuthGuard` 前面：

```ts
app.useGlobalGuards(app.get(RateLimitGuard), app.get(AdminAuthGuard));
```

限流用 Redis 记录“某个 IP + HTTP 方法 + 路径”在一个时间窗口内访问了多少次。这样可以挡住后台接口被频繁刷新、脚本误调用或简单暴力请求。

### `rate-limit.guard.ts`

```ts
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.redisService.isRateLimitEnabled()) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const path = String(request?.url || '').split('?')[0];
    if (this.shouldSkip(path)) {
      return true;
    }

    const method = String(request?.method || 'GET').toUpperCase();
    const ip = this.resolveIp(request);
    const result = await this.redisService.checkRateLimit({
      key: `rate:${ip}:${method}:${path}`,
    });

    if (!result.allowed) {
      throw new HttpException(
        {
          message: '请求过于频繁，请稍后再试',
          resetAt: result.resetAt,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
```

`RedisService.checkRateLimit()` 在真实 Redis 模式下使用 `INCR + EXPIRE`：

```ts
async checkRateLimit(input: { key: string; limit?: number; windowSeconds?: number }) {
  const key = this.normalizeKey(input.key);
  const limit = input.limit || this.getDefaultRateLimit();
  const windowSeconds = input.windowSeconds || this.getDefaultRateWindowSeconds();

  if (this.canUseRedis()) {
    const redisKey = this.rateRedisKey(key);
    const count = await this.client!.incr(redisKey);
    if (count === 1) {
      await this.client!.expire(redisKey, windowSeconds);
    }
    const ttl = await this.client!.ttl(redisKey);
    return this.toRateLimitResult({
      key,
      count,
      limit,
      resetAt: Date.now() + Math.max(ttl, 1) * 1000,
    });
  }

  // 本地开发没有 Redis 时，回退到内存桶。
}
```

相关配置：

```env
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=300
RATE_LIMIT_WINDOW_SECONDS=60
```

## 审计日志 Interceptor

审计要记录后台写操作。

### 审计解决什么问题

没有审计时：

```text
商品价格被改了，不知道谁改的。
订单备注被清空了，不知道什么时候改的。
某个管理员被禁用了，不知道谁操作的。
```

有审计后：

```text
谁
在什么时候
通过哪个接口
对哪个模块
做了什么操作
成功还是失败
耗时多少
请求参数是什么
```

### `audit-log.interceptor.ts`

```ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { PrismaService } from '../../modules/prisma/prisma.service';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    if (!this.shouldAudit(request)) {
      return next.handle();
    }

    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        void this.record(request, {
          status: 'succeeded',
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((error) => {
        void this.record(request, {
          status: 'failed',
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error),
        });

        return throwError(() => error);
      }),
    );
  }

  private shouldAudit(request: {
    method?: string;
    url?: string;
    admin?: unknown;
  }) {
    const method = String(request.method || '').toUpperCase();
    const path = String(request.url || '').split('?')[0];

    if (!request.admin) return false;
    if (!path.startsWith('/api/admin/')) return false;
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return false;
    if (path.includes('/audit-logs')) return false;

    return true;
  }

  private async record(
    request: {
      method?: string;
      url?: string;
      params?: Record<string, unknown>;
      query?: Record<string, unknown>;
      body?: unknown;
      admin?: {
        adminId: string | bigint;
        tenantId: string | bigint;
        username: string;
        realName?: string;
      };
    },
    outcome: {
      status: 'succeeded' | 'failed';
      durationMs: number;
      error?: string;
    },
  ) {
    if (!request.admin) return;

    const path = String(request.url || '').split('?')[0];
    const method = String(request.method || '').toUpperCase();

    try {
      await this.prisma.sysAuditLog.create({
        data: {
          tenantId: BigInt(request.admin.tenantId),
          operatorId: BigInt(request.admin.adminId),
          operator: request.admin.realName || request.admin.username,
          module: this.resolveModule(path),
          action: this.resolveAction(method, path),
          targetId: this.resolveTargetId(path),
          content: `${method} ${path} ${outcome.status}`.slice(0, 500),
          rawJson: {
            params: this.sanitize(request.params || {}),
            query: this.sanitize(request.query || {}),
            body: this.sanitize(request.body),
            error: outcome.error,
            durationMs: outcome.durationMs,
          },
        },
      });
    } catch {
      // 审计是旁路能力，写日志失败不能打断主业务请求。
    }
  }

  private resolveModule(path: string) {
    const parts = path.replace(/^\/api\/admin\/v1\/?/, '').split('/');
    return parts[0] || 'admin';
  }

  private resolveTargetId(path: string) {
    return path.split('/').find((part) => /^\d+$/.test(part));
  }

  private resolveAction(method: string, path: string) {
    if (method === 'POST') return path.split('/').at(-1) || 'create';
    if (method === 'PUT' || method === 'PATCH') return 'update';
    if (method === 'DELETE') return 'delete';
    return method.toLowerCase();
  }

  private sanitize(value: unknown): unknown {
    if (!value || typeof value !== 'object') {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }

    const sensitiveKeys = ['password', 'token', 'secret', 'authorization'];
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
        result[key] = '[redacted]';
      } else {
        result[key] = this.sanitize(item);
      }
    }

    return result;
  }
}
```

为什么审计不能影响主流程：

- 审计是旁路能力。
- 如果审计写失败，通常不应该导致用户创建商品失败。
- 真实项目可以在 `record()` 内部 catch 错误，避免打断业务。

为什么要脱敏：

- 审计日志可能保存请求体。
- 密码、token、密钥不能明文进入日志。

为什么只审计写操作：

- GET 请求太多，全部审计会产生大量噪音。
- 关键风险主要在新增、修改、删除。

## SystemModule

```ts
import { Module } from '@nestjs/common';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
```

注意：

- `PrismaModule` 是全局模块，`SystemService` 可以直接注入 `PrismaService`。
- `AuditLogInterceptor` 在根模块作为全局 provider 注册，不需要挂在 `SystemModule` 里。
- 当前项目的权限解析放在 `AuthService`，通过 Prisma 读取系统表。

更清晰的拆法：

```text
AuthService 负责登录、token 和 access 解析。
SystemService 负责系统管理 CRUD。
AdminAuthGuard 注入 AuthService + RedisService。
```

这样能避免 AuthModule 和 SystemModule 互相依赖。

## Redis 运维接口

当前项目还有一个后台 Redis 运维模块，给管理员查看 Redis 状态、缓存、登录态、锁和限流结果。它不是业务主数据，只是临时状态的观察和调试入口。

目标接口：

```text
GET    /api/admin/v1/redis/status
GET    /api/admin/v1/redis/cache
GET    /api/admin/v1/redis/cache/:key
POST   /api/admin/v1/redis/cache
DELETE /api/admin/v1/redis/cache/:key
GET    /api/admin/v1/redis/sessions
POST   /api/admin/v1/redis/locks/acquire
POST   /api/admin/v1/redis/locks/release
POST   /api/admin/v1/redis/rate-limit/check
```

核心 Controller：

```ts
@ApiTags('redis')
@Controller('/api/admin/v1/redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('/status')
  status() {
    return this.redisService.getStatus();
  }

  @Get('/cache')
  listCache(@Query() query: RedisQueryDto) {
    return this.redisService.listCache(query);
  }

  @Post('/cache')
  setCache(@Body() dto: RedisCacheMutationDto) {
    return this.redisService.setCache(dto.key, dto.value, dto.ttlSeconds);
  }

  @Get('/sessions')
  listSessions(@Query() query: RedisQueryDto) {
    return this.redisService.listSessions(query);
  }

  @Post('/locks/acquire')
  acquireLock(@Body() dto: RedisLockMutationDto) {
    return this.redisService.acquireLock(dto.key, dto.owner, dto.ttlSeconds);
  }

  @Post('/rate-limit/check')
  checkRateLimit(@Body() dto: RedisRateLimitDto) {
    return this.redisService.checkRateLimit(dto);
  }
}
```

`AdminAuthGuard` 会给 Redis 运维接口推导权限：

```ts
if (path.startsWith('/api/admin/v1/redis')) {
  return [isRead ? 'redis:read' : 'redis:write'];
}
```

为什么 Redis 运维也要走后台权限：

- session、锁、缓存都可能包含业务上下文，不能公开暴露。
- 手动释放锁、写缓存属于高风险操作，要限制到管理员。
- 这些接口主要用于排查问题，不应该被小程序端或普通用户调用。

## 更清晰 Guard 依赖

为了减少循环依赖，推荐这样：

```ts
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly redisService: RedisService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.resolveBearerToken(request.headers?.authorization);
    const payload = await this.verifyToken(token);

    const sessionOk = await this.redisService.hasLoginSession(
      'admin',
      payload.tenantId,
      payload.sub,
    );
    if (!sessionOk) {
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
      ...access,
    };

    this.checkPermissions(context, access);
    return true;
  }
}
```

为什么这样更好：

- Guard 组合 JWT 验签、Redis 登录态、数据库用户状态和权限校验。
- AuthService 内部通过 Prisma 读取 `sys_admin_user`、角色、权限、菜单。
- Redis 只管“这次登录是否还有效”，不保存后台用户主数据。
- 权限最终以 MySQL 当前状态为准。

## 初始化默认权限数据

系统刚启动时，如果没有任何权限和超级管理员，会出现没人能管理系统的问题。可以写一个 seed 方法：

```ts
async seedSystemData() {
  await this.createPermissionIfMissing({
    code: 'system:user:read',
    name: '用户查看',
    resourceType: 'api',
    resourcePath: '/api/admin/v1/system/users',
    status: 'enabled',
  });

  await this.createPermissionIfMissing({
    code: 'system:user:write',
    name: '用户写入',
    resourceType: 'api',
    resourcePath: '/api/admin/v1/system/users',
    status: 'enabled',
  });

  await this.createPermissionIfMissing({
    code: 'system:role:read',
    name: '角色查看',
    resourceType: 'api',
    status: 'enabled',
  });

  await this.createPermissionIfMissing({
    code: 'system:role:write',
    name: '角色写入',
    resourceType: 'api',
    status: 'enabled',
  });

  await this.createRoleIfMissing({
    name: '超级管理员',
    code: 'super_admin',
    permissionCodes: [
      'system:user:read',
      'system:user:write',
      'system:role:read',
      'system:role:write',
    ],
    menuIds: [],
    status: 'enabled',
  });
}
```

真实项目中，这类初始化通常放在：

```text
prisma/seed.ts
```

为什么 seed 很重要：

- 没有默认管理员就无法登录。
- 没有默认权限就无法配置后台。
- 本地开发需要一组能跑通的基础数据。

## 接口调用顺序

推荐按这个顺序调接口：

### 注册或 seed 一个超级管理员

已经有 register。创建用户时可以先给：

```json
{
  "username": "admin",
  "password": "admin123456",
  "realName": "管理员",
  "roleCodes": ["super_admin"],
  "status": "enabled"
}
```

真实项目里默认 admin 来自 seed。

### 登录

```text
POST /api/admin/v1/auth/login
```

拿到 token。

### 创建权限点

```text
POST /api/admin/v1/system/permissions
```

示例：

```json
{
  "code": "catalog:read",
  "name": "商品查看",
  "resourceType": "api",
  "resourcePath": "/api/admin/v1/catalog",
  "status": "enabled"
}
```

### 创建菜单

```text
POST /api/admin/v1/system/menus
```

示例：

```json
{
  "name": "商品管理",
  "path": "/catalog/products",
  "icon": "box",
  "permissionCode": "catalog:read",
  "sortNo": 10,
  "visible": true,
  "status": "enabled"
}
```

### 创建角色

```text
POST /api/admin/v1/system/roles
```

示例：

```json
{
  "name": "运营",
  "code": "operator",
  "permissionCodes": ["catalog:read"],
  "menuIds": ["1"],
  "status": "enabled"
}
```

### 创建用户并绑定角色

```text
POST /api/admin/v1/system/users
```

示例：

```json
{
  "username": "alice",
  "password": "alice123456",
  "realName": "Alice",
  "phone": "13800000000",
  "roleCodes": ["operator"],
  "status": "enabled"
}
```

### 用新用户登录

登录后应返回：

```text
menus
buttonPermissions
roles
```

如果新用户访问没有权限的接口，应返回 403。

## 本章核心设计总结

| 设计 | 解决什么问题 | 为什么这样做 |
| --- | --- | --- |
| SystemModule | 后台系统管理能力集中 | 和 AuthModule 职责分开 |
| 用户 CRUD | 管理后台员工账号 | 后台账号不能只靠注册 |
| 角色 | 按岗位分组权限 | 比给每个用户单独配权限更好维护 |
| 权限码 | 接口和按钮权限判断 | 字符串稳定，前后端都能用 |
| 菜单 | 控制后台导航展示 | 菜单是展示入口，不等于接口安全 |
| Guard 权限校验 | 后端兜底安全 | 防止绕过前端直接调接口 |
| 审计日志 | 追溯后台写操作 | ERP 涉及订单、库存、财务，必须可追责 |
| 敏感字段脱敏 | 防止日志泄漏密码/token | 审计也不能牺牲安全 |
| seed 默认数据 | 避免系统无人可管 | 初始管理员和权限必须存在 |

### 和真实 ERP 项目的区别

| 简易版 | 真实 ERP 项目 |
| --- | --- |
| MySQL + Prisma 保存用户角色权限 | 当前项目真实实现 |
| 简化 roleCodes/permissionCodes 数组 | JSON 字段或后续中间表 |
| 手动 seed 方法 | `prisma/seed.ts` |
| 装饰器声明权限 | 项目中也支持按路由推导默认权限 |
| 审计写 `sys_audit_log` | 当前项目真实实现 |
| 没有租户 | 真实项目所有核心表带 `tenant_id` |





