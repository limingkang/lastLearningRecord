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
继续使用内存仓储。真实 ERP 项目中，这些数据对应 MySQL 表：
```text
sys_admin_user
sys_role
sys_permission
sys_menu
sys_audit_log
```
为什么先用内存：
- 重点是理解 RBAC 和审计设计
- 真实数据库会在后续 Prisma 章节深入
- 先把业务关系讲清楚，再把存储替换成 MySQL

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
      system.repository.ts
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

### `system.repository.ts` 的基础类型

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

为什么角色里先用数组保存权限和菜单：

- 先简单直接了解下实现方式
- 对应真实项目里的 `role_codes_json`、`permission_codes_json`、`menu_ids_json`。
- 后续如果权限规模大，可以拆成中间表。

真实数据库中更像：

```text
sys_admin_user.role_codes_json
sys_role.permission_codes_json
sys_role.menu_ids_json
```

如果项目变大，也可以演进成：

```text
sys_user_role
sys_role_permission
sys_role_menu
```

## DTO 设计

DTO 负责接口入参校验。

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

## SystemRepository

### 基础仓储

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditLog,
  SystemMenu,
  SystemPermission,
  SystemRole,
  SystemUser,
} from './system.types';

@Injectable()
export class SystemRepository {
  private users: SystemUser[] = [];
  private roles: SystemRole[] = [];
  private permissions: SystemPermission[] = [];
  private menus: SystemMenu[] = [];
  private auditLogs: AuditLog[] = [];

  private ids = {
    user: 1,
    role: 1,
    permission: 1,
    menu: 1,
    audit: 1,
  };

  nextId(type: keyof typeof this.ids) {
    return String(this.ids[type]++);
  }

  now() {
    return new Date();
  }
}
```

实际代码中可以把类型放在 `system.types.ts`，也可以直接放 `system.repository.ts`。

### 用户相关方法

```ts
async listUsers(query: { keyword?: string; status?: string }) {
  return this.users.filter((user) => {
    if (user.deletedAt) return false;
    if (query.status && user.status !== query.status) return false;
    if (query.keyword) {
      const keyword = query.keyword.toLowerCase();
      return (
        user.username.toLowerCase().includes(keyword) ||
        user.realName.toLowerCase().includes(keyword) ||
        user.phone?.includes(keyword)
      );
    }
    return true;
  });
}

async findUserById(id: string) {
  return this.users.find((user) => user.id === id && !user.deletedAt) || null;
}

async findUserByUsername(username: string) {
  return this.users.find((user) => user.username === username && !user.deletedAt) || null;
}

async createUser(input: Omit<SystemUser, 'id' | 'createdAt' | 'updatedAt'>) {
  const existed = await this.findUserByUsername(input.username);
  if (existed) {
    throw new ConflictException('username already exists');
  }

  const now = this.now();
  const user: SystemUser = {
    ...input,
    id: this.nextId('user'),
    createdAt: now,
    updatedAt: now,
  };

  this.users.push(user);
  return user;
}

async updateUser(id: string, patch: Partial<SystemUser>) {
  const user = await this.findUserById(id);
  if (!user) {
    throw new NotFoundException('user not found');
  }

  Object.assign(user, patch, {
    updatedAt: this.now(),
  });

  return user;
}

async deleteUser(id: string) {
  const user = await this.findUserById(id);
  if (!user) {
    throw new NotFoundException('user not found');
  }

  user.deletedAt = this.now();
  user.updatedAt = this.now();
  return { success: true };
}
```

为什么删除用 `deletedAt`：

- 后台用户涉及审计和历史操作，不应该轻易物理删除。
- 用户删除后，历史审计日志仍然要知道是谁操作的。

### 角色、权限、菜单方法

核心写法类似，这里摘关键代码：

```ts
async listRoles() {
  return this.roles.filter((role) => !role.deletedAt);
}

