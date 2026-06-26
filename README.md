# Product API

Learning project: REST product API with **PostgreSQL**, **Redis caching**, and **nginx load balancing**.

📖 **[LEARNING_GUIDE.md](./LEARNING_GUIDE.md)** — detailed student guide: architecture, ticket-by-ticket implementation, concepts, and critical thinking questions.

## Stack

- Node.js + Express
- PostgreSQL (Docker)
- Redis (Docker, cache-aside pattern)
- nginx (load balancer, 3 API replicas)
- k6 (automated load / smoke tests)

## Project scaffold (issue #6)

**Stack chosen:** Node.js + Express + PostgreSQL + Redis

**Start full stack (Postgres + Redis + 3 APIs + nginx):**

```bash
npm install
npm run lb:up
npm run db:migrate   # first time only
```

**Health check:**

```bash
curl http://localhost/health
# → { "status": "ok" }
```

Copy `.env.example` to `.env` for local single-instance dev (`npm run dev`).

## Setup (local dev)

```bash
npm install
# Copy .env.example to .env and adjust if needed
npm run db:up
npm run db:migrate
npm run dev
```

API runs at `http://localhost:3000`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API with nodemon |
| `npm run db:up` | Start Postgres + Redis in Docker |
| `npm run db:down` | Stop Docker services |
| `npm run db:migrate` | Run SQL migrations |
| `npm run lb:up` | Start full stack (3 APIs + nginx + DB + Redis) |
| `npm run lb:down` | Stop full stack |
| `npm run test:k6` | k6 smoke test (health + products) |
| `npm run test:k6:health` | k6 health check only |
| `npm run test:k6:lb` | k6 load balancer header test |
| `npm run test:k6:rate-limit` | k6 rate limit test (expect 429) |

## Local dev (single instance)

```bash
npm run db:up
npm run db:migrate
npm run dev
```

API at `http://localhost:3000`.

## Load balancing (issue #3)

```bash
npm run lb:up
npm run db:migrate   # first time only
```

All traffic goes through nginx at **`http://localhost`** (port 80).

Test round-robin — run 10 times and check `X-Instance-Id` header:

```bash
curl -i http://localhost/health
```

PowerShell:

```powershell
1..10 | ForEach-Object { (Invoke-WebRequest http://localhost/health).Headers['X-Instance-Id'] }
```

You should see `api-1`, `api-2`, `api-3` rotating.

Product API through load balancer:

```bash
curl http://localhost/products
curl http://localhost/products/1
```

Stop: `npm run lb:down`

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/products` | Create product |
| GET | `/products` | List products |
| GET | `/products/:id` | Get product (cached in Redis) |
| PUT | `/products/:id` | Update product |
| DELETE | `/products/:id` | Delete product |
| POST | `/products/:id/purchase` | Purchase (decrement stock) |

## k6 automated tests

Requires Docker. Start the stack first: `npm run lb:up`

```bash
npm run test:k6:health      # GET /health → 200
npm run test:k6             # smoke: health + products
npm run test:k6:lb          # X-Instance-Id from api-1/2/3
npm run test:k6:rate-limit  # 110 requests → some 429
```

k6 runs in Docker (`grafana/k6`) and hits `http://host.docker.internal` (your nginx on port 80).

## Example requests

```bash
curl -X POST http://localhost:3000/products \
  -H "Content-Type: application/json" \
  -d '{"name":"Mouse","description":"Wireless","price":29.99,"stock":10}'

curl http://localhost:3000/products
curl http://localhost:3000/products/1

curl -X PUT http://localhost:3000/products/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Mouse Pro","description":"Updated","price":34.99,"stock":5}'

curl -X DELETE http://localhost:3000/products/1
```

## Redis caching

- `GET /products/:id` → key `product:{id}` (TTL 10 min)
- `GET /products` → key `products:list:{page}`
- POST / PUT / DELETE invalidate affected cache keys
- Terminal logs show `CACHE HIT` / `CACHE MISS`

Inspect cache with [Redis Insight](https://redis.io/insight/) at `localhost:6379`.

## Rate limiting

- `GET /products` and `GET /products/:id` — **100 requests per minute per IP**
- Returns `429 Too Many Requests` with `Retry-After` header when exceeded
- Enforced via shared Redis (works across all load-balanced instances)

Test via nginx:

```powershell
1..105 | ForEach-Object {
  try {
    $r = Invoke-WebRequest http://localhost/products -UseBasicParsing
    "$_ : $($r.StatusCode)"
  } catch {
    "$_ : $($_.Exception.Response.StatusCode.value__)"
  }
}
```

Requests 101+ should return `429`.

## Purchase endpoint (issue #5)

`POST /products/:id/purchase` with body `{ "quantity": 1 }`

Uses a Redis lock (`lock:product:{id}`) so concurrent purchases cannot oversell stock.

```bash
curl -X POST http://localhost/products/1/purchase \
  -H "Content-Type: application/json" \
  -d '{"quantity": 1}'
```

Concurrent test (set product stock to 1 first):

```bash
# via nginx
API_URL=http://localhost/products node scripts/concurrent-purchase.js 1 1 10
```

Only one request should succeed (`200`); others return `409 Insufficient stock`.

## Env vars

```
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/productdb
REDIS_URL=redis://localhost:6379
```
