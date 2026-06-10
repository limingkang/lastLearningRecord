# 项目作品集和求职准备

最后阶段的重点是把学习成果包装成能投递的作品。转行不是靠“我学过”，而是靠“我做过、能演示、能讲清楚”。

## 学习目标

- 准备 3 个高质量项目
- 写出能打动面试官的 README
- 准备在线 Demo 和演示视频
- 梳理简历关键词
- 准备 AI Agent 面试题
- 准备 NestJS + FastAPI 服务端架构说明

## 必备项目一：RAG 知识库助手

项目亮点：

- Vue 3 前端
- NestJS 主后端
- FastAPI RAG 服务
- 文档上传
- 文档切分
- Embedding
- 向量检索
- 回答引用来源
- 无答案兜底
- Vue 流式聊天界面
- RAG 测试集和评估记录

简历写法：

> 基于 Vue、NestJS、FastAPI、PostgreSQL 和 pgvector 实现企业知识库问答系统，支持文档上传、向量检索、流式回答和引用来源展示，并通过 prompt 约束、引用校验和测试集评估降低模型幻觉。

## 必备项目二：业务 Agent

推荐方向：

- 电商选品 Agent
- 简历优化 Agent
- 客服质检 Agent
- 合同审查 Agent
- 个人效率 Agent

项目亮点：

- NestJS 保存业务任务和执行状态
- Agent 服务负责任务拆解和工具调用
- 多步骤任务
- 工具调用
- 结构化输出
- 任务状态保存
- 人工确认
- 报告生成
- traceId 追踪完整执行链路

## 必备项目三：MCP 工具 Agent

项目亮点：

- Node.js + TypeScript MCP Server
- 自定义工具
- 本地数据查询
- 工具权限控制
- 调用日志
- Agent 客户端接入

这个项目能体现你不仅会调模型，还理解 Agent 工具生态。

## README 必须包含

- 项目介绍
- 在线 Demo
- 技术栈
- 架构图
- 服务端分工说明
- 核心功能
- 本地启动方式
- 环境变量说明
- 关键实现说明
- 评估方式
- 安全边界
- 截图
- 后续优化计划

## 简历关键词

可以使用：

- Vue 3
- TypeScript
- Node.js
- NestJS
- FastAPI
- Express
- LLM
- AI Agent
- RAG
- Embedding
- Vector Database
- pgvector
- Function Calling
- Tool Calling
- MCP
- Prompt Engineering
- Streaming Response
- Docker
- Redis
- BullMQ
- CI/CD
- Observability

## 面试准备

必须能讲清楚：

- 项目为什么这么设计
- RAG 的完整链路
- Agent 工具调用流程
- 如何降低幻觉
- 如何控制 token 成本
- 如何处理接口失败
- 如何做流式输出
- 如何保护 API Key
- 如何部署项目
- 项目还有哪些可优化点
- 为什么主后端用 NestJS，AI 服务用 FastAPI
- 如何做 Agent / RAG 评估
- 如何通过 traceId 排查问题

## 投递方向

优先搜索这些岗位关键词：

- AI Agent 开发
- LLM 应用开发
- AIGC 应用开发
- RAG 知识库开发
- AI 前端工程师
- AI 产品工程师
- Node.js AI 应用开发
- Vue AI 应用开发

## 最终验收

在开始投简历前，至少完成：

- 3 个 GitHub 项目
- 2 个在线 Demo
- 1 个 3 分钟项目演示视频
- 1 份针对 AI Agent 岗位优化过的简历
- 1 份常见面试题回答文档
- 1 份系统架构图
- 1 份 RAG 或 Agent 评估记录

## 求职判断线

如果只会写聊天页面，还不够。

达到下面程度，再开始大规模投递更稳：

- 能现场讲清楚 Vue、NestJS、FastAPI、数据库、向量库之间的数据流
- 能演示一个文档从上传到检索回答的完整链路
- 能演示一个 Agent 从接收目标到调用工具再到输出报告的完整链路
- 能展示失败处理，比如无答案拒答、工具调用失败、接口超时、人工确认
- 能说明成本控制、安全边界和线上部署方案

不要等全部学完才开始展示。每完成一个阶段，就把代码和笔记放到 GitHub，这会让你的转行过程本身变成可信证据。
