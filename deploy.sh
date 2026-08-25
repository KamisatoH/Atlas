#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${1:-$(pwd)}"
BRANCH="${BRANCH:-main}"
APP_NAME="${APP_NAME:-atlas}"
SERVER_PORT="${SERVER_PORT:-3001}"

log() {
  printf '\n[%s] %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1"
    exit 1
  fi
}

require_cmd git
require_cmd node
require_cmd npm

if [[ ! -d "$ROOT_DIR" ]]; then
  echo "目录不存在：$ROOT_DIR"
  exit 1
fi

if [[ ! -d "$ROOT_DIR/.git" ]]; then
  echo "不是 git 仓库：$ROOT_DIR"
  exit 1
fi

cd "$ROOT_DIR"

log "更新代码"
git fetch origin "$BRANCH"
git reset --hard "origin/$BRANCH"

log "检查环境文件"
if [[ ! -f server/.env ]]; then
  cp server/.env.example server/.env
  echo "已生成 server/.env，请补全 OPENAI_API_KEY、JWT_SECRET 等配置后重跑。"
  exit 1
fi

if [[ ! -f frontend/.env ]]; then
  echo "缺少 frontend/.env，请先配置 VITE_AMAP_KEY 后重跑。"
  exit 1
fi

log "安装后端依赖"
cd "$ROOT_DIR/server"
npm ci

log "生成数据库客户端"
npm run db:generate

log "同步数据库结构"
npm run db:push

log "构建后端"
npm run build

log "安装前端依赖"
cd "$ROOT_DIR/frontend"
npm ci

log "构建前端"
npm run build

log "重启后端服务"
mkdir -p "$ROOT_DIR/logs"
if command -v pm2 >/dev/null 2>&1; then
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  PORT="$SERVER_PORT" pm2 start "$ROOT_DIR/server/dist/index.js" --name "$APP_NAME" --time --update-env --cwd "$ROOT_DIR/server"
  pm2 save
else
  echo "未检测到 pm2，建议安装后再部署：npm i -g pm2"
  nohup env PORT="$SERVER_PORT" node "$ROOT_DIR/server/dist/index.js" >"$ROOT_DIR/logs/backend.log" 2>&1 &
  echo $! >"$ROOT_DIR/logs/backend.pid"
  echo "后端已使用 nohup 启动，日志：$ROOT_DIR/logs/backend.log"
fi

log "部署完成"
