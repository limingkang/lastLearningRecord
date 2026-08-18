> 本文服务器命令默认以 Ubuntu/Debian 为例。Windows 是本地开发环境，真正部署时建议使用 Linux 服务器或 Linux 容器。

## 先建立完整的请求链路

用户在浏览器输入 `https://docs.example.com` 后，请求通常会经过：

```text
浏览器
  -> DNS：把域名解析成 IP
  -> CDN/WAF：可选，缓存和安全防护
  -> 云安全组/防火墙：判断端口是否允许访问
  -> Nginx：终止 HTTPS、提供静态文件、代理 API
  -> 前端静态文件或应用服务
  -> 后端 API
  -> MySQL / Redis / 对象存储
```

每一层都可能产生不同问题：

| 现象 | 优先检查 |
| --- | --- |
| 域名完全打不开 | DNS、服务器 IP、安全组、80/443 端口 |
| IP 能访问，域名不能访问 | DNS 记录、Nginx `server_name` |
| 首页能打开，刷新子路由 `404` | Nginx SPA 回退配置 |
| 页面请求 API 返回 `502` | 后端进程、端口、Nginx `proxy_pass` |
| 浏览器提示跨域 | API 的 CORS 配置、域名、协议和 Cookie |
| 页面还是旧版本 | HTML、CDN、浏览器或 Service Worker 缓存 |
| HTTPS 页面调用 HTTP API 失败 | Mixed Content，API 也必须使用 HTTPS |
| 服务器偶尔不可用 | CPU、内存、磁盘、进程重启和上游超时 |

## Linux 与服务器基础

### 为什么前端也要会 Linux

服务器、Docker 容器和大多数 CI Runner 都运行在 Linux 上。前端不需要成为 Linux 专家，但必须能完成：

- 登录服务器并安全地传输文件。
- 找到项目目录、配置文件和日志。
- 判断进程是否运行、端口是否监听。
- 判断 CPU、内存、磁盘是否异常。
- 启动、停止和重启系统服务。
- 正确设置文件所有者和权限。

### 准备练习环境

推荐从下面三种环境中选一个：

1. Windows 本地使用 WSL2，适合练 Linux 命令和 Nginx。
2. 使用 Linux 虚拟机，适合反复重装和故障演练。
3. 使用一台最低配置的 Ubuntu 云服务器，适合完成域名和 HTTPS 实战。

一台干净的 Ubuntu/Debian 服务器先安装本文会使用的基础工具：

```bash
sudo apt update
sudo apt install -y ca-certificates curl git openssl rsync dnsutils lsof python3
```

其中：

- `dnsutils` 提供 `dig`。
- `lsof` 用于查看端口对应进程。
- `rsync` 用于增量上传发布产物。
- `openssl` 用于检查 TLS 证书。

创建独立部署用户：

```bash
sudo adduser deploy
sudo usermod -aG www-data deploy
```

如果云服务器当前用户已经能通过密钥登录，可以把同一把公钥授权给 `deploy`：

```bash
sudo install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

如果当前用户没有 `~/.ssh/authorized_keys`，应从可信的云控制台或已有管理员会话写入自己的公钥，不要复制私钥到服务器。

需要运行 Node API 时，再创建一个不能交互登录的应用用户：

```bash
sudo adduser --system --group --home /srv/my-app app
```

`deploy` 负责上传和切换版本，`app` 只负责运行应用。不要为了让 CI 方便而直接赋予部署用户无限制的 `sudo` 权限。

本文后续命令使用三种角色，执行前先确认终端中的 `whoami`：

- **管理员账号**：具备 `sudo`，负责安装软件、修改 `/etc`、配置 Nginx/systemd、防火墙和系统目录。
- **`deploy` 账号**：不具备 `sudo`，只负责向管理员预先创建并授权的 release 目录上传产物、校验文件和切换软链接。
- **`app` 账号**：不能交互登录，只由 systemd 用来运行应用进程。

因此，本文所有包含 `sudo`、`apt`、`systemctl`、`nginx -t` 或写入 `/etc` 的命令，都应在管理员会话执行；不要在 `deploy` 会话里反复尝试。CI 使用 `deploy` 时也不需要 `sudo`，因为管理员已经提前准备好目录和权限。

Windows PowerShell 默认没有 `rsync`、`dig` 等 Linux 工具。可以在 WSL 中执行本文命令；普通 SSH 登录也可以直接使用 Windows 自带的 `ssh`。

### SSH 登录

生成本地 SSH 密钥：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/deploy_ed25519 -C "your-name"
ssh-copy-id -i ~/.ssh/deploy_ed25519.pub deploy@203.0.113.10
```

`ssh-copy-id` 可以在 Linux 或 WSL 中使用。Windows PowerShell 没有该命令时，可通过云控制台或已有管理员会话，把 `deploy_ed25519.pub` 的内容追加到 `/home/deploy/.ssh/authorized_keys`。只上传公钥，私钥始终留在本地或 CI Secrets 中。

登录服务器：

```bash
ssh deploy@203.0.113.10
```

指定密钥文件：

```bash
ssh -i ~/.ssh/deploy_ed25519 deploy@203.0.113.10
```

上面的登录只用于验证发布账号和练习发布目录操作。验证完成后输入 `exit`，后续系统初始化仍使用原来的管理员账号登录。推荐为部署创建独立用户，不要长期直接使用 `root`。只有确认密钥登录可用后，才能考虑关闭密码登录，否则很容易把自己锁在服务器外。

### 文件与目录

```bash
pwd                         # 当前目录
ls -lah                     # 包含隐藏文件、权限和大小
cd /srv/my-app              # 切换目录
mkdir -p releases/current   # 创建多级目录
cp -a source target         # 保留属性复制
mv old-name new-name        # 移动或重命名
find /srv/my-app -name '*.log'
```

查看文件内容：

