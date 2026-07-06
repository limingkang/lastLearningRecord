Python常用于自动化脚本、数据处理、爬虫、Web 后端、AI、办公提效、测试工具、运维脚本等场景。大概的流程是：
```text
安装 Python
-> 配置编辑器
-> 创建虚拟环境
-> 运行第一个程序
-> 变量和数据类型
-> 条件判断和循环
-> 列表 / 元组 / 字典 / 集合
-> 函数
-> 模块和包
-> 文件读写
-> 异常处理
-> 类和对象
-> 常用标准库
-> pip 安装第三方库
```

## 环境搭建

### 安装 Python

进入 Python 官网下载并安装：

```text
https://www.python.org/downloads/
```

Windows 安装时注意勾选：

```text
Add python.exe to PATH
```

安装完成后，打开终端检查：

```bash
python --version
```

如果 Windows 上 `python` 不生效，可以试：

```bash
py --version
```

如果能看到类似下面的输出，说明安装成功：

```text
Python 3.x.x
```

学习阶段建议使用 Python 3，不要再学 Python 2。

### 安装编辑器
编辑器用VS Code，建议安装这些插件：
```text
Python
Pylance
Jupyter
```
### 第一个 Python 程序
新建文件：
```text
hello.py
```
写入：
```python
print("Hello Python")
print("hello world")
```
运行：
```bash
python hello.py
```

## 虚拟环境

虚拟环境可以理解成“每个项目自己独立的一套 Python 依赖”。这样项目 A 安装的库不会影响项目 B。

在项目目录里创建虚拟环境：

```bash
python -m venv .venv
```

Windows PowerShell 激活：

```bash
.\.venv\Scripts\Activate.ps1
```

Windows CMD 激活：

```bash
.\.venv\Scripts\activate.bat
```

macOS / Linux 激活：

```bash
source .venv/bin/activate
```

激活后，命令行前面通常会出现：

```text
(.venv)
```

退出虚拟环境：

```bash
deactivate
```

以后安装第三方库，尽量在虚拟环境里安装。

## pip 包管理

`pip` 是 Python 常用的包管理工具，用来安装第三方库。

查看 pip 版本：

```bash
python -m pip --version
```

升级 pip：

```bash
python -m pip install --upgrade pip
```

安装库：

```bash
python -m pip install requests
```

查看已安装的库：

```bash
python -m pip list
```

导出依赖：

```bash
python -m pip freeze > requirements.txt
```

根据依赖文件安装：

```bash
python -m pip install -r requirements.txt
```

建议用 `python -m pip`，它能更明确地使用当前 Python 环境里的 pip。

## Python 基础语法

### 注释

```python
# 这是单行注释

"""
这是多行字符串。
有时也会被初学者当作多行注释使用。
"""
```

### 变量

Python 变量不需要提前声明类型。

```python
name = "小明"
age = 18
height = 1.75
is_student = True

print(name)
print(age)
print(height)
print(is_student)
```

变量命名建议：

```text
用英文
用小写字母
多个单词用下划线连接
见名知意
```

示例：

```python
user_name = "Tom"
total_price = 99.8
is_login = False
```

### 常见数据类型

```python
name = "Tom"       # str 字符串
age = 20           # int 整数
price = 19.99      # float 小数
is_ok = True       # bool 布尔值
empty = None       # None 空值
```

查看类型：

```python
print(type(name))
print(type(age))
print(type(price))
print(type(is_ok))
print(type(empty))
```

### 类型转换

```python
age_text = "18"
age = int(age_text)

price_text = "19.99"
price = float(price_text)

count = 100
count_text = str(count)

print(age + 1)
print(price * 2)
print("数量：" + count_text)
```

注意：字符串和数字不能直接相加。

```python
age = 18

# 错误写法
# print("年龄：" + age)

# 正确写法
print("年龄：" + str(age))
print(f"年龄：{age}")
```

### 字符串

字符串可以用单引号或双引号。

```python
name1 = "Tom"
name2 = 'Jerry'
```

常用操作：

```python
text = "hello python"

print(text.upper())       # HELLO PYTHON
print(text.lower())       # hello python
print(text.title())       # Hello Python
print(text.replace("python", "world"))
print(text.startswith("hello"))
print(text.endswith("python"))
print(len(text))
```

