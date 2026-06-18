基础能力补充
```text
文件上传
  -> 图片访问
  -> 数据导出
  -> 数据导入
  -> 任务台账
  -> 消息队列
  -> 定时任务
```

一个后台不能只写 CRUD。因为真实系统里，很多事情都不是“点一下按钮就立刻完成”的：

```text
上传大文件
批量导出
批量导入
图片压缩
异步通知
超时关单
自动对账
库存预警
```

如果这些都塞进一个 HTTP 请求里，系统很快就会变慢、超时、重复执行、难以排查。本章就是在学：

```text
怎么把慢任务拆出去。
怎么把结果记下来。
怎么让失败可重试。
怎么让后台人员能看见任务历史。
```

目标接口：

```text
文件中心：
POST /api/admin/v1/files
GET  /api/admin/v1/files
GET  /api/admin/v1/files/:id
GET  /api/admin/v1/files/:id/sign
DELETE /api/admin/v1/files/:id
GET  /uploads/:datePath/:fileName

导入导出中心：
GET  /api/admin/v1/data-transfer/catalog
POST /api/admin/v1/data-transfer/exports
POST /api/admin/v1/data-transfer/imports
POST /api/admin/v1/data-transfer/import-templates
GET  /api/admin/v1/data-transfer/tasks
GET  /api/admin/v1/data-transfer/tasks/:id
GET  /api/admin/v1/data-transfer/export-files
POST /api/admin/v1/data-transfer/export-files/cleanup

消息队列中心：
GET  /api/admin/v1/mq/topology
GET  /api/admin/v1/mq/consumer/status
POST /api/admin/v1/mq/consumer/start
POST /api/admin/v1/mq/consumer/stop
POST /api/admin/v1/mq/outbox
POST /api/admin/v1/mq/outbox/:id/publish
POST /api/admin/v1/mq/outbox/publish-pending
POST /api/admin/v1/mq/outbox/:id/consume
POST /api/admin/v1/mq/outbox/:id/retry
POST /api/admin/v1/mq/outbox/:id/dead
GET  /api/admin/v1/mq/consume-logs

定时任务中心：
GET  /api/admin/v1/scheduler/jobs
POST /api/admin/v1/scheduler/jobs/:id/run
POST /api/admin/v1/scheduler/run-all
```

## 做一个文件上传中心

最小可用的文件中心，先不要想复杂对象存储，先想清楚三件事：

```text
文件存哪儿
文件怎么访问
文件元数据怎么记
```

### 文件表设计

核心表以 `schema.prisma` 里的 `SysFile` 为准：

```prisma
model SysFile {
  id              BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId        BigInt    @map("tenant_id") @db.UnsignedBigInt
  fileKey         String    @map("file_key") @db.VarChar(128)
  originalName    String    @map("original_name") @db.VarChar(255)
  mimeType        String    @map("mime_type") @db.VarChar(128)
  extension       String?   @db.VarChar(32)
  size            BigInt    @db.UnsignedBigInt
  storageProvider String    @default("local") @map("storage_provider") @db.VarChar(32)
  bucket          String?   @db.VarChar(128)
  objectKey       String    @map("object_key") @db.VarChar(255)
  url             String    @db.VarChar(512)
  thumbnailUrl    String?   @map("thumbnail_url") @db.VarChar(512)
  status          String    @default("uploaded") @db.VarChar(32)
  metadataJson    Json?     @map("metadata_json")
  createdAt       DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt       DateTime  @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt       DateTime? @map("deleted_at") @db.DateTime(3)
  version         Int       @default(1) @db.UnsignedInt

  @@unique([tenantId, fileKey], map: "uk_sys_file_tenant_key")
  @@index([tenantId, status, createdAt], map: "idx_sys_file_tenant_status_time")
  @@map("sys_file")
}
```

为什么要这样设计：

```text
fileKey    -> 业务唯一键，避免直接暴露自增 id
objectKey  -> 真正存储位置
url        -> 给前端直接访问的地址
metadata   -> 保存导出信息、图片处理信息、来源信息
status     -> 不要物理删除太快，先做逻辑状态
```

### 不用把文件直接放数据库

文件二进制直接进数据库并不适合大多数后台：

```text
读写大
备份重
恢复慢
查询麻烦
CDN 不好接
```