```bash
sudo less /var/log/nginx/error.log
sudo tail -n 100 /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

`tail -f` 会持续等待新日志，按 `Ctrl+C` 退出。

### 用户和权限

查看当前用户：

```bash
whoami
id
```

修改目录所有者：

```bash
sudo chown -R deploy:www-data /srv/my-app
```

常见权限：

```bash
chmod 755 /srv/my-app
chmod 644 /srv/my-app/current/index.html
sudo chmod 600 /etc/my-app.env
```

权限数字含义：

| 数字 | 权限 |
| --- | --- |
| `4` | 读取 `r` |
| `2` | 写入 `w` |
| `1` | 执行 `x` |
| `7` | 读、写、执行 |
| `6` | 读、写 |
| `5` | 读、执行 |

`755` 表示所有者可读写执行，其他用户可读和执行。`644` 常用于普通静态文件。不要为了省事直接使用 `chmod -R 777`。

### 进程、端口和服务

```bash
ps aux | grep nginx
top
free -h
ss -lntp
sudo lsof -i :3000
```

`ss -lntp` 中常见列：

- `LISTEN`：进程正在监听连接。
- `Local Address:Port`：监听地址和端口。
- `0.0.0.0:3000`：所有 IPv4 网卡都能访问。
- `127.0.0.1:3000`：只允许本机访问，适合由 Nginx 反向代理。

使用 systemd 管理服务：

```bash
sudo systemctl status nginx
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl reload nginx
sudo systemctl enable nginx
```

查看服务日志：

```bash
sudo journalctl -u nginx -n 100 --no-pager
sudo journalctl -u nginx -f
```

配置没有变化时不要无意义重启。Nginx 修改配置后通常先检查，再平滑重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

### CPU、内存和磁盘

```bash
uptime
top
free -h
df -h
du -sh /var/log/*
docker system df
```

排查顺序：

1. `df -h` 检查磁盘是否已满。
2. `free -h` 检查可用内存和 Swap。
3. `top` 检查消耗资源最多的进程。
4. 检查日志是否异常增长。
5. 检查容器镜像、构建缓存和数据库文件占用。

不要看到磁盘满就直接执行大范围清理命令。先确认具体目录和文件，再删除可重建的数据。

## DNS、端口、HTTP 与 HTTPS

### IP 与端口

IP 用于定位主机，端口用于定位主机上的服务。常见端口：

| 端口 | 常见用途 |
| --- | --- |
| `22` | SSH |
| `80` | HTTP |
| `443` | HTTPS |
| `3000` | 前端开发服务器或 Node 服务 |
| `3306` | MySQL，不应直接暴露到公网 |
| `6379` | Redis，不应直接暴露到公网 |

生产环境通常只公开 `80` 和 `443`，SSH 的 `22` 最好限制来源 IP。数据库和 Redis 只允许内网或本机访问。

### DNS 记录

| 类型 | 作用 | 示例 |
| --- | --- | --- |
| `A` | 域名指向 IPv4 地址 | `docs.example.com -> 203.0.113.10` |
| `AAAA` | 域名指向 IPv6 地址 | `docs.example.com -> 2001:db8::10` |
| `CNAME` | 域名指向另一个域名 | `www.example.com -> example.com` |
| `TXT` | 域名验证、安全策略等文本信息 | 证书或邮件验证 |

检查解析结果：

```bash
nslookup docs.example.com
dig docs.example.com
dig +short docs.example.com
```

DNS 修改不会保证立即在所有地方生效，因为本地、运营商和递归 DNS 都可能缓存旧结果。

### HTTP 请求和响应

一次 HTTP 请求主要包含：

```text
请求方法 + URL + 请求头 + 请求体
```

一次响应主要包含：

```text
状态码 + 响应头 + 响应体
```

常见状态码：

| 状态码 | 含义 | 常见原因 |
| --- | --- | --- |
| `200` | 成功 | 正常返回 |
| `204` | 成功但没有响应体 | 删除、更新操作 |
| `301/308` | 永久重定向 | HTTP 跳 HTTPS、域名迁移 |
| `302/307` | 临时重定向 | 登录跳转、临时流量切换 |
| `304` | 使用本地缓存 | 条件请求命中 |
| `400` | 请求不合法 | 参数格式错误 |
| `401` | 未认证 | 未登录、Token 无效 |
| `403` | 已认证但无权限 | 角色或资源权限不足 |
| `404` | 资源不存在 | 路径错误、SPA 回退缺失 |
| `429` | 请求过多 | 触发限流 |
| `500` | 应用内部错误 | 未处理异常 |
| `502` | 代理连接上游失败 | 后端没启动、端口错误 |
| `504` | 上游响应超时 | 后端慢查询、网络或超时配置 |

使用 `curl` 排查：

```bash
curl -I https://docs.example.com
curl -v https://docs.example.com
curl -i http://127.0.0.1:3000/health
curl --connect-timeout 3 --max-time 10 https://docs.example.com
```

### HTTPS 做了什么

HTTPS 是运行在 TLS 上的 HTTP，主要提供：

- 加密：中间人无法直接读取内容。
- 完整性：传输内容被篡改时可以被发现。
- 身份验证：证书证明当前服务与域名的关系。

证书正常不代表应用一定安全，它只保护传输链路。登录鉴权、权限校验、XSS 和注入仍需要应用自己处理。

检查证书：

```bash
openssl s_client -connect docs.example.com:443 -servername docs.example.com
```

### CORS 不是网络不通

CORS 是浏览器执行的同源安全策略。下面三部分全部相同才是同源：

```text
协议 + 域名 + 端口
```

例如：

```text
https://admin.example.com
https://api.example.com
```

域名不同，属于跨域。服务器即使已经返回响应，浏览器也可能因为缺少正确的 CORS 响应头而不允许前端代码读取。

带 Cookie 的跨域请求不能把允许来源配置为 `*`，必须返回明确来源并允许凭据。更简单的生产方案通常是由 Nginx 把 `/api` 代理到后端，让页面和接口使用同一个域名。

## 前端构建与生产环境

### 开发服务器不能直接当生产服务器

`npm run dev` 的目标是开发体验，通常包含热更新、源码转换和调试能力。生产部署应该先构建：

```bash
npm ci
npm run build
```

`npm ci` 会严格按照锁文件安装依赖，适合 CI 和可重复构建。提交代码时应该同时提交 `package-lock.json`，但不提交 `node_modules`。

当前 VuePress 项目的产物目录：

```text
docs/.vuepress/dist/
```

构建后先检查：

```bash
ls -lah docs/.vuepress/dist
```

至少应该包含入口 HTML 和静态资源目录。

### 静态站点、SSR 与 API 服务

| 类型 | 运行方式 | 示例 |
| --- | --- | --- |
| 静态站点 | 构建后只部署 HTML、CSS、JS | Vite SPA、VuePress、纯 React SPA |
| SSR 应用 | 服务器必须持续运行 JavaScript 进程 | Next.js、Nuxt SSR |
| API 服务 | 服务器持续运行后端进程 | Node、Java、Go API |

静态站点最适合放到对象存储加 CDN，或由 Nginx 直接提供。SSR 和 API 则需要 systemd、容器或编排平台保持进程运行。

### 环境变量

前端变量要区分两类：

1. 构建时变量：执行 `npm run build` 时被写入静态 JS。
2. 运行时变量：应用启动或页面加载时从服务器配置读取。

Vite 中的 `VITE_*` 变量会进入浏览器代码，例如：

```ini
VITE_API_BASE_URL=https://api.example.com
```

```ts
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;
```

任何进入浏览器的内容都不是秘密。数据库密码、私钥、云密钥和管理 Token 不能放在前端环境变量里。

如果希望同一份静态产物用于多个环境，可以在页面启动时请求 `/runtime-config.json`：

```json
{
  "apiBaseUrl": "/api",
  "environment": "production"
}
```

这样部署时只替换配置文件，不需要重新构建所有 JS。

本仓库当前 `.gitignore` 只忽略了 `dist` 和 `node_modules`。在创建 `.env.production` 等文件前，必须补上：

```text
.env*
!.env.example
```

`.env.example` 只保留变量名和无敏感性的示例值：

```ini
DATABASE_URL=mysql://user:replace_me@db:3306/app
API_TOKEN=replace_me
```

修改后执行下面的命令，确认真实环境文件不会被 Git 跟踪：

```bash
git check-ignore -v .env.production
git status --short
```

`.dockerignore` 只控制哪些文件进入 Docker 构建上下文，不能代替 `.gitignore`。已经提交过的秘密即使后来加入忽略规则，也必须从 Git 跟踪中移除并立即轮换。

### 路径与白屏

部署到域名根路径：

```text
https://docs.example.com/
```

部署到子路径：

```text
https://example.com/docs/
```

子路径部署需要同时检查：

- 构建工具的 `base` 或 `publicPath`。
- Vue Router/React Router 的基础路径。
- Nginx 的 `location` 和 `root/alias`。
- HTML 中 JS、CSS 的真实 URL。

当前仓库的 `base: '/lastLearningRecord/'` 是一个实际示例：

- 部署到 GitHub Pages 项目路径时保留 `/lastLearningRecord/`。
- 部署到 `docs.example.com` 根路径时使用 `/`。

如果两种环境都要发布，可以让配置读取构建环境变量：

> 这是后续独立域名 Docker 和 CI 示例的必做前置。当前 `config.js` 仍然硬编码 `/lastLearningRecord/`，在完成下面修改前，单独设置 `VUEPRESS_BASE=/` 不会产生任何效果。

```js
const slidebar = require('./router');

module.exports = {
  title: '持续学习',
  base: process.env.VUEPRESS_BASE || '/lastLearningRecord/',
  themeConfig: {
    sidebar: slidebar,
  },
};
```

Linux 或 CI 中构建独立域名版本：

```bash
VUEPRESS_BASE=/ node -e "console.log(require('./docs/.vuepress/config').base)"
VUEPRESS_BASE=/ npm run build
```

第一条命令必须输出 `/`。如果仍输出 `/lastLearningRecord/`，说明 `config.js` 还没有真正读取环境变量，此时不要继续部署。

Windows PowerShell 中：

```powershell
$env:VUEPRESS_BASE='/'
node -e "console.log(require('./docs/.vuepress/config').base)"
npm run build
```

如果继续使用 `/lastLearningRecord/`，访问地址、冒烟测试和 Nginx 部署路径也必须带上这个前缀。不能只修改 Nginx，而不重新检查构建后的 HTML 资源地址。

页面白屏时先打开浏览器 Console 和 Network，检查 JS 是否 `404`，不要只盯着页面源码。

### 缓存策略

推荐策略：

| 资源 | 推荐策略 | 原因 |
| --- | --- | --- |
| `index.html` | 不缓存或短缓存 | 必须尽快引用新版本资源 |
| 带内容哈希的 JS/CSS | 一年长缓存，`immutable` | 内容变化时文件名也变化 |
| 不带哈希的配置文件 | 不缓存或短缓存 | 部署时可能直接替换 |
| 用户上传文件 | 按业务制定 | 文件名是否不可变决定缓存时间 |

如果 HTML 被长期缓存，即使新 JS 已经上传，用户仍可能继续请求旧文件名，最终出现白屏或版本不一致。

## 使用 Nginx 部署静态站点

### 安装与目录约定

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable --now nginx
```

建议使用发布目录和软链接：

```text
/srv/last-learning-record/
  releases/
    20260818-100000/
    20260818-120000/
  current -> /srv/last-learning-record/releases/20260818-120000
```

Nginx 永远读取 `current`。发布新版本时上传到新目录，验证后切换软链接；回滚时再把软链接指回旧版本。

创建目录：

```bash
sudo mkdir -p /srv/last-learning-record/releases
sudo chown -R deploy:www-data /srv/last-learning-record
```

本地构建后上传：

```bash
rsync -az docs/.vuepress/dist/ deploy@203.0.113.10:/srv/last-learning-record/releases/20260818-120000/
```

第一次切换版本：

```bash
ln -sfn /srv/last-learning-record/releases/20260818-120000 /srv/last-learning-record/.current-next
mv -Tf /srv/last-learning-record/.current-next /srv/last-learning-record/current
```

在同一文件系统内，最后一步通过重命名替换链接，切换窗口比先删除再创建 `current` 更可靠。`mv -T` 是本文 Ubuntu/GNU 工具环境下的写法。

### 静态站点配置

创建 `/etc/nginx/sites-available/last-learning-record.conf`：

下面配置假设 VuePress 构建时使用 `base: '/'`，站点部署在 `https://docs.example.com/` 根路径：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name docs.example.com;

    root /srv/last-learning-record/current;
    index index.html;

    access_log /var/log/nginx/last-learning-record.access.log;
    error_log  /var/log/nginx/last-learning-record.error.log;

    error_page 404 /404.html;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    location = /404.html {
        internal;
    }

    location = /index.html {
        add_header Cache-Control "no-cache" always;
    }

    location = /runtime-config.json {
        add_header Cache-Control "no-store" always;
    }

    location ~* \.html$ {
        try_files $uri =404;
        add_header Cache-Control "no-cache" always;
    }

    location = /version.txt {
        add_header Cache-Control "no-store" always;
    }

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/last-learning-record.conf /etc/nginx/sites-enabled/last-learning-record.conf
sudo nginx -t
sudo systemctl reload nginx
```

不同构建工具的资源目录名可能不是 `/assets/`。要根据实际产物修改，不要直接照抄。

如果保留当前仓库的 `base: '/lastLearningRecord/'`，可以让服务器文件路径与 URL 前缀一致：

```bash
sudo mkdir -p /srv/www
sudo ln -s /srv/last-learning-record/current /srv/www/lastLearningRecord
```

对应的 Nginx 核心配置：

```nginx
server {
    listen 80;
    server_name docs.example.com;
    root /srv/www;
    index index.html;
    error_page 404 /lastLearningRecord/404.html;

    location = / {
        return 302 /lastLearningRecord/;
    }

    location /lastLearningRecord/ {
        try_files $uri $uri/ $uri.html =404;
    }

    location = /lastLearningRecord/index.html {
        add_header Cache-Control "no-cache" always;
    }

    location = /lastLearningRecord/runtime-config.json {
        add_header Cache-Control "no-store" always;
    }

    location ~* \.html$ {
        try_files $uri =404;
        add_header Cache-Control "no-cache" always;
    }

    location = /lastLearningRecord/version.txt {
        add_header Cache-Control "no-store" always;
    }

    location = /lastLearningRecord/404.html {
        internal;
    }

    location /lastLearningRecord/assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
}
```

这时站点地址是 `https://docs.example.com/lastLearningRecord/`，CI 冒烟测试也必须使用同一路径。

### SPA 路由回退

上面的配置适用于 VuePress 这类会生成 HTML 文件的静态站点，不存在的地址会正确返回 `404`。

React Router 或 Vue Router 的纯单页应用中，`/users/42` 通常不对应服务器上的真实文件。浏览器直接刷新时，Nginx 必须返回 `index.html`，再由前端路由解析：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

如果项目是 VuePress、VitePress 等静态生成站点，每个页面可能有真实 HTML，则应按照生成目录设计 `try_files` 和 `404.html`，不能机械套用 SPA 配置。否则不存在的地址也会返回首页和 `200`，不利于故障判断和搜索引擎收录。

### 反向代理 API

如果后端监听 `127.0.0.1:8080`：

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 3s;
    proxy_read_timeout 30s;
}
```

这里 `proxy_pass` 后没有结尾 `/`，上游会收到原始 `/api/...` 路径。如果写成：

```nginx
proxy_pass http://127.0.0.1:8080/;
```

匹配到的 `/api/` 前缀会被替换成 `/`。修改时必须确认后端真实路由，否则很容易产生 `404`。

### WebSocket 代理

需要 WebSocket 时增加：

```nginx
location /socket/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

### 常用检查

```bash
sudo nginx -t
sudo nginx -T
sudo systemctl status nginx
sudo tail -f /var/log/nginx/last-learning-record.access.log
sudo tail -f /var/log/nginx/last-learning-record.error.log
curl -I -H 'Host: docs.example.com' http://127.0.0.1
```

`nginx -T` 会输出完整生效配置，适合排查“改了文件但没有生效”或多个 `server` 块冲突。

## 域名、HTTPS 与云防火墙

### 上线前提

1. 已购买或拥有域名。
2. 域名的 `A/AAAA` 记录已经指向服务器。
3. 云安全组允许 `80` 和 `443`。
4. Nginx 的 `server_name` 与证书域名一致。
5. 如果所在地区要求备案，应先完成相应流程。

不要把 MySQL `3306`、Redis `6379`、Docker API 或应用内部管理端口直接开放到公网。

### 使用 Certbot 申请证书

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d docs.example.com
```

测试自动续期：

```bash
sudo certbot renew --dry-run
```

检查定时器：

```bash
systemctl list-timers | grep certbot
```

证书续期失败通常与 DNS、80 端口、挑战路径、代理配置或防火墙有关。应该监控证书到期时间，不能只依赖“自动续期应该会成功”。

### HTTPS 后仍需检查

```bash
curl -I http://docs.example.com
curl -I https://docs.example.com
```

确认：

- HTTP 会跳转到 HTTPS。
- 证书域名正确且证书链完整。
- 页面没有加载 HTTP 图片、脚本或 API。
- `X-Forwarded-Proto` 正确传给后端，避免后端反复重定向。

## 运行 Node.js SSR 或 API 服务

静态站点不需要常驻 Node 进程，但 Next.js、Nuxt SSR 和 Node API 需要。

### 应用监听地址

如果 Nginx 和应用在同一台服务器，应用推荐监听：

```text
127.0.0.1:3000
```

这样公网只能访问 Nginx，不能绕过 HTTPS、限流和访问日志直接调用应用。

### 使用 systemd 管理进程

先安装项目明确支持、仍在维护的 Node.js 版本。不要假设交互终端和 systemd 会找到同一个 Node，尤其是使用 nvm 时。构建和部署前确认：

```bash
node --version
npm --version
command -v node
readlink -f "$(command -v node)"
npm ci
npm run build
```

准备应用发布目录：

```bash
sudo chown deploy:app /srv/my-app
sudo chmod 2750 /srv/my-app
sudo install -d -m 2750 -o deploy -g app /srv/my-app/releases
```

上传服务端构建产物及生产依赖后，先确认 `app` 用户确实可以读取入口文件：

```bash
sudo -u app test -r /srv/my-app/current/server.js
```

下面是模板，`ExecStart` 必须替换成 `readlink -f "$(command -v node)"` 得到的真实绝对路径，以及项目真实入口。NestJS 项目常见入口可能是 `dist/main.js`，Next.js/Nuxt 的启动方式也不同。

创建 `/etc/systemd/system/my-app.service`：

```ini
[Unit]
Description=My Node Application
After=network.target

[Service]
Type=simple
User=app
Group=app
WorkingDirectory=/srv/my-app/current
EnvironmentFile=/etc/my-app.env
ExecStart=/usr/bin/node /srv/my-app/current/server.js
Restart=on-failure
RestartSec=5
TimeoutStopSec=30

[Install]
WantedBy=multi-user.target
```

环境变量文件 `/etc/my-app.env`：

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DATABASE_URL=mysql://app_user:replace_me@127.0.0.1:3306/app_db
```

限制读取权限：

```bash
sudo chown root:app /etc/my-app.env
sudo chmod 640 /etc/my-app.env
```

加载并启动：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now my-app
sudo systemctl status my-app
sudo journalctl -u my-app -f
```

### 健康检查

应用至少提供一个轻量健康检查：

```http
GET /health
```

基础健康检查只判断进程能否响应。就绪检查可以继续判断数据库、Redis 等关键依赖是否可用，但不应该执行昂贵查询。

```bash
curl -i http://127.0.0.1:3000/health
```

### 优雅退出

发布和重启时，进程应处理 `SIGTERM`：

1. 停止接收新请求。
2. 等待正在处理的请求结束。
3. 关闭数据库、Redis 和 MQ 连接。
4. 在超时前退出。

否则发布过程中可能中断支付、上传或写数据库请求。

## Docker 快速入门

### 安装并验证 Docker

Windows 本地练习可以安装 Docker Desktop 并启用 WSL2 后端。Linux 服务器应按照 Docker 官方对应发行版的步骤安装 Docker Engine 和 Compose 插件，避免混用多个来源的软件包：

- [Docker Desktop 安装](https://docs.docker.com/desktop/)
- [Ubuntu 安装 Docker Engine](https://docs.docker.com/engine/install/ubuntu/)

安装后验证：

```bash
docker version
docker compose version
sudo docker run --rm hello-world
```

把用户加入 `docker` 用户组可以免 `sudo`，但该用户组基本拥有宿主机 root 级能力。学习环境可以理解其便利性，生产服务器必须严格控制谁能访问 Docker Daemon。

本文后续命令为便于阅读省略了 `sudo`。如果当前用户没有 Docker Daemon 权限，应统一使用 `sudo docker ...` 和 `sudo docker compose ...`，不要通过修改 `/var/run/docker.sock` 为任意用户可写来绕过权限。

### 核心概念

| 概念 | 含义 |
| --- | --- |
| Dockerfile | 构建镜像的步骤 |
| Image | 不可变的应用模板 |
| Container | 镜像运行后的进程实例 |
| Registry | 保存和分发镜像的仓库 |
| Volume | 独立于容器生命周期的持久数据 |
| Network | 容器间通信网络 |
| Compose | 用 YAML 描述多个容器如何一起运行 |

容器不是完整虚拟机。容器的主进程退出，容器就会停止。

### 前端多阶段构建

下面示例假设已经按照第 4 章让 `docs/.vuepress/config.js` 读取 `VUEPRESS_BASE`。

项目根目录创建 `Dockerfile`：

```dockerfile
FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ARG VUEPRESS_BASE=/
ARG APP_VERSION=local
ENV VUEPRESS_BASE=$VUEPRESS_BASE
RUN npm run build
RUN printf '%s\n' "$APP_VERSION" > docs/.vuepress/dist/version.txt

FROM nginx:1.28-alpine

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/docs/.vuepress/dist /usr/share/nginx/html

EXPOSE 80
```

`deploy/nginx.conf`：

```nginx
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;
    error_page 404 /404.html;

    location / {
        try_files $uri $uri/ $uri.html =404;
    }

    location = /404.html {
        internal;
    }

    location = /index.html {
        add_header Cache-Control "no-cache" always;
    }

    location = /runtime-config.json {
        add_header Cache-Control "no-store" always;
    }

    location ~* \.html$ {
        try_files $uri =404;
        add_header Cache-Control "no-cache" always;
    }

    location = /version.txt {
        add_header Cache-Control "no-store" always;
    }

    location /assets/ {
        try_files $uri =404;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }
}
```

`.dockerignore`：

```text
node_modules
docs/.vuepress/dist
.git
.env*
npm-debug.log*
```

构建和运行：

```bash
docker build --build-arg APP_VERSION=local -t last-learning-record:local .
docker run --name learning-docs -d -p 127.0.0.1:8080:80 last-learning-record:local
curl -I http://127.0.0.1:8080
```

常用检查：

```bash
docker ps
docker ps -a
docker logs --tail 100 learning-docs
docker logs -f learning-docs
docker inspect learning-docs
docker exec -it learning-docs sh
docker stop learning-docs
```

真实项目应固定基础镜像版本，并定期更新，不要永远依赖浮动标签。

### 端口映射

```bash
docker run -p 8080:80 image-name
```

含义是：

```text
宿主机 8080 -> 容器 80
```

如果只希望宿主机本地访问：

```bash
docker run -p 127.0.0.1:8080:80 image-name
```

然后由宿主机 Nginx 代理 `127.0.0.1:8080`。

### 容器中的 localhost

容器里的 `127.0.0.1` 只代表当前容器，不代表宿主机，也不代表另一个容器。

在 Compose 网络中，容器通过服务名互相访问：

```text
http://api:8080
```

而不是：

```text
http://127.0.0.1:8080
```

这是容器部署中最常见的 `502` 原因之一。

### Docker Compose

当前仓库可以直接使用下面的 `compose.yaml`：

```yaml
services:
  docs:
    build:
      context: .
      args:
        VUEPRESS_BASE: /
        APP_VERSION: local-compose
    ports:
      - "127.0.0.1:8080:80"
    restart: unless-stopped
```

启动和检查：

```bash
docker compose config
docker compose up -d --build
docker compose ps
docker compose logs --tail 100 docs
docker compose logs -f docs
curl -I http://127.0.0.1:8080
```

后续把仓库拆成 `frontend/` 和 `server/` 后，可以扩展为：

```yaml
services:
  web:
    build:
      context: ./frontend
    ports:
      - "127.0.0.1:8080:80"
    depends_on:
      - api
    restart: unless-stopped

  api:
    build:
      context: ./server
    env_file:
      - .env.production
    expose:
      - "8080"
    restart: unless-stopped
```

这个示例选择“宿主机 Nginx 终止 HTTPS”的架构：Compose 中的 Web 容器只绑定宿主机 `127.0.0.1:8080`，宿主机 Nginx 再代理到该端口。不要让宿主机 Nginx 和 Web 容器同时绑定 `0.0.0.0:80`。

如果决定由容器直接占用 `80/443`，就应停用对应的宿主机 Nginx，并在容器方案中完整处理证书、日志和重载，二者只选一种入口架构。

API 在容器内必须监听 `0.0.0.0:8080`，这样其他容器才能通过 `api:8080` 访问。第 7 章 systemd 场景使用的 `127.0.0.1` 只适用于应用与 Nginx 位于同一宿主机、且不经过容器网络的情况。

如果 Nginx 也在 `web` 容器内，代理地址应使用：

```nginx
proxy_pass http://api:8080;
```

`docker compose config` 可以在启动前检查合并后的配置以及变量替换结果。

`depends_on` 主要控制启动顺序，并不代表 API 已经完成初始化、可以接收请求。真实项目还需要健康检查，并让调用方在依赖暂时不可用时进行有限重试。

### 数据持久化

容器删除后，其可写层数据也会消失。数据库、上传文件等持久数据必须放在 Volume、宿主机目录或外部托管服务中。

不要把数据库备份和数据库原始数据保存在同一块磁盘上，否则磁盘损坏时会一起丢失。

## CI/CD 自动发布

### CI 与 CD

CI 持续集成负责：

```text
安装依赖 -> 静态检查 -> 测试 -> 构建
```

CD 持续交付或部署负责：

```text
保存制品 -> 发布测试环境 -> 验证 -> 审批 -> 发布生产 -> 回滚
```

不要在服务器上直接 `git pull` 后原地构建。这样难以保证构建环境一致，也很难快速回滚。

### 一个基础 GitHub Actions 工作流

创建 `.github/workflows/deploy.yml`：

当前仓库的 `package.json` 还没有 `test` 或 `lint` 脚本，因此下面的流水线明确执行“配置校验 + 构建校验”，不会用 `npm test --if-present` 制造一个实际什么都没测的绿色结果。以后添加测试脚本后，再增加 `run: npm test`；不要加 `--if-present`，脚本缺失也应该让配置错误暴露出来。

```yaml
name: Deploy documentation

on:
  push:
    branches:
      - main

permissions:
  contents: read

concurrency:
  group: production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production
    timeout-minutes: 15

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Validate project configuration
        env:
          VUEPRESS_BASE: /
        run: |
          node -e "const p=require('./package.json'); if (!p.scripts?.build) throw new Error('missing build script')"
          node -e "const c=require('./docs/.vuepress/config'); if (c.base !== '/') throw new Error('VUEPRESS_BASE is not effective')"

      - name: Build
        env:
          VUEPRESS_BASE: /
        run: |
          npm run build
          if grep -q '"/lastLearningRecord/' docs/.vuepress/dist/index.html; then
            echo "VuePress base is still /lastLearningRecord/" >&2
            exit 1
          fi
          printf '%s\n' "$GITHUB_SHA" > docs/.vuepress/dist/version.txt

      - name: Configure SSH
        env:
          DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$DEPLOY_SSH_KEY" > ~/.ssh/id_ed25519
          chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts

      - name: Upload immutable release
        env:
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        run: |
          ROOT_DIR="/srv/last-learning-record"
          RELEASE_ID="${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
          RELEASE_DIR="$ROOT_DIR/releases/$RELEASE_ID"
          SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=3)
          ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "mkdir '$RELEASE_DIR'"
          rsync -az \
            -e "ssh -o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=3" \
            docs/.vuepress/dist/ "$DEPLOY_USER@$DEPLOY_HOST:$RELEASE_DIR/"
          ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
            "test -f '$RELEASE_DIR/index.html' && \
             grep -Fx '$GITHUB_SHA' '$RELEASE_DIR/version.txt'"

      - name: Activate release
        env:
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
        run: |
          ROOT_DIR="/srv/last-learning-record"
          RELEASE_ID="${GITHUB_SHA}-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}"
          SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=3)
          PREVIOUS_RELEASE="$(ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
            "readlink -f '$ROOT_DIR/current' 2>/dev/null || true")"
          printf '%s\n' "$PREVIOUS_RELEASE" > "$RUNNER_TEMP/previous-release"

          if [ -n "$PREVIOUS_RELEASE" ]; then
            ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
              "ln -s '$PREVIOUS_RELEASE' '$ROOT_DIR/.previous-$RELEASE_ID' && \
               mv -Tf '$ROOT_DIR/.previous-$RELEASE_ID' '$ROOT_DIR/previous'"
          fi

          ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
            "ln -s '$ROOT_DIR/releases/$RELEASE_ID' '$ROOT_DIR/.current-$RELEASE_ID' && \
             mv -Tf '$ROOT_DIR/.current-$RELEASE_ID' '$ROOT_DIR/current'"

      - name: Smoke test and rollback on failure
        env:
          DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
          DEPLOY_USER: ${{ secrets.DEPLOY_USER }}
          SITE_URL: https://docs.example.com
        run: |
          ROOT_DIR="/srv/last-learning-record"
          SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=10 -o ServerAliveInterval=10 -o ServerAliveCountMax=3)

          if ACTUAL_VERSION="$(curl --fail --silent --show-error \
            --connect-timeout 5 --max-time 20 \
            --retry 5 --retry-delay 2 --retry-connrefused \
            "$SITE_URL/version.txt?release=$GITHUB_SHA")" \
            && [ "$ACTUAL_VERSION" = "$GITHUB_SHA" ]; then
            echo "Release $GITHUB_SHA is active"
            exit 0
          fi

          echo "Smoke test failed, rolling back" >&2
          PREVIOUS_RELEASE="$(cat "$RUNNER_TEMP/previous-release")"

          if [ -n "$PREVIOUS_RELEASE" ]; then
            ssh "${SSH_OPTS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" \
              "ln -s '$PREVIOUS_RELEASE' '$ROOT_DIR/.rollback-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT' && \
               mv -Tf '$ROOT_DIR/.rollback-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT' '$ROOT_DIR/current'"
          else
            echo "No previous release exists; automatic rollback is unavailable" >&2
          fi

          exit 1
```

流水线的 `timeout-minutes` 是整项任务的最后保险；`ConnectTimeout`、`ServerAliveInterval` 和 `curl --max-time` 则让具体网络命令在连接半开时尽快失败。两层都需要，不能依赖 CI 平台数小时后的默认超时。

需要配置的 Secrets：

| Secret | 内容 |
| --- | --- |
| `DEPLOY_HOST` | 服务器域名或 IP |
| `DEPLOY_USER` | 低权限部署用户 |
| `DEPLOY_SSH_KEY` | 部署专用私钥 |
| `DEPLOY_KNOWN_HOSTS` | 预先核验的服务器 Host Key |

不要在流水线里临时用未经核验的 `ssh-keyscan` 结果替代可信 Host Key，否则可能失去 SSH 主机身份验证的意义。可以先从本地收集公钥，再与云控制台中服务器显示的指纹进行核验：

```bash
ssh-keyscan -t ed25519 docs.example.com > deploy_known_hosts
ssh-keygen -lf deploy_known_hosts
```

服务器控制台查看真实主机指纹：

```bash
sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

两边一致后，把 `deploy_known_hosts` 的完整内容存入 `DEPLOY_KNOWN_HOSTS`。

上面的冒烟测试通过 `version.txt` 确认线上已经切到本次 Commit，并能在失败时回滚。它仍不能证明 JS 已成功执行。真实前端项目还应增加 Playwright 页面测试，例如打开首页、等待关键标题出现，并检查关键 JS/CSS 请求没有失败。

### Release 保留与清理

每次发布使用唯一目录才能可靠回滚，但不清理会逐渐占满磁盘。一个适合入门项目的策略是：

- `current` 指向线上版本，`previous` 指向上一版本，这两个目标永远不删。
- 其余 release 至少保留 14 天；磁盘紧张时也至少保留最近 5 个成功版本。
- 清理前先输出候选目录并核对，清理后再检查磁盘、首页和版本号。

先以 `deploy` 用户只查看 14 天前的候选目录：

```bash
ROOT_DIR=/srv/last-learning-record
CURRENT="$(readlink -f "$ROOT_DIR/current" || true)"
PREVIOUS="$(readlink -f "$ROOT_DIR/previous" || true)"

find "$ROOT_DIR/releases" -mindepth 1 -maxdepth 1 -type d -mtime +14 -print0 |
  while IFS= read -r -d '' RELEASE; do
    if [ "$RELEASE" != "$CURRENT" ] && [ "$RELEASE" != "$PREVIOUS" ]; then
      printf 'cleanup candidate: %s\n' "$RELEASE"
    fi
  done
```

确认输出只包含过期 release 后，再把同样的“路径必须位于 `$ROOT_DIR/releases/` 且不等于 `current`/`previous`”判断写进定时清理脚本。初学阶段建议按输出逐个删除精确路径，不要直接对 `releases/*` 执行宽泛的 `rm -rf`。同时为根分区设置磁盘告警，不能把清理脚本当成唯一保护。

### 环境隔离

至少区分：

```text
development -> 本地开发
staging     -> 测试或预发布
production  -> 生产
```

不同环境应有独立的：

- 域名和配置。
- 数据库和第三方密钥。
- CI/CD Secrets。
- 发布审批和访问权限。

生产 Secrets 不应在普通 PR 构建中可用。对生产环境设置分支限制和人工审批。

### 发布策略

最容易入门的是不可变目录加软链接：

```text
上传新目录 -> 健康检查 -> current 指向新目录 -> 冒烟测试
```

进一步可以学习：

- 滚动发布：逐台替换实例。
- 蓝绿发布：新旧两套完整环境切流量。
- 金丝雀发布：先让少量用户访问新版本。

## 日志、监控与可观测性

### 三类基本信号

| 信号 | 回答的问题 |
| --- | --- |
| Logs 日志 | 某次请求具体发生了什么？ |
| Metrics 指标 | 系统整体是否正在变慢或出错？ |
| Traces 链路 | 一次请求在多个服务中分别耗时多久？ |

前端入门阶段先把日志和基本指标做好，再学习完整链路追踪。

### 必看指标

服务器：

- CPU 使用率和 Load Average。
- 可用内存、Swap。
- 磁盘使用率和 inode。
- 网络流量和连接数。

Web 服务：

- 请求量。
- `4xx`、`5xx` 比例。
- 平均延迟以及 `p95/p99` 延迟。
- 活跃连接和上游超时。
- 健康检查是否成功。

前端：

- JS 异常。
- 资源加载失败。
- 接口失败率。
- Core Web Vitals。
- 版本号和 Source Map 映射。

### 日志要包含什么

推荐包含：

- 时间和时区。
- 日志级别。
- 服务名和版本号。
- 请求 ID。
- HTTP 方法、路径、状态码和耗时。
- 错误类型和堆栈。

不要写入：

- 密码、完整 Token、Cookie。
- 身份证号、银行卡等敏感信息。
- 数据库完整连接串。

### 常用排查命令

```bash
sudo tail -f /var/log/nginx/last-learning-record.error.log
sudo journalctl -u my-app --since '10 minutes ago'
docker compose logs --since 10m api
curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://docs.example.com
```

### 基础告警

至少配置：

- 站点连续多次不可访问。
- `5xx` 比例异常。
- 磁盘使用率超过安全阈值。
- 进程或容器反复重启。
- HTTPS 证书即将过期。
- 数据库备份失败。

告警必须能到达真实负责人。只有监控面板而没有通知，不算完整监控。

可以先用一个独立的 GitHub Actions 定时工作流，从服务器外部检查站点和证书。创建 `.github/workflows/uptime.yml`：

```yaml
name: Uptime check

on:
  schedule:
    - cron: '*/15 * * * *'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - name: Check website
        run: |
          curl --fail --silent --show-error \
            --connect-timeout 5 --max-time 15 \
            https://docs.example.com/version.txt

      - name: Check certificate has at least 7 days left
        run: |
          set -o pipefail
          echo | timeout 15s openssl s_client \
            -connect docs.example.com:443 \
            -servername docs.example.com 2>/dev/null \
            | openssl x509 -noout -checkend 604800
