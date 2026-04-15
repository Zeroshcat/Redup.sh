# Deployment

Single-host Docker Compose deployment. Puts Postgres, Redis, the Go
backend, and the Next.js frontend on one machine behind a reverse proxy
of your choice (nginx / Caddy / Cloudflare Tunnel).

## Prerequisites

- Docker 24+ and the Compose plugin
- A domain and TLS terminator (nginx/caddy/cloudflared) pointing at the
  host — the containers listen on plain HTTP, TLS is the proxy's job

## First-time setup

```bash
git clone git@github.com:Zeroshcat/Redup.sh.git
cd Redup

# Create the production env file and edit it
cp .env.prod.example .env.prod
$EDITOR .env.prod
```

Minimum values to change in `.env.prod`:

- `POSTGRES_PASSWORD` — strong random string
- `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` — `openssl rand -hex 32` each
- `NEXT_PUBLIC_API_URL` — the URL the browser should call the backend on
- `CORS_ALLOW_ORIGIN` — must match the frontend origin exactly

## Start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The first boot runs GORM AutoMigrate. Check logs until you see `Redup
backend listening`:

```bash
docker compose -f docker-compose.prod.yml logs -f backend
```

## First admin

The first user to register is automatically promoted to admin. Register
via the frontend, then log in to `/admin` to configure site settings,
categories, and content rules.

## Reverse proxy sketch (nginx)

```nginx
server {
  server_name your.domain.com;
  listen 443 ssl http2;
  # ... ssl certs ...

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    # SSE needs buffering off and a long read timeout
    proxy_buffering off;
    proxy_read_timeout 3600s;
  }

  location = /healthz { proxy_pass http://127.0.0.1:8080/healthz; }
  location = /readyz  { proxy_pass http://127.0.0.1:8080/readyz;  }
  location = /metrics {
    # Restrict /metrics to internal scrapers only
    allow 10.0.0.0/8;
    deny all;
    proxy_pass http://127.0.0.1:8080/metrics;
  }
}
```

When proxying `/api/*` from the same origin, set `NEXT_PUBLIC_API_URL`
to `https://your.domain.com` (no `/api` suffix — the frontend API
client prefixes it) and `CORS_ALLOW_ORIGIN` to the same origin.

## Health checks

- `GET /healthz` — liveness, always 200 if process is up
- `GET /readyz` — readiness, pings Postgres and Redis; use for LB checks
- `GET /metrics` — Prometheus metrics (route, method, status, latency)

## Backups

Postgres data lives in the `postgres_data` docker volume. Recommended:

```bash
# ad-hoc dump
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > backup-$(date +%F).sql.gz
```

Schedule this via cron or your hosting provider's snapshot feature. Set
up at least one off-host copy before going live.

## Update

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

The backend graceful-shutdown handler drains in-flight requests for up
to 30s before exiting.

## Scaling note

The SSE hub is in-memory per backend instance. Running multiple backend
replicas will split real-time events across nodes; a client only sees
events from the node it happens to be connected to. For horizontal
scale, add a Redis pub/sub layer in front of the stream hub.
