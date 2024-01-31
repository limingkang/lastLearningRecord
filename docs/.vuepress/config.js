const slidebar = require('./router')

module.exports = {
  title: '持续学习',
  port: 8997,
  base: '/lastLearningRecord/',
  // dest: '../../../docs/dist/',
  description: '持续学习',
  themeConfig: {
    nav: [{ text: 'gitHub', link: 'https://github.com/limingkang' }],
    sidebar: slidebar
  }
}