```

在 GitHub 通知设置中打开失败工作流通知，并手动执行一次 `workflow_dispatch`。把域名暂时改成无效测试地址，确认自己确实能收到失败通知，再改回来。

定时 Actions 可能延迟，适合学习和低风险个人项目，不适合作为高 SLA 服务的唯一监控。正式项目应使用云监控或独立可用性监控服务，并配置多个探测位置。

主机磁盘无法由外部 HTTP 检查发现。安装云厂商监控 Agent 后，为根分区使用率创建告警，例如达到 `80%` 持续 5 分钟通知。配置前可以先用下面命令确认 Agent 与监控面板看到的数值一致：

```bash
df -P / | awk 'NR == 2 { print "root disk usage:", $5 }'
```

同样为 `my-app-backup.service` 失败、容器重启次数和 Nginx `5xx` 建立告警。至少演练一次失败，确认通知渠道、负责人和处理链接都有效。

## 高频故障排查手册

### 通用排查顺序

不要一上来就重启服务器。按链路从外到内检查：

```text
1. DNS 是否解析正确
2. 80/443 是否能建立连接
3. TLS 证书是否正确
4. Nginx 是否收到请求
5. 静态文件是否存在，代理配置是否命中
6. 上游进程和端口是否正常
7. 数据库、Redis 等依赖是否正常
8. CPU、内存、磁盘是否耗尽
9. 最近是否刚发布或改过配置
```

### 首页正常，刷新路由 404

原因：服务器把 `/users/42` 当成真实文件查找。

检查和修复：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

同时确认这确实是 SPA，而不是每个路径都生成 HTML 的静态站点。

### 502 Bad Gateway

依次检查：

```bash
sudo nginx -t
sudo tail -n 100 /var/log/nginx/error.log
ss -lntp
curl -i http://127.0.0.1:8080/health
sudo systemctl status my-app
docker compose ps
docker compose logs --tail 100 api
```

常见原因：

- 后端没有启动或正在重启。
- `proxy_pass` 端口写错。
- 容器里错误使用 `127.0.0.1` 访问另一个容器。
- 上游只监听了不正确的网卡。
- Nginx 没有权限访问 Unix Socket。

### 504 Gateway Timeout

不要第一反应只增加 Nginx 超时时间。先检查：

- 后端慢查询。
- 第三方接口卡住。
- 数据库连接池耗尽。
- 下游没有设置超时。
- CPU 或内存压力过高。

延长代理超时只能隐藏问题，不能解决下游无限等待。

### 发布后仍是旧页面

按层检查：

1. `current` 是否已经指向新目录。
2. Nginx 实际 `root` 是否正确。
3. `index.html` 是否被浏览器或 CDN 长期缓存。
4. Service Worker 是否仍控制页面。
5. HTML 是否引用旧资源文件名。
6. CDN 是否完成刷新或版本切换。

```bash
readlink -f /srv/last-learning-record/current
curl -I https://docs.example.com/index.html
curl -s https://docs.example.com/index.html | head
```

### 页面白屏

浏览器中检查：

- Console 是否有运行时错误。
- JS/CSS 是否 `404`。
- `Content-Type` 是否错误，例如 JS 返回了 HTML。
- `base/publicPath` 是否符合部署路径。
- 环境变量是否在构建时写错。
- 新旧 HTML 和 JS 是否版本不一致。

### CORS 或 Cookie 不生效

检查：

- 前端请求是否真的发往预期域名。
- 服务端 `Access-Control-Allow-Origin` 是否精确匹配。
- 是否需要 `Access-Control-Allow-Credentials: true`。
- 前端是否设置 `credentials: 'include'`。
- Cookie 的 `Domain`、`Path`、`SameSite`、`Secure`。
- 预检 `OPTIONS` 是否被 Nginx、鉴权或网关拒绝。

### 磁盘已满

```bash
df -h
df -i
du -xhd1 /var | sort -h
du -xhd1 /srv | sort -h
docker system df
```

先确认增长源，再处理日志轮转、旧制品、构建缓存或无用镜像。不要直接运行无法回滚的大范围清理命令。

### Permission denied

```bash
namei -l /srv/last-learning-record/current/index.html
ls -ld /srv/last-learning-record /srv/last-learning-record/current
ls -l /srv/last-learning-record/current/index.html
```

访问文件需要对路径上的每一级目录都有执行权限。不要用 `777` 掩盖所有者和用户组配置错误。

## 安全、备份与回滚

### 最低安全基线

- 使用 SSH 密钥，部署使用独立低权限用户。
- 只开放 `22`、`80`、`443` 等必要端口。
- SSH 尽量限制来源 IP。
- 数据库、Redis 和内部管理端口不暴露公网。
- 自己的 Node、Java、Go 等业务进程使用非 root 用户运行；第三方镜像要检查其默认用户、Linux capabilities 和实际需要的权限，尽量减少容器特权。
- Secrets 不提交 Git，不写入前端产物和日志。
- CI Token、云密钥和数据库账号使用最小权限。
- 定期安装安全更新并更新基础镜像。
- 为登录、上传和高频接口配置限流。
- 定期扫描依赖和镜像漏洞。
- 不把 Docker Socket 暴露给不可信容器。

前端尤其要记住：只要内容被发送到浏览器，用户就能看到。所谓“前端加密隐藏密钥”不能保护真正的服务端秘密。

### 备份不等于复制一份文件

备份需要回答：

1. 备份什么：数据库、上传文件、配置和证书恢复信息。
2. 多久备份一次：由最多能接受丢失多少数据决定。
3. 保存多久：满足业务、审计和成本要求。
4. 保存在哪里：不能只放原服务器同一块磁盘。
5. 谁能恢复：权限和恢复流程必须明确。
6. 是否验证：从未恢复过的备份不能证明有效。

常见目标：

- RPO：最多允许丢失多长时间的数据。
- RTO：故障后最多允许多久恢复服务。

### MySQL 备份与恢复演练

在管理员会话安装客户端，并确认其版本与目标 MySQL 兼容。连接托管数据库时可以把客户端装在受控的备份主机，不必装在数据库服务器上：

```bash
sudo apt update
sudo apt install -y default-mysql-client
command -v mysqldump
mysqldump --version
```

先使用数据库管理员账号创建最小权限备份账号。下面针对普通 InnoDB 表备份，并配合后文的 `--no-tablespaces`，避免为了读取 tablespace 元数据授予全局 `PROCESS` 权限：

```sql
CREATE USER 'backup_user'@'127.0.0.1'
  IDENTIFIED BY 'replace_with_a_long_random_password';
