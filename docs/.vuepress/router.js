module.exports = [
  {
    title: '项目优化',
    path: '/',
    collapsable: false,
    children: [
      ['/webview/webview', 'webview如何优化'],
      ['/componentsDesign/componentsDesign', '组件库设计'],
      ['/jsbridge/jsbridge', 'jsbridge设计'],
    ]
  },
  {
    title: 'nodejs',
    path: '/node/',
    collapsable: false,
    children: [
      ['/node/onenode', '框架设计和登录鉴权'],
      ['/node/twonode', 'RBAC权限、菜单和审计日志'],
      ['/node/threenode', '后台商品中心'],
      ['/node/fournode', '小程序会员'],
      ['/node/fivenode', '购物车和订单预览'],
      ['/node/sixnode', '创建订单数据库事务'],
      ['/node/sevennode', '微信支付'],
      ['/node/eightnode', '发货售后退款'],
      ['/node/ninenode', '营销CMS首页配置'],
      ['/node/tennode', '文件上传导入导出'],
      ['/node/elevennode', '异步任务和MQ'],
    ]
  },
  {
    title: '补齐基础',
    path: '/',
    collapsable: false,
    children: [
      ['/babel/babel', 'babel小计'],
      ['/uniapp/uniapp', 'uniapp'],
      ['/three/three', 'threejs'],
      ['/question/question', 'question'],
    ]
  },
  {
    title: 'ai agent开发',
    path: '/ai-agent/',
    collapsable: false,
    children: [
      ['/ai-agent/', '学习大纲'],
      ['/ai-agent/01-llm-foundation', 'AI Agent 和 LLM 基础'],
      ['/ai-agent/02-node-backend', 'NestJS / FastAPI 服务端工程基础'],
      ['/ai-agent/03-llm-api', '大模型 API 和 Prompt 工程'],
      ['/ai-agent/04-rag', 'RAG 知识库开发'],
      ['/ai-agent/05-agent-tools', 'Agent 工具调用和工作流'],
      ['/ai-agent/06-mcp', 'MCP 和外部工具生态'],
      ['/ai-agent/07-vue-product', 'Vue 前端和 AI 产品化'],
    ]
  },
  {
    title: '随笔',
    path: '/',
    collapsable: false,
    children: [
      ['/web3/web3', 'web3'],
    ]
  },
]