所以更常见的是：

```text
MySQL 只存元数据
文件本体存本地磁盘或对象存储
```

### 最小上传接口

先用一个简单 DTO 表示上传请求：

```ts
class FileUploadDto {
  originalName: string;
  mimeType: string;
  contentBase64: string;
  metadata?: Record<string, unknown> | null;
}
```

为什么先用 base64，而不是一上来就搞 multipart：

```text
学习阶段更容易理解
前后端联调更简单
可以先把业务跑通
```

真实项目里，后面再升级成 multipart / 直传对象存储都行。

### 核心上传代码

```ts
async uploadFile(dto: FileUploadDto) {
  const tenantId = await this.getDefaultTenantId();
  const buffer = Buffer.from(dto.contentBase64, 'base64');
  if (buffer.length === 0) {
    throw new BadRequestException('文件内容不能为空');
  }

  const now = new Date();
  const datePath = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const fileKey = randomUUID();
  const objectKey = `${datePath}/${fileKey}.png`;

  await writeFile(join(storageRoot, objectKey), buffer);

  const file = await prisma.sysFile.create({
    data: {
      tenantId,
      fileKey,
      originalName: dto.originalName,
      mimeType: dto.mimeType,
      size: BigInt(buffer.length),
      storageProvider: 'local',
      objectKey,
      url: `/uploads/${objectKey}`,
      status: 'uploaded',
      metadataJson: dto.metadata ?? null,
    },
  });

  return file;
}
```

这里有几个关键点：

```text
1. 先写文件，再写数据库，避免数据库有记录但文件丢了。
2. 用 randomUUID 生成对象名，避免重复覆盖。
3. objectKey 按日期分目录，方便清理和排查。
```

### 要有签名访问

不是所有文件都应该裸奔公开访问。所以给敏感文件单独加一个签名链接：

```ts
async signFile(id: string) {
  const file = await getFileById(id);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const token = Buffer.from(`${file.fileKey}:${expiresAt.getTime()}`).toString('base64url');
  return {
    url: `${file.url}?token=${token}&expires=${expiresAt.getTime()}`,
    expiresAt,
  };
}
```

为什么要签名：

```text
限制过期时间
减少未授权分享
便于以后切对象存储
```

## 把图片访问和公开读取分开

上传不是访问。很多人会把“上传成功”和“外网能访问”混成一件事，其实要拆开。

### 公开读取接口

公开访问文件时，不要直接允许任意路径读取。

```ts
async readPublicUpload(datePath: string, fileName: string) {
  if (!/^\d{8}$/.test(datePath) || fileName.includes('/') || fileName.includes('\\')) {
    throw new NotFoundException('文件不存在');
  }

  const objectKey = `${datePath}/${fileName}`;
  const file = await prisma.sysFile.findFirst({
    where: { objectKey, status: 'uploaded', deletedAt: null },
  });
  if (!file) throw new NotFoundException('文件不存在');

  return readFile(join(storageRoot, objectKey));
}
```

为什么要校验路径：

```text
防止 ../ 路径穿越
防止读到系统敏感文件
防止构造奇怪 URL
```

### 图片缩略图和原图要分开考虑

图片经常会有两个需求：

```text
列表页看缩略图
详情页看原图
```

所以元数据里可以记：

```ts
thumbnailUrl: mimeType.startsWith('image/') ? `${url}?thumbnail=1` : null
```

这不是必须，但它能让前端展示更快，也给后续图片处理留位置。

## 任务台账

很多后台到后期都会遇到同一个问题：

```text
“这个导入任务到底成功没？”
“上次导出文件是哪一个？”
“为什么某次图片处理失败了？”
```

所以要有统一的任务表。

### 任务表设计

