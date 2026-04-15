# Redup Backend

Go + Gin + GORM + PostgreSQL.

## 快速开始

### 1. 启动 PostgreSQL 和 Redis

```bash
docker compose up -d
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 按需修改 .env（默认值本地可直接用）
```

### 3. 运行

```bash
go run ./cmd/server
```

默认监听 `:8080`，健康检查 `GET /api/health`。

## 目录结构

```
backend/
├── cmd/server/          启动入口
├── config/              环境配置
├── internal/
│   ├── auth/            JWT + 鉴权中间件
│   ├── db/              GORM 初始化
│   ├── http/            CORS 等 HTTP 中间件
│   └── user/            用户域（model/repo/service/handler）
├── docker-compose.yml   本地 Postgres + Redis
├── .env.example
└── go.mod
```

## 已实现接口

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册新用户 |
| POST | `/api/auth/login` | 用户名或邮箱登录 |
| POST | `/api/auth/refresh` | 刷新 access token |
| POST | `/api/auth/logout` | 退出登录（无状态 JWT，Phase 2 加 Redis blocklist） |

### 用户

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/users/me` | ✔ | 获取当前用户 |

### 系统

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |

## 响应格式

所有接口返回同一层包裹结构，顶层只会出现 `data` 或 `error` 之一。

**成功：**
```json
{ "data": { ... } }
```

**错误：**
```json
{ "error": { "code": "username_taken", "message": "username already taken" } }
```

`code` 是稳定的机读标识，前端做错误分支时应匹配 `code` 而不是 `message`。常用 code 定义在 `internal/http/response.go`。

## 接口示例

### 注册

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"zero","email":"zero@redup.dev","password":"hunter2hunter"}'
```

成功响应（`201 Created`）：

```json
{
  "data": {
    "user": { "id": 1, "username": "zero", ... },
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_in": 900
  }
}
```

错误响应示例（`409 Conflict`）：

```json
{
  "error": { "code": "username_taken", "message": "username already taken" }
}
```

### 登录

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"zero","password":"hunter2hunter"}'
```

`login` 字段支持用户名或邮箱。

### 获取自己

```bash
curl http://localhost:8080/api/users/me \
  -H "Authorization: Bearer <access_token>"
```

### 刷新 token

```bash
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token":"eyJ..."}'
```

## 注册字段校验

- **username**：字母开头，3-32 位，允许 `a-zA-Z0-9_-`
- **email**：标准邮箱格式
- **password**：至少 8 位（后续加更严格的规则）

## 下一步

- [ ] 帖子 / 回复模块（`internal/forum`）
- [ ] 板块 CRUD（`internal/platform/categories`）
- [ ] 匿名 ID 生成（`internal/anon`）
- [ ] Bot Gateway（`internal/bot/gateway`）
- [ ] RBAC 权限系统（`internal/platform/roles`）
- [ ] Refresh token 撤销（Redis blocklist）
- [ ] 请求日志 / recovery / 限流中间件
