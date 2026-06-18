前面项目已经有了三张关键表：

```text
sys_async_task    记录用户能看到的任务状态
mq_outbox         记录待发布的领域事件
mq_consume_log    记录消费者幂等消费结果
```
但是只建表还不够。真正要解决高并发慢请求问题，必须让业务入口写这些表，并且有后台机制把事件发布和消费掉。大概流程如下
``` text
业务系统写订单
  ↓
把“订单创建成功”这条消息写入 mq_outbox
  ↓
schedule定时扫描后台把 mq_outbox 里的消息发到 MQ
  ↓
库存/积分/通知服务收到消息
  ↓
这些服务 consume 消息
  ↓
处理前后记录 mq_consume_log，防止重复处理
```

## 原来的问题

项目里最容易出问题的链路有两类。

第一类是大数据量操作：

```text
导出商品、订单、库存、会员、支付数据
导入商品、库存、会员、发货数据
生成导入模板
```

这些操作会读很多数据、生成文件、写文件、批量写库。如果都在 HTTP 请求里同步做，请求会变慢，前端容易超时，并发高时还会把 Node 进程和数据库连接都占住。

第二类是外部接口调用：

```text
微信订阅消息发送
后续可能还有短信、邮件、物流推送、图片处理
```

外部接口不可控，可能慢、失败、限流。如果在业务请求里直接调用，用户下单、后台操作都会被外部服务拖慢。

## 优化后的分工

现在项目按这个流程走：

```text
HTTP 请求
  -> 校验参数
  -> 写业务记录 / sys_async_task
  -> 同事务写 mq_outbox
  -> 立即返回

Scheduler 定时任务
  -> 扫描 pending outbox
  -> 发布 MQ
  -> local 模式下直接本地消费
  -> rabbitmq 模式下交给 RabbitMQ consumer 消费

Consumer
  -> 先写 mq_consume_log，保证幂等
  -> 根据 eventType 调用真实业务 handler
  -> 成功标 succeeded
  -> 失败写 lastError，等待重试或进入死信
```

这里最重要的一点是：业务数据和 outbox 事件必须在同一个 MySQL 事务里提交。这样不会出现“任务创建成功但消息没发出去”，也不会出现“消息发出去了但任务不存在”。

## 这次改了哪些地方

| 位置 | 作用 |
| --- | --- |
| `DataTransferService.createExport()` | 导出请求只创建 `pending` 任务和 outbox 事件 |
| `DataTransferService.createImport()` | 导入请求只创建 `pending` 任务和 outbox 事件 |
| `DataTransferService.createImportTemplate()` | 模板生成也改为任务化 |
| `DataTransferService.processQueuedTask()` | MQ 消费时执行真正的导入、导出、模板生成 |
| `NotifyService.createMessage()` | 微信订阅消息不再同步发送，只入队 |
| `NotifyService.sendPendingMessage()` | MQ 消费时真正发送微信订阅消息 |
| `MqService.dispatchDomainEvent()` | 按 eventType 分发到真实业务 handler |
| `MqService.publishOutboxEntity()` | local 模式发布后直接本地幂等消费 |
| `SchedulerService` | 新增 `mq-publish-pending` 定时任务，自动发布 pending outbox |

## 表的职责

### sys_async_task

