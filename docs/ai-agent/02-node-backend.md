# Node.js / NestJS / FastAPI 服务端工程基础

你已经有 Node 和 Vue 基础，转 AI Agent 开发时，最大的补强点是服务端工程能力。AI 能力最终要通过后端封装成稳定服务，而不是把 API Key 暴露在前端。

这一阶段建议按 **NestJS 主后端 + FastAPI AI 微服务** 的方式学习。NestJS 负责业务系统，FastAPI 负责更贴近 Python AI 生态的能力。

## 学习目标

- 能用 TypeScript 写 NestJS 后端服务
- 能设计清晰的 API 接口
- 能连接数据库并保存用户会话
- 能封装大模型调用服务
- 能用 FastAPI 封装 RAG、Embedding 和评估服务
- 能处理日志、异常、配置和鉴权

## TypeScript 工程化

重点学习：

- tsconfig 配置
- 类型声明和接口设计
- async/await 错误处理
- 环境变量管理
- ESLint 和 Prettier
- pnpm 或 npm scripts

AI 应用里会有大量结构化数据，TypeScript 类型能明显减少联调成本。

## 服务端框架选择

建议路线：

- 主线：NestJS
- 补充：FastAPI
- 快速 Demo：Express

Express 简单灵活，适合早期 Demo。NestJS 更工程化，适合写进简历，也更接近企业项目结构。FastAPI 不是替代 NestJS，而是补齐 Python AI 生态，比如文档解析、Embedding、RAG 评估和部分 Agent 实验。

## NestJS 主后端

NestJS 建议重点掌握：

- Module
- Controller
- Provider
- Service
- Dependency Injection
- Pipe 参数校验
- Guard 鉴权
- Interceptor 日志和响应处理
- Exception Filter 异常处理
- ConfigModule 配置管理
- Swagger 接口文档

推荐模块拆分：

```text
src/
  modules/
    auth/
    users/
    chat/
    files/
    knowledge-base/
    agents/
    tools/
    billing/
  common/
    guards/
    pipes/
    filters/
    interceptors/
  infrastructure/
    database/
    llm/
    queue/
```

## FastAPI AI 微服务

FastAPI 建议重点掌握：

- 路由和 Pydantic 模型
- async 接口
- 文件上传
- 后台任务
- 请求参数校验
- OpenAPI 文档
- 与 NestJS 的 HTTP 调用

适合放到 FastAPI 的能力：

- PDF / Word 文档解析
- 文本切分
- Embedding 生成
- 向量检索
- RAG 质量评估
- Python Agent 框架实验
- 复杂数据处理脚本

## NestJS 和 FastAPI 如何协作

推荐架构：

```text
Vue
  ↓
NestJS API Gateway / BFF
  ├─ PostgreSQL / Redis
  ├─ LLM Provider Adapter
  ├─ Agent Task Service
  └─ FastAPI AI Service
        ├─ Document Parser
        ├─ Embedding Service
        ├─ Retrieval Service
        └─ Evaluation Service
```

原则：

- 用户、权限、会话、文件记录放 NestJS
- AI 计算、RAG 检索、评估任务可以放 FastAPI
- 两边都要有统一 trace id，方便排查问题
- 不要让前端直接调用模型供应商 API

## API 设计

需要掌握：

- REST API 基础
- 请求参数校验
- 统一响应格式
- 统一错误处理
- 接口鉴权
- 文件上传接口
- 流式响应接口
- 异步任务接口
- Webhook 接口

AI 应用常见接口：

- `POST /api/chat`
- `POST /api/files/upload`
- `POST /api/knowledge-base/index`
- `POST /api/agent/run`
- `GET /api/agent/tasks/:id`
- `GET /api/sessions`
- `GET /api/messages`

## 数据库基础

优先学习 PostgreSQL，也可以先用 SQLite 做本地 Demo。

需要掌握：

- 用户表
- 会话表
- 消息表
- 文件表
- 工具调用记录表
- Agent 任务运行表

推荐 ORM：

- Prisma
- Drizzle

## 队列和异步任务

AI 应用里很多任务不能同步等待。

需要学习：

- Redis
- BullMQ
- 任务重试
- 任务超时
- 任务进度
- 失败原因记录

适合异步执行的任务：

- 文档解析
- 向量入库
- 长报告生成
- 批量质检
- 多步骤 Agent 执行

## 后端分层

Node / NestJS 建议结构：

```text
src/
  controllers/
  services/
  repositories/
  llm/
  agents/
  tools/
  config/
  middlewares/
```

核心原则：Controller 只处理请求和响应，AI 调用、Agent 编排、数据库操作都放到独立服务里。

## 流式响应

AI 产品体验很依赖流式输出。

需要学习：

- Server-Sent Events
- fetch 流读取
- Node.js Stream
- 前端逐字渲染
- 中断生成
- 超时处理

## 推荐实践

做一个 AI 服务端骨架：

- TypeScript
- NestJS
- `.env` 配置模型 API Key
- `/api/chat` 接口
- `/api/chat/stream` 流式接口
- PostgreSQL 保存消息记录
- Redis + BullMQ 执行文档索引任务
- FastAPI 提供 `/embed` 和 `/retrieve` 接口

## 面试要能回答

- 为什么 API Key 不能放前端
- AI 应用为什么需要流式响应
- 如何设计聊天记录表
- 如何处理模型接口超时
- Express、NestJS 和 FastAPI 的分工是什么
- 如何统计每次调用的 token 成本
- 为什么文档索引要用异步任务
- NestJS 里 Guard、Pipe、Interceptor 分别解决什么问题
