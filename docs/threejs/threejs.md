Three.js 是一个在浏览器里写 3D 场景的 JavaScript 库。可以把它理解成：它帮我们把复杂的 WebGL 底层代码封装好，我们只需要用“场景、相机、物体、灯光、材质、动画”这些更接近人类理解的概念来搭建 3D 页面。学习步骤

```text
-> 第一个旋转立方体
-> 场景 / 相机 / 渲染器
-> 几何体 / 材质 / 网格模型
-> 坐标 / 位移 / 旋转 / 缩放
-> 灯光 / 阴影
-> 纹理
-> 相机控制器
-> 动画循环
-> 鼠标拾取 Raycaster
-> 加载 glTF 模型
-> 性能优化和项目结构
```

## 第一个Three.js页面
引入`three`包之后，大概如下核心代码，应该能看到一个旋转的蓝色立方体
```js
import * as THREE from 'three'

const app = document.querySelector('#app')

// 1. 创建场景：所有 3D 物体、灯光都会放进 scene
const scene = new THREE.Scene()
scene.background = new THREE.Color('#111827')

// 2. 创建相机：决定你从哪里看这个 3D 世界
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  100
)
camera.position.set(0, 0, 4)

// 3. 创建渲染器：把 scene + camera 渲染到 canvas 上
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
app.appendChild(renderer.domElement)

// 4. 创建一个立方体
const geometry = new THREE.BoxGeometry(1, 1, 1)
const material = new THREE.MeshBasicMaterial({ color: '#38bdf8' })
const cube = new THREE.Mesh(geometry, material)
scene.add(cube)

// 5. 动画循环
function animate() {
  cube.rotation.x += 0.01
  cube.rotation.y += 0.01

  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)

// 6. 适配窗口大小变化
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()

  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})
```

## Three.js 的核心概念

理解这6个词：

```text
Scene：场景，装所有 3D 内容的容器
Camera：相机，决定从哪里看、怎么看
Renderer：渲染器，把 3D 内容画到 canvas
Geometry：几何体，决定物体形状
Material：材质，决定物体外观
Mesh：网格模型，Geometry + Material 的组合
```

它们的关系可以这样理解：

```text
Scene
  ├─ Mesh
  │   ├─ Geometry
  │   └─ Material
  ├─ Light
  └─ Camera

Renderer.render(Scene, Camera)
```

## 场景 Scene

`Scene` 是一个容器，所有要显示的物体都要通过 `scene.add()` 放进去。

```js
const scene = new THREE.Scene()

scene.background = new THREE.Color('#020617')

const axesHelper = new THREE.AxesHelper(3)
scene.add(axesHelper)

const gridHelper = new THREE.GridHelper(10, 10)
scene.add(gridHelper)
```

常用方法：

```text
scene.add(object)：添加对象
scene.remove(object)：移除对象
scene.background：设置背景
scene.fog：设置雾效
```

## 相机 Camera

最常用的是透视相机 `PerspectiveCamera`，接近人眼看世界的效果：近大远小。

```js
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
)

camera.position.set(0, 2, 6)
camera.lookAt(0, 0, 0)
```

4 个参数含义：

```text
fov：视野角度，常用 45 到 75
aspect：宽高比，一般是 window.innerWidth / window.innerHeight
near：最近可见距离，太近的东西不渲染
far：最远可见距离，太远的东西不渲染
```

如果做 2D 风格、地图、建筑平面视角，可以了解 `OrthographicCamera`，它没有近大远小的透视效果。

## 渲染器 Renderer

渲染器负责把场景画出来。

```js
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
})

renderer.setSize(window.innerWidth, window.innerHeight)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)
```

常用设置：

```js
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
```

`setPixelRatio` 不建议无脑设置成 `window.devicePixelRatio`。高清屏可能是 3 或 4，会明显增加渲染压力，所以常用：

```js
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
```

## 几何体 Geometry

几何体决定物体的形状。

```js
const box = new THREE.BoxGeometry(1, 1, 1)
const sphere = new THREE.SphereGeometry(1, 32, 32)
const plane = new THREE.PlaneGeometry(5, 5)
const torus = new THREE.TorusGeometry(1, 0.3, 16, 100)
```

常用几何体：

```text
BoxGeometry：盒子
SphereGeometry：球
PlaneGeometry：平面
CircleGeometry：圆
ConeGeometry：圆锥
CylinderGeometry：圆柱
TorusGeometry：圆环
BufferGeometry：自定义几何体
```

示例：创建一个三角形自定义几何体。

```js
const vertices = new Float32Array([
  0, 1, 0,
  -1, -1, 0,
  1, -1, 0
])

const geometry = new THREE.BufferGeometry()
geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))

const material = new THREE.MeshBasicMaterial({
  color: '#f97316',
  side: THREE.DoubleSide
})

const triangle = new THREE.Mesh(geometry, material)
scene.add(triangle)
```