给后台看的任务台账。

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

  @@unique([tenantId, taskNo], map: "uk_sys_async_task_tenant_no")
  @@index([tenantId, status, createdAt], map: "idx_sys_async_task_tenant_status_time")
  @@map("sys_async_task")
}
```

导入导出任务状态会经历：

```text
pending -> processing -> succeeded
pending -> processing -> failed
```

### mq_outbox

给 MQ publisher 看的事件表。

```prisma
model MqOutbox {
  id            BigInt    @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId      BigInt    @map("tenant_id") @db.UnsignedBigInt
  eventId       String    @map("event_id") @db.VarChar(64)
  eventType     String    @map("event_type") @db.VarChar(128)
  aggregateType String    @map("aggregate_type") @db.VarChar(64)
  aggregateId   String    @map("aggregate_id") @db.VarChar(64)
  payloadJson   Json?     @map("payload_json")
  status        String    @default("pending") @db.VarChar(32)
  retryCount    Int       @default(0) @map("retry_count")
  nextRetryAt   DateTime? @map("next_retry_at") @db.DateTime(3)
  publishedAt   DateTime? @map("published_at") @db.DateTime(3)
  lastError     String?   @map("last_error") @db.VarChar(500)

  @@unique([tenantId, eventId], map: "uk_mq_outbox_tenant_event")
  @@index([tenantId, status, nextRetryAt], map: "idx_mq_outbox_tenant_status_retry")
  @@map("mq_outbox")
}
```

关键字段：

```text
eventType     决定消费者调用哪个 handler
aggregateId   通常放任务 id 或消息 id
payloadJson   放 handler 需要的轻量参数
status        pending / published / dead
nextRetryAt   控制失败后什么时候重试
```

### mq_consume_log

给消费者做幂等。

```prisma
model MqConsumeLog {
  id           BigInt @id @default(autoincrement()) @db.UnsignedBigInt
  tenantId     BigInt @map("tenant_id") @db.UnsignedBigInt
  consumerName String @map("consumer_name") @db.VarChar(128)
  eventId      String @map("event_id") @db.VarChar(64)
  eventType    String @map("event_type") @db.VarChar(128)
  status       String @default("succeeded") @db.VarChar(32)
  retryCount   Int    @default(0) @map("retry_count")
  lastError    String? @map("last_error") @db.VarChar(500)

  @@unique([tenantId, consumerName, eventId], map: "uk_mq_consume_log_tenant_consumer_event")
  @@index([tenantId, status, updatedAt], map: "idx_mq_consume_log_tenant_status_time")
  @@map("mq_consume_log")
}
```

同一个消费者消费同一个 `eventId`，只能成功一次。

## 导出怎么异步化

现在 `POST /api/admin/v1/data-transfer/exports` 不再同步生成文件。

它只做三件事：

```text
1. 校验 resource、format、limit、retentionDays
2. 创建 sys_async_task，状态 pending
3. 同事务创建 mq_outbox 事件
```

核心代码：

```ts
async createExport(dto: DataExportRequestDto) {
  const tenantId = await this.getDefaultTenantId();
  const resource = this.normalizeResource(dto.resource, EXPORT_RESOURCES);
  const format = dto.format || 'csv';
  const limit = Math.min(Math.max(Number(dto.limit || 200), 1), 1000);
  const retentionDays = Math.min(
    Math.max(Number(dto.retentionDays || this.getDefaultRetentionDays()), 1),
    365,
  );
  const filters = this.normalizeRecord(dto.filters);
  const taskNo = await this.createTaskNo(tenantId, 'EXPORT');

  const task = await this.prisma.$transaction(async (tx) => {
    const created = await tx.sysAsyncTask.create({
      data: {
        tenantId,
        taskNo,
        type: 'data_export',
        status: 'pending',
        progress: 0,
        resultJson: this.toNullableJson({
          resource,
          format,
          limit,
          retentionDays,
          filters,
          queuedAt: new Date().toISOString(),
        }),
      },
    });

    await this.createOutboxEvent(tx, {
      tenantId,
      eventType: 'data_transfer.export.requested.v1',
      aggregateType: 'sys_async_task',
      aggregateId: created.id.toString(),
      payload: {
        taskId: created.id.toString(),
        type: created.type,
        resource,
      },
    });

    return created;
  });

  return {
    task: this.toTask(task),
    file: null,
  };
}
```

注意这里返回 `file: null` 是正常的。

文件还没有生成，前端应该拿 `task.id` 去查任务详情或任务列表。

## 导出 worker 怎么执行

MQ 消费到 `data_transfer.export.requested.v1` 后，会调用：

```ts
async processQueuedTask(taskId: string) {
  const task = await this.prisma.sysAsyncTask.findFirst({
    where: {
      id: this.parseBigInt(taskId, 'Task ID is invalid'),
      deletedAt: null,
      type: {
        in: DATA_TRANSFER_TASK_TYPES,
      },
    },
  });

  if (task.type === 'data_export') {
    return this.processExportTask(task);
  }
  if (task.type === 'data_import') {
    return this.processImportTask(task);
  }
  if (task.type === 'data_import_template') {
    return this.processImportTemplateTask(task);
  }
}
```

真正导出时再读数据、生成 CSV/JSON、写 `sys_file`、更新任务：

```ts
private async processExportTask(task: AsyncTaskEntity) {
  const input = this.jsonObject(task.resultJson);
  await this.markTaskRunning(task.id);

  try {
    const tenantId = task.tenantId;
    const resource = this.normalizeResource(String(input.resource || ''), EXPORT_RESOURCES);
    const rows = await this.loadExportRows(
      tenantId,
      resource,
      Number(input.limit || 200),
      this.normalizeRecord(input.filters),
    );

    const content = input.format === 'json'
      ? `${JSON.stringify(rows, null, 2)}\n`
      : this.toCsv(rows);

    const file = await this.prisma.sysFile.create({
      data: {
        tenantId,
        fileKey,
        originalName,
        mimeType,
        size: BigInt(buffer.length),
        storageProvider: this.getStorageProvider(),
        bucket: this.getStorageBucket(),
        objectKey,
        url: this.buildPublicObjectUrl(objectKey),
        status: 'uploaded',
        metadataJson: this.toNullableJson(metadata),
      },
    });

    await this.prisma.sysAsyncTask.update({
      where: { id: task.id },
      data: {
        status: 'succeeded',
        progress: 100,
        resultJson: this.toNullableJson({
          ...input,
          rowCount: rows.length,
          fileKey,
          originalName,
          objectKey,
          url: this.buildPublicObjectUrl(objectKey),
        }),
        finishedAt: new Date(),
      },
    });

    return file;
  } catch (error) {
    await this.markTaskFailed(task.id, task.resultJson, error);
    throw error;
  }
}
```

这里失败后要重新 `throw error`。

原因是：任务表标成 failed 只是给后台看，MQ 还要知道这次消费失败，从而让 outbox 进入重试。

## 导入怎么异步化

导入比导出更需要异步，因为它会写业务表。

现在导入入口只排队：

```ts
async createImport(dto: DataImportRequestDto) {
  const tenantId = await this.getDefaultTenantId();
  const resource = this.normalizeResource(dto.resource, IMPORT_RESOURCES);
  const mode = dto.mode || 'validate_only';
  const dryRun = dto.dryRun ?? mode === 'validate_only';
  const taskNo = await this.createTaskNo(tenantId, 'IMPORT');

  if (dto.fileId) {
    await this.getFileById(tenantId, dto.fileId);
  }

  const rows = Array.isArray(dto.rows)
    ? dto.rows.map((row) => this.normalizeRecord(row))
    : [];

  const task = await this.prisma.$transaction(async (tx) => {
    const created = await tx.sysAsyncTask.create({
      data: {
        tenantId,
        taskNo,
        type: 'data_import',
        status: 'pending',
        progress: 0,
        resultJson: this.toNullableJson({
          resource,
          mode,
          dryRun,
          fileId: dto.fileId || null,
          rows,
          queuedAt: new Date().toISOString(),
        }),
      },
    });

    await this.createOutboxEvent(tx, {
      tenantId,
      eventType: 'data_transfer.import.requested.v1',
      aggregateType: 'sys_async_task',
      aggregateId: created.id.toString(),
      payload: {
        taskId: created.id.toString(),
        type: created.type,
        resource,
      },
    });

    return created;
  });

  return this.toTask(task);
}
```

worker 执行导入时才读取文件、校验、写库：

```ts
private async processImportTask(task: AsyncTaskEntity) {
  const input = this.jsonObject(task.resultJson);
  await this.markTaskRunning(task.id);

  const fileId = this.optionalText(input.fileId);
  const sourceFile = fileId ? await this.getFileById(task.tenantId, fileId) : null;
  const inlineRows = Array.isArray(input.rows)
    ? input.rows.map((row) => this.normalizeRecord(row))
    : [];
  const rows = sourceFile ? await this.loadImportRowsFromFile(sourceFile) : inlineRows;

  const validation = this.validateImportRows(resource, rows);
  if (validation.errors.length === 0 && !dryRun) {
    applyResult = await this.applyImportRows(task.tenantId, resource, rows, mode);
  }

  await this.prisma.sysAsyncTask.update({
    where: { id: task.id },
    data: {
      status: validation.errors.length > 0 ? 'failed' : 'succeeded',
      progress: validation.errors.length > 0 ? 0 : 100,
      resultJson: this.toNullableJson({
        ...input,
        receivedRows: rows.length,
        acceptedRows: validation.acceptedRows,
        errors: validation.errors,
        insertedRows: applyResult?.insertedRows || 0,
        updatedRows: applyResult?.updatedRows || 0,
      }),
      finishedAt: new Date(),
    },
  });
}
```

导入有业务校验失败和技术失败两种。

```text
业务校验失败：字段缺失、格式不对，任务标 failed，并生成错误报告
技术失败：数据库异常、文件读取失败，任务标 failed，同时 MQ 事件抛错等待重试
```

## 微信订阅通知怎么异步化

原来创建微信订阅消息后，会马上调用微信接口：

```text
create notify_message
  -> sendWechatSubscribeMessage()
  -> HTTP 请求等待微信返回