```prisma
model SysAsyncTask {
  id           BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId     BigInt    @map("tenant_id") @db.UnsignedBigInt
  taskNo       String    @map("task_no") @db.VarChar(64)
  type         String    @db.VarChar(64)
  status       String    @default("pending") @db.VarChar(32)
  progress     Int       @default(0)
  resultJson   Json?     @map("result_json")
  errorMessage String?   @map("error_message") @db.VarChar(500)
  startedAt    DateTime? @map("started_at") @db.DateTime(3)
  finishedAt   DateTime? @map("finished_at") @db.DateTime(3)
  createdAt    DateTime  @default(now()) @map("created_at") @db.DateTime(3)
  updatedAt    DateTime  @updatedAt @map("updated_at") @db.DateTime(3)
  deletedAt    DateTime? @map("deleted_at") @db.DateTime(3)
  version      Int       @default(1) @db.UnsignedInt

  @@unique([tenantId, taskNo], map: "uk_sys_async_task_tenant_no")
  @@index([tenantId, status, createdAt], map: "idx_sys_async_task_tenant_status_time")
  @@map("sys_async_task")
}
```

为什么要单独放一张表：

```text
统一追踪所有慢任务
前端可以查历史
失败可以重试
排障时有证据链
```

### 文件上传时顺手记录任务

```ts
await prisma.$transaction([
  prisma.sysFile.create({ data: fileData }),
  prisma.sysAsyncTask.create({
    data: {
      tenantId,
      taskNo,
      type: 'file_upload',
      status: 'succeeded',
      progress: 100,
      resultJson: { fileKey, objectKey, url },
      startedAt: now,
      finishedAt: new Date(),
    },
  }),
]);
```

为什么一起提交：

```text
文件和任务必须保持一致
不能出现任务成功但文件没记录
```

## 先做数据导出，再做数据导入

导出和导入，最适合教“同步做完”和“异步思维”的区别。

### 为什么先做导出

导出一般比导入更安全。

因为导出只是读数据，不会改库。

先做导出，能让你先理解：

```text
查询条件怎么拼
文件怎么生成
导出结果怎么记录
```

### 导出资源白名单

```ts
const EXPORT_RESOURCES = ['products', 'orders', 'inventory', 'members', 'payments'] as const;
```

为什么不能让前端传任意表名：

```text
避免越权
避免暴露内部表
避免以后表结构一改就炸
```

### 导出请求 DTO

```ts
class DataExportRequestDto {
  resource: string;
  format?: 'csv' | 'json' = 'csv';
  limit?: number = 200;
  retentionDays?: number = 7;
  filters?: Record<string, unknown>;
}
```

为什么先支持 CSV 和 JSON：

```text
零依赖
易调试
后面再接 xlsx 更稳
```

### 导出核心流程

```ts
async createExport(dto: DataExportRequestDto) {
  const rows = await loadExportRows(dto.resource, dto.limit, dto.filters);
  const content = dto.format === 'json'
    ? JSON.stringify(rows, null, 2)
    : toCsv(rows);

  const file = await createTransferFile({
    originalName: `products-export.csv`,
    mimeType: 'text/csv',
    content: Buffer.from(content),
  });

  const task = await prisma.sysAsyncTask.create({
    data: {
      taskNo,
      type: 'data_export',
      status: 'succeeded',
      progress: 100,
      resultJson: { fileId: file.id, rowCount: rows.length },
    },
  });

  return { task, file };
}
```

### 导入更复杂

导入会写库，所以会碰到：

```text
格式错误
字段缺失
数据重复
部分成功部分失败
幂等问题
```

所以默认先 dry-run。

### 导入请求 DTO

```ts
class DataImportRequestDto {
  resource: string;
  fileId?: string;
  mode?: 'validate_only' | 'upsert' | 'append' = 'validate_only';
  dryRun?: boolean = true;
  rows?: Array<Record<string, unknown>>;
}
```

为什么默认只校验：

```text
防止误导入
先告诉用户哪里错了
确认后再落库
```

### 导入核心流程

```ts
async createImport(dto: DataImportRequestDto) {
  const rows = dto.fileId
    ? await loadImportRowsFromFile(dto.fileId)
    : dto.rows || [];

  const validation = validateImportRows(dto.resource, rows);
  if (validation.errors.length > 0) {
    return createFailedTask(validation.errors);
  }

  if (dto.dryRun) {
    return createSucceededTask({ note: 'Dry-run only' });
  }

  const result = await applyImportRows(dto.resource, rows, dto.mode);
  return createSucceededTask(result);
}
```

### 导入要支持模板

```text
运营人员不一定知道字段顺序
模板可以减少沟通成本
模板还能统一样例格式
```

所以导入模板也是一个可生成文件的任务：

