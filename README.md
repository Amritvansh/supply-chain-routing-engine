# Distributed Supply Chain Routing & Inventory Balancing Engine

An intelligent logistics engine that routes e-commerce orders to the optimal warehouse using a distance/cost-based scoring algorithm, computes 3D bin-packing for split shipments, and prevents overselling during flash sales via Redis distributed locking and Postgres transactions. Built with React, Node/Express, PostgreSQL, and Redis.

## Architecture

This project uses a **Hybrid Architecture** with two distinct paths:

1. **Synchronous Deterministic Path** — The checkout flow uses pure math (cost function + bin-packing) and ACID transactions. Target latency: <50ms. This path never calls external AI services.
2. **Asynchronous AI Explainability Path** — After checkout completes, the system can generate a plain-language explanation of routing decisions via the Gemini API. This is entirely non-blocking; if Gemini is unavailable, a deterministic fallback is used.

> **Critical design rule:** The deterministic checkout path must not depend on the asynchronous AI explanation layer. Gemini failure must never cause checkout failure.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React, Tailwind CSS, Mapbox GL JS, Recharts |
| API Server | Node.js, Express |
| Database | PostgreSQL |
| Cache / Locks | Redis |
| AI (async) | Google Gemini API (free tier) |
| Distance | Google Maps Distance Matrix API (with Haversine fallback) |

---

## Getting Started

### Prerequisites

- **Node.js** >= 18.0.0
- **PostgreSQL** >= 14
- **Redis** (required later for concurrency engine)

### 1. Clone and Install

