# AI Agent 和 LLM 基础

这个阶段的目标是建立正确的认知框架。你不需要一开始研究模型训练，但必须理解 LLM 应用、RAG、Agent、工具调用和工作流之间的关系。

## 学习目标

- 理解 AI Agent 的基本组成
- 理解 LLM 应用和传统前端应用的区别
- 能说清楚 RAG、Agent、Workflow、Tool Calling 的适用场景
- 建立后续项目开发的技术地图

## 大模型基础

重点学习：

- Token 是什么
- 上下文窗口是什么
- System Prompt、User Prompt、Assistant Message 的区别
- Temperature、Top P 等参数的作用
- 为什么模型会幻觉
- 为什么模型输出需要约束和校验

前端开发者可以这样理解：LLM 不是普通接口，它的返回结果不是完全确定的，所以你需要用 prompt、schema、重试、校验和兜底逻辑来提高稳定性。

## AI Agent 基础

Agent 可以理解为一个会使用工具完成目标的 AI 程序。

核心组成：

- LLM：负责理解、推理和生成
- Tools：负责查询、计算、写入、调用外部系统
- Memory：保存上下文和历史信息
- Planning：拆解任务步骤
- Executor：执行工具调用和流程推进
- Guardrails：限制危险输入和不合规输出

## Agent 和聊天机器人的区别

聊天机器人主要回答问题。Agent 不只回答，还会根据目标主动规划步骤、调用工具、检查结果，并输出最终交付物。

例子：

- 聊天机器人：告诉你如何写日报
- Agent：读取今天的任务记录，整理完成事项，生成日报，并保存到文档

## RAG 基础

RAG 是 Retrieval-Augmented Generation，也就是检索增强生成。

你需要理解：

- 为什么要先检索再回答
- 文档为什么要切分
- Embedding 如何把文本变成向量
- 向量检索如何找到相似内容
- 回答为什么要带引用来源
- 文档没有答案时为什么不能让模型硬编

## Workflow 基础

Workflow 更像明确的业务流程，适合步骤固定、规则清楚的场景。

例如：

1. 上传合同
2. 提取关键信息
3. 检查风险条款
4. 输出风险报告
5. 等待人工确认

Agent 适合开放目标，Workflow 适合稳定流程。实际工作中经常把两者结合起来。

## 推荐实践

做一个最小聊天 Demo：

- Vue 页面输入问题
- Node.js 后端调用模型
- 前端展示回答
- 支持 loading 和错误提示

## 面试要能回答

- AI Agent 是什么
- Agent 和普通 Chatbot 有什么区别
- RAG 解决什么问题
- 为什么大模型会幻觉
- 为什么需要工具调用
- Workflow 和 Agent 怎么选择