```

现在改成：

```text
create notify_message(status=pending)
  -> create mq_outbox(eventType=notify.message.send.requested.v1)
  -> HTTP 立即返回
  -> MQ consumer 再调用 sendWechatSubscribeMessage()
```

核心代码：

```ts
async createMessage(dto: NotifyMessageMutationDto) {
  const tenantId = await this.getDefaultTenantId();
  const channel = dto.channel || 'station';

  const message = await this.prisma.$transaction(async (tx) => {
    const created = await tx.notifyMessage.create({
      data: {
        tenantId,
        receiverType: this.normalizeText(dto.receiverType),
        receiverId: dto.receiverId ? this.parseBigInt(dto.receiverId, '接收人ID格式错误') : null,
        channel,
        title: this.normalizeText(dto.title),
        content: this.normalizeText(dto.content),
        bizType: this.normalizeOptionalText(dto.bizType),
        bizId: dto.bizId ? this.parseBigInt(dto.bizId, '业务ID格式错误') : null,
        status: channel === 'wechat_subscribe' ? 'pending' : 'unread',
        sentAt: channel === 'wechat_subscribe' ? null : new Date(),
      },
    });

    if (channel === 'wechat_subscribe') {
      await this.createOutboxEvent(tx, {
        tenantId,
        message: created,
        reason: 'create',
      });
    }

    return created;
  });

  return this.toMessage(message);
}
```

outbox 事件：

```ts
private async createOutboxEvent(
  tx: TxClient,
  input: {
    tenantId: bigint;
    message: MessageEntity;
    reason: string;
  },
) {
  return tx.mqOutbox.create({
    data: {
      tenantId: input.tenantId,
      eventId: createBusinessNo('evt_', 8),
      eventType: 'notify.message.send.requested.v1',
      aggregateType: 'notify_message',
      aggregateId: input.message.id.toString(),
      payloadJson: this.toNullableJson({
        messageId: input.message.id.toString(),
        channel: input.message.channel,
        bizType: input.message.bizType,
        bizId: input.message.bizId?.toString() || null,
        reason: input.reason,
      }),
      status: 'pending',
    },
  });
}
```

MQ 消费时真正发送：

```ts
async sendPendingMessage(id: string) {
  const message = await this.prisma.notifyMessage.findFirst({
    where: {
      id: this.parseBigInt(id, '消息ID格式错误'),
      deletedAt: null,
    },
  });

  if (message.channel === 'wechat_subscribe') {
    return this.sendWechatSubscribeMessage(message);
  }

  return this.prisma.notifyMessage.update({
    where: { id: message.id },
    data: {
      sentAt: new Date(),
      status: message.status === 'read' ? 'read' : 'unread',
    },
  });
}
```

这样用户请求不会被微信接口卡住。

## MQ 怎么分发事件

`MqService.dispatchDomainEvent()` 是消费者的分发入口。

现在只处理项目里已经落地的两类事件：

```ts
private async dispatchDomainEvent(event: RabbitEvent) {
  if (event.payload && event.payload.forceConsumerFailure === true) {
    throw new BadRequestException('forced consumer failure');
  }

  if (event.eventType === 'notify.message.send.requested.v1') {
    const messageId = this.normalizeText(String(event.payload.messageId || event.aggregateId));
    await this.notifyService.sendPendingMessage(messageId);
    return;
  }

  if (
    event.eventType === 'data_transfer.export.requested.v1' ||
    event.eventType === 'data_transfer.import.requested.v1' ||
    event.eventType === 'data_transfer.import_template.requested.v1'
  ) {
    const taskId = this.normalizeText(String(event.payload.taskId || event.aggregateId));
    await this.dataTransferService.processQueuedTask(taskId);
  }
}
```

后续要加短信、邮件、图片压缩、搜索索引同步，就继续按 `eventType` 增加 handler。

## local 模式也要真正消费

项目默认可以不启动 RabbitMQ，用 `RABBITMQ_MODE=local` 先跑通流程。

local 模式不是只把 outbox 标成 published，而是发布后直接调用本地消费者：

```ts
private async publishOutboxEntity(outbox: OutboxEntity) {
  const topology = this.getTopology();
  const routingKey = this.resolveRoutingKey(outbox.eventType);

  if (topology.mode === 'rabbitmq') {
    await this.publishToRabbit(outbox, routingKey);
  }

  const published = await this.prisma.mqOutbox.update({
    where: { id: outbox.id },
    data: {
      status: 'published',
      publishedAt: new Date(),
      lastError: null,
      payloadJson: this.toNullableJson({
        ...this.toJsonObject(outbox.payloadJson),
        broker: {
          mode: topology.mode,
          exchange: topology.exchange.name,
          routingKey,
          publishedAt: new Date().toISOString(),
        },
      }),
    },
  });

  if (topology.mode !== 'rabbitmq') {
    await this.recordConsumedEvent({
      consumerName: 'local-inline-consumer',
      event: {
        eventId: published.eventId,
        eventType: published.eventType,
        aggregateType: published.aggregateType,
        aggregateId: published.aggregateId,
        tenantId: published.tenantId,
        payload: this.toJsonObject(published.payloadJson),
        createdAt: published.createdAt.toISOString(),
      },
    });
  }

  return published;
}
```

local 模式适合本地开发、教学、单机部署。RabbitMQ 模式适合多实例和更高吞吐。

## Scheduler 怎么自动发布 outbox

以前 outbox 需要手动调用：

```text
POST /api/admin/v1/mq/outbox/publish-pending
```

现在 scheduler 新增了一个系统任务：

```text
mq-publish-pending    每 1 分钟发布 pending outbox
```

核心代码：

```ts
type JobId =
  | 'close-unpaid-orders'
  | 'auto-confirm-receipts'
  | 'expire-coupons'
  | 'inventory-warning'
  | 'wechat-reconciliation'
  | 'report-summary'
  | 'mq-publish-pending';