字符串切片：

```python
text = "Python"

print(text[0])      # P
print(text[1])      # y
print(text[-1])     # n
print(text[0:3])    # Pyt
print(text[:3])     # Pyt
print(text[3:])     # hon
```

格式化字符串推荐用 f-string：

```python
name = "小明"
score = 95

print(f"{name} 的分数是 {score}")
```

### 运算符

```python
a = 10
b = 3

print(a + b)   # 加
print(a - b)   # 减
print(a * b)   # 乘
print(a / b)   # 除，结果是小数
print(a // b)  # 整除
print(a % b)   # 取余
print(a ** b)  # 幂运算
```

比较运算：

```python
print(10 > 3)
print(10 >= 10)
print(10 == 10)
print(10 != 3)
```

逻辑运算：

```python
age = 20
has_ticket = True

print(age >= 18 and has_ticket)
print(age < 18 or has_ticket)
print(not has_ticket)
```

### 条件判断

Python 用缩进表示代码块，一般使用 4 个空格。

```python
age = 18

if age >= 18:
    print("成年人")
else:
    print("未成年人")
```

多条件：

```python
score = 86

if score >= 90:
    print("优秀")
elif score >= 80:
    print("良好")
elif score >= 60:
    print("及格")
else:
    print("不及格")
```

判断空值：

```python
name = ""

if name:
    print("有名字")
else:
    print("名字为空")
```

下面这些值在条件判断里会被当作 `False`：

```text
False
None
0
""
[]
{}
set()
```

### for 循环

```python
for i in range(5):
    print(i)
```

输出：

```text
0
1
2
3
4
```

指定范围：

```python
for i in range(1, 6):
    print(i)
```

指定步长：

```python
for i in range(0, 10, 2):
    print(i)
```

遍历列表：

```python
names = ["Tom", "Jerry", "Alice"]

for name in names:
    print(name)
```

同时拿到下标和值：

```python
names = ["Tom", "Jerry", "Alice"]

for index, name in enumerate(names):
    print(index, name)
```

### while 循环

```python
count = 0

while count < 5:
    print(count)
    count += 1
```

### break 和 continue

```python
for i in range(10):
    if i == 3:
        continue
    if i == 8:
        break
    print(i)
```

`continue` 跳过本次循环，`break` 结束整个循环。

### 列表 list

列表用来存一组有顺序的数据。

```python
fruits = ["apple", "banana", "orange"]

print(fruits[0])
print(fruits[-1])
```

常用操作：

```python
fruits = ["apple", "banana"]

fruits.append("orange")
fruits.insert(0, "pear")
fruits.remove("banana")

last = fruits.pop()

print(fruits)
print(last)
```

列表切片：

```python
nums = [1, 2, 3, 4, 5]

print(nums[0:3])
print(nums[:3])
print(nums[2:])
print(nums[::-1])
```

列表推导式：

```python
nums = [1, 2, 3, 4, 5]

squares = [num * num for num in nums]
even_nums = [num for num in nums if num % 2 == 0]

print(squares)
print(even_nums)
```

### 元组 tuple

元组和列表类似，但是创建后不能修改。

```python
point = (10, 20)

print(point[0])
print(point[1])
```

适合表示不希望被改动的数据，比如坐标、固定配置。

### 字典 dict

字典用来存键值对。

```python
user = {
    "name": "Tom",
    "age": 18,
    "city": "Shanghai"
}

print(user["name"])
print(user.get("age"))
```

添加和修改：

```python
user["age"] = 19
user["email"] = "tom@example.com"
```

删除：

```python
del user["city"]
```

遍历字典：

```python
for key, value in user.items():
    print(key, value)
```

常见安全取值：

```python
score = user.get("score", 0)
print(score)
```

如果用 `user["score"]`，键不存在会报错；用 `get` 可以给默认值。

### 集合 set

集合的特点是：无序、不重复。

```python
tags = {"python", "web", "python"}

print(tags)
```

常用来去重：

```python
nums = [1, 2, 2, 3, 3, 3]
unique_nums = list(set(nums))

print(unique_nums)
```

集合运算：

