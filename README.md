# 东方幻绮梦 - Django论坛项目

一个基于Django开发的现代化论坛系统，支持用户注册、邮箱验证、帖子发布、权限管理、社交互动等功能。

## ✨ 主要特性

### 用户管理
- ✅ 用户注册与登录、邮箱验证、密码重置（邮箱+密保）
- ✅ 个人资料管理、头像上传、用户统计信息、角色权限管理

### 帖子功能
- ✅ 帖子发布与编辑、图片上传、点赞、收藏、转发、搜索
- ✅ 评论系统（嵌套回复、评论点赞）、私信、通知（@提及/点赞/评论/关注/精华）

### 社交与内容
- ✅ 关注/粉丝系统、标签系统、热门排行、浏览量统计、置顶/精华、帖子举报
- ✅ 用户等级体系（10级，经验值自动升级）、富文本编辑器（Markdown）
- ✅ 深色模式、卡片化响应式 UI

### 安全
- ✅ 邮箱验证、安全Token机制、密码加密存储、CSRF保护、统一权限控制

---

## 🚀 快速开始（部署到任意机器 / 任意隧道）

> 本项目支持 **本地开发、DevBridge / Cloudflare / ngrok 等任意 HTTPS 隧道分享**，
> 所有环境相关配置统一由项目根目录的 `.env` 管理（已被 `.gitignore` 忽略，不会误提交）。

### 0. 前置要求

- Python 3.8 ~ 3.12（推荐 3.10+，项目在 3.11 / 3.12 验证通过）
- pip、git
- （可选）内外网隧道工具：cloudflared / ngrok 等

### 1. 克隆项目

```bash
git clone https://gitcode.com/drz8848-dev/my_thhqm_001.git
cd my_thhqm_001
```

### 2. 配置 `.env`

复制 `.env` 模板（或参考下方说明）并修改：

```ini
# ---------- 隧道/域名配置（重点） ----------
# 对外访问域名：只写你的 Host（逗号分隔可多写；localhost/127.0.0.1 已默认允许）
ALLOWED_HOSTS=xbyzkqdh-8000.cn-north-4-bridge.myhuaweicloud.com
# HTTPS 隧道/反代必须登记完整 Origin（https://host）
CSRF_TRUSTED_ORIGINS=https://xbyzkqdh-8000.cn-north-4-bridge.myhuaweicloud.com
# Cloudflare 等 TLS 反代（边缘终结 HTTPS）必须 true；纯本地 http 设 false
TRUST_X_FORWARDED_PROTO=true

# ---------- 初始超级管理员 ----------
ADMIN_USER=admin
ADMIN_PASS=你的强密码
# ADMIN_EMAIL=admin@example.com
# ADMIN_RESET_PASSWORD=true    # 管理员已存在时是否按 .env 重置密码（默认 false 不动原账号）

# ---------- 邮件 SMTP（可选，发验证/重置邮件才需要） ----------
# EMAIL_HOST_USER=你的邮箱@163.com
# EMAIL_HOST_PASSWORD=你的163授权码
```

> ⚠️ 三行隧道配置的作用：
> - `ALLOWED_HOSTS`：Django 只接受这些 Host 头的请求，否则返回 400 DisallowedHost；
> - `CSRF_TRUSTED_ORIGINS`：HTTPS 下 POST 请求的 Origin 校验必须显式登记，否则登录/发帖等表单全部 403（`Origin checking failed`）；
> - `TRUST_X_FORWARDED_PROTO`：Cloudflare 等反代在边缘终结 TLS，需信任该头 Django 才能正确识别 HTTPS。

### 3. 一键部署（推荐）

```bash
# 方式 A：域名已在 .env 里配置好（推荐）
./deploy.sh

# 方式 B：临时用某个域名（会临时覆盖 .env，不改文件）
./deploy.sh cloudflare域名 或 DevBridge域名 或 ngrok域名
```

`deploy.sh` 自动完成四步：**装依赖（华为云镜像加速）→ 数据库迁移 → 按 .env 创建/更新超级管理员 → 启动服务**，监听 `0.0.0.0:8000`。

### 4. 手工部署（不用脚本时）

```bash
pip3 install -r requirements.txt -i https://mirrors.huaweicloud.com/repository/pypi/simple
python3 manage.py migrate
python3 manage.py ensure_admin   # 按 .env 的 ADMIN_USER/ADMIN_PASS 建管理员（幂等）
python3 manage.py runserver 0.0.0.0:8000
```

### 5. 访问

- 本地：http://localhost:8000
- 管理后台：`/admin/`（用 `.env` 里 `ADMIN_USER` / `ADMIN_PASS` 登录）
- 对外分享：把服务通过隧道暴露到 8000 端口，见下节

---

## 🌐 通过隧道对外分享（绕开公网 IP）

服务固定监听 `0.0.0.0:8000`，选一个隧道工具把 8000 暴露出去即可；每次换隧道域名，**只需改 `.env` 里三行 + 重启服务**。

### DevBridge（华为云开发隧道）

```bash
# 建隧道指向 8000，获得 https://<tunnelId>-8000.<region>-bridge.myhuaweicloud.com
# 然后把该域名写入 .env 三行，重启服务
```

### Cloudflare Tunnel（cloudflared）

临时隧道（免费、无需自有域名）：
```bash
cloudflared tunnel --url http://localhost:8000
# 得到 https://xxxx-random.trycloudflare.com，写入 .env 三行后重启
```