```

执行分发：

```ts
private async executeJob(id: JobId) {
  switch (id) {
    case 'mq-publish-pending':
      return this.mqService.publishPending({
        limit: Number(this.configService.get<string>('SCHEDULER_MQ_PUBLISH_LIMIT') || 50),
      });
    default:
      return {};
  }
}
```

注册任务：

```ts
private registerJobs() {
  const defaults: Array<{ id: JobId; name: string; minutes: number }> = [
    { id: 'close-unpaid-orders', name: '超时关单', minutes: 1 },
    { id: 'auto-confirm-receipts', name: '自动确认收货', minutes: 10 },
    { id: 'expire-coupons', name: '优惠券过期', minutes: 10 },
    { id: 'inventory-warning', name: '库存预警汇总', minutes: 30 },
    { id: 'wechat-reconciliation', name: '微信对账生成', minutes: 60 },
    { id: 'report-summary', name: '报表汇总', minutes: 30 },
    { id: 'mq-publish-pending', name: 'MQ待发布事件', minutes: 1 },
  ];
}
```

因为 `SchedulerService.runJob()` 已经用 Redis 分布式锁，所以多进程部署时不会所有实例都同时发布同一批 outbox。

## RabbitMQ 模式怎么跑

本地开发可以继续用 local：

```env
RABBITMQ_MODE=local
SCHEDULER_ENABLED=true
```

如果要接真实 RabbitMQ：

```env
RABBITMQ_MODE=rabbitmq
RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_EXCHANGE=ecom.domain
RABBITMQ_QUEUE=ecom.domain.q
RABBITMQ_CONSUMER_ENABLED=true
RABBITMQ_CONSUMER_PREFETCH=10
RABBITMQ_MAX_RETRY_COUNT=3
RABBITMQ_RETRY_DELAY_MS=60000
SCHEDULER_MQ_PUBLISH_LIMIT=50
```

RabbitMQ 模式下：

```text
Scheduler 调用 publishPending
  -> MqService.publishToRabbit()
  -> RabbitMQ queue
  -> consumer consumeRabbitMessage()
  -> recordConsumedEvent()
  -> dispatchDomainEvent()