```python
a = {1, 2, 3}
b = {3, 4, 5}

print(a | b)  # 并集
print(a & b)  # 交集
print(a - b)  # 差集
```

### 函数

函数用来封装一段可以重复使用的逻辑。

```python
def say_hello():
    print("hello")

say_hello()
```

带参数：

```python
def greet(name):
    print(f"你好，{name}")

greet("小明")
```

返回值：

```python
def add(a, b):
    return a + b

result = add(3, 5)
print(result)
```

默认参数：

```python
def create_user(name, role="user"):
    return {
        "name": name,
        "role": role
    }

print(create_user("Tom"))
print(create_user("Alice", "admin"))
```

关键字参数：

```python
def order(name, price, count):
    total = price * count
    print(f"{name} 总价：{total}")

order(name="苹果", price=5, count=3)
```

### 作用域

函数内部定义的变量，默认只能在函数内部使用。

```python
def demo():
    message = "hello"
    print(message)

demo()

# 这里访问不到 message
# print(message)
```

如果函数外部也需要使用，就用 `return` 返回。

```python
def build_message(name):
    return f"你好，{name}"

message = build_message("小明")
print(message)
```

### 模块和包

一个 `.py` 文件就是一个模块。

例如有文件：

```text
math_utils.py
```

内容：

```python
def add(a, b):
    return a + b

def multiply(a, b):
    return a * b
```

在另一个文件中使用：

```python
import math_utils

print(math_utils.add(1, 2))
print(math_utils.multiply(3, 4))
```

也可以这样导入：

```python
from math_utils import add

print(add(1, 2))
```

常见入口写法：

```python
def main():
    print("程序开始运行")

if __name__ == "__main__":
    main()
```

这表示：只有直接运行当前文件时，才执行 `main()`。

### 写入文本文件

```python
with open("hello.txt", "w", encoding="utf-8") as file:
    file.write("你好，Python\n")
    file.write("这是第二行\n")
```

### 读取文本文件

```python
with open("hello.txt", "r", encoding="utf-8") as file:
    content = file.read()

print(content)
```

### 按行读取

```python
with open("hello.txt", "r", encoding="utf-8") as file:
    for line in file:
        print(line.strip())
```

### 追加写入

```python
with open("hello.txt", "a", encoding="utf-8") as file:
    file.write("追加一行\n")
```

文件模式：

```text
r：读取
w：写入，会覆盖原文件
a：追加
rb：读取二进制
wb：写入二进制
```

### JSON 处理

JSON 是前后端、配置文件、接口数据里很常见的数据格式。

```python
import json

user = {
    "name": "Tom",
    "age": 18,
    "skills": ["Python", "JavaScript"]
}

json_text = json.dumps(user, ensure_ascii=False, indent=2)
print(json_text)
```

写入 JSON 文件：

```python
import json

user = {
    "name": "Tom",
    "age": 18
}

with open("user.json", "w", encoding="utf-8") as file:
    json.dump(user, file, ensure_ascii=False, indent=2)
```

读取 JSON 文件：

```python
import json

with open("user.json", "r", encoding="utf-8") as file:
    user = json.load(file)

print(user["name"])
```

### 异常处理

程序运行时可能报错，比如文件不存在、网络失败、用户输入不合法。

```python
try:
    num = int(input("请输入一个数字："))
    print(10 / num)
except ValueError:
    print("输入的不是数字")
except ZeroDivisionError:
    print("不能除以 0")
else:
    print("没有发生异常")
finally:
    print("程序结束")
```

常见异常：

```text
ValueError：值不合法
TypeError：类型错误
KeyError：字典键不存在
IndexError：列表下标越界
FileNotFoundError：文件不存在
ZeroDivisionError：除以 0
```

主动抛出异常：

```python
def set_age(age):
    if age < 0:
        raise ValueError("年龄不能小于 0")
    return age
```

### 类和对象

类可以理解成对象的模板。

```python
class User:
    def __init__(self, name, age):
        self.name = name
        self.age = age

    def say_hello(self):
        print(f"你好，我是 {self.name}")

user = User("Tom", 18)
print(user.name)
user.say_hello()
```

说明：