async findRoleByCode(code: string) {
  return this.roles.find((role) => role.code === code && !role.deletedAt) || null;
}

async createRole(input: Omit<SystemRole, 'id' | 'createdAt' | 'updatedAt'>) {
  const existed = await this.findRoleByCode(input.code);
  if (existed) {
    throw new ConflictException('role code already exists');
  }

  const now = this.now();
  const role: SystemRole = {
    ...input,
    id: this.nextId('role'),
    createdAt: now,
    updatedAt: now,
  };

  this.roles.push(role);
  return role;
}

async listPermissions() {
  return this.permissions.filter((permission) => !permission.deletedAt);
}

async findPermissionByCode(code: string) {
  return this.permissions.find((item) => item.code === code && !item.deletedAt) || null;
}

async createPermission(
  input: Omit<SystemPermission, 'id' | 'createdAt' | 'updatedAt'>,
) {
  const existed = await this.findPermissionByCode(input.code);
  if (existed) {
    throw new ConflictException('permission code already exists');
  }

  const now = this.now();
  const permission: SystemPermission = {
    ...input,
    id: this.nextId('permission'),
    createdAt: now,
    updatedAt: now,
  };

  this.permissions.push(permission);
  return permission;
}

async listMenus() {
  return this.menus.filter((menu) => !menu.deletedAt);
}

async createMenu(input: Omit<SystemMenu, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = this.now();
  const menu: SystemMenu = {
    ...input,
    id: this.nextId('menu'),
    createdAt: now,
    updatedAt: now,
  };

  this.menus.push(menu);
  return menu;
}
```

为什么角色和权限要校验 code 唯一：

- 权限判断靠 code。
- 如果重复，Guard 无法确定真正含义。
- 菜单可以不按 path 唯一，真实项目里可根据业务需求加约束。

### 审计日志方法

```ts
async createAuditLog(input: Omit<AuditLog, 'id' | 'createdAt'>) {
  const auditLog: AuditLog = {
    ...input,
    id: this.nextId('audit'),
    createdAt: this.now(),
  };

  this.auditLogs.push(auditLog);
  return auditLog;
}