```ts
async createImportTemplate(dto: DataImportTemplateRequestDto) {
  const template = IMPORT_TEMPLATES[dto.resource];
  const file = await createTransferFile({
    originalName: `${dto.resource}-import-template.csv`,
    mimeType: 'text/csv',
    content: Buffer.from(toCsv([template.sampleRow])),
  });
  return { file, columns: template.columns };
}
```

## 定时任务 Scheduler

当前项目有定时任务中心，用来处理：

```text
close-unpaid-orders      关闭超时未支付订单
auto-confirm-receipts    自动确认收货
expire-coupons           过期优惠券
inventory-warning        库存预警
wechat-reconciliation    微信对账
report-summary           报表汇总
```

这些任务不是用户点一次按钮才需要执行，而是系统要周期性检查：

- 订单过了 30 分钟还没支付，要自动关闭并释放库存、优惠券。
- 已发货订单超过 7 天，可以自动确认收货。
- 优惠券过期后，要自动改成 `expired`，避免下单时还被使用。
- 库存预警、报表汇总、微信对账要定期生成，方便后台查看。

### 模块装配

`SchedulerModule` 会依赖订单、营销、财务、报表、Redis 和 Prisma：

```ts
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    OrderModule,
    MarketingModule,
    FinanceModule,
    ReportModule,
  ],
  controllers: [SchedulerController],
  providers: [SchedulerService],
})
export class SchedulerModule {}
```

根模块里注册 `SchedulerModule` 后，服务启动时就会创建 `SchedulerService`：

```ts
@Module({
  imports: [
    RedisModule,
    PrismaModule,
    OrderModule,
    MarketingModule,
    FinanceModule,
    ReportModule,
    SchedulerModule,
  ],
})
export class AppModule {}
```

为什么 scheduler 要依赖这些业务模块：

- 定时任务本身不应该重写关单、过期优惠券、对账这些业务逻辑。
- Scheduler 只负责“什么时候执行、是否重复执行、结果怎么记录”。
- 真正的业务动作仍然由 `OrderService`、`MarketingService`、`FinanceService`、`ReportService` 完成。

### 后台接口

当前项目提供三个后台接口：

```ts
@ApiTags('scheduler')
@Controller('/api/admin/v1/scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Get('/jobs')
  listJobs() {
    return this.schedulerService.listJobs();
  }

  @Post('/jobs/:id/run')
  runJob(@Param('id') id: string) {
    return this.schedulerService.runJob(id);
  }

  @Post('/run-all')
  runAll() {
    return this.schedulerService.runAll();
  }
}
```

对应用途：

| 接口 | 用途 |
| --- | --- |
| `GET /api/admin/v1/scheduler/jobs` | 查看所有任务、是否启用、上次执行、下次执行、错误信息 |
| `POST /api/admin/v1/scheduler/jobs/:id/run` | 手动执行某个任务 |
| `POST /api/admin/v1/scheduler/run-all` | 手动执行所有任务 |

`AdminAuthGuard` 会给 scheduler 接口推导权限：

```ts
if (path.startsWith('/api/admin/v1/scheduler')) {
  return [isRead ? 'scheduler:read' : 'scheduler:write'];
}
```

### 服务启动后自动 tick

`SchedulerService` 实现了 `OnModuleInit` 和 `OnModuleDestroy`。服务启动时，如果 `SCHEDULER_ENABLED` 没关闭，就用 `setInterval` 周期扫描到期任务：

```ts
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  private readonly jobs = new Map<JobId, SchedulerJob>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly orderService: OrderService,
    private readonly marketingService: MarketingService,
    private readonly financeService: FinanceService,
    private readonly reportService: ReportService,
  ) {
    this.registerJobs();
  }

  onModuleInit() {
    if (!this.isEnabled()) {
      return;
    }
    this.timer = setInterval(() => {
      this.runDueJobs().catch(() => undefined);
    }, this.getTickMs());
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}
```

相关配置：

```env
SCHEDULER_ENABLED=true
SCHEDULER_TICK_MS=30000
SCHEDULER_CLOSE_UNPAID_ORDERS_INTERVAL_MS=60000
SCHEDULER_AUTO_CONFIRM_RECEIPTS_INTERVAL_MS=600000
```

没有单独配置某个任务间隔时，会使用代码里的默认分钟数。

