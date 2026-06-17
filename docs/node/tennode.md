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

核心表可以这样理解：

```ts
type SysFile = {
  id: string;
  tenantId: string;
  fileKey: string;
  originalName: string;
  mimeType: string;
  extension: string | null;
  size: string;
  storageProvider: 'local' | 's3';
  bucket: string | null;
  objectKey: string;
  url: string;
  thumbnailUrl: string | null;
  status: 'uploaded' | 'deleted' | 'expired';
  metadataJson: Record<string, unknown> | null;
  createdAt: string;
};
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

```ts
type SysAsyncTask = {
  id: string;
  tenantId: string;
  taskNo: string;
  type: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  progress: number;
  resultJson: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};
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
