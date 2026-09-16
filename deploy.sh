#!/usr/bin/env bash
# ============================================================
# 东方幻绮梦论坛 —— 一键快速部署脚本（任意机器 / 任意隧道通用）
#
# 用法：
#   ./deploy.sh <隧道域名>
#       例：./deploy.sh xbyzkqdh-8000.cn-north-4-bridge.myhuaweicloud.com
#   ./deploy.sh              # 不带参数 = 仅本地 localhost/127.0.0.1 访问
#
# 适用隧道：DevBridge、Cloudflare Tunnel(cloudflared)、ngrok 等任何 HTTPS 反代，
# 只需把对外域名作为参数传入（cloudflared 会经 X-Forwarded-Proto 交给 Django，
# 脚本会自动开启信任，让 Django 正确识别 HTTPS）。
#
# 环境变量（优先级：真实 shell 环境变量 > .env 文件 > settings.py 默认值）：
#   ALLOWED_HOSTS / CSRF_TRUSTED_ORIGINS / TRUST_X_FORWARDED_PROTO
#       隧道/反代域名配置，建议统一放 .env（模板见 .env 文件注释）
#   ADMIN_USER / ADMIN_PASS / ADMIN_EMAIL / ADMIN_RESET_PASSWORD
#       初始超级管理员配置，放 .env，由 ensure_admin 命令读取
#
# 端口：服务固定监听 0.0.0.0:8000，隧道建到该端口即可。
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

HOST="${1:-}"

# 1) 把隧道域名注入 Django 配置（不修改 settings.py，靠环境变量）
if [ -n "$HOST" ]; then
  export ALLOWED_HOSTS="${ALLOWED_HOSTS:-${HOST},localhost,127.0.0.1}"
  export CSRF_TRUSTED_ORIGINS="${CSRF_TRUSTED_ORIGINS:-https://${HOST}}"
  export TRUST_X_FORWARDED_PROTO="${TRUST_X_FORWARDED_PROTO:-true}"
fi
echo ">> ALLOWED_HOSTS         = ${ALLOWED_HOSTS:-<默认: localhost/127.0.0.1/pythonanywhere>}"
echo ">> CSRF_TRUSTED_ORIGINS  = ${CSRF_TRUSTED_ORIGINS:-<空：非 HTTPS 场景不需要>}"
echo ">> TRUST_X_FORWARDED_PROTO= ${TRUST_X_FORWARDED_PROTO:-<false: 仅本地 http>}"

# 2) 安装依赖（华为云镜像加速，装过会秒过）
echo ">> [1/4] 安装依赖 ..."
python3 -m pip install -r requirements.txt -i https://mirrors.huaweicloud.com/repository/pypi/simple

# 3) 数据库迁移（幂等，可反复执行；首次会生成 db.sqlite3）
echo ">> [2/4] 数据库迁移 ..."
python3 manage.py migrate

# 4) 根据 .env 的 ADMIN_USER/ADMIN_PASS 创建/更新超级管理员（幂等，可反复执行）
echo ">> [3/4] 检查超级管理员（由 .env 的 ADMIN_USER/ADMIN_PASS 控制）..."
python3 manage.py ensure_admin

# 5) 启动服务（前台；Ctrl+C 停止）
echo ">> [4/4] 启动服务：http://localhost:8000"
[ -n "$HOST" ] && echo "         隧道访问：https://${HOST}/"
exec python3 manage.py runserver 0.0.0.0:8000