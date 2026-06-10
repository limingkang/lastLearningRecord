# ai agent大纲

主线是 **Node.js + TypeScript + Vue + LLM 应用开发**。完成这套学习后，应该能独立做出可演示、可部署的AI Agent 项目。即你能完成下面 3 件事，就已经具备AI Agent / LLM 应用开发的基本能力：

- 能用 Vue + NestJS 独立做出一个完整 AI 产品
- 能用 RAG、Tool Calling、MCP 做出 3 个可演示项目
- 能讲清楚工程化问题：安全、评估、观测、部署、成本和失败兜底

## 技术主线

- 前端：Vue 3、Vite、TypeScript、组件化、状态管理、流式输出 UI
- 主后端：Node.js、TypeScript、NestJS、REST API、鉴权、日志、任务队列
- AI 服务：FastAPI、Python、Embedding、RAG、模型评估、异步任务
- AI：LLM API、Prompt、结构化输出、Function Calling、Tool Calling
- 知识库：Embedding、向量数据库、RAG、文档解析、答案引用
- Agent：任务拆解、工具调用、记忆、工作流、多 Agent 协作
- 工程化：Docker、部署、监控、成本统计、测试、CI/CD

## 服务端路线

服务端建议按这个分工学习：

- NestJS：作为主业务后端，负责用户、会话、文件、权限、订单、任务、日志和对外 API
- Node.js：作为 TypeScript 运行环境，也可以写 MCP Server、脚本工具和模型适配层
- FastAPI：作为 Python AI 微服务，负责文档解析、Embedding、RAG 检索、模型评估、复杂 Agent 实验

真实项目可以这样拆：

```text
Vue 前端
  ↓
NestJS 主后端
  ├─ 用户 / 权限 / 会话 / 文件 / 任务
  ├─ LLM API 适配层
  ├─ Agent 工作流编排
  └─ 调用 FastAPI AI 服务
        ├─ 文档解析
        ├─ Embedding
        ├─ 向量检索
        ├─ RAG 评估
        └─ Python Agent 实验
```

## 阶段路线

### 1. AI Agent 和 LLM 基础

先理解大模型应用、Agent、RAG、工具调用、工作流分别解决什么问题。你要能说清楚“聊天机器人”和“Agent”的区别。

### 2. Node.js / NestJS / FastAPI 服务端工程基础

前端转 Agent 开发，后端能力是核心补强项。你需要能用 NestJS 写主业务接口、接数据库、设计服务层，并用 FastAPI 补齐 Python AI 生态能力。

### 3. 大模型 API 和 Prompt 工程

学习如何调用 OpenAI、Claude、通义千问、DeepSeek 等模型，掌握 prompt、结构化 JSON 输出、流式响应、错误重试和成本控制。

### 4. RAG 知识库开发

企业最常见的 AI 落地方式就是知识库问答。你要掌握文档上传、切分、Embedding、向量检索、回答生成、来源引用和幻觉控制。

### 5. Agent 工具调用和工作流

让 AI 不只是回答问题，而是能调用工具、查询数据库、执行任务、生成报告。重点学习工具设计、任务编排、状态管理和失败恢复。

### 6. MCP 和外部工具生态

学习 MCP 的基本思想，把本地文件、数据库、业务 API 暴露给 Agent 调用。这个能力很适合写进简历，能体现你理解 Agent 工具生态。

### 7. Vue 前端和 AI 产品化

把 AI 能力做成真正可用的产品界面：聊天界面、流式输出、文件上传、引用展示、任务进度、历史记录、反馈按钮和错误状态。

### 8. 项目作品集和求职准备

最终准备 3 个项目：RAG 知识库、业务 Agent、MCP 工具 Agent。每个项目都要有 GitHub、在线 Demo、README、架构图和演示视频。

### 9. 工程化、评估和安全

把 Demo 打磨成能被企业接受的项目。重点补齐 Agent 评估、RAG 质量评估、trace 观测、日志、权限、限流、成本统计、部署和 CI/CD。

## 最终要提交的作品

### 项目一：个人知识库 RAG 助手

支持上传 Markdown、PDF、TXT，自动建立向量索引，用户提问时返回答案和引用来源。推荐架构是 Vue + NestJS + FastAPI + PostgreSQL + pgvector。

### 项目二：电商选品 Agent

输入商品链接或商品信息，Agent 自动分析价格、利润、竞品、卖点、标题和上架建议。NestJS 负责业务任务和数据保存，Agent 服务负责工具调用和报告生成。

### 项目三：MCP 本地效率助手

Agent 通过 MCP 查询本地笔记、创建待办、生成日报、读取 SQLite 数据，并输出结构化结果。这个项目可以用 Node.js + TypeScript 写 MCP Server。
