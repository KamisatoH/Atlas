# Atlas · Render + Neon 部署

这套方案使用 Render 托管前后端，使用 Neon 托管 PostgreSQL。Render 会自动提供 HTTPS 子域名，不需要购买域名或手动申请证书。

## 1. 创建 Neon 数据库

1. 打开 [Neon Console](https://console.neon.tech/)，创建一个免费项目。
2. 进入项目的 **Connect** 页面，复制 PostgreSQL 连接串。
3. 保存连接串，不要提交到 Git 或发送到聊天中。连接串通常已经包含 `sslmode=require`；如果没有，请在末尾补上。

## 2. 创建 Render 服务

1. 打开 [Render Dashboard](https://dashboard.render.com/)，选择 **New + → Blueprint**。
2. 连接 GitHub 仓库 `KamisatoH/Atlas`，分支选择 `master`。
3. Render 会读取根目录的 `render.yaml`。如果界面要求确认服务，确认创建 `atlas`。
4. 在环境变量页面补全下面 4 个秘密值：

```text
DATABASE_URL=Neon 的 PostgreSQL 连接串
JWT_SECRET=至少 32 位的随机字符串
OPENAI_API_KEY=你的大模型 API Key
VITE_AMAP_KEY=高德 Web 端 Key
VITE_AMAP_SECURITY_JS_CODE=高德安全密钥
```

其余变量已经写入 `render.yaml`。`VITE_AMAP_KEY` 和 `VITE_AMAP_SECURITY_JS_CODE` 会在前端构建时使用；它们不是大模型密钥，但仍应配置高德域名白名单。

## 3. 部署验证

部署完成后，Render 会生成类似下面的地址：

```text
https://atlas-xxxx.onrender.com
```

打开下面的地址检查后端：

```text
https://atlas-xxxx.onrender.com/api/health
```

预期返回：

```json
{"ok":true}
```

首次启动会执行 `prisma db push`，自动在 Neon 中创建 Atlas 所需的数据表。

## 4. 高德地图白名单

将 Render 分配的完整域名加入高德 Web 端 Key 的域名白名单，例如：

```text
atlas-xxxx.onrender.com
```

Render 的默认域名已经带 HTTPS，不需要另外配置证书。

## 注意事项

- Render 免费服务会在一段时间无访问后休眠，首次访问可能需要等待几十秒。
- Neon 免费数据库可能自动休眠，首次数据库请求也可能较慢。
- `DATABASE_URL`、`JWT_SECRET`、`OPENAI_API_KEY` 不要写入代码仓库。
- 如果需要更稳定的在线体验，再考虑升级实例；当前免费方案无需购买域名或证书。