```text
class：定义类
__init__：创建对象时自动执行
self：代表当前对象自己
self.name：对象属性
say_hello：对象方法
```

### 继承

```python
class Animal:
    def __init__(self, name):
        self.name = name

    def speak(self):
        print("动物发出声音")

class Dog(Animal):
    def speak(self):
        print(f"{self.name} 汪汪叫")

dog = Dog("小黑")
dog.speak()
```

### dataclass

如果只是用来存数据，可以用 `dataclass`，代码更简洁。

```python
from dataclasses import dataclass

@dataclass
class Product:
    name: str
    price: float
    count: int

    def total_price(self):
        return self.price * self.count

product = Product("苹果", 5.5, 3)
print(product)
print(product.total_price())
```

### 类型标注

Python 不强制类型，但类型标注能让代码更清楚，也方便编辑器提示。

```python
def add(a: int, b: int) -> int:
    return a + b

name: str = "Tom"
age: int = 18
scores: list[int] = [80, 90, 100]
```

函数返回字典：

```python
def create_user(name: str, age: int) -> dict[str, str | int]:
    return {
        "name": name,
        "age": age
    }
```

小白不用一开始就写满类型标注，但函数参数和返回值建议逐步加上。

## 常用标准库

Python 自带很多标准库，不需要额外安装。

### pathlib 路径处理

```python
from pathlib import Path

current_dir = Path(".")
file_path = current_dir / "hello.txt"

print(file_path.exists())
print(file_path.resolve())
```

创建目录：

```python
from pathlib import Path

output_dir = Path("output")
output_dir.mkdir(exist_ok=True)
```

### datetime 时间处理

```python
from datetime import datetime, timedelta

now = datetime.now()
tomorrow = now + timedelta(days=1)

print(now.strftime("%Y-%m-%d %H:%M:%S"))
print(tomorrow)
```

### random 随机数

```python
import random

print(random.randint(1, 10))
print(random.choice(["apple", "banana", "orange"]))
```

### os 环境和系统信息

```python
import os

print(os.getcwd())
print(os.environ.get("PATH"))
```

### sys 命令行参数

```python
import sys

print(sys.argv)
```

例如运行：

```bash
python app.py hello
```

`sys.argv` 里会包含脚本名和传入的参数。

## 第三方库入门

Python 强大的地方之一是第三方库很多。

常见方向：

```text
requests：发送 HTTP 请求
beautifulsoup4：解析 HTML
pandas：表格和数据分析
openpyxl：读写 Excel
fastapi：写 Web API
flask：轻量 Web 后端
pytest：自动化测试
```

安装示例：

```bash
python -m pip install requests
```

发送请求：

```python
import requests

response = requests.get("https://httpbin.org/get", timeout=10)

print(response.status_code)
print(response.json())
```

注意：第三方库不是 Python 自带的。别人运行你的项目时，需要先根据 `requirements.txt` 安装依赖。


## 项目架构

下面这套结构更接近真实生产项目，适合中大型 Python 后端服务、数据服务、企业内部系统、自动化平台、AI 应用服务等。这类项目的核心分层思路是：

```text
api 层：接收 HTTP 请求，做参数校验和路由分发
application 层：编排业务流程，处理用例
domain 层：放真正的业务规则，不依赖数据库和框架
infrastructure 层：对接数据库、缓存、消息队列、第三方服务
workers/jobs 层：处理异步任务和定时任务
tests 层：保证代码长期可维护
```

