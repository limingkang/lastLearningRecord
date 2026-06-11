# 07. Vue 前端和 AI 产品化

前面几章你已经学过 LLM API、RAG、Agent 工具调用和 MCP。到第七阶段，重点不再是“接口能不能跑”，而是：

> 如何把 AI 能力做成一个普通用户能理解、能操作、能信任、能演示的产品界面。

转行 AI Agent 开发时，前端能力是非常重要的优势。很多人会调模型 API，也能写命令行 demo，但真正面试时，能打开一个完整页面，让面试官看到流式回答、引用来源、文件索引状态、Agent 执行过程、人工确认和调用日志，这会明显更有说服力。

AI 产品的前端不是普通 CRUD 页面。它要处理更复杂的状态：

- 模型回答是流式生成的。
- RAG 回答需要展示引用来源。
- 文件上传后还要经历解析、切分、向量化、入库。
- Agent 会连续调用工具，中间可能失败、重试、等待人工确认。
- 用户需要能停止生成、重新生成、复制回答、反馈质量。
- 产品需要展示日志、成本、traceId 和错误原因。

![第七阶段 Vue AI 产品化学习地图](./images/56-vue-ai-product-map.svg)

这一阶段你要把自己从“会写 Vue 页面”升级成“能设计 AI 产品体验的前端工程师”。

## 7.1 学习目标

本阶段完成后，你需要具备这些能力：

- 能用 Vue 3 + TypeScript 搭建一个 AI 产品工作台。
- 能设计聊天界面、会话列表、输入区、右侧上下文面板。
- 能实现流式输出、停止生成、失败重试、自动滚动。
- 能展示 RAG 引用来源和原文片段。
- 能设计文件上传、解析、索引状态和失败重试界面。
- 能展示 Agent 执行步骤、工具调用、参数摘要、结果摘要。
- 能设计 human-in-the-loop 人工确认交互。
- 能用 Pinia 管理会话、消息、文件、任务、工具过程等状态。
- 能处理 AI 产品常见状态：空、加载、流式生成、等待确认、错误、无权限、完成。
- 能把前端项目做成作品集里可演示的一部分。

阶段验收标准：

- 有一个可打开的 Vue AI 工作台页面。
- 支持普通聊天和流式输出。
- 支持展示 RAG 引用来源。
- 支持展示 Agent 工具调用过程。
- 支持文件上传状态管理。
- 支持停止生成和重试。
- 有基础的日志或成本展示面板。
- README 能说明交互设计和关键实现。

## 7.2 AI 前端和普通前端的区别

普通管理系统常见交互是：用户点击按钮，前端发请求，后端返回结果，页面展示数据。

AI 产品不是这样。

AI 产品更像一个长时间运行的交互过程。用户发起请求后，系统可能会：

1. 创建会话消息。
2. 检索知识库。
3. 调用模型生成回答。
4. 过程中不断返回 token。
5. 中途调用工具。
6. 等待用户确认。
7. 失败后尝试重试或降级。
8. 最后保存回答、引用、工具记录和成本。

所以 AI 前端的核心不是“把接口数据渲染出来”，而是“把一个不确定的 AI 执行过程变得可见、可控、可恢复”。

普通 CRUD 更关心：

- 表格。
- 表单。
- 筛选。
- 分页。
- 新增、编辑、删除。
- 权限按钮。

AI 产品更关心：

- 生成过程是否可见。
- 用户能否停止生成。
- 回答是否有依据。
- 工具调用是否透明。
- 高风险操作是否确认。
- 失败后能否恢复。
- 成本和日志是否可追踪。
- 用户反馈能否进入后续优化。

这就是为什么 AI Agent 作品集不能只做一个 `textarea + button`。那只能说明你能调接口，不能说明你能做产品。

## 7.3 推荐技术栈

第七阶段建议使用这套前端技术栈：

```txt
Vue 3
TypeScript
Vite
Vue Router
Pinia
fetch stream / SSE
AbortController
Markdown 渲染
代码高亮
文件上传组件
图标库
```

### Vue 3

Vue 3 是核心框架。建议使用 Composition API，因为它更适合把复杂逻辑拆成 composables，例如：

- `useAiStream`
- `useAutoScroll`
- `useFileUpload`
- `useAgentTimeline`
- `useCitationPanel`
- `useConfirmAction`

### TypeScript

AI 前端的数据结构比普通页面复杂。消息、引用、工具调用、任务状态、错误类型都应该有类型。

不要把所有数据都写成 `any`。AI 产品里一旦状态变复杂，`any` 会让你很难定位问题。

### Vite

Vite 用于开发和构建 Vue 项目。学习阶段重点掌握：

