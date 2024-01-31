## WebGpu和WebGl
WebGL 于 2011 年登陆 Chrome。通过允许 Web 应用利用 GPU，WebGL 可以在 Web 上实现惊人的体验——从 Google 地球到交互式音乐视频，再到 3D 房地产等
等。WebGL是基于OpenGL系列API开发的，该API最初开发于1992年，自那时以来 GPU 硬件已经发生了极大的变化

为跟上这一进步，一种新型的API被开发出来，以更高效地与现代GPU硬件交互。这些API包括Direct3D 12、Metal和Vulkan。这些新的 API 支持GPU编程的新的和苛
刻的用例，例如机器学习的爆炸式增长和渲染算法的进步。WebGPU 是 WebGL 的继承者，将这种新型现代 API 的进步带到了 Web。

WebGPU 在浏览器中解锁了许多新的 GPU 编程可能性。它更好地反映了现代 GPU 硬件的工作方式，并为未来更高级的GPU功能奠定了基础。自2017年以来，这个API已
经在W3C的“Web GPU”小组中不断完善，并得到了包括苹果、谷歌、Mozilla、微软和英特尔在内的众多公司的合作。经过 6 年的努力，很高兴地宣布，这项对 Web 平
台最大的增强功能终于可用了！

WebGPU 现在可以在 Chrome OS、macOS和Windows上的Chrome 113中使用，其他平台也将会很快推出，WebGPU 的目的是提供现代 3D 图形和计算能力。它是前端的
老朋友W3C组织制定的标准。与 WebGL 不同，WebGPU 不是 OpenGL 的包装器。相反，它指的是当前的图形渲染技术，一种新的跨平台高性能图形界面。

它的设计更容易被三大图形框架实现，减轻了浏览器开发者的负担。它是一个精确的图形API，完全开放了整个显卡的能力。不再是像 WebGL 这样的上层 API。更具体的优点如下：
1. 减少 CPU 开销
2. 对多线程的良好支持
3. 使用计算着色器将通用计算 (GPGPU) 的强大功能引入 Web
4. 全新的着色器语言——WebGPU Shading Language (WGSL)
5. 未来将支持“实时光线追踪”的技术

直接看github地址即可[threejs学习示例](https://github.com/limingkang/threejsDemo)

## 参考文档
[threejs](https://threejs.org/docs/index.html#manual/zh/introduction/Installation)
[webgpu](https://www.orillusion.com/guide/)