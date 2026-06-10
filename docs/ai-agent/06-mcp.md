# MCP 和外部工具生态

MCP 是 Model Context Protocol。它的作用是让 AI 应用用统一方式连接外部工具和数据源。对 Agent 开发来说，MCP 是很值得学习的加分项。

## 学习目标

- 理解 MCP 的作用
- 能写一个简单 MCP Server
- 能把本地工具暴露给 Agent
- 能设计安全的工具权限
- 能把 MCP 项目写进作品集

## MCP 解决什么问题

没有 MCP 时，每个 AI 应用都要单独适配文件、数据库、浏览器、业务 API。

有 MCP 后，可以把工具封装成标准服务，让不同 Agent 客户端都能调用。

你可以把 MCP 理解成 Agent 世界里的工具连接标准。

## MCP 基础概念

需要理解：

- MCP Client
- MCP Server
- Tools
- Resources
- Prompts
- Transport
- 权限边界

## 适合前端转型者的 MCP 项目

可以做一个“本地效率 MCP Server”。

提供工具：

- 查询本地 Markdown 笔记
- 搜索学习记录
- 创建待办事项
- 查询 SQLite 数据
- 生成日报
- 统计本周学习时长

## Node.js 实现方向

你可以用 TypeScript 写 MCP Server。

建议结构：

```text
mcp-server/
  src/
    tools/
    resources/
    services/
    index.ts
```

每个工具单独维护，输入输出都用 schema 约束。

## 安全设计

MCP 工具直接连接本地或业务系统，必须注意安全。

重点：

- 工具白名单
- 路径限制
- 参数校验
- 敏感操作确认
- 调用日志
- 只读工具和写入工具分开

## 推荐实践

做一个“MCP 本地学习助手”：

- 读取本项目中的 Markdown 学习笔记
- 根据关键词搜索内容
- 创建新的学习计划
- 生成当天学习总结
- 返回结构化结果

## 面试要能回答

- MCP 是什么
- MCP Server 和普通 API 有什么区别
- Tools 和 Resources 有什么区别
- 如何控制 MCP 工具权限
- 为什么 MCP 对 Agent 生态重要
- 你做过哪些 MCP 工具