- 开发服务器。
- 环境变量。
- 路径别名。
- 代理配置。
- 构建产物。

### Vue Router

AI 产品不应该只有一个页面。至少可以设计：

```txt
/chat              AI 聊天工作台
/knowledge         知识库管理
/agents            Agent 任务列表
/agents/:id        Agent 执行详情
/logs              调用日志
/settings          模型与系统配置
```

### Pinia

Pinia 用于管理跨组件状态。AI 产品中很多状态不适合只放在单个组件里，比如：

- 当前会话。
- 消息列表。
- 正在生成的请求。
- 文件上传任务。
- Agent 执行步骤。
- 工具调用日志。
- 用户配置。

### UI 组件库

可以用 Element Plus、Naive UI、Ant Design Vue，也可以自己写基础组件。学习阶段不要把重点放在炫酷视觉上，而是要把 AI 交互做完整。

必须优先做好：

- 输入框。
- 按钮。
- 下拉菜单。
- 标签页。
- 抽屉。
- 弹窗。
- 进度条。
- 状态标签。
- Tooltip。
- 文件上传。

### Markdown 和代码高亮

AI 回答经常包含 Markdown、列表、表格、代码块。你需要支持：

- Markdown 渲染。
- 代码块高亮。
- 复制代码。
- 链接安全处理。
- 表格横向滚动。
- 流式生成时的半成品 Markdown 展示。

## 7.4 产品信息架构

一个可演示的 AI 产品，首页应该直接是工作台，而不是一屏很大的营销介绍。

推荐布局：

- 左侧：会话列表、任务列表、知识库入口。
- 中间：聊天消息和输入区。
- 右侧：引用来源、工具过程、文件状态、成本日志。
- 顶部：当前应用名称、模型选择、用户设置。

![AI 聊天工作台布局](./images/57-ai-chat-layout.svg)

这个布局适合同时承载 RAG、Agent、MCP：

- RAG 回答时，右侧显示引用来源。
- Agent 执行时，右侧显示步骤和工具调用。
- MCP 工具调用时，右侧显示工具名称、参数摘要和返回摘要。
- 文件上传后，右侧或知识库页显示索引进度。

### 页面划分

建议至少有 5 个页面。

#### ChatPage

用于普通聊天、RAG 问答、Agent 对话。

核心功能：

- 会话列表。
- 消息列表。
- 输入区。
- 流式输出。
- 停止生成。
- 重新生成。
- 复制回答。
- 引用来源。
- 工具调用摘要。

#### KnowledgePage

用于管理知识库文档。

核心功能：

- 文件上传。
- 文件列表。
- 解析状态。
- chunk 数量。
- embedding 状态。
- 删除文件。
- 重新索引。
- 索引失败重试。

#### AgentTaskPage

用于查看 Agent 任务。

核心功能：

- 任务列表。
- 当前状态。
- 执行步骤。
- 工具调用记录。
- 人工确认记录。
- 最终报告。

#### LogsPage

用于查看调用日志。

核心功能：

- 模型调用日志。
- RAG 检索日志。
- 工具调用日志。
- token 成本。
- 失败原因。
- traceId 搜索。

#### SettingsPage

用于配置基础参数。

核心功能：

- 模型选择。
- 温度。
- topK。
- rerank 开关。
- 是否显示工具详情。
- 是否启用人工确认。
- 默认知识库。

## 7.5 前端数据模型

AI 产品的前端数据模型要先想清楚。否则页面一多，状态会乱。

下面是一组推荐类型。

### 会话和消息

```ts
export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system" | "tool";
  status: "pending" | "streaming" | "done" | "error" | "aborted";
  content: string;
  citations?: Citation[];
  toolCalls?: ToolCallSummary[];
  error?: AiError;
  createdAt: string;
};
```

注意这里不要只存 `content`。AI 消息至少需要 `status`，因为同一条 assistant 消息可能经历：

```txt
pending -> streaming -> done
pending -> streaming -> aborted
pending -> streaming -> error
```

### 引用来源

```ts
export type Citation = {
  id: string;
  sourceId: string;
  title: string;
  fileName: string;
  page?: number;
  heading?: string;
  snippet: string;
  score?: number;
};
```

引用来源要能支持点击跳转或展开原文片段。只有文件名不够，最好还有标题、页码、段落、相似度和片段。

### 工具调用

```ts
export type ToolCallSummary = {
  id: string;
  name: string;
  status: "pending" | "running" | "success" | "error" | "waiting_approval";
  argsSummary: string;
  resultSummary?: string;
  errorMessage?: string;
  startedAt: string;
  endedAt?: string;
};
```

前端不一定要默认展示完整参数和完整结果。建议默认展示摘要，点击后展开详情。

### 文件和索引任务