```

## 前端和后台怎么使用

### 导出

请求：

```text
POST /api/admin/v1/data-transfer/exports
```

返回的是 pending 任务：

```json
{
  "task": {
    "id": "101",
    "type": "data_export",
    "status": "pending",
    "progress": 0
  },
  "file": null
}
```

之后查任务：

```text
GET /api/admin/v1/data-transfer/tasks/101
```

任务成功后，`result.fileKey`、`result.objectKey`、`result.url` 才会出现。

### 导入

请求：

```text
POST /api/admin/v1/data-transfer/imports
```

返回 pending 任务。后台通过任务状态看结果：

```text
pending       等待 MQ 发布
processing    worker 正在执行
succeeded     导入完成
failed        校验失败或执行失败
```

### 微信订阅通知

创建消息后如果是 `wechat_subscribe`：

```text
notify_message.status = pending
mq_outbox.status = pending
```

MQ 消费成功后：

```text
notify_message.status = sent
mq_consume_log.status = succeeded
```

## 为什么这样能抗并发

请求线程变短了。

```text
原来：请求一直等导出、导入、微信接口
现在：请求只落库和写事件
```

慢任务可控了。

```text
Scheduler 每批只 publish 指定 limit
RabbitMQ consumer 可以配置 prefetch
失败事件按 nextRetryAt 延迟重试
```

重复消费可控了。

```text
mq_consume_log 使用 tenantId + consumerName + eventId 唯一键
同一个事件重复投递时，成功记录会让后续消费直接跳过
```

排查更容易了。

```text
sys_async_task 看用户任务状态
mq_outbox 看事件发布状态
mq_consume_log 看消费者是否成功、失败原因、重试次数
```

## 后续还能继续异步化的地方

现在已经落地的是导入导出和微信订阅通知。

后续高并发下还可以继续把这些事情改为 MQ：

```text
商品修改后同步搜索索引
支付成功后的多渠道通知
售后退款后的财务入账和通知
图片上传后的压缩、缩略图、水印
报表汇总从实时计算改成异步预聚合
库存预警从定时查询改成库存变动事件驱动
```

判断一个逻辑该不该异步，可以用三个标准：

```text
用户不需要立刻拿到最终结果
操作耗时不可控或依赖外部系统
失败后可以重试，并且有明确的状态可查
```

符合这三条，就优先考虑 `sys_async_task + mq_outbox + mq_consume_log`。
