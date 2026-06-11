# AI Agent 转行学习路线

主线是 **Node.js + TypeScript + Vue + LLM 应用开发**。目标不是只会调模型 API，而是能独立做出可演示、可部署、可解释、可评估的 AI Agent 产品。

完成这条路线后，应该具备下面 4 类能力：

- 能用 Vue + NestJS + FastAPI 做出一个完整 AI 产品
- 能独立完成 RAG、Tool Calling、MCP 三类可演示项目
- 能讲清楚工程化问题：安全、评估、观测、部署、成本和失败兜底

## 技术主线

- 前端：Vue 3、Vite、TypeScript、组件化、状态管理、流式输出 UI、文件上传、任务进度
- 主后端：Node.js、TypeScript、NestJS、REST API、鉴权、日志、任务队列、数据库设计
- 数据层：PostgreSQL、Prisma 或 TypeORM、Redis、pgvector、数据库迁移、文件存储
- AI 服务：FastAPI、Python、Embedding、RAG、模型评估、异步任务、文档解析
- LLM 应用：模型 API、Prompt、结构化输出、JSON Schema、流式响应、重试、超时、降级
- 知识库：文档解析、切分、Embedding、向量检索、关键词检索、Rerank、答案引用
- Agent：工具调用、任务编排、状态管理、人工确认、失败恢复、工作流持久化
- MCP：Tools、Resources、Prompts、本地 MCP Server、权限边界、外部系统连接
- 工程化：Docker、部署、监控、Trace、成本统计、测试、CI/CD、安全防护

## 服务端分工

服务端建议按这个边界学习和实现：

- NestJS：主业务后端，负责用户、会话、文件、权限、任务、日志、成本统计和对外 API
- Node.js：TypeScript 运行环境，也用于 MCP Server、脚本工具、模型适配层和 Agent 编排
- FastAPI：Python AI 微服务，负责文档解析、Embedding、RAG 检索、模型评估和复杂 Agent 实验

真实项目可以这样拆：

```text
Vue 前端
  ↓
NestJS 主后端
  ├─ 用户 / 权限 / 会话 / 文件 / 任务
  ├─ PostgreSQL / Redis / 文件存储
  ├─ LLM API 适配层
  ├─ Agent 工作流编排
  ├─ 日志 / Trace / 成本统计 / 限流
  └─ 调用 FastAPI AI 服务
        ├─ 文档解析
        ├─ Embedding
        ├─ 向量检索
        ├─ RAG 评估
        └─ Python Agent 实验
```

## 阶段路线

### 1. LLM、RAG、Agent 基础概念

先理解大模型应用、Agent、RAG、工具调用、工作流分别解决什么问题。你要能说清楚“聊天机器人”和“Agent”的区别，也要知道什么时候不需要 Agent。

### 2. Node.js / NestJS / FastAPI 服务端基础

前端转 Agent 开发，后端能力是核心补强项。你需要能用 NestJS 写主业务接口、接数据库、设计服务层，并用 FastAPI 补齐 Python AI 生态能力。重点学习：

- NestJS 模块、Controller、Service、DTO、Pipe、Guard、Interceptor
- PostgreSQL、Prisma 或 TypeORM、数据库迁移、基础表设计
- Redis、BullMQ 或同类队列，处理文档解析、Embedding、报告生成等异步任务
- 文件上传、文件存储、任务状态、错误状态、日志记录
- FastAPI 基础接口、Pydantic、后台任务、和 NestJS 的服务间调用

### 3. LLM 应用工程

这一阶段不要只学 prompt，要学如何把模型调用做成稳定服务。重点学习：

- OpenAI、Claude、通义千问、DeepSeek 等模型 API 的共性和差异
- 模型适配层设计，避免业务代码直接绑定某一个模型厂商
- 结构化输出：JSON Schema、Zod、Pydantic 校验
- 流式响应：SSE、WebSocket、前端逐字展示
- retry、timeout、fallback、错误分类、成本统计
- prompt 版本管理、少量测试集、输出质量回归检查

阶段验收：

- 做出一个统一的 LLM Provider 接口
- 支持普通回答、结构化 JSON 输出、流式输出
- 记录每次调用的模型、token、耗时、费用估算和错误信息

### 4. Vue AI 产品界面

把 AI 能力做成真正可用的产品界面，而不是只有接口。重点学习：

- 聊天界面、流式输出、停止生成、重新生成
- 文件上传、上传进度、任务进度、失败重试
- 引用来源展示、历史记录、反馈按钮
- 空状态、加载状态、错误状态、权限不足状态
- 简洁的管理页：会话、文件、任务、调用日志

### 5. RAG 知识库 MVP

企业最常见的 AI 落地方式是知识库问答。先完成最小闭环，再优化质量。重点学习：

- Markdown、PDF、TXT 上传和解析
- 文档切分：按标题、段落、长度、重叠窗口
- Embedding 生成和入库
- pgvector 或其他向量数据库
- 检索相关片段，拼接上下文，生成回答
- 引用来源：文件名、页码、段落、原文片段

阶段验收：

- 用户上传文档后能自动建立索引
- 用户提问时能返回答案和引用来源
- 后台能看到文档、chunk、embedding 任务和问答日志

### 6. RAG 质量优化和评估

RAG 的难点不在“能跑”，而在“答得准、能解释、可评估”。重点学习：

