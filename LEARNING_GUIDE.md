# Product API — Student Learning Guide

> **Purpose:** This document explains *how* and *why* this project was built, ticket by ticket. Read it when you want to understand concepts, code flow, and critical thinking behind each decision — not just copy-paste answers.

**Repo:** [github.com/akshatsoni123/Product-API](https://github.com/akshatsoni123/Product-API)

---

## Table of contents

1. [What this project teaches](#1-what-this-project-teaches)
2. [Big picture architecture](#2-big-picture-architecture)
3. [Folder structure explained](#3-folder-structure-explained)
4. [How a request travels (full flow)](#4-how-a-request-travels-full-flow)
5. [Ticket-by-ticket build order](#5-ticket-by-ticket-build-order)
   - [Ticket #6 — Scaffold](#ticket-6--scaffold-docker-postgresql-redis-health--k6)
   - [Ticket #1 — Product CRUD](#ticket-1--product-crud-with-postgresql)
   - [Ticket #2 — Redis cache](#ticket-2--redis-cache-aside)
   - [Ticket #3 — Load balancing](#ticket-3--nginx-load-balancer-3-api-instances)
   - [Ticket #4 — Rate limiting](#ticket-4--redis-rate-limiting)
   - [Ticket #5 — Purchase + lock](#ticket-5--purchase-endpoint-with-redis-lock)
6. [Key concepts glossary](#6-key-concepts-glossary)
7. [Two ways to run the project](#7-two-ways-to-run-the-project)
8. [Testing cheat sheet](#8-testing-cheat-sheet)
9. [Critical thinking questions](#9-critical-thinking-questions-ask-yourself)
10. [Common mistakes & debugging](#10-common-mistakes--debugging)
11. [What to learn next](#11-what-to-learn-next)

---

## 1. What this project teaches

This is a **learning project**, not a production app. You built a small Product API and layered real backend skills on top:

| Skill | Where in project |
|-------|------------------|
| REST API design | CRUD endpoints |
| SQL / PostgreSQL | `products` table, migrations |
| Docker | Postgres, Redis, API containers |
| Redis caching | Cache-aside pattern |
| Horizontal scaling | 3 identical API instances |
| Load balancing | nginx round-robin |
| Distributed rate limiting | Redis counter shared by all instances |
| Concurrency / locks | Redis lock on purchase |
| Automated load tests | k6 scripts |

**Critical thinking goal:** Understand *why* each piece exists and what breaks if you remove it.

---

## 2. Big picture architecture

```
                    ┌─────────────┐
   Postman / curl → │   nginx     │  port 80 (only public entry in LB mode)
                    │ (load bal.) │
                    └──────┬──────┘
                           │ round-robin
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
        api-1           api-2           api-3    (same code, different INSTANCE_ID)
           │               │               │
           └───────────────┼───────────────┘
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
        PostgreSQL                   Redis
     (source of truth)          (cache, locks, rate limits)
```

**Golden rules of this architecture:**

1. **PostgreSQL** = permanent data (products, stock). Never store products only in memory.
2. **Redis** = fast temporary data (cache, counters, locks). Not the main database.
3. **API instances are stateless** — any instance can handle any request because shared DB + Redis exist.
4. **nginx** = single door for clients in load-balancer mode (port 80).

---

## 3. Folder structure explained

```
Product-API/
├── src/
│   ├── index.js                 # App entry — starts Express, mounts middleware & routes
│   ├── routes/products.js       # URL → controller mapping
│   ├── controllers/productController.js  # Business logic + SQL
│   ├── validators/product.js    # Input validation (400 errors)
│   ├── middleware/
│   │   ├── instanceId.js        # Adds X-Instance-Id header
│   │   └── rateLimiter.js       # Redis-backed 100 req/min on GET
│   ├── services/
│   │   ├── cache.js             # Cache get/set/invalidate helpers
│   │   └── lock.js              # Redis distributed lock for purchase
│   └── db/
│       ├── pool.js              # PostgreSQL connection pool
│       └── redis.js             # Redis client (ioredis)
├── migrations/
│   └── 001_create_products.sql  # Database schema
├── docker/
│   └── docker-compose.yml       # Postgres + Redis + 3 APIs + nginx
├── nginx/
│   └── nginx.conf               # Load balancer config
├── scripts/
│   ├── concurrent-purchase.js   # Test overselling protection
│   └── k6/                      # Automated load tests
├── Dockerfile                   # Builds API image for Docker
├── .env.example                 # Environment variable template
└── README.md                    # Quick reference (commands)
```

**Why this layout?**

- **routes** = thin (only wiring)
- **controllers** = fat (logic)
- **services** = reusable Redis helpers
- **middleware** = runs before every (or some) requests
- **db** = connection setup only

This is a common Node.js pattern. As projects grow, you keep the same idea.

---

## 4. How a request travels (full flow)

Example: `GET http://localhost/products/1` (through nginx)

```
1. Client sends request to nginx :80
2. nginx picks api-2 (round-robin)
3. nginx forwards request, sets X-Real-IP header
4. Express on api-2:
   a. instanceId middleware → sets X-Instance-Id: api-2
   b. rateLimiter on GET → Redis INCR ratelimit:products:{ip}
      → if > 100/min → 429 STOP
   c. productController.getById:
      → check Redis key product:1
      → HIT? return cached JSON
      → MISS? query PostgreSQL → save to Redis → return
5. Response goes back through nginx to client
```

Example: `POST http://localhost/products/1/purchase` with `{ "quantity": 1 }`

```
1. nginx → random api instance
2. No rate limit on POST (only GET is limited)
3. purchase controller:
   a. Validate quantity
   b. Check product exists (404 if not)
   c. Acquire Redis lock lock:product:1
   d. SQL: UPDATE stock WHERE stock >= quantity
   e. Release lock
   f. Invalidate Redis cache for product + lists
   g. Return updated product
```

---

## 5. Ticket-by-ticket build order

> **Note:** GitHub issue numbers are not the order we built in. **Logical build order** is below.

---

### Ticket #6 — Scaffold (Docker, PostgreSQL, Redis, health + k6)

**Goal:** Get a running foundation before feature code.

**What we added:**

| File | Purpose |
|------|---------|
| `docker/docker-compose.yml` | Runs Postgres, Redis, APIs, nginx |
| `.env.example` | Documents `PORT`, `DATABASE_URL`, `REDIS_URL` |
| `src/index.js` | `GET /health` → `{ status: "ok" }` |
| `Dockerfile` | Packages Node app for containers |
| `scripts/k6/health.js` | Automated health check |

**Key concept — Docker Compose:**

One file starts multiple services. Services talk by **service name** inside Docker network:
- `postgres` hostname inside Docker (not `localhost`)
- `redis` hostname inside Docker

**Why `GET /health`?**

A tiny endpoint with no database logic. Used to verify "is the server alive?" — standard in real apps and load balancers.

**Student question:** *What happens if Postgres is down but API is up?*
- `/health` still returns 200 (we don't check DB in health)
- `/products` would fail with 500 when querying DB
- In production, you'd add a "deep health" check that pings DB too

**Commands:**

```bash
npm run lb:up          # full stack
npm run db:migrate     # create products table
npm run test:k6:health # automated test
curl http://localhost/health
```

---

### Ticket #1 — Product CRUD with PostgreSQL

**Goal:** All product data lives in PostgreSQL. No in-memory arrays.

**What we added:**

| File | Purpose |
|------|---------|
| `migrations/001_create_products.sql` | Creates `products` table |
| `src/db/pool.js` | `pg` Pool — reusable DB connections |
| `src/validators/product.js` | Rejects bad input → 400 |
| `src/controllers/productController.js` | SQL for create/list/get/update/delete |
| `src/routes/products.js` | Maps URLs to controller |

**Endpoints:**

| Method | Path | SQL idea |
|--------|------|----------|
| POST | `/products` | INSERT |
| GET | `/products` | SELECT all |
| GET | `/products/:id` | SELECT by id |
| PUT | `/products/:id` | UPDATE |
| DELETE | `/products/:id` | DELETE |

**Key concept — connection pool (`pool.js`):**

Opening a new DB connection per request is slow. A **pool** keeps connections ready and reuses them.

**Key concept — parameterized queries (`$1`, `$2`):**

```js
pool.query('SELECT * FROM products WHERE id=$1', [id]);
```

Prevents SQL injection. Never concatenate user input into SQL strings.

**Key concept — validation before DB:**

Check `name`, `price`, `stock` *before* hitting PostgreSQL. Return `400` early — saves DB work and gives clear errors.

**Dev workflow (single instance):**

```bash
npm run db:up      # Postgres + Redis only
npm run db:migrate
npm run dev        # API on localhost:3000
```

**Student question:** *Why PostgreSQL and not Redis for products?*
- Postgres = durable, relational, ACID transactions, source of truth
- Redis = fast but memory-first; you'd lose data if not configured for persistence

---

### Ticket #2 — Redis cache-aside

**Goal:** Speed up read-heavy endpoints. Invalidate cache when data changes.

**What we added:**

| File | Purpose |
|------|---------|
| `src/db/redis.js` | Redis client + TTL (10 min) |
| `src/services/cache.js` | get/set/delete cache helpers |
| Updated `productController.js` | Cache on GET, invalidate on writes |

**Cache-aside pattern (most important Redis pattern here):**

```
READ:
  1. Check Redis
  2. If HIT → return cached data (fast)
  3. If MISS → read PostgreSQL → write to Redis → return

WRITE (create/update/delete/purchase):
  1. Update PostgreSQL
  2. DELETE related Redis keys (invalidate)
```

**Cache keys used:**

| Key | When |
|-----|------|
| `product:{id}` | Single product GET |
| `products:list:{page}` | List GET |

**Why invalidate on write?**

If you update a product but don't clear cache, clients see **stale old data**. Cache is useless if wrong.

**Logs to watch:**

```
CACHE HIT  product:1
CACHE MISS product:1
```

**Student question:** *Why not cache POST/PUT responses?*
- Those change data; caching reads is the win (80% of traffic in many apps is reads)

**Student question:** *What if Redis is down?*
- Currently the app errors. Production apps often "fall through" to DB only when Redis fails.

---

### Ticket #3 — nginx load balancer (3 API instances)

**Goal:** Run multiple identical APIs behind one URL. Prove requests spread across instances.

**What we added:**

| File | Purpose |
|------|---------|
| `docker-compose.yml` | `api-1`, `api-2`, `api-3` + nginx |
| `nginx/nginx.conf` | upstream round-robin |
| `src/middleware/instanceId.js` | `X-Instance-Id` response header |
| `Dockerfile` | Same image for all 3 APIs |

**nginx.conf explained simply:**

```nginx
upstream api_backend {
  server api-1:3000;
  server api-2:3000;
  server api-3:3000;
}
```

nginx sends request 1 → api-1, request 2 → api-2, request 3 → api-3, request 4 → api-1, ...

**`INSTANCE_ID` env var:**

Each container gets a different ID (`api-1`, `api-2`, `api-3`). Middleware puts it in response header so **you** can see which instance answered.

**Key concept — stateless apps:**

If api-1 stored cart data in its own memory, api-2 wouldn't see it. We avoid that — all data in Postgres/Redis.

**Important URLs:**

| URL | Mode |
|-----|------|
| `http://localhost` (port 80) | Through nginx — LB test |
| `http://localhost:3000` | Single `npm run dev` — no LB |

**Student question:** *Why 3 instances and not 10?*
- Learning project — 3 is enough to see round-robin. Production scales based on load.

---

### Ticket #4 — Redis rate limiting

**Goal:** Stop one IP from spamming `GET /products` thousands of times. Limit works **across all 3 API instances**.

**What we added:**

| File | Purpose |
|------|---------|
| `src/middleware/rateLimiter.js` | Redis counter per IP |
| `src/routes/products.js` | Applied only to GET routes |
| `src/index.js` | `trust proxy` for real IP behind nginx |

**How it works:**

```js
Redis INCR ratelimit:products:{ip}   // count +1
EXPIRE key 60 seconds               // window = 1 minute
if count > 100 → 429 Too Many Requests
```

**Why Redis (not a variable in Node memory)?**

```
api-1 memory: 50 requests
api-2 memory: 50 requests
api-3 memory: 50 requests
→ Attacker sends 150 total — each instance thinks it's OK!

Redis (shared): 150 total — correctly blocked at 101
```

**Why only GET routes first?**

Reads are spammed most (bots scraping). Writes need different limits and often authentication.

**`trust proxy`:**

Behind nginx, `req.ip` might be nginx's IP. nginx sends `X-Real-IP` — we read that for the rate limit key.

**Student question:** *What's the difference between 429 and 409?*
- `429` = too many requests (rate limit)
- `409` = conflict (e.g. out of stock, lock busy)

---

### Ticket #5 — Purchase endpoint with Redis lock

**Goal:** When stock = 1 and two people buy at the same time, only one succeeds. Stock never goes negative.

**What we added:**

| File | Purpose |
|------|---------|
| `src/routes/products.js` | `POST /:id/purchase` |
| `src/services/lock.js` | `withProductLock()` |
| `purchase` in controller | lock → SQL → invalidate cache |
| `scripts/concurrent-purchase.js` | Fires 10 parallel purchases |

**Endpoint:**

```
POST /products/1/purchase
Body: { "quantity": 1 }
```

**Two layers of protection:**

1. **Redis lock** (`lock:product:1`) — only one purchase at a time per product
2. **SQL guard** — `WHERE stock >= quantity` — DB refuses to go negative even if logic has a bug

**Lock flow:**

```
Try SET lock:product:1 NX (only if not exists)
  → got lock? run SQL decrement → release lock
  → no lock? 409 "Could not acquire lock"
```

**Why Lua script on release?**

Only delete the lock if **you** still own it (your token matches). Prevents deleting another request's lock by mistake.

**After success:**

Invalidate `product:{id}` cache so next GET shows new stock.

**Test:**

```bash
# Set stock to 1, then:
API_URL=http://localhost/products node scripts/concurrent-purchase.js 1 1 10
# Expected: 1 success, 9 failures, final stock = 0
```

**Student question:** *Is the lock alone enough without the SQL WHERE clause?*
- No — always keep DB as final guard. Defense in depth.

---

## 6. Key concepts glossary

| Term | Simple meaning |
|------|----------------|
| **CRUD** | Create, Read, Update, Delete |
| **Cache-aside** | App manages cache: read cache first, on miss read DB, on write delete cache |
| **TTL** | Time To Live — how long cache entry survives (we use 600 sec) |
| **Round-robin** | Distribute requests evenly: 1→2→3→1→2→3 |
| **Stateless** | Server doesn't remember user between requests; all state in DB/Redis |
| **Rate limiting** | Cap how many requests one client can make per time window |
| **Distributed lock** | Only one process across all servers can do a critical action at once |
| **409 Conflict** | Request valid but can't complete (out of stock, lock busy) |
| **429 Too Many Requests** | Client sent too many requests (rate limited) |
| **Migration** | SQL file that creates/changes database schema |
| **Middleware** | Function that runs before your route handler |

---

## 7. Two ways to run the project

### Mode A — Local dev (coding)

Best when writing/changing code. Fast reload with nodemon.

```bash
npm run db:up       # Postgres + Redis in Docker
npm run db:migrate
npm run dev         # API on http://localhost:3000
```

`.env` uses `localhost` for DB and Redis.

### Mode B — Full stack (LB + all features)

Best when testing nginx, round-robin, rate limit through LB.

```bash
npm run lb:up       # Everything in Docker
npm run db:migrate  # first time
# API via http://localhost (port 80)
```

**Don't run both `npm run dev` and `lb:up` API at once** — confusing and port conflicts possible.

---

## 8. Testing cheat sheet

| What to test | How |
|--------------|-----|
| Health | `curl http://localhost/health` |
| CRUD | Postman on `/products` |
| Cache HIT/MISS | GET same product twice, watch terminal logs |
| Redis data | Redis Insight at `localhost:6379` |
| Load balancing | GET `/products` 10x, check `X-Instance-Id` header |
| Rate limit | 101+ GET `/products` → 429 |
| Purchase lock | `node scripts/concurrent-purchase.js 1 1 10` |
| k6 automated | `npm run test:k6:health`, `npm run test:k6:lb`, etc. |

---

## 9. Critical thinking questions (ask yourself)

### Architecture
- What breaks if we remove Redis entirely? (Slower reads, no rate limit across instances, no purchase lock)
- What breaks if we remove nginx but keep 3 APIs? (Client must pick an instance; no single URL)
- Why is PostgreSQL still needed if we have Redis?

### Caching
- What happens if we cache but never invalidate?
- Should we cache the product list forever? Why 10 min TTL?

### Load balancing
- Would round-robin still work if api-2 stored sessions in memory?
- Why does `X-Instance-Id` not appear when using `npm run dev` without `INSTANCE_ID` in `.env`?

### Rate limiting
- Why 100/minute and not 10?
- Could someone bypass rate limit by hitting api-1, api-2, api-3 directly? (Not through nginx — but in production APIs aren't exposed directly)

### Concurrency
- Two requests, stock = 5, each buys 3 — what should happen?
- Why both lock AND `WHERE stock >= quantity`?

---

## 10. Common mistakes & debugging

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| `relation "products" does not exist` | Migration not run | `npm run db:migrate` |
| `X-Instance-Id: unknown` | Using port 3000 dev mode | Use `http://localhost` + `lb:up` |
| Redis connection error | Redis container not running | `npm run db:up` or `lb:up` |
| Always CACHE HIT, stale data | Invalidation not called on write | Check controller after PUT/DELETE |
| Rate limit not triggering | Testing on port 3000 dev | Test through nginx port 80 |
| All purchases succeed with stock 1 | Lock not working / no rebuild | `npm run lb:up --build` |

---

## 11. What to learn next

After mastering this project:

1. **JWT authentication** — protect POST/PUT/DELETE
2. **Redis pub/sub** — notify when stock is low
3. **Kubernetes** — manage containers at scale (instead of manual compose)
4. **Observability** — Prometheus, Grafana, structured logs
5. **CI/CD** — GitHub Actions runs k6 on every push
6. **Managed cloud** — Neon (Postgres), Upstash (Redis), Railway/Render (API)

---

## Quick reference — all endpoints

| Method | Path | Ticket | Notes |
|--------|------|--------|-------|
| GET | `/health` | #6 | No DB |
| POST | `/products` | #1 | Create |
| GET | `/products` | #1, #2, #4 | Cached, rate limited |
| GET | `/products/:id` | #1, #2, #4 | Cached, rate limited |
| PUT | `/products/:id` | #1 | Invalidates cache |
| DELETE | `/products/:id` | #1 | Invalidates cache |
| POST | `/products/:id/purchase` | #5 | Redis lock |

---

## Suggested study path (1 hour)

1. **15 min** — Read sections 2–4 (architecture + request flow)
2. **15 min** — Run `lb:up`, hit endpoints in Postman, watch headers
3. **15 min** — Open `productController.js` and trace one GET and one POST
4. **15 min** — Answer 5 questions from section 9 without looking at answers

---

*You built this ticket by ticket. Each layer solved one real problem. That's how backend systems are designed — not all at once, but one reliable piece at a time.*