async listAuditLogs() {
  return [...this.auditLogs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
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
import { SystemRepository } from './system.repository';

@Injectable()
export class SystemService {
  constructor(private readonly repository: SystemRepository) {}

  listUsers(query: UserQueryDto) {
    return this.repository.listUsers(query);
  }

  async createUser(dto: CreateUserDto) {
    await this.ensureRoleCodesExist(dto.roleCodes);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.repository.createUser({
      username: dto.username,
      passwordHash,
      realName: dto.realName,
      phone: dto.phone,
      roleCodes: dto.roleCodes,
      status: dto.status,
    });

    return this.sanitizeUser(user);
  }

  async updateUser(id: string, dto: UpdateUserDto) {
    await this.ensureRoleCodesExist(dto.roleCodes);

    const patch: Record<string, unknown> = {
      realName: dto.realName,
      phone: dto.phone,
      roleCodes: dto.roleCodes,
      status: dto.status,
    };

    if (dto.password) {
      patch.passwordHash = await bcrypt.hash(dto.password, 10);
    }

    const user = await this.repository.updateUser(id, patch);
    return this.sanitizeUser(user);
  }

  deleteUser(id: string) {
    return this.repository.deleteUser(id);
  }

  private sanitizeUser(user: {
    id: string;
    username: string;
    realName: string;
    phone?: string;
    roleCodes: string[];
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: user.id,
      username: user.username,
      realName: user.realName,
      phone: user.phone,
      roleCodes: user.roleCodes,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async ensureRoleCodesExist(roleCodes: string[]) {
    const roles = await this.repository.listRoles();
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
  return this.repository.listPermissions();
}

async createPermission(dto: PermissionMutationDto) {
  return this.repository.createPermission({
    code: dto.code,
    name: dto.name,
    resourceType: dto.resourceType,
    resourcePath: dto.resourcePath,
    status: dto.status,
  });
}

async listMenus() {
  const menus = await this.repository.listMenus();
  return this.buildMenuTree(menus);
}

async createMenu(dto: MenuMutationDto) {
  if (dto.permissionCode) {
    await this.ensurePermissionCodesExist([dto.permissionCode]);
  }

  return this.repository.createMenu({
    parentId: dto.parentId,
    name: dto.name,
    path: dto.path,
    icon: dto.icon,
    permissionCode: dto.permissionCode,
    sortNo: dto.sortNo,
    visible: dto.visible,
    status: dto.status,
  });
}

private buildMenuTree(menus: Array<{
  id: string;
  parentId?: string;
  sortNo: number;
}>) {
  const cloned = menus
    .map((menu) => ({ ...menu, children: [] as unknown[] }))
    .sort((a, b) => a.sortNo - b.sortNo);

  const map = new Map(cloned.map((menu) => [menu.id, menu]));
  const roots: unknown[] = [];

  for (const menu of cloned) {
    if (menu.parentId && map.has(menu.parentId)) {
      map.get(menu.parentId)!.children.push(menu);
    } else {
      roots.push(menu);
    }
  }

  return roots;
}

private async ensurePermissionCodesExist(permissionCodes: string[]) {
  const permissions = await this.repository.listPermissions();
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
  return this.repository.listRoles();
}

async createRole(dto: RoleMutationDto) {
  await this.ensurePermissionCodesExist(dto.permissionCodes);
  await this.ensureMenuIdsExist(dto.menuIds);

  return this.repository.createRole({
    name: dto.name,
    code: dto.code,
    permissionCodes: dto.permissionCodes,
    menuIds: dto.menuIds,
    status: dto.status,
  });
}

async updateRole(id: string, dto: RoleMutationDto) {
  await this.ensurePermissionCodesExist(dto.permissionCodes);
  await this.ensureMenuIdsExist(dto.menuIds);

  return this.repository.updateRole(id, {
    name: dto.name,
    code: dto.code,
    permissionCodes: dto.permissionCodes,
    menuIds: dto.menuIds,
    status: dto.status,
  });
}

private async ensureMenuIdsExist(menuIds: string[]) {
  const menus = await this.repository.listMenus();
  const menuIdSet = new Set(menus.map((menu) => menu.id));

  const missing = menuIds.filter((id) => !menuIdSet.has(id));
  if (missing.length > 0) {
    throw new BadRequestException(`menu not found: ${missing.join(', ')}`);
  }
}
```

如果 `repository.updateRole` 尚未实现，可以按 `updateUser` 同样方式实现。

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
async resolveAdminAccess(user: { roleCodes: string[] }): Promise<AdminAccessSnapshot> {
  const roles = await this.systemRepository.listRoles();
  const permissions = await this.systemRepository.listPermissions();
  const menus = await this.systemRepository.listMenus();

  const enabledRoles = roles.filter(
    (role) => role.status === 'enabled' && user.roleCodes.includes(role.code),
  );

  const isSuperAdmin = enabledRoles.some((role) => role.code === 'super_admin');

  const permissionCodeSet = new Set<string>();
  const menuIdSet = new Set<string>();

  for (const role of enabledRoles) {
    for (const code of role.permissionCodes) {
      permissionCodeSet.add(code);
    }
    for (const menuId of role.menuIds) {
      menuIdSet.add(menuId);
    }
  }

  const enabledPermissions = permissions.filter(
    (permission) =>
      permission.status === 'enabled' &&
      (isSuperAdmin || permissionCodeSet.has(permission.code)),
  );

  const buttonPermissions = enabledPermissions
    .filter((permission) => permission.resourceType === 'button')
    .map((permission) => permission.code);

  const visibleMenus = menus.filter(
    (menu) =>
      menu.status === 'enabled' &&
      menu.visible &&
      (isSuperAdmin || menuIdSet.has(menu.id)),
  );

  return {
    roleCodes: enabledRoles.map((role) => role.code),
    permissionCodes: enabledPermissions.map((permission) => permission.code),
    menus: this.buildMenuTree(visibleMenus),
    buttonPermissions,
    isSuperAdmin,
  };
}
```

这里的 `systemRepository` 需要注入到 `AuthService`。

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

## AdminAuthGuard 加权限校验

### 核心代码

```ts
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // 这里省略第一章已经写过的 token、session、用户状态校验。
    const adminUser = await this.resolveAdminUserFromToken(request);
    const access = await this.authService.resolveAdminAccess(adminUser);

    request.admin = {
      adminId: adminUser.id,
      username: adminUser.username,
      realName: adminUser.realName,
      ...access,
    };

    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS_KEY, [
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
import { SystemRepository } from '../../modules/system/system.repository';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(private readonly repository: SystemRepository) {}

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
        adminId: string;
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

    await this.repository.createAuditLog({
      operatorId: request.admin.adminId,
      operator: request.admin.realName || request.admin.username,
      module: this.resolveModule(path),
      action: this.resolveAction(method, path),
      path,
      method,
      targetId: this.resolveTargetId(path),
      status: outcome.status,
      durationMs: outcome.durationMs,
      raw: {
        params: this.sanitize(request.params || {}),
        query: this.sanitize(request.query || {}),
        body: this.sanitize(request.body),
        error: outcome.error,
      },
    });
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
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { AuditLogInterceptor } from '../../common/interceptors/audit-log.interceptor';
import { SystemController } from './system.controller';
import { SystemRepository } from './system.repository';
import { SystemService } from './system.service';

@Module({
  imports: [AuthModule],
  controllers: [SystemController],
  providers: [
    SystemRepository,
    SystemService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
  exports: [
    SystemRepository,
    SystemService,
  ],
})
export class SystemModule {}
```

注意：

- 如果 `AuthModule` 也需要 `SystemRepository` 来解析角色权限，要避免循环依赖。
- 可以先把 `SystemRepository` 提供在全局共享模块里，或者把 `resolveAdminAccess` 放到 `SystemService`。
- 真实项目里通过模块依赖关系、Provider 注入和合理边界解决。

更清晰的拆法：

```text
AuthService 只负责登录和 token。
SystemService 负责解析 access。
AdminAuthGuard 注入 AuthService + SystemService。
```

这样能避免 AuthModule 和 SystemModule 互相依赖。

## 更清晰 Guard 依赖

为了减少循环依赖，推荐这样：

```ts
@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
    private readonly systemService: SystemService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.resolveBearerToken(request.headers?.authorization);
    const payload = await this.verifyToken(token);
    const adminUser = await this.authService.getAdminForAccess({
      adminId: payload.sub,
    });

    if (!adminUser) {
      throw new UnauthorizedException('admin disabled or not found');
    }

    const access = await this.systemService.resolveAdminAccess(adminUser);

    request.admin = {
      adminId: adminUser.id,
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

- Auth 只管身份。
- System 只管权限。
- Guard 组合身份和权限。
- 模块职责更清楚。

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
| 内存数组保存用户角色权限 | MySQL + Prisma |
| 简化 roleCodes/permissionCodes 数组 | JSON 字段或后续中间表 |
| 手动 seed 方法 | `prisma/seed.ts` |
| 装饰器声明权限 | 项目中也支持按路由推导默认权限 |
| 审计写内存 | 审计写 `sys_audit_log` |
| 没有租户 | 真实项目所有核心表带 `tenant_id` |

真实 ERP 项目里对应文件：

```text
server/src/modules/system
server/src/common/guards/admin-auth.guard.ts
server/src/common/interceptors/audit-log.interceptor.ts
server/prisma/schema.prisma
server/prisma/seed.ts
```