- chunk 策略对召回质量的影响
- metadata：文件名、页码、权限、时间、业务分类
- hybrid search：关键词检索 + 向量检索
- rerank、query rewrite、多路召回
- 幻觉控制：不知道就说不知道、必须引用来源、答案忠实度检查
- RAG 评估：检索命中率、答案准确率、引用正确率、拒答正确率

阶段验收：

- 准备 20-50 条测试问题和标准答案
- 对比不同 chunk 大小、topK、rerank 策略的效果
- 输出一份 RAG 评估报告，说明当前效果和问题

### 7. Agent 工具调用和可靠工作流

让 AI 不只是回答问题，而是能调用工具、查询数据库、执行任务、生成报告。重点不是“多 Agent”，而是可靠完成一条业务流程。重点学习：

- tool schema 设计：工具名称、参数、返回值、错误码
- 工具权限：哪些工具能自动调用，哪些必须人工确认
- planner-executor、router、evaluator 等常见模式
- 状态管理：任务状态、步骤状态、中间结果、失败原因
- 幂等、重试、回滚、超时、失败恢复
- human-in-the-loop：关键操作前让用户确认

阶段验收：

- 做出一个可以连续调用 3 个以上工具的 Agent
- 每一步工具调用都有日志、输入、输出和错误记录
- 高风险工具调用前必须出现用户确认

### 8. MCP 和外部工具生态

学习 MCP 的基本思想，把本地文件、数据库、业务 API 暴露给 Agent 调用。这个能力适合写进简历，也能体现你理解 Agent 工具生态。重点学习：

- MCP Tools、Resources、Prompts 的区别
- 本地 MCP Server 和远程 MCP Server
- 用 Node.js + TypeScript 写 MCP Server
- 暴露 SQLite、Markdown 笔记、本地文件、业务 API
- 权限边界：限制目录、限制 SQL、限制危险操作
- secret 保护、访问授权、prompt injection 和 tool poisoning 风险

阶段验收：

- 写出一个本地 MCP Server
- Agent 能读取本地笔记、查询 SQLite、创建待办
- README 里写清楚工具权限、安全边界和示例调用

### 9. 部署、观测、评估、安全和作品集

最后把 Demo 打磨成能被企业接受的项目。重点学习：

- Docker Compose 部署 Vue、NestJS、FastAPI、PostgreSQL、Redis
- 环境变量、密钥管理、日志脱敏
- OpenTelemetry 或同类 trace 观测
- 调用日志、工具调用日志、任务日志、成本报表
- 单元测试、接口测试、RAG eval、Agent eval
- 鉴权、权限、限流、文件访问控制、输入校验
- CI/CD、README、架构图、演示视频

阶段验收：

- 三个作品至少一个有在线 Demo
- 每个作品都有清晰 README、架构图、启动方式和演示截图
- 每个作品都有测试说明、评估说明、安全说明和已知问题

## 最终作品集

### 项目一：个人知识库 RAG 助手

支持上传 Markdown、PDF、TXT，自动建立向量索引，用户提问时返回答案和引用来源。推荐架构是 Vue + NestJS + FastAPI + PostgreSQL + pgvector。

必须包含：

- 文档上传、解析、切分、Embedding、索引入库
- 问答、引用来源、历史会话
- RAG 评估集和评估报告
- 调用日志、任务日志、成本统计
- Docker Compose 一键启动

加分项：

- hybrid search + rerank
- 文档权限控制
- 答案反馈按钮和 bad case 收集

### 项目二：电商选品 Agent

输入商品链接或商品信息，Agent 自动分析价格、利润、竞品、卖点、标题和上架建议。NestJS 负责业务任务和数据保存，Agent 服务负责工具调用和报告生成。

建议先用模拟数据、公开数据或手工商品数据集，不要把重点放在不稳定爬虫上。

必须包含：

- 商品信息录入或导入
- 利润计算、竞品对比、卖点提炼、标题生成
- 多步骤 Agent 工作流
- 工具调用日志和报告生成记录
- 高风险操作前的人工确认

加分项：

- 报告导出为 Markdown / PDF
- 商品评分规则可配置
- 失败重试和任务恢复

### 项目三：MCP 本地效率助手

Agent 通过 MCP 查询本地笔记、创建待办、生成日报、读取 SQLite 数据，并输出结构化结果。这个项目可以用 Node.js + TypeScript 写 MCP Server。

必须包含：

- 一个可运行的 MCP Server
- 至少 3 个 MCP Tools
- 至少 1 个 MCP Resource
- SQLite 查询或本地 Markdown 笔记查询
- 工具权限、安全边界和示例调用说明

加分项：

- 只读模式和确认模式
- 工具调用审计日志
- 和桌面客户端或聊天界面集成

## 每个项目的标准

每个作品都尽量满足下面标准：

- GitHub 仓库结构清晰
- README 包含背景、功能、架构图、启动方式、演示截图、已知问题
- 有在线 Demo 或本地一键启动方式
- 有 3-5 分钟演示视频
- 有基础测试：接口测试、核心函数测试或 eval 测试
- 有日志或 trace，可以看到模型调用、工具调用、任务状态
- 有成本统计或 token 统计
- 有安全说明：鉴权、权限、限流、文件访问、敏感信息保护