```text
enterprise_python_service/
  README.md
  pyproject.toml
  poetry.lock
  .python-version
  .env.example
  .gitignore
  Makefile
  Dockerfile
  docker-compose.yml
  alembic.ini

  src/
    app/
      __init__.py
      main.py
      asgi.py
      cli.py

      api/
        __init__.py
        deps.py
        routers/
          __init__.py
          health.py
          users.py
          orders.py
          files.py
        schemas/
          __init__.py
          common.py
          user_schema.py
          order_schema.py
          file_schema.py

      core/
        __init__.py
        config.py
        logging.py
        security.py
        exceptions.py
        middleware.py
        pagination.py
        response.py

      domain/
        __init__.py
        users/
          __init__.py
          entities.py
          value_objects.py
          repositories.py
          services.py
          events.py
          exceptions.py
      application/
        __init__.py
        users/
          __init__.py
          commands.py
          queries.py
          handlers.py
          dto.py

      infrastructure/
        __init__.py
        db/
          __init__.py
          base.py
          session.py
          models/
            __init__.py
            user_model.py
            order_model.py
          repositories/
            __init__.py
            user_repository.py
            order_repository.py
        cache/
          __init__.py
          redis_client.py
        message_queue/
          __init__.py
          producer.py
          consumer.py
        storage/
          __init__.py
          local_storage.py
          s3_storage.py
        http/
          __init__.py
          client.py
          payment_client.py
        email/
          __init__.py
          sender.py

      workers/
        __init__.py
        celery_app.py
        tasks/
          __init__.py
          email_tasks.py
          order_tasks.py

      jobs/
        __init__.py
        daily_report.py
        clean_expired_data.py

      utils/
        __init__.py
        datetime_utils.py
        file_utils.py
        id_utils.py
        json_utils.py

  migrations/
    env.py
    script.py.mako
    versions/
      202607060001_create_users.py
      202607060002_create_orders.py

  tests/
    __init__.py
    conftest.py
    unit/
      test_user_domain_service.py
      test_order_domain_service.py
    integration/
      test_user_repository.py
      test_order_api.py
    e2e/
      test_order_flow.py
    factories/
      user_factory.py
      order_factory.py

  scripts/
    seed_db.py
    create_admin.py
    export_report.py
    run_worker.py

  deploy/
    nginx.conf
    gunicorn_conf.py
    supervisord.conf
    k8s/
      deployment.yaml
      service.yaml
      ingress.yaml
      configmap.yaml
      secret.example.yaml

  docs/
    architecture.md
    api.md
    database.md
    deployment.md

  data/
    .gitkeep
  logs/
    .gitkeep
```

```text
pyproject.toml
```

现代 Python 项目的核心配置文件。可以管理项目名称、版本、Python 版本要求、依赖、格式化工具、类型检查工具、测试工具配置等。大型项目一般优先使用它，而不是只依赖零散配置文件。

```text
poetry.lock
```

依赖锁定文件。记录每个依赖的精确版本，保证本地、测试环境、生产环境安装出来的依赖一致。如果使用 `uv`，也可能是 `uv.lock`。

```text
.python-version
```

记录项目使用的 Python 版本，比如 `3.12.4`。团队成员可以用 `pyenv` 或类似工具自动切换版本。


```text
Makefile
```

把常用命令统一封装起来。比如 `make dev`、`make test`、`make lint`、`make migrate`。团队协作时，大家不用记一堆长命令。

```text
Dockerfile
```

定义如何把项目构建成 Docker 镜像。生产部署、测试环境、CI/CD 都经常依赖它。

```text
docker-compose.yml
```

本地开发环境编排文件。可以一键启动应用、数据库、Redis、消息队列等依赖服务。

```text
alembic.ini
```

Alembic 数据库迁移工具的配置文件。大型后端项目会用它管理数据库表结构变更。

### src/app 入口层

```text
src/
```

源码根目录。把真实业务代码放进 `src`，可以避免测试、脚本、配置文件和应用代码混在一起。

```text
src/app/
```

应用主包。`app` 可以替换成真实业务名，比如 `payment_service`、`crm_backend`、`ai_platform`。

```text
src/app/__init__.py
```

声明 `app` 是 Python 包。也可以放项目版本号，但大型项目里通常保持简单。

```text
src/app/main.py
```

应用主入口。以 FastAPI 为例，这里通常创建 `app` 实例，注册路由、中间件、异常处理器。它负责启动装配，不负责写具体业务。

```text
src/app/asgi.py
```

ASGI 服务器入口。部署到 `uvicorn`、`gunicorn`、`hypercorn` 时会引用它，例如 `app.asgi:application`。

```text
src/app/cli.py
```

命令行入口。用于提供内部管理命令，比如初始化数据、创建管理员、手动触发任务等。

### api 接口层

```text
src/app/api/
```

HTTP API 层。负责接收请求、参数校验、权限依赖、响应返回。它应该尽量薄，不要写复杂业务。

```text
src/app/api/deps.py
```