### 注册任务

当前项目把任务定义放在内存 `Map` 里，任务历史则写入 MySQL：

```ts
private registerJobs() {
  const defaults: Array<{ id: JobId; name: string; minutes: number }> = [
    { id: 'close-unpaid-orders', name: '超时关单', minutes: 1 },
    { id: 'auto-confirm-receipts', name: '自动确认收货', minutes: 10 },
    { id: 'expire-coupons', name: '优惠券过期', minutes: 10 },
    { id: 'inventory-warning', name: '库存预警汇总', minutes: 30 },
    { id: 'wechat-reconciliation', name: '微信对账生成', minutes: 60 },
    { id: 'report-summary', name: '报表汇总', minutes: 30 },
  ];

  defaults.forEach((item) => {
    const intervalMs = Number(
      this.configService.get<string>(
        `SCHEDULER_${item.id.replace(/-/g, '_').toUpperCase()}_INTERVAL_MS`,
      ) || item.minutes * 60 * 1000,
    );

    this.jobs.set(item.id, {
      id: item.id,
      name: item.name,
      intervalMs,
      enabled: true,
      running: false,
      lastRunAt: null,
      nextRunAt: new Date(Date.now() + intervalMs),
      lastResult: null,
      lastError: null,
    });
  });
}
```

为什么任务定义不直接存 MySQL：

- 当前项目先用代码固定任务清单，避免后台误删关键系统任务。
- `jobs` 保存的是运行态，比如 `running`、`nextRunAt`、`lastError`。
- 任务执行历史已经写入 `sys_async_task`，后台排查有记录。

### 扫描到期任务

自动 tick 只做一件事：找到到期任务，然后调用 `runJob()`：

```ts
private async runDueJobs() {
  const now = Date.now();
  for (const job of this.jobs.values()) {
    if (!job.enabled || job.running) {
      continue;
    }
    if (!job.nextRunAt || job.nextRunAt.getTime() <= now) {
      await this.runJob(job.id);
    }
  }
}
```

如果服务只启动一个进程，本地 `setInterval` 就能跑。但真实部署可能有多个 Node 进程或多台机器，所有实例都到点执行同一个任务，就会出现重复关单、重复对账、重复写任务记录。

所以当前项目在 `SchedulerService.runJob()` 里先抢 Redis 锁：

```ts
async runJob(id: string) {
  const job = this.jobs.get(id as JobId);
  if (!job) {
    return { id, skipped: true, reason: 'unknown job' };
  }
  if (!job.enabled) {
    return { id, skipped: true, reason: 'disabled' };
  }

  const lock = await this.redisService.acquireLock(
    `scheduler:${job.id}`,
    'scheduler',
    Math.ceil(job.intervalMs / 1000),
  );
  if (!lock.locked) {
    return {
      id: job.id,
      skipped: true,
      reason: 'locked',
      lock,
    };
  }

  job.running = true;
  try {
    const result = await this.executeJob(job.id);
    job.lastRunAt = new Date();
    job.nextRunAt = new Date(job.lastRunAt.getTime() + job.intervalMs);
    job.lastResult = result;
    job.lastError = null;
    await this.recordTask(job, 'succeeded', result);
    return { ...this.toJobRow(job), result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.lastRunAt = new Date();
    job.nextRunAt = new Date(job.lastRunAt.getTime() + job.intervalMs);
    job.lastError = message;
    await this.recordTask(job, 'failed', { error: message });
    return { ...this.toJobRow(job), error: message };
  } finally {
    job.running = false;
    await this.redisService.releaseLock(`scheduler:${job.id}`, 'scheduler');
  }
}
```

### 分发到具体业务

`executeJob()` 负责把任务 ID 分发到真实业务 Service：

```ts
private async executeJob(id: JobId) {
  switch (id) {
    case 'close-unpaid-orders':
      return this.orderService.closeExpiredUnpaidOrders();
    case 'auto-confirm-receipts':
      return this.orderService.autoConfirmReceipts();
    case 'expire-coupons':
      return this.marketingService.expireCoupons();
    case 'inventory-warning':
      return this.buildInventoryWarning();
    case 'wechat-reconciliation':
      return this.financeService.generateReconciliation({
        channel: 'wechat',
        billDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });
    case 'report-summary':
      return this.buildReportSummary();
    default:
      return {};
  }
}
```