GRANT SELECT, SHOW VIEW, TRIGGER ON app_db.*
  TO 'backup_user'@'127.0.0.1';
```

如果业务使用存储过程或定时 Event，需要根据实际 MySQL 版本单独评估 `--routines`、`--events` 及对应权限，不要直接扩大为全库管理员。托管数据库应通过其管理控制台或受控管理员连接执行等价授权。

再创建专用系统用户和目录。不要在脚本命令行中直接写数据库密码：

```bash
sudo adduser --system --group --home /var/lib/appbackup appbackup
sudo install -d -m 700 -o appbackup -g appbackup /var/backups/my-app
sudo install -d -m 700 -o appbackup -g appbackup /var/lib/appbackup
sudo -u appbackup touch /var/lib/appbackup/mysql.cnf
sudo chmod 600 /var/lib/appbackup/mysql.cnf
sudoedit /var/lib/appbackup/mysql.cnf
```

`mysql.cnf` 内容：

```ini
[client]
host=127.0.0.1
user=backup_user
password=replace_with_real_password
```

创建 `/usr/local/sbin/backup-my-app`：

```bash
#!/usr/bin/env bash
set -euo pipefail

umask 077
BACKUP_DIR=/var/backups/my-app
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/app_db-$STAMP.sql.gz"
TEMP="$BACKUP_DIR/.app_db-$STAMP.sql.gz.tmp"