API 依赖注入文件。常见内容包括：获取当前用户、校验权限、获取数据库会话、获取分页参数等。

```text
src/app/api/routers/
```

路由目录。按业务模块拆分接口，不要把所有接口都写在一个文件里。

```text
src/app/api/routers/health.py
```

健康检查接口。用于监控系统判断服务是否存活，比如 `/health`、`/ready`。

```text
src/app/api/schemas/
```

接口入参和出参结构。FastAPI 项目一般用 Pydantic model。它描述“接口层的数据长什么样”，不等于数据库模型。

```text
src/app/api/schemas/common.py
```

通用接口结构。比如分页参数、分页响应、统一错误响应。

```text
src/app/api/schemas/user_schema.py
```

用户接口的数据结构。比如 `CreateUserRequest`、`UserResponse`、`UpdateUserRequest`。

```text
src/app/api/schemas/order_schema.py
```

订单接口的数据结构。比如 `CreateOrderRequest`、`OrderDetailResponse`。

### core 核心基础设施

```text
src/app/core/
```

项目核心配置和基础能力目录。这里放跨模块都会用到的东西。

```text
src/app/core/config.py
```

配置读取。负责从环境变量、`.env`、配置中心读取数据库地址、Redis 地址、运行环境、密钥等。

```text
src/app/core/logging.py
```

日志配置。定义日志格式、日志级别、输出到控制台还是文件、是否接入日志平台。

```text
src/app/core/security.py
```

安全相关工具。比如密码哈希、JWT 生成和校验、权限判断、签名校验。

```text
src/app/core/exceptions.py
```

全局异常定义。比如业务异常、权限异常、资源不存在异常、第三方服务异常。

```text
src/app/core/middleware.py
```

中间件。比如请求日志、跨域、请求 ID、耗时统计、异常捕获。

```text
src/app/core/pagination.py
```

分页工具。统一分页参数和分页响应结构，避免每个接口都重复写分页逻辑。

```text
src/app/core/response.py
```

统一响应格式。比如所有接口都返回 `{ code, message, data }` 这种结构时，可以放这里。

### domain 领域层

```text
src/app/domain/
```

领域层，放真正的业务规则。它应该尽量不依赖 FastAPI、SQLAlchemy、Redis 等外部框架。这样业务规则更稳定，也更容易测试。

```text
src/app/domain/users/entities.py
```

用户领域实体。描述用户在业务里的核心属性和行为，例如用户是否可登录、是否已禁用。

```text
src/app/domain/users/value_objects.py
```

值对象。比如邮箱、手机号、金额、地址这类有校验规则但没有独立生命周期的数据。


### application 应用层

```text
src/app/application/
```

应用层负责“编排一个完整用例”。它会调用领域层、仓储接口、第三方服务，但不直接处理 HTTP 细节。

```text
src/app/application/users/commands.py
```

命令对象。表示会改变系统状态的操作，比如创建用户、修改用户、禁用用户。

```text
src/app/application/users/queries.py
```

### infrastructure 基础设施层

```text
src/app/infrastructure/
```

基础设施层。负责和外部世界打交道，包括数据库、缓存、消息队列、对象存储、第三方 HTTP 服务、邮件服务等。

```text
src/app/infrastructure/db/base.py
```

数据库模型基类。SQLAlchemy 项目里常放 `Base`、元数据、模型注册等。

```text
src/app/infrastructure/db/session.py
```

数据库连接和会话管理。比如创建 engine、SessionLocal、事务上下文。

```text
src/app/infrastructure/db/models/
```

数据库 ORM 模型目录。描述数据库表结构。它和 domain entity 不一定是同一个东西。


### workers 和 jobs

```text
src/app/workers/
```

异步任务目录。适合放 Celery、RQ、Dramatiq 等任务队列相关代码。

```text
src/app/workers/celery_app.py
```

Celery 应用配置。定义 broker、backend、任务发现路径、序列化方式等。

```text
src/app/workers/tasks/email_tasks.py
```

邮件相关异步任务。比如发送注册邮件、发送报表邮件。

```text
src/app/workers/tasks/order_tasks.py
```

订单相关异步任务。比如订单超时关闭、支付状态同步。

```text
src/app/jobs/
```