几个真实任务的核心逻辑：

```ts
async closeExpiredUnpaidOrders() {
  const cutoff = new Date(Date.now() - 30 * 60 * 1000);
  const orders = await this.prisma.ecOrder.findMany({
    where: {
      status: 'pending_payment',
      payStatus: 'unpaid',
      createdAt: { lte: cutoff },
      deletedAt: null,
    },
  });

  for (const order of orders) {
    await this.prisma.$transaction(async (tx) => {
      await this.releaseOrderResources(tx, order, 'order_timeout_release', '超时关闭订单释放库存');
      await tx.ecOrder.update({
        where: { id: order.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
    });
  }

  return { affected: orders.length };
}
```

```ts
async expireCoupons() {
  const result = await this.prisma.mkCoupon.updateMany({
    where: {
      status: 'available',
      expiredAt: { lte: new Date() },
      deletedAt: null,
    },
    data: { status: 'expired' },
  });
  return { affected: result.count };
}
```

`RedisService.acquireLock()` 在真实 Redis 模式下使用 `SET key value NX PX ttl`：

```ts
async acquireLock(key: string, owner?: string, ttlSeconds = 30) {
  const normalizedKey = this.normalizeKey(key);
  const nextOwner = owner || randomUUID();

  if (this.canUseRedis()) {
    const redisKey = this.lockRedisKey(normalizedKey);
    const result = await this.client!.set(redisKey, nextOwner, {
      NX: true,
      PX: ttlSeconds * 1000,
    });

    if (result === 'OK') {
      return {
        locked: true,
        key: normalizedKey,
        owner: nextOwner,
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      };
    }

    return {
      locked: false,
      key: normalizedKey,
      owner: await this.client!.get(redisKey) || '',
      expiresAt: null,
    };
  }

  // 本地开发没有 Redis 时，用内存锁兜底。
}
```

为什么锁要有 TTL：

- 任务执行中服务崩溃时，锁能自动过期。
- 防止某个任务失败后永久阻塞后续执行。
- TTL 通常按任务间隔设置，当前项目用 `Math.ceil(job.intervalMs / 1000)`。

为什么释放锁还要传 owner：

- 只有持有者才能释放自己的锁。
- 避免 A 任务超时后锁过期，B 抢到新锁，A 的 finally 又误删 B 的锁。
- 当前项目用固定 owner `scheduler`，已经能满足单类调度任务互斥；如果以后要更严格，可以给每次执行生成唯一 owner。

任务结果仍然记录到 MySQL 的 `sys_async_task`：

```ts
private async recordTask(job: SchedulerJob, status: string, result: unknown) {
  const tenantId = await this.getDefaultTenantId();
  await this.prisma.sysAsyncTask.create({
    data: {
      tenantId,
      taskNo: `JOB${Date.now()}${job.id.replace(/-/g, '').slice(0, 12)}`,
      type: `scheduler_${job.id}`,
      status,
      progress: status === 'succeeded' ? 100 : 0,
      resultJson: this.toNullableJson(result),
      errorMessage: status === 'failed'
        ? String((result as { error?: string })?.error || '')
        : null,
      startedAt: job.lastRunAt || new Date(),
      finishedAt: new Date(),
    },
  });
}
```

所以这里的分工是：

| 能力 | 存在哪里 | 用途 |
| --- | --- | --- |
| 是否正在执行 | Redis lock | 防重复执行 |
| 执行结果和历史 | MySQL `sys_async_task` | 后台可查、可追溯 |
| 当前进程内状态 | `SchedulerService.jobs` | 展示 lastRunAt、nextRunAt、running |

### 调用顺序

查看任务：

```text
GET /api/admin/v1/scheduler/jobs
```

手动执行超时关单：

```text
POST /api/admin/v1/scheduler/jobs/close-unpaid-orders/run
```

手动执行全部任务：

```text
POST /api/admin/v1/scheduler/run-all
```

为什么仍然需要手动执行接口：

- 本地调试不用等定时器。
- 运维排查时可以单独重跑某个任务。
- 自动 tick 和手动触发都走 `runJob()`，所以锁、错误处理、任务台账逻辑一致。