```bash
git clone https://github.com/Amritvansh/supply-chain-routing-engine.git
cd supply-chain-routing-engine/server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your `DATABASE_URL`:

```
DATABASE_URL=postgres://username:password@localhost:5432/supply_chain_db
```

Create the database if it doesn't exist:

```bash
createdb supply_chain_db
```

### 3. Run Migrations

```bash
npm run migrate
```

This discovers all SQL files in `db/migrations/`, sorts them numerically, and executes each one inside a transaction. A `_migrations` tracking table ensures idempotency — running the command a second time safely skips already-applied migrations.

### 4. Seed Sample Data

```bash
npm run seed
```

Inserts 5 warehouses, 10 SKUs, and inventory rows with deliberately varied stock levels (healthy, low-stock, out-of-stock, and unstocked combinations) to support routing algorithm testing.

The seed script uses `ON CONFLICT DO NOTHING` and is safely repeatable.

---

## Database Schema

### Entity Relationship Overview

The database has 9 tables organized into two groups:

**Transactional Core** (used by the checkout path):
- `warehouses` — Physical warehouse locations with lat/lng coordinates
- `skus` — Product catalog with dimensions and weight (for bin-packing)
- `inventories` — Stock levels per warehouse/SKU pair (available + reserved quantities)
- `orders` — Customer orders with idempotency keys for safe flash-sale retries
- `order_items` — Line items linking orders to SKUs
- `shipments` — Routing results; one order can produce multiple shipments (split orders)

**Observability & Async Layer** (never read during checkout):
- `lock_audit` — Append-only log of Redis lock attempts for stress-test analysis
- `webhook_events` — Simulated inbound shipment status transitions
- `ai_explanations` — Cached AI-generated routing explanations (leaf table)

### Entity Relationship Diagram

```mermaid
erDiagram
    %% ─── Transactional Core ───────────────────────────────
    warehouses {
        UUID id PK
        TEXT name
        DOUBLE_PRECISION lat
        DOUBLE_PRECISION lng
        BOOLEAN active
    }

    skus {
        TEXT sku PK
        TEXT name
        INT length_cm
        INT width_cm
        INT height_cm
        NUMERIC weight_kg
    }

    inventories {
        UUID id PK
        UUID warehouse_id FK
        TEXT sku FK
        INT available_qty
        INT reserved_qty
    }

    orders {
        UUID id PK
        DOUBLE_PRECISION customer_lat
        DOUBLE_PRECISION customer_lng
        TEXT status
        TEXT idempotency_key UK
        TIMESTAMPTZ created_at
    }

    order_items {
        UUID id PK
        UUID order_id FK
        TEXT sku FK
        INT qty
    }

    shipments {
        UUID id PK
        UUID order_id FK
        UUID warehouse_id FK
        TEXT box_size
        NUMERIC total_cost
        NUMERIC distance_km
        TIMESTAMPTZ created_at
    }

    %% ─── Observability / Async Layer ─────────────────────
    lock_audit {
        UUID id PK
        TEXT sku
        BOOLEAN acquired
        INT waited_ms
        TIMESTAMPTZ created_at
    }

    webhook_events {
        UUID id PK
        UUID shipment_id FK
        TEXT status
        TIMESTAMPTZ created_at
    }

    ai_explanations {
        UUID id PK
        UUID order_id FK
        TEXT explanation_text
        TEXT model_used
        TEXT source
        INT latency_ms
        TIMESTAMPTZ created_at
    }

    %% ─── Relationships ──────────────────────────────────
    warehouses ||--o{ inventories : "stocks"
    skus ||--o{ inventories : "tracked at"
    orders ||--o{ order_items : "contains"
    orders ||--o{ shipments : "fulfilled by"
    skus ||--o{ order_items : "references"
    warehouses ||--o{ shipments : "ships from"
    shipments ||--o{ webhook_events : "lifecycle"
    orders ||--o| ai_explanations : "LEAF: explained by"
```

> **⚠️ Note:** `ai_explanations` is a **leaf table** — it points TO `orders` via a FK, but **no transactional table points INTO it**. The checkout path never reads or writes this table. It can be truncated or rebuilt independently.

### Table Details

#### `warehouses`
Stores warehouse name, geographic coordinates, and active status. The routing engine uses lat/lng to compute distance scores.

#### `skus`
Normalized product catalog. Dimensions (`length_cm`, `width_cm`, `height_cm`) and `weight_kg` are read by the bin-packing algorithm to determine box sizing (SMALL / MEDIUM / LARGE).

#### `inventories`
One row per warehouse/SKU pair. `available_qty` tracks sellable units; `reserved_qty` tracks committed-but-unshipped units. This separation prevents double-decrement bugs. Has a `UNIQUE(warehouse_id, sku)` constraint.

#### `orders`
Customer location + order status. The `idempotency_key` column (`UNIQUE NOT NULL`) ensures that a dropped HTTP response during a flash sale cannot cause a duplicate order on retry. Status values: `PENDING`, `ROUTED`, `SPLIT`, `FAILED`, `FULFILLED`.

#### `order_items`
Line items with a `CHECK (qty > 0)` constraint.

#### `shipments`
Each shipment represents one leg of a routed order. `box_size` is `SMALL`, `MEDIUM`, or `LARGE`. `total_cost` is the routing engine's computed score. Split orders produce multiple shipment rows.

#### `lock_audit`
Every Redis lock attempt (acquired or failed) is logged with wait time in milliseconds. Used by stress-test analysis scripts to graph contention rates.

#### `webhook_events`
Logs simulated inbound shipment lifecycle events (`PICKED_UP` → `IN_TRANSIT` → `DELIVERED`). Transition validation is handled by the API controller, not the schema.

#### `ai_explanations`

> ⚠️ **Design Note for Contributors:** This is an intentionally decoupled **leaf table**. It has a foreign key pointing TO `orders`, but no other table has a foreign key pointing INTO `ai_explanations`. This is by design — the entire table can be truncated or rebuilt without affecting any order, inventory, or shipment data. **Do not add reverse foreign keys from transactional tables into this table.**

Caches AI-generated (or fallback-template) explanations of routing decisions. The `source` column indicates whether the text came from `'gemini'` or `'fallback_template'` (used when the Gemini API is unavailable). The `order_id` column is `UNIQUE` so each order has at most one cached explanation.

### Indexes

| Index | Table | Column(s) | Purpose |
|---|---|---|---|
| `idx_inventories_sku` | inventories | sku | Fast SKU-based stock lookups during routing |
| `idx_inventories_warehouse` | inventories | warehouse_id | Fast per-warehouse inventory queries |
| `idx_orders_status` | orders | status | Dashboard filtering by order status |
| `idx_shipments_order_id` | shipments | order_id | Order detail joins (Week 4) |
| `idx_order_items_order_id` | order_items | order_id | Order detail joins (Week 4) |
| `idx_orders_created_at` | orders | created_at DESC | Dashboard recent-orders sort (Week 4) |

---

## Project Structure

```
server/
├── algorithms/
│   ├── binPacking.js          # 3D bin-packing (FFD algorithm)
│   ├── costFunction.js        # Deterministic routing cost calculator
│   ├── inputValidation.js     # Input sanity guards (Week 4)
│   └── routingEngine.js       # Warehouse selection + split routing
├── db/
│   ├── migrations/
│   │   ├── 001_warehouses.sql
│   │   ├── 002_skus.sql
│   │   ├── 003_inventories.sql
│   │   ├── 004_orders.sql
│   │   ├── 005_order_items.sql
│   │   ├── 006_shipments.sql
│   │   ├── 007_lock_audit.sql
│   │   ├── 008_webhook_events.sql
│   │   ├── 009_ai_explanations.sql
│   │   └── 010_performance_indexes.sql
│   ├── transactions/
│   │   └── checkoutTransaction.js
│   ├── lockAudit.js
│   ├── migrate.js             # Idempotent migration runner
│   ├── pool.js
│   └── seed.js                # Sample data seeder
├── errors/
│   └── checkoutErrors.js
├── services/
│   ├── redisClient.js
│   └── redisLock.js
├── .env.example               # Environment variable template
└── package.json
```

---

## Team Ownership

| Member | Owns |
|---|---|
| **M1 — Core Algorithms & DB Lead** | Schema, migrations, Redis locks, ACID transactions, bin-packing, cost function |
| **M2 — API & Orchestration Lead** | Express server, Maps/Haversine, Gemini service, checkout controller, stress tests |
| **M3 — Frontend & Geospatial Lead** | React, Tailwind, Mapbox, dashboards, AI explanation widget |