trap 'rm -f -- "$TEMP"' EXIT

mysqldump \
  --defaults-extra-file=/var/lib/appbackup/mysql.cnf \
  --single-transaction \
  --quick \
  --no-tablespaces \
  --triggers \
  app_db | gzip -9 > "$TEMP"

gzip -t "$TEMP"
mv -- "$TEMP" "$TARGET"
trap - EXIT

(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$TARGET")" > "$(basename "$TARGET").sha256.tmp"
  mv -- "$(basename "$TARGET").sha256.tmp" "$(basename "$TARGET").sha256"
)
printf 'backup created: %s\n' "$TARGET"
```

`set -o pipefail` 会让 `mysqldump` 失败传递到整个管道；失败时 `trap` 删除隐藏临时文件。只有导出完成且 `gzip -t` 通过后才原子改名为最终 `.sql.gz`，异机同步和保留策略只处理最终文件。

保存后设置权限并手动执行一次：

```bash
sudo chown root:root /usr/local/sbin/backup-my-app
sudo chmod 755 /usr/local/sbin/backup-my-app
sudo -u appbackup /usr/local/sbin/backup-my-app
sudo -u appbackup ls -lh /var/backups/my-app
```

使用 systemd 定时执行。创建 `/etc/systemd/system/my-app-backup.service`：

```ini
[Unit]
Description=Back up my-app MySQL database