自有域名（推荐，域名固定）：
```yaml
# ~/.cloudflared/config.yml
ingress:
  - hostname: forum.你的域名.com
    service: http://localhost:8000
  - service: http_status:404
```
```bash
cloudflared tunnel login
cloudflared tunnel create myforum
cloudflared tunnel route dns myforum forum.你的域名.com
cloudflared tunnel run myforum
```

### ngrok（可选）

```bash
ngrok http 8000   # 得到 https://xxxx.ngrok-free.app，同样写入 .env 三行
```

---

## ⚙️ 环境变量参考

| 变量 | 必填 | 说明 |
|------|------|------|
| `ALLOWED_HOSTS` | 隧道场景必填 | 允许访问的 Host，逗号分隔（`localhost/127.0.0.1/pythonanywhere` 默认允许） |
| `CSRF_TRUSTED_ORIGINS` | HTTPS 必填 | 可信 Origin，完整 `https://host`，逗号分隔；否则 POST 表单 403 |
| `TRUST_X_FORWARDED_PROTO` | TLS 反代必填 | `true`=信任代理 X-Forwarded-Proto 识别 HTTPS（Cloudflare/ngrok 等） |
| `ADMIN_USER` | 首次部署建议 | 初始超级管理员用户名（`ensure_admin` 读取） |
| `ADMIN_PASS` | 首次部署建议 | 初始超级管理员密码 |
| `ADMIN_EMAIL` | 可选 | 管理员邮箱，默认 `<username>@example.com` |
| `ADMIN_RESET_PASSWORD` | 可选 | `true` 时已存在的管理员按 .env 重置密码 |
| `EMAIL_HOST_USER` | 邮件功能 | 163 邮箱账号（发送验证/重置邮件） |
| `EMAIL_HOST_PASSWORD` | 邮件功能 | 163 邮箱 SMTP 授权码（**不是登录密码**） |

**优先级**：真实 shell 环境变量 > `.env` 文件 > `settings.py` 默认值。

---

## ❓ 常见问题（FAQ）

**1. 登录/发帖报 403，`Origin checking failed`？**
HTTPS 隧道下 POST 请求的 Origin 必须登记在 `CSRF_TRUSTED_ORIGINS`，改成你的隧道域名后重启。

**2. 打开网站 400 `DisallowedHost`？**
`ALLOWED_HOSTS` 没包含当前域名，补上后重启。

**3. 通过 Cloudflare/ngrok 访问，登录后跳回 http 或 HTTPS 相关功能异常？**
设置 `TRUST_X_FORWARDED_PROTO=true`（反代在边缘终结 TLS 时必须）。

**4. 注册后收不到验证邮件？**
开发环境 `EMAIL_VERIFICATION_REQUIRED=False`，注册不受影响；要发邮件请在 `.env` 配好 163 SMTP 授权码（见 `EMAIL_SETUP.md`）。

**5. 忘了管理员密码？**
在 `.env` 设置 `ADMIN_USER`/`ADMIN_PASS`/`ADMIN_RESET_PASSWORD=true`，执行 `python3 manage.py ensure_admin`。

**6. 换机器部署后数据是空的？**
SQLite 开发库 `db.sqlite3` 不随仓库提交（已 gitignore）。要带演示数据，把原机器 `db.sqlite3` 一并拷到新机器项目根目录即可（仅限开发场景）。

---

## 📁 项目结构

```
my_thhqm_001/
├── accounts/                # 用户管理应用（含 management/commands/ensure_admin.py）
│   ├── migrations/         # 数据库迁移
│   ├── admin.py / forms.py / models.py / views.py / ...
├── posts/                   # 帖子管理应用（帖子/评论/标签/私信/通知）
│   ├── migrations/
│   └── ...
├── templates/               # 模板文件（accounts/ + posts/）
├── myforum/                 # 项目配置（settings.py 支持 .env 注入）
├── deploy.sh                # 一键部署脚本（依赖 .env）
├── .env                     # 本机环境配置（gitignore，不提交；首次部署需创建）
├── db.sqlite3               # SQLite 数据库（首次 migrate 生成，不提交）
├── manage.py
├── test_features.py
└── requirements.txt
```

## 🔧 技术栈

- 后端：Django 4.2
- 前端：Bootstrap 5、jQuery、marked.js
- 数据库：SQLite（开发）/ PostgreSQL（生产）
- 邮件：网易163 SMTP
- 表单：Django Crispy Forms

## 👥 用户角色

| 角色 | 权限 |
|------|------|
| 普通用户 (user) | 浏览/发布帖子、点赞收藏、评论互动、编辑资料 |
| 管理员 (mod) | 普通用户权限 + 删除帖子、禁言、管理后台 |
| 拥有者 (owner) | 管理员权限 + 修改角色、完全系统控制 |

## 🛠️ 开发指南

1. 改模型 → `python manage.py makemigrations` → `python manage.py migrate`
2. 权限装饰器：`@login_required` / `@role_required('mod','owner')` / `@not_muted_required`（见 `accounts/decorators.py`）
3. 邮件工具：`accounts/utils.py` 的 `send_verification_email` / `send_password_reset_email`

## 🧪 测试

```bash
python test_features.py
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License（作者：drz8848）

---

**注意**：这是一个学习项目，请根据实际需求进行调整和优化。