定时任务目录。和 workers 不同，jobs 更偏“按时间触发”。

```text
src/app/jobs/daily_report.py
```

### utils 工具层

```text
src/app/utils/
```

通用工具函数目录。只放和业务关系不强、可以复用的函数。

```text
src/app/utils/datetime_utils.py
```

时间处理工具。比如时间格式化、时区转换、日期范围计算。

### migrations 数据库迁移

```text
migrations/
```

数据库迁移目录。用于记录数据库表结构变化，通常由 Alembic 管理。

```text
migrations/env.py
```

Alembic 运行环境配置。负责加载数据库连接、模型元数据等。

```text
migrations/script.py.mako
```

迁移文件模板。Alembic 生成新迁移脚本时会用到。

```text
migrations/versions/
```

具体迁移脚本目录。每次新增表、改字段、加索引，都会生成一个版本文件。

```text
migrations/versions/202607060001_create_users.py
```

创建用户表的迁移脚本。

```text
migrations/versions/202607060002_create_orders.py
```

创建订单表的迁移脚本。

### tests 测试目录

```text
tests/
```

测试代码目录。大型项目必须有测试，否则后期修改很容易引入问题。

```text
tests/conftest.py
```

pytest 公共配置。常放测试数据库、测试客户端、mock 对象、fixture。

```text
tests/unit/
```

单元测试。只测一个函数、一个类、一个领域服务，速度快，不依赖真实数据库和外部服务。

```text
tests/integration/
```

集成测试。测试多个模块协作，比如 API + 数据库、仓储 + 数据库。

```text
tests/e2e/
```

端到端测试。从真实接口入口测试完整业务流程，比如创建订单到支付完成。

```text
tests/factories/
```

测试数据工厂。统一创建用户、订单、商品等测试对象，避免测试里重复造数据。

### scripts 脚本目录

```text
scripts/
```

项目辅助脚本目录。脚本可以调用应用代码，但不属于正式业务入口。

```text
scripts/seed_db.py
```

初始化测试数据或开发数据。

```text
scripts/create_admin.py
```

创建管理员账号。

```text
scripts/export_report.py
```

导出报表脚本。适合临时运营、财务、数据导出需求。

```text
scripts/run_worker.py
```

启动 worker 的辅助脚本。也可以直接通过命令行工具启动。

### deploy 部署目录

```text
deploy/
```

部署相关配置目录。把部署配置和业务代码分开。

```text
deploy/nginx.conf
```

Nginx 配置。用于反向代理、静态文件、负载均衡等。

```text
deploy/gunicorn_conf.py
```

Gunicorn 配置。用于生产环境启动 Python Web 服务。

```text
deploy/supervisord.conf
```

Supervisor 配置。用于传统服务器上管理进程。

```text
deploy/k8s/
```

Kubernetes 部署配置目录。

```text
deploy/k8s/deployment.yaml
```

K8s Deployment，定义应用副本、镜像、资源限制、环境变量等。

```text
deploy/k8s/service.yaml
```

K8s Service，定义服务如何在集群内暴露。

```text
deploy/k8s/ingress.yaml
```

K8s Ingress，定义外部域名如何访问服务。

```text
deploy/k8s/configmap.yaml
```

非敏感配置。比如运行环境、普通开关配置。

```text
deploy/k8s/secret.example.yaml
```

敏感配置示例。真实 secret 不要直接提交仓库。

### 大型项目分层依赖规则

真实大型项目最重要的不是目录多，而是依赖方向要清楚。推荐依赖方向：

```text
api -> application -> domain
application -> infrastructure
infrastructure -> domain
```
尽量避免：
```text
domain 直接依赖 FastAPI
domain 直接依赖 SQLAlchemy
domain 直接读取 Redis
domain 直接调用第三方 HTTP API
api 层直接写复杂业务
main.py 里堆满业务逻辑
```

## 参考文档

- [Python 官方教程](https://docs.python.org/3/tutorial/index.html)
- [Python 标准库文档](https://docs.python.org/3/library/index.html)
- [venv 官方文档](https://docs.python.org/3/library/venv.html)
- [Python Packaging User Guide](https://packaging.python.org/en/latest/tutorials/installing-packages/)