[Service]
Type=oneshot
User=appbackup
Group=appbackup
ExecStart=/usr/local/sbin/backup-my-app
```

创建 `/etc/systemd/system/my-app-backup.timer`：

```ini
[Unit]
Description=Run my-app backup every day

[Timer]
OnCalendar=*-*-* 03:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

启用并验证：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now my-app-backup.timer
systemctl list-timers my-app-backup.timer
sudo systemctl start my-app-backup.service
sudo journalctl -u my-app-backup.service -n 50 --no-pager
```

本机备份仍不完整，必须再同步到另一台主机或私有对象存储。下面只是异机传输示意，目标主机需要独立的低权限备份账号和 SSH 密钥：

```bash
sudo -u appbackup rsync -az /var/backups/my-app/ \
  backup_user@backup-host:/srv/backups/my-app/
```

确认异机备份完整且可以读取后，再清理超过保留期的本机副本。先只打印候选文件：

```bash
sudo -u appbackup find /var/backups/my-app -type f \
  \( -name '*.sql.gz' -o -name '*.sha256' \) -mtime +14 -print
```

人工确认目标路径和清单无误后，才能把最后的 `-print` 改成 `-delete`。不要对未确认的变量路径或宽泛目录执行递归清理。

至少每月做一次恢复演练。不要直接覆盖生产库。下面命令明确在管理员 root 会话执行，因为备份目录是 `appbackup:appbackup 0700`，恢复配置也是 `root:root 0600`。先准备只供管理员使用的恢复连接配置 `/root/restore.cnf`；它可以是受限的恢复操作员账号，不能使用只读的 `backup_user`。

```bash
sudo touch /root/restore.cnf
sudo chown root:root /root/restore.cnf
sudo chmod 600 /root/restore.cnf
sudoedit /root/restore.cnf
```

格式与前面的 `mysql.cnf` 相同，按实际数据库填写 `host`、`user` 和 `password`。然后进入 root 会话，自动选择最新一份最终备份，并使用唯一临时库名验证：

```bash
sudo -i
set -euo pipefail