```ts
export type KnowledgeFile = {
  id: string;
  name: string;
  size: number;
  type: string;
  status:
    | "uploading"
    | "uploaded"
    | "extracting"
    | "chunking"
    | "embedding"
    | "indexed"
    | "failed";
  progress: number;
  chunkCount?: number;
  errorMessage?: string;
  createdAt: string;
};
```

RAG 文件上传不是上传完就结束。用户需要知道文件是否已经能被问答使用。

### Agent 执行步骤

```ts
export type AgentStep = {
  id: string;
  taskId: string;
  type: "plan" | "tool" | "approval" | "reflection" | "final";
  title: string;
  status: "pending" | "running" | "success" | "error" | "skipped";
  summary: string;
  toolCall?: ToolCallSummary;
  requiresApproval?: boolean;
  createdAt: string;
};
```

Agent 前端的关键是把步骤拆开。否则用户只看到“正在执行”，不知道系统到底在做什么。

## 7.6 状态管理设计

Vue AI 产品建议用 Pinia 拆几个 store。

```txt
stores/
  conversation.store.ts
  stream.store.ts
  knowledge.store.ts
  agent.store.ts
  log.store.ts
  settings.store.ts
```

### conversationStore

负责：

- 当前会话 ID。
- 会话列表。
- 当前消息列表。
- 新建会话。
- 切换会话。
- 追加用户消息。
- 更新 assistant 消息。
- 保存引用和工具调用。

### streamStore

负责：

- 当前是否正在生成。
- 当前请求的 `AbortController`。
- 当前流式消息 ID。
- 启动流。
- 停止流。
- 处理流式 chunk。
- 处理完成和错误。

### knowledgeStore

负责：

- 文件列表。
- 上传队列。
- 上传进度。
- 索引状态。
- 失败重试。
- 删除文件。

### agentStore

负责：

- 当前任务。
- 执行步骤。
- 工具调用记录。
- 等待确认的操作。
- 确认或取消操作。
- 失败重试。

### settingsStore

负责：

- 当前模型。
- temperature。
- topK。
- 是否显示引用。
- 是否显示工具详情。
- 是否启用人工确认。
- 默认知识库。

## 7.7 AI 前端状态机

AI 前端最常见的错误，是只用一个 `loading` 布尔值。

```ts
const loading = ref(false);
```

这对普通按钮请求够用，但对 AI 产品不够。

你至少要区分：

- `idle`：等待用户输入。
- `pending`：请求已发送，等待首个响应。
- `streaming`：正在接收模型输出。
- `tool_running`：正在执行工具。
- `confirming`：等待人工确认。
- `done`：完成。
- `error`：失败。
- `aborted`：用户停止。

![AI 前端状态机](./images/63-ai-frontend-state-machine.svg)

可以定义：

```ts
export type AiRunStatus =
  | "idle"
  | "pending"
  | "streaming"
  | "tool_running"
  | "confirming"
  | "done"
  | "error"
  | "aborted";
```

状态机的价值是：你能清楚决定每个状态下页面应该显示什么。

例如：

- `idle`：输入框可用，发送按钮可点。
- `pending`：输入框禁用，显示“正在连接”。
- `streaming`：显示停止按钮，逐字展示回答。
- `tool_running`：显示工具调用卡片。
- `confirming`：弹出确认框，等待用户决定。
- `done`：显示复制、重试、反馈按钮。
- `error`：显示错误原因和重试按钮。
- `aborted`：显示“已停止”，允许继续追问或重新生成。

## 7.8 流式输出

流式输出是 AI 产品最基础也最重要的体验之一。

如果用户提问后页面一直转圈，过 20 秒突然出现一大段答案，体验会很差。流式输出能让用户感到系统正在工作，也能更早发现回答方向是否正确。

![流式输出 UI 流程](./images/58-streaming-ui-flow.svg)

### 7.8.1 三种常见方案

#### fetch stream

适合前端用 `POST` 提交复杂参数，并接收后端返回的流。

优点：

- 支持 POST。
- 可以传复杂请求体。
- 可以用 AbortController 中断。
- 和普通 fetch 代码接近。

缺点：

- 要自己解析 chunk。
- 后端需要正确设置流式响应。

#### EventSource

适合服务端通过 SSE 持续推送事件。

优点：

- 浏览器原生支持。
- 自动重连机制。
- 事件格式清晰。

缺点：

- 原生 EventSource 主要是 GET。
- 传复杂请求体不方便。
- 中断和鉴权设计要额外考虑。

#### WebSocket

适合双向实时通信，例如多人协作、实时任务看板、复杂 Agent 事件流。

优点：

- 双向通信。
- 适合复杂事件。

缺点：

