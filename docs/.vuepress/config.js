const slidebar = require('./router')

module.exports = {
  title: '学个锤子',
  port: 8997,
  base: '/lastLearningRecord/',
  // dest: '../../../docs/dist/',
  description: '写完和代码说再见',
  themeConfig: {
    nav: [{ text: 'gitHub', link: 'https://github.com/limingkang' }],
    sidebar: slidebar
  }
}