BACKUP="$(find /var/backups/my-app -maxdepth 1 -type f \
  -name 'app_db-*.sql.gz' -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
test -n "$BACKUP" && test -f "$BACKUP"

gzip -t "$BACKUP"
(cd "$(dirname "$BACKUP")" && sha256sum -c "$(basename "$BACKUP").sha256")

RESTORE_DB="app_restore_check_$(date -u +%Y%m%dT%H%M%SZ)_$$"

mysql --defaults-extra-file=/root/restore.cnf \
  -e "CREATE DATABASE \`$RESTORE_DB\` CHARACTER SET utf8mb4;"

gzip -dc "$BACKUP" | mysql \
  --defaults-extra-file=/root/restore.cnf "$RESTORE_DB"

mysql --defaults-extra-file=/root/restore.cnf \
  -e "SHOW TABLES FROM \`$RESTORE_DB\`;"

# 人工抽查关键表数量和业务数据后，再删除这次演练库
mysql --defaults-extra-file=/root/restore.cnf \
  -e "DROP DATABASE \`$RESTORE_DB\`;"
exit
```

恢复账号和 `/root/restore.cnf` 只应由管理员持有并设置为 `600`。若中途失败，不要盲目重复命令；先记录终端输出和 `$RESTORE_DB`，检查临时库是否存在，再决定继续检查或精确删除。恢复完成后必须抽查关键表数量和业务数据，而不只是看到命令退出成功。

### 静态站点回滚

查看版本：

```bash
ls -lah /srv/last-learning-record/releases
readlink -f /srv/last-learning-record/current
```

切回上一版本：

```bash
ln -sfn /srv/last-learning-record/releases/<previous-commit> /srv/last-learning-record/.current-rollback
mv -Tf /srv/last-learning-record/.current-rollback /srv/last-learning-record/current
curl --fail https://docs.example.com/
```

这里真正完成原子替换的是同一文件系统内的 `mv -T`。Nginx 的 `root` 没变化时通常不需要重载配置。

### 数据库迁移与回滚

代码可以快速回滚，数据库迁移未必能安全反向执行。生产迁移建议采用兼容式步骤：

```text
1. 先新增字段或新表，不立即删除旧结构
2. 发布兼容新旧结构的代码
3. 回填或迁移数据
4. 确认旧代码不再使用旧字段
5. 后续发布再删除旧结构
```
这也叫 Expand and Contract。不要在没有备份和验证的情况下自动执行破坏性迁移。


## Kubernetes、Terraform 和专业SRE

满足以下情况再学习 Kubernetes：

- 服务数量明显增加，需要多实例和自动调度。
- 团队生产环境已经使用 Kubernetes。
- 需要滚动发布、自动恢复、服务发现和弹性扩缩容。
- 已经熟悉 Docker、网络、健康检查、日志和资源限制。

如果感兴趣学习顺序建议：

```text
Linux
  -> 网络与 HTTP
  -> Nginx 和 HTTPS
  -> Docker 和 Compose
  -> CI/CD、监控和回滚
  -> Kubernetes
  -> Terraform/Ansible
  -> 完整可观测性和 SRE