- 实现和维护成本更高。
- 对普通聊天流式输出来说可能偏重。

学习阶段建议先掌握 fetch stream，再理解 SSE 和 WebSocket。

### 7.8.2 fetch stream 基础流程

前端流程：

1. 用户点击发送。
2. 创建用户消息。
3. 创建一条空的 assistant 消息。
4. 发起 fetch 请求。
5. 使用 reader 读取流。
6. 每收到一段文本，就追加到 assistant 消息。
7. 完成后把消息状态改为 `done`。
8. 失败则改为 `error`。
9. 用户点击停止时调用 `AbortController.abort()`。

示例 composable：

```ts
import { ref } from "vue";

export function useAiStream() {
  const status = ref<AiRunStatus>("idle");
  const controller = ref<AbortController | null>(null);

  async function start(input: {
    conversationId: string;
    content: string;
    onDelta: (text: string) => void;
    onDone?: () => void;
    onError?: (error: unknown) => void;
  }) {
    controller.value = new AbortController();
    status.value = "pending";

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: input.conversationId,
          content: input.content,
        }),
        signal: controller.value.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error("Stream request failed");
      }

      status.value = "streaming";

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        input.onDelta(chunk);
      }

      status.value = "done";
      input.onDone?.();
    } catch (error) {
      if (controller.value?.signal.aborted) {
        status.value = "aborted";
        return;
      }

      status.value = "error";
      input.onError?.(error);
    } finally {
      controller.value = null;
    }
  }

  function stop() {
    controller.value?.abort();
  }

  return {
    status,
    start,
    stop,
  };
}
```

真实项目里，后端不一定直接返回纯文本，也可能返回事件：

```txt
event: message_delta
data: {"text":"你好"}

event: citation
data: {"sourceId":"doc_1","title":"RAG 指南"}

event: tool_call
data: {"name":"search_notes","status":"running"}

event: done
data: {"usage":{"tokens":1200}}
```

这种情况下，前端需要解析事件类型，并更新不同区域：

- `message_delta` 更新回答正文。
- `citation` 更新引用面板。
- `tool_call` 更新工具过程。
- `done` 更新用量和完成状态。
- `error` 更新错误提示。

### 7.8.3 停止生成

停止生成不是简单隐藏 loading。它应该做几件事：

- 中断当前请求。
- 把当前 assistant 消息标记为 `aborted`。
- 保留已经生成的部分内容。
- 显示“已停止生成”状态。
- 允许用户重新生成或继续追问。

停止后的消息不要直接删除。保留半成品内容对用户有价值，也方便调试。

### 7.8.4 自动滚动

聊天页面通常需要自动滚动到底部，但不能粗暴地每次都滚。

建议规则：

- 如果用户本来就在底部，流式输出时自动滚动。
- 如果用户手动往上看历史，不要强行拉到底。
- 新消息发送时滚到底。
- 回答完成后可以再滚一次。

可以用 `IntersectionObserver` 或滚动位置判断实现。

## 7.9 RAG 文件上传和索引状态

RAG 产品的文件上传体验，不能只显示“上传成功”。

因为上传成功只说明文件到了服务器，不代表它已经能被问答系统使用。一个文档至少要经历：

1. 上传。
2. 文本解析。
3. 清洗。
4. 分块。
5. Embedding。
6. 入向量库。
7. 可检索。

![RAG 文件上传与索引状态 UI](./images/59-rag-upload-index-ui.svg)

### 7.9.1 文件列表字段

知识库文件列表建议展示：

- 文件名。
- 文件类型。
- 文件大小。
- 上传时间。
- 当前状态。
- 解析进度。
- chunk 数量。
- embedding 数量。
- 失败原因。
- 操作按钮。

状态示例：

```txt
uploading
uploaded
extracting
chunking
embedding
indexed
failed
```

用户最关心的是：

- 这个文件现在能不能问？
- 如果不能，卡在哪一步？
- 如果失败，为什么失败？
- 能不能重试？

### 7.9.2 上传组件设计

上传组件需要包含：

- 拖拽上传。
- 点击选择文件。
- 文件类型限制。
- 文件大小限制。
- 多文件队列。
- 上传进度。
- 取消上传。
- 上传失败重试。

不要只依赖后端报错。前端也应该提前校验：

- 文件是否为空。
- 文件类型是否支持。
- 文件大小是否超过限制。
- 是否重复上传。

### 7.9.3 索引任务状态

后端通常会把解析和 embedding 放到异步任务队列。前端可以通过轮询或事件流更新状态。

轮询适合简单项目：

```ts
async function pollFileStatus(fileId: string) {
  const timer = window.setInterval(async () => {
    const file = await api.getKnowledgeFile(fileId);
    knowledgeStore.updateFile(file);

    if (file.status === "indexed" || file.status === "failed") {
      window.clearInterval(timer);
    }
  }, 2000);
}
```