`BufferAttribute(vertices, 3)` 的意思是：每 3 个数字组成一个顶点的 `x, y, z`。

## 材质 Material

材质决定物体表面长什么样。

```js
const basic = new THREE.MeshBasicMaterial({ color: '#38bdf8' })
const standard = new THREE.MeshStandardMaterial({
  color: '#22c55e',
  roughness: 0.4,
  metalness: 0.1
})
```

常用材质：

```text
MeshBasicMaterial：不受灯光影响，适合调试、纯色、贴图
MeshLambertMaterial：受灯光影响，没有高光
MeshPhongMaterial：受灯光影响，有高光
MeshStandardMaterial：PBR 标准材质，真实感更好，项目常用
MeshPhysicalMaterial：更高级的物理材质，支持清漆、透光等效果
MeshNormalMaterial：用法线显示颜色，适合调试
```

小白建议：

```text
调试阶段：MeshBasicMaterial / MeshNormalMaterial
正式项目：MeshStandardMaterial
高级真实感：MeshPhysicalMaterial
```

## 网格模型 Mesh

`Mesh = Geometry + Material`。

```js
const geometry = new THREE.SphereGeometry(1, 32, 32)
const material = new THREE.MeshStandardMaterial({ color: '#a3e635' })
const sphere = new THREE.Mesh(geometry, material)

scene.add(sphere)
```

一个物体被加入场景后，就可以设置位置、旋转和缩放。

```js
sphere.position.set(2, 0, 0)
sphere.rotation.y = Math.PI / 4
sphere.scale.set(1.5, 1.5, 1.5)
```

## 坐标系和变换

Three.js 默认使用右手坐标系：

```text
x：左右，向右为正
y：上下，向上为正
z：前后，朝屏幕外通常为正，远离相机方向要结合相机位置看
```

常用变换：

```js
mesh.position.x = 1
mesh.position.set(1, 2, 3)

mesh.rotation.x = Math.PI / 2
mesh.rotation.set(0, Math.PI / 4, 0)

mesh.scale.x = 2
mesh.scale.set(2, 2, 2)
```

角度要用弧度：

```js
const angle = THREE.MathUtils.degToRad(45)
mesh.rotation.y = angle
```

## Object3D 和父子关系

Three.js 里大部分对象都继承自 `Object3D`，包括 `Mesh`、`Group`、`Camera`、`Light`。

如果你想让多个物体一起移动，可以用 `Group`。

```js
const group = new THREE.Group()

const material = new THREE.MeshStandardMaterial({ color: '#38bdf8' })

const cube1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
cube1.position.x = -1.2

const cube2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material)
cube2.position.x = 1.2

group.add(cube1)
group.add(cube2)
scene.add(group)

group.rotation.y = Math.PI / 4
```

父对象移动、旋转、缩放时，子对象会跟着变化。

## 灯光 Light

如果你用了 `MeshStandardMaterial`、`MeshPhongMaterial` 这类受光材质，就必须添加灯光。

```js
const ambientLight = new THREE.AmbientLight('#ffffff', 0.5)
scene.add(ambientLight)

const directionalLight = new THREE.DirectionalLight('#ffffff', 1)
directionalLight.position.set(3, 4, 5)
scene.add(directionalLight)
```

常用灯光：

```text
AmbientLight：环境光，整体照亮，没有方向
DirectionalLight：平行光，像太阳光
PointLight：点光源，像灯泡
SpotLight：聚光灯，像手电筒
HemisphereLight：半球光，适合模拟天空和地面的柔和补光
```

## 阴影 Shadow

阴影要同时打开 3 个地方：

```js
renderer.shadowMap.enabled = true

directionalLight.castShadow = true

cube.castShadow = true
plane.receiveShadow = true
```

完整示例：

```js
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.shadowMap.enabled = true

const light = new THREE.DirectionalLight('#ffffff', 1.5)
light.position.set(3, 5, 4)
light.castShadow = true
scene.add(light)

const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: '#38bdf8' })
)
cube.position.y = 0.5
cube.castShadow = true
scene.add(cube)

const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(8, 8),
  new THREE.MeshStandardMaterial({ color: '#e5e7eb' })
)
plane.rotation.x = -Math.PI / 2
plane.receiveShadow = true
scene.add(plane)
```

如果阴影很糊，可以调大阴影贴图尺寸：

```js
light.shadow.mapSize.width = 1024
light.shadow.mapSize.height = 1024
```

## 纹理 Texture

纹理就是贴在物体表面的图片。

```js
const textureLoader = new THREE.TextureLoader()
const colorTexture = textureLoader.load('/textures/brick/color.jpg')
colorTexture.colorSpace = THREE.SRGBColorSpace

const material = new THREE.MeshStandardMaterial({
  map: colorTexture
})

const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), material)
scene.add(wall)
```

