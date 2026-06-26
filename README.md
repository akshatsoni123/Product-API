# Product API

Learning project: REST product API with **PostgreSQL**, **Redis caching**, and **nginx load balancing**.

## Stack

- Node.js + Express
- PostgreSQL (Docker)
- Redis (Docker, cache-aside pattern)

## Setup

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

## Env vars

```
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/productdb
REDIS_URL=redis://localhost:6379
```