事件流适合更实时的项目：

```txt
file_uploaded
text_extracted
chunks_created
embedding_started
embedding_progress
indexed
index_failed
```

作品集项目用轮询也可以，关键是状态要完整，不要让用户猜。

## 7.10 RAG 引用来源展示

RAG 答案必须展示引用来源。没有引用来源，用户无法判断答案是否可靠。

![RAG 引用来源展示](./images/60-citation-source-panel.svg)

### 7.10.1 引用展示的层级

建议分三层：

第一层：回答中的引用标记。

```txt
RAG 的核心流程包括解析、分块、Embedding 和检索。[1][2]
```

第二层：右侧来源卡片。

```txt
[1] rag-guide.md
标题：RAG 构建流程
相似度：0.86
页码：12
```

第三层：可展开原文片段。

```txt
先将文档切分成 chunk，再生成 embedding 并写入向量库...
```

这三层的作用不同：

- 引用标记告诉用户哪句话有依据。
- 来源卡片告诉用户依据来自哪里。
- 原文片段让用户可以验证模型有没有乱说。

### 7.10.2 引用点击交互

建议实现：

- 点击回答里的 `[1]`，右侧高亮对应来源。
- 点击来源卡片，展开原文片段。
- 点击文件名，跳转到文档详情。
- 鼠标悬停引用标记，显示简短来源。

这类细节很加分，因为它体现你知道 RAG 产品不是“把 chunk 拼给模型”这么简单。

### 7.10.3 引用错误状态

要考虑这些情况：

- 回答没有引用。
- 引用文件已删除。
- 引用片段为空。
- 引用和回答不匹配。
- 用户没有权限查看引用文件。

对应 UI：

- 没有引用时显示“本回答未找到可引用来源”。
- 无权限时显示权限提示。
- 引用丢失时显示“来源不可用”。
- 引用不匹配时允许用户反馈。

## 7.11 Agent 执行过程可视化

Agent 产品最容易犯的错误，是让用户只看到一个长时间 loading。

Agent 的价值在于它会做多步任务，所以界面也应该把多步任务展示出来。

![Agent 执行过程可视化](./images/61-agent-execution-timeline.svg)

### 7.11.1 时间线结构

可以按时间线展示：

- 步骤 1：理解目标。
- 步骤 2：制定计划。
- 步骤 3：调用工具。
- 步骤 4：等待确认。
- 步骤 5：继续执行。
- 步骤 6：生成最终结果。

每个步骤至少包含：

- 标题。
- 状态。
- 摘要。
- 开始时间。
- 结束时间。
- 是否可展开。

工具步骤还要包含：

- 工具名称。
- 参数摘要。
- 返回摘要。
- 错误信息。
- traceId。

### 7.11.2 默认摘要，按需展开

不要默认把完整 JSON 参数和返回结果全部显示给用户。这样会显得很乱。

推荐：

- 默认展示自然语言摘要。
- 技术用户可以点击展开 JSON。
- 错误时默认展示错误原因。
- traceId 放在详情里，方便复制给开发者排查。

### 7.11.3 工具调用状态

工具调用状态建议统一：

```txt
pending
running
success
error
waiting_approval
skipped
```

UI 对应：

- `pending`：灰色等待。
- `running`：显示进度或旋转状态。
- `success`：绿色完成。
- `error`：红色错误，可重试。
- `waiting_approval`：黄色提示，显示确认按钮。
- `skipped`：灰色跳过，显示原因。

## 7.12 Human-in-the-loop 交互

Agent 不应该静默执行所有操作。只要操作有风险，就应该让用户确认。

高风险操作包括：

- 写数据库。
- 创建订单。
- 发送邮件。
- 删除文件。
- 修改商品价格。
- 发布内容。
- 调用付费 API。
- 批量创建任务。

![Human-in-the-loop 确认界面](./images/62-human-confirmation-ui.svg)

### 7.12.1 确认弹窗要展示什么

确认弹窗不是只问“是否继续”。

应该展示：

- 即将执行的工具。
- 参数摘要。
- 会影响哪些对象。
- 是否可撤销。
- 风险提示。
- 取消按钮。
- 确认按钮。
- 可选替代方案。

例如：

```txt
Agent 准备创建 12 条商品上架任务。

工具：create_listing_tasks
影响：会在任务系统中创建真实记录
风险：标题和价格建议尚未人工审核
建议：先生成草稿，再确认写入
```

### 7.12.2 前端状态流

人工确认的状态流：

```txt
tool_running -> waiting_approval -> approved -> tool_running -> success
tool_running -> waiting_approval -> rejected -> skipped
```

