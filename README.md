# Atlas

地图驱动的智能行程规划：搜索选点、AI 对话生成多日路线、行程面板编辑时间与交通。

## 结构

- `frontend/` — React + Vite + 高德地图
- `server/` — Express + Prisma (SQLite) + AI 对话 API

## 本地开发

### 后端

```bash
cd server
cp .env.example .env   # 填写 JWT_SECRET、OPENAI_API_KEY 等
npm install
npm run db:generate
npm run db:push
npm run dev            # http://localhost:3001
```

### 前端

```bash
cd frontend
# 新建 .env，配置 VITE_AMAP_KEY
npm install
npm run dev            # http://localhost:5173
```

## 环境变量

| 位置 | 变量 | 说明 |
|------|------|------|
| `server/.env` | `JWT_SECRET` | 登录令牌密钥 |
| `server/.env` | `OPENAI_API_KEY` | 大模型 API |
| `frontend/.env` | `VITE_AMAP_KEY` | 高德 Web Key |

勿将 `.env` 提交到 Git。