常见贴图：

```text
map：颜色贴图
normalMap：法线贴图，制造凹凸细节
roughnessMap：粗糙度贴图
metalnessMap：金属度贴图
aoMap：环境遮蔽贴图
alphaMap：透明贴图
displacementMap：置换贴图，真的改变顶点位置
```

重复纹理：

```js
colorTexture.wrapS = THREE.RepeatWrapping
colorTexture.wrapT = THREE.RepeatWrapping
colorTexture.repeat.set(4, 4)
```

注意：颜色贴图通常设置 `SRGBColorSpace`，法线贴图、粗糙度贴图、金属度贴图一般不设置。

## OrbitControls 鼠标控制相机

`OrbitControls` 可以让你用鼠标拖拽旋转、滚轮缩放、右键平移。

```js
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
```

动画循环里要调用 `controls.update()`：

```js
function animate() {
  controls.update()
  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
```

常用配置：

```js
controls.enableZoom = true
controls.enablePan = true
controls.autoRotate = false
controls.minDistance = 2
controls.maxDistance = 10
controls.target.set(0, 1, 0)
controls.update()
```

## 动画循环

最核心的动画逻辑就是：每一帧修改物体状态，然后重新渲染。

```js
const clock = new THREE.Clock()

function animate() {
  const elapsedTime = clock.getElapsedTime()

  cube.position.y = Math.sin(elapsedTime) * 0.5
  cube.rotation.y = elapsedTime

  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
```

如果需要速度不受帧率影响，用 `delta`：

```js
const clock = new THREE.Clock()

function animate() {
  const delta = clock.getDelta()

  cube.rotation.y += delta * 1.5

  renderer.render(scene, camera)
}
```

`delta` 是上一帧到当前帧经过的秒数。

## Raycaster 鼠标点击 3D 物体

`Raycaster` 可以从相机发出一条射线，判断鼠标点中了哪个 3D 物体。

```js
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

const objects = [cube, sphere]

window.addEventListener('click', (event) => {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1

  raycaster.setFromCamera(pointer, camera)

  const intersects = raycaster.intersectObjects(objects)

  if (intersects.length > 0) {
    const selected = intersects[0].object
    selected.material.color.set('#f97316')
  }
})
```

这里的鼠标坐标必须转换成标准设备坐标：

```text
x 范围：-1 到 1
y 范围：-1 到 1
左下角不是原点，屏幕中心是 0,0
```

## 加载 glTF 模型

实际项目中最常用的 3D 模型格式是 `glTF / glb`。

这里示例里的 `/models/robot.glb` 不是 Three.js 自带的模型，而是我们假设项目里有一个机器人模型文件。

在 Vite 项目里，如果模型放在：

```text
public/models/robot.glb
```

代码里就用：

```js
loader.load('/models/robot.glb', ...)
```

这个模型的作用是：代替我们手写的 `BoxGeometry`、`SphereGeometry` 这些简单几何体，直接加载一个已经做好的复杂 3D 物体。一个 `glb` 文件里可能包含：

```text
模型层级
网格 Mesh
材质 Material
贴图 Texture
骨骼 Skeleton
动画 Animation
相机 Camera
灯光 Light
```

`GLTFLoader` 加载完成后，最常用的是取出 `gltf.scene`，它就是一个可以直接加入 Three.js 场景的 `Object3D`。

```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const loader = new GLTFLoader()

loader.load(
  '/models/robot.glb',
  (gltf) => {
    const model = gltf.scene
    model.position.set(0, 0, 0)
    model.scale.set(1, 1, 1)

    scene.add(model)
  },
  (event) => {
    const progress = (event.loaded / event.total) * 100
    console.log(`模型加载进度：${progress.toFixed(1)}%`)
  },
  (error) => {
    console.error('模型加载失败', error)
  }
)
```

### 模型需要自己做吗

不一定。Three.js 开发里，模型来源通常有 3 种：

```text
学习阶段：直接用第三方免费模型，先把 Three.js 流程跑通
真实项目：设计师或 3D 建模师提供模型，前端负责加载、交互、性能优化
个人项目：可以自己用 Blender 做简单模型，再导出 glb 给 Three.js 使用
```

所以前端小白刚学 Three.js，不需要一开始就会专业建模。你先知道“模型文件从哪里来、怎么放进项目、怎么加载出来、怎么调大小和位置”就够了。

### 第三方模型从哪里找

常见模型来源：

```text
Three.js examples models：适合学习，很多官方示例模型
Sketchfab：模型很多，有免费也有付费，下载前看清许可证
Poly Haven：有模型、HDRI、纹理，适合做真实感场景
Kenney：偏游戏资产，风格统一，适合练小游戏和低多边形场景
Mixamo：适合找人物模型和人物动画
公司设计资源：真实业务里最常见，通常由设计或 3D 同事交付
```