用户拒绝后，不一定整个任务失败。Agent 可以继续生成报告，只是跳过写入操作。

### 7.12.3 确认记录要保存

建议保存：

- 谁确认的。
- 确认时间。
- 确认的工具。
- 参数摘要。
- 用户选择：同意或拒绝。
- 后续执行结果。

这样项目看起来就不只是 demo，而是有真实业务系统的审计意识。

## 7.13 错误、空状态和恢复

AI 产品的失败很多，不要只弹一个“请求失败”。

常见错误包括：

- 模型 API 超时。
- 模型额度不足。
- 后端连接失败。
- RAG 没有检索到内容。
- 文件解析失败。
- 工具调用失败。
- 用户无权限访问文件。
- 输出 JSON 解析失败。
- 用户停止生成。

### 7.13.1 错误分类

建议统一错误类型：

```ts
export type AiErrorCode =
  | "NETWORK_ERROR"
  | "MODEL_TIMEOUT"
  | "RATE_LIMITED"
  | "NO_RETRIEVAL_RESULT"
  | "FILE_PARSE_FAILED"
  | "TOOL_CALL_FAILED"
  | "PERMISSION_DENIED"
  | "OUTPUT_VALIDATION_FAILED"
  | "USER_ABORTED";
```

前端要根据错误类型给出不同动作：

- 网络错误：重试。
- 模型超时：重新生成或切换模型。
- 没有检索结果：提示换关键词或上传资料。
- 文件解析失败：重新解析或删除文件。
- 权限不足：申请权限或切换知识库。
- 用户停止：保留内容并允许继续。

### 7.13.2 空状态

空状态不是写一句“暂无数据”。

不同页面的空状态应该不同：

- 没有会话：显示新建会话入口。
- 没有知识库文件：显示上传入口。
- 没有 Agent 任务：显示创建任务入口。
- 没有日志：提示执行一次问答后会出现日志。
- 没有引用：提示当前回答没有检索到可靠来源。

空状态要引导下一步动作。

### 7.13.3 失败恢复

每个失败状态都要考虑是否可恢复：

- 聊天失败：重新生成。
- 工具失败：重试该步骤。
- 文件解析失败：重新解析。
- embedding 失败：重新入库。
- 人工确认拒绝：跳过该操作。

AI 产品可用性的关键，不是永远不失败，而是失败后用户知道怎么办。

## 7.14 观测和成本展示

作品集项目里，哪怕只是一个简单面板，也建议展示 AI 调用日志和成本。

![AI 产品观测面板](./images/64-ai-product-observability-ui.svg)

### 7.14.1 调用日志字段

建议前端日志列表展示：

- traceId。
- 会话 ID。
- 模型名称。
- 请求类型。
- 输入 token。
- 输出 token。
- 估算成本。
- 耗时。
- 状态。
- 错误码。
- 创建时间。

### 7.14.2 工具日志字段

Agent 工具日志展示：

- traceId。
- toolName。
- argsSummary。
- resultSummary。
- status。
- latencyMs。
- errorCode。
- requiresApproval。

### 7.14.3 用户反馈

每条回答建议提供反馈：

- 有帮助。
- 没帮助。
- 引用不准确。
- 回答太泛。
- 回答错误。

这些反馈可以进入后续 eval。面试时你可以说：

> 我不仅做了回答界面，还设计了 bad case 收集入口。用户可以标记引用不准确或回答无帮助，后续用这些反馈构建 RAG 和 Agent 的评估集。

这会非常加分。

## 7.15 组件拆分建议

建议按业务组件拆分，而不是按视觉小碎片过度拆分。

```txt
src/
  app/
    router.ts
    pinia.ts
  pages/
    ChatPage.vue
    KnowledgePage.vue
    AgentTaskPage.vue
    LogsPage.vue
    SettingsPage.vue
  components/
    chat/
      ConversationList.vue
      MessageList.vue
      MessageBubble.vue
      ChatInput.vue
      StreamStatusBar.vue
    rag/
      FileUploader.vue
      KnowledgeFileTable.vue
      CitationPanel.vue
      SourceSnippet.vue
    agent/
      AgentTimeline.vue
      AgentStepCard.vue
      ToolCallCard.vue
      ApprovalDialog.vue
    logs/
      CallLogTable.vue
      CostSummary.vue
    common/
      EmptyState.vue
      ErrorState.vue
      StatusBadge.vue
      CopyButton.vue
  composables/
    useAiStream.ts
    useAutoScroll.ts
    useFileUpload.ts
    usePolling.ts
    useClipboard.ts
  stores/
    conversation.store.ts
    stream.store.ts
    knowledge.store.ts
    agent.store.ts
    settings.store.ts
  api/
    chat.api.ts
    knowledge.api.ts
    agent.api.ts
    logs.api.ts
  types/
    chat.ts
    rag.ts
    agent.ts
    logs.ts
```