```

不要跳过 Docker 和网络直接背 Kubernetes YAML。那样出现问题时仍然不知道是 DNS、Service、端口、容器还是应用本身。

## 常用命令速查

### Linux

```bash
pwd
ls -lah
df -h
free -h
top
ss -lntp
sudo lsof -i :8080
tail -f /path/to/error.log
sudo journalctl -u service-name -f
```

### 网络与 HTTP

```bash
dig +short docs.example.com
curl -I https://docs.example.com
curl -v https://docs.example.com
curl -i http://127.0.0.1:8080/health
openssl s_client -connect docs.example.com:443 -servername docs.example.com
```

### Nginx

```bash
sudo nginx -t
sudo nginx -T
sudo systemctl status nginx
sudo systemctl reload nginx
sudo tail -f /var/log/nginx/error.log
```

### Docker

```bash
docker build -t app:local .
docker run -d --name app -p 127.0.0.1:8080:80 app:local
docker ps -a
docker logs --tail 100 app
docker exec -it app sh
docker inspect app
docker compose config
docker compose up -d --build
docker compose logs -f
```

### 发布与回滚

```bash
rsync -az dist/ deploy@server:/srv/app/releases/<commit>/
ln -sfn /srv/app/releases/<commit> /srv/app/.current-next
mv -Tf /srv/app/.current-next /srv/app/current
readlink -f /srv/app/current
curl --fail https://docs.example.com/
```