下载模型时优先选：

```text
glb
gltf
fbx
obj
```

Three.js 最推荐直接用 `glb / glTF`。如果你拿到的是 `fbx / obj`，也能加载，但通常还要处理材质、贴图路径、动画兼容等问题。对小白来说，能选 `glb` 就选 `glb`。

下载第三方模型一定要注意许可证：

```text
能不能商用
要不要署名
能不能二次修改
能不能放到自己的项目里公开分发
```

建议把来源记录放在模型旁边：

```text
public/models/robot.glb
public/models/robot-LICENSE.txt
public/models/robot-source.txt
```

### 自己做模型用什么工具

小白最推荐用 `Blender`，因为它免费、功能完整、教程多，并且可以直接导出 `glb / glTF`。

其他常见工具：

```text
Blender：免费，最适合个人学习和 Web 3D
Cinema 4D：设计行业常见，适合动效和视觉设计
Maya：影视、动画、角色绑定常见
3ds Max：建筑、室内、工业场景常见
Substance Painter：专业贴图绘制工具，常和 Blender / Maya 搭配
```

如果只是学 Three.js，不用一开始学很深的建模软件。会用 Blender 做一个简单桌子、杯子、机器人，再导出 `glb`，已经足够配合前端练习。

### 用 Blender 做一个模型的大概流程

以做一个简单机器人为例：

```text
1. 建模：用立方体、球体、圆柱体拼出身体、头、手、脚
2. 调整结构：移动、缩放、旋转每个部件，让比例看起来正常
3. 命名对象：比如 head、body、leftArm、rightArm，方便代码里查找
4. 添加材质：给身体、眼睛、关节设置不同颜色和粗糙度
5. UV 和贴图：复杂模型需要展开 UV，再贴颜色图、法线图、粗糙度图
6. 优化面数：Web 项目不要模型太重，面数和贴图都要控制
7. 设置原点：让模型中心点在合理位置，方便 Three.js 旋转和缩放
8. 应用变换：导出前应用位置、旋转、缩放，避免导入后比例混乱
9. 导出 glb：Blender 里选择 File -> Export -> glTF 2.0
10. 放入项目：把导出的 robot.glb 放到 public/models/robot.glb
```

Blender 导出时，小白可以先这样选：

```text
Format：glTF Binary (.glb)
Include：Selected Objects
Transform：默认即可，遇到朝向问题再调整
Data：勾选材质、贴图
Animation：如果做了动画就勾选
```

`.glb` 是单文件，模型、材质、贴图可以打包在一起，最适合前端学习。`.gltf` 通常会拆成 `.gltf + .bin + textures` 多个文件，管理起来更麻烦。

### 加载带动画的模型

如果模型里有动画，比如人物走路、机器人挥手，`gltf.animations` 里会有动画片段。Three.js 里要用 `AnimationMixer` 播放。

```js
let mixer = null

loader.load('/models/robot.glb', (gltf) => {
  const model = gltf.scene
  centerModel(model)
  scene.add(model)

  if (gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(model)
    const action = mixer.clipAction(gltf.animations[0])
    action.play()
  }
})
```

动画循环里更新：

```js
const clock = new THREE.Clock()

function animate() {
  const delta = clock.getDelta()

  if (mixer) {
    mixer.update(delta)
  }

  renderer.render(scene, camera)
}

renderer.setAnimationLoop(animate)
```

如果模型太大、太小、偏离中心，可以先用包围盒自动居中：

```js
function centerModel(model) {
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  model.position.sub(center)

  const maxSize = Math.max(size.x, size.y, size.z)
  const scale = 2 / maxSize
  model.scale.setScalar(scale)
}
```

使用：

```js
loader.load('/models/robot.glb', (gltf) => {
  const model = gltf.scene
  centerModel(model)
  scene.add(model)
})
```

## 参考文档

- [Three.js 官方文档](https://threejs.org/docs/)
- [Three.js 官方手册](https://threejs.org/manual/)
- [Three.js examples](https://threejs.org/examples/)
- [OrbitControls 文档](https://threejs.org/docs/#examples/en/controls/OrbitControls)
- [GLTFLoader 文档](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [WebGLRenderer 文档](https://threejs.org/docs/#api/en/renderers/WebGLRenderer)
- [Khronos glTF 说明](https://www.khronos.org/gltf/)
- [Blender glTF 2.0 导入导出文档](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html)
- [Sketchfab 3D Models](https://sketchfab.com/3d-models)
- [Poly Haven Models](https://polyhaven.com/models)
- [Kenney Assets](https://kenney.nl/assets)
- [Mixamo](https://www.mixamo.com/)