拆分原则：

- 页面负责布局和组合。
- 组件负责展示和局部交互。
- store 负责跨组件状态。
- composable 负责可复用逻辑。
- api 文件负责请求封装。
- types 文件负责数据结构。

不要把流式请求、消息更新、滚动逻辑、文件上传和工具展示全部写在一个 `ChatPage.vue` 里。

## 7.16 样式和交互规范

AI 产品界面要克制、清晰、可扫描。

建议：

- 不要做大面积营销 hero。
- 第一屏直接进入工作台。
- 页面结构稳定，不要生成中导致布局跳动。
- 按钮文案要明确。
- 高风险操作用确认弹窗。
- 状态标签颜色保持一致。
- 右侧详情面板不要压迫主消息区。
- 移动端至少保证聊天可用。
- 长文本、代码块、表格都要处理溢出。

### 消息气泡

用户消息：

- 靠右。
- 宽度不要撑满。
- 背景略有区分。

AI 消息：

- 靠左。
- 支持 Markdown。
- 支持引用标记。
- 支持工具调用折叠。
- 支持复制和反馈。

### 输入区

输入区应该支持：

- 多行输入。
- Enter 发送。
- Shift + Enter 换行。
- 上传附件。
- 停止生成。
- 清空输入。
- 字数提示。

如果正在生成，发送按钮应该变成停止按钮，或者旁边出现停止按钮。

### 右侧面板

右侧面板可以用 tabs：

```txt
引用
工具
文件
日志
```

这样不会让界面太拥挤。

## 7.17 和后端接口的契约

前端产品化不是前端自己能完成的，必须和后端约定接口。

### 聊天流接口

请求：

```http
POST /api/chat/stream
Content-Type: application/json
```

```json
{
  "conversationId": "conv_001",
  "message": "帮我总结这份文档",
  "knowledgeBaseId": "kb_001",
  "mode": "rag"
}
```

返回事件：

```txt
message_delta
citation
tool_call_started
tool_call_finished
usage
done
error
```

### 文件上传接口

```http
POST /api/knowledge/files
GET /api/knowledge/files
GET /api/knowledge/files/:id
POST /api/knowledge/files/:id/reindex
DELETE /api/knowledge/files/:id
```

### Agent 任务接口

```http
POST /api/agent/tasks
GET /api/agent/tasks
GET /api/agent/tasks/:id
POST /api/agent/tasks/:id/approve
POST /api/agent/tasks/:id/reject
POST /api/agent/tasks/:id/retry
```

### 日志接口

```http
GET /api/logs/model-calls
GET /api/logs/tool-calls
GET /api/logs/tasks/:traceId
```

接口契约越清晰，前端越容易做出稳定体验。

## 7.18 实战项目：AI Agent 工作台

第七阶段建议完成一个“AI Agent 工作台”前端。

它可以先使用 mock API，不一定一开始就接完整后端。关键是把产品体验跑通。

### 7.18.1 第一版范围

第一版只做这些：

- 左侧会话列表。
- 中间聊天区。
- 输入区。
- 流式输出。
- 停止生成。
- 右侧引用面板。
- 右侧工具调用面板。
- 文件上传列表。
- Agent 执行时间线。

### 7.18.2 第二版范围

第二版再加：

- 会话历史保存。
- 文件索引状态轮询。
- 工具调用详情展开。
- 人工确认弹窗。
- 日志页面。
- 模型设置页。
- 用户反馈按钮。

### 7.18.3 第三版范围

第三版打磨作品集：

- 接真实 NestJS 后端。
- 接真实 RAG 查询。
- 接真实 Agent 任务。
- 展示 token 和成本。
- README 加截图。
- 录制 3 分钟演示视频。
- 写清楚已知问题和后续优化。

## 7.19 面试怎么讲

面试官问“你做过 AI 前端吗”，不要只说“做过聊天页面”。

你可以这样讲：

> 我做了一个 Vue 3 + TypeScript 的 AI Agent 工作台。它不是简单聊天框，而是把 RAG、Agent 和工具调用过程都产品化展示出来。聊天区支持 fetch stream 流式输出、AbortController 停止生成、Markdown 渲染和复制反馈；RAG 回答会在右侧展示引用来源和原文片段；Agent 执行会展示步骤时间线、工具调用参数摘要、结果摘要和等待人工确认状态；知识库页面能展示文件上传、解析、chunk、embedding 和索引状态。为了让系统可排查，我还做了调用日志、traceId、token 成本和用户反馈入口。

这段话体现了：

- 你理解 AI 产品不是普通页面。
- 你知道流式输出怎么做。
- 你知道 RAG 引用怎么展示。
- 你知道 Agent 过程怎么可视化。
- 你有工程化和可观测意识。

## 7.20 常见错误

### 错误一：只有一个聊天框

只有聊天框无法体现 RAG、Agent、MCP 的能力。至少要有引用、工具过程或文件状态。

### 错误二：没有流式输出

AI 回答通常较慢，没有流式输出会让产品显得很笨重。流式输出是 AI 前端的基本功。

### 错误三：不能停止生成

用户发现问题问错了，应该能停止。不能停止会浪费成本，也会让体验变差。

### 错误四：RAG 没有引用来源

知识库问答没有引用，就很难被信任。引用来源是 RAG 产品的核心界面能力。

### 错误五：Agent 是黑箱

Agent 执行多步任务时，用户必须看到步骤。否则一旦等待时间超过几秒，用户会认为系统卡住了。

### 错误六：错误提示太粗糙

“请求失败”没有意义。你要告诉用户是网络失败、模型超时、没有检索结果、文件解析失败，还是工具调用失败。

### 错误七：没有移动端适配

作品集项目不一定要移动端功能完整，但至少不能布局崩掉。聊天区、输入区和消息列表要能在窄屏使用。

## 7.21 阶段练习

### 练习一：设计页面草图

画出 AI Agent 工作台页面，至少包含：

- 会话列表。
- 消息列表。
- 输入区。
- 引用来源面板。
- 工具调用面板。
- 文件状态入口。

要求你能说明每个区域解决什么问题。

### 练习二：定义数据类型

用 TypeScript 写出：

- `Conversation`
- `ChatMessage`
- `Citation`
- `ToolCallSummary`
- `KnowledgeFile`
- `AgentStep`

要求不要使用 `any`。

### 练习三：实现流式输出 mock

不用接真实模型，先写一个 mock stream，让回答每 100ms 输出几个字。

要求支持：

- 开始生成。
- 停止生成。
- 重新生成。
- 完成状态。
- 错误状态。

### 练习四：实现引用面板

准备 3 条假引用数据，在回答中显示 `[1][2]`，点击后右侧高亮来源卡片。

要求支持：

- 展开原文片段。
- 显示文件名。
- 显示相似度。
- 处理引用不存在的情况。

### 练习五：实现 Agent 时间线

准备一个 mock Agent 任务，包含：

- plan 步骤。
- tool 步骤。
- approval 步骤。
- final 步骤。

要求每一步有状态和摘要，工具步骤可以展开参数。

### 练习六：写作品集说明

为这个前端项目写一段 README 介绍，说明：

- 为什么这样设计页面。
- 如何处理流式输出。
- 如何展示 RAG 引用。
- 如何展示 Agent 工具调用。
- 如何处理错误和停止生成。

## 7.22 阶段验收清单

完成第七阶段前，请逐项检查：

- [ ] 能用 Vue 3 + TypeScript 搭建 AI 工作台。
- [ ] 能解释 AI 前端和普通 CRUD 的区别。
- [ ] 能设计会话、消息、引用、工具调用、文件状态的数据类型。
- [ ] 能实现流式输出。
- [ ] 能用 AbortController 停止生成。
- [ ] 能处理生成中、完成、失败、停止状态。
- [ ] 能展示 RAG 引用来源和原文片段。
- [ ] 能展示文件上传和索引状态。
- [ ] 能展示 Agent 执行时间线。
- [ ] 能设计人工确认弹窗。
- [ ] 能展示基础调用日志和成本。
- [ ] 能把项目讲成一个完整 AI 产品，而不是聊天 demo。

## 7.23 和下一阶段的关系

第七阶段把 AI 能力做成了可用前端。下一阶段会进入作品集和求职准备，你需要把这些项目包装成能投递、能演示、能讲清楚的成果：

- README 怎么写。
- 架构图怎么画。
- Demo 怎么部署。
- 演示视频怎么录。
- 简历项目怎么描述。
- 面试问题怎么回答。

如果第七阶段做得扎实，后面的作品集会轻松很多，因为你已经不只是“有后端能力”，而是有一个完整的 AI 产品形态。

## 参考资料

- [Vue 官方文档](https://vuejs.org/guide/introduction.html)
- [Vue TypeScript 指南](https://vuejs.org/guide/typescript/overview.html)
- [Vue Router 官方文档](https://router.vuejs.org/guide/)
- [Pinia 官方文档](https://pinia.vuejs.org/)
- [Vite 官方文档](https://vite.dev/guide/)
- [MDN Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API)
- [MDN AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController)
- [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
