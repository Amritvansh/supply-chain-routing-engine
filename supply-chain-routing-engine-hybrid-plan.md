# Distributed Supply Chain Routing & Inventory Balancing Engine
## Hybrid Master Execution Plan (Deterministic Core + Async AI Explainability)

This supersedes the original plan by adding a non-blocking Gemini AI layer on top of the same deterministic core. The checkout path itself is unchanged in spirit — still pure math, still ACID-safe — but everything AI-related is explicitly pushed outside the critical path so a slow or down Gemini API can never affect order correctness or checkout latency.

---

## PART 1 — HYBRID MASTER EXECUTION PLAN

### 1.1 Architecture: Two Paths, One Order

```
┌────────────────────────── SYNCHRONOUS PATH (target <50ms) ──────────────────────────┐
│                                                                                        │
│  Client          Express               Redis            Postgres                     │
│    │  POST /api/v1/orders/checkout                                                    │
│    ├──────────────▶│                                                                  │
│    │                ├─ idempotency check (orders.idempotency_key)                     │
│    │                ├─ costFunction + binPacking (pure JS math, no I/O to AI)          │
│    │                ├────SETNX lock:checkout:${sku}────▶│                             │
│    │                │◀───lock acquired──────────────────┤                             │
│    │                ├────BEGIN; UPDATE inventories...──▶│                             │
│    │                │◀───COMMIT──────────────────────────┤                            │
│    │                ├────release lock──────────────────▶│                             │
│    │◀───201 { order, shipments, costBreakdown } ─┤                                    │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────── ASYNCHRONOUS PATH (fire after checkout renders) ──────────┐
│                                                                                        │
│  Client (React)        Express                    Gemini API           Postgres      │
│    │  GET /api/v1/orders/:id/explain                                                  │
│    ├──────────────────────▶│                                                          │
│    │                        ├─ check ai_explanations cache ─────────────────▶│        │
│    │                        │◀─ cache hit? return immediately ───────────────┤        │
│    │                        │  (cache miss:)                                          │
│    │                        ├─ build prompt from deterministic inputs                 │
│    │                        │   (distance, penalty, box tier, alternatives)           │
│    │                        ├──────────────────▶│ Gemini generateContent              │
│    │                        │◀──────────────────┤ plain-language explanation          │
│    │                        ├─ cache in ai_explanations ────────────────────▶│        │
│    │◀── 200 { explanation, generatedAt } ────────┤                                    │
│                                                                                        │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**The core guarantee:** `POST /api/v1/orders/checkout` never calls Gemini, never awaits it, and never fails because of it. The React UI renders the order confirmation immediately from the synchronous response, then fires the `/explain` call separately and shows a "generating explanation…" state on the Control Tower map until it resolves. If Gemini is down or the free-tier quota is exhausted, `/explain` degrades to a canned deterministic-text fallback (see §1.5) — it never blocks or fails the order itself.

### 1.2 Refined PostgreSQL Schema

Same core tables as the deterministic plan, plus one addition for AI observability:

```sql
-- (warehouses, skus, inventories, orders, order_items, shipments, lock_audit — unchanged from the deterministic core plan)

-- webhook_events (formalized from proposal stage)
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID REFERENCES shipments(id),
  status TEXT NOT NULL, -- PICKED_UP, IN_TRANSIT, DELIVERED
  received_at TIMESTAMPTZ DEFAULT now()
);

-- ai_explanations (async layer only — never read/written on the checkout path)
CREATE TABLE ai_explanations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) UNIQUE,
  explanation_text TEXT NOT NULL,
  model_used TEXT NOT NULL,           -- e.g. 'gemini-1.5-flash'
  source TEXT NOT NULL DEFAULT 'gemini', -- 'gemini' or 'fallback_template'
  latency_ms INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

`ai_explanations` is intentionally decoupled — a foreign key to `orders`, nothing referencing it back. Deleting or truncating this table can never corrupt an order or inventory state, which is the whole point of keeping AI outside the deterministic core.

### 1.3 Core Algorithmic Specs (unchanged from deterministic core)

**Cost Function:**
```
Total Cost = (distance_km × 0.5) + packaging_base_cost(box_size) + inventory_depletion_penalty(...)
packaging_base_cost: SMALL=1, MEDIUM=3, LARGE=7
depletion_penalty: remaining==0 → 50 | remaining<0 → ineligible | remaining<=5 → 10 | else 0
```

**3D Bin-Packing (First-Fit Decreasing):** sort items by volume descending, fit cumulative volume+weight into SMALL(5000cm³/2kg) → MEDIUM(20000cm³/10kg) → LARGE(50000cm³/25kg); overflow triggers `SPLIT_SHIPMENT` with recursive grouping.

**Redis Lock + ACID Transaction:** `SETNX lock:checkout:${sku}` with 5s TTL and Lua-script compare-and-delete release; `BEGIN; UPDATE inventories ... WHERE available_qty >= X; INSERT orders/order_items/shipments; COMMIT`, idempotency-key short-circuit on replay.

These three pieces are exactly what feeds the Gemini prompt in §1.5 — the AI layer explains decisions this math already made, it never makes decisions itself.

### 1.4 Complete Internal API Table

| Method | Path | Owner | Sync/Async | Purpose |
|---|---|---|---|---|
| POST | `/api/v1/orders/checkout` | M2 | **Sync**, <50ms target | Deterministic routing + ACID checkout |
| GET | `/api/v1/orders/:id` | M2 | Sync | Order + items + shipments |
| GET | `/api/v1/orders/:id/explain` | M2 | **Async** | Cached or freshly-generated Gemini explanation |
| POST | `/api/v1/orders/flash-test` | M2 | Sync (triggers async load) | Server-side flash-sale stress simulation |
| GET | `/api/v1/warehouses` | M2 | Sync | Warehouse list + inventory summary |
| POST | `/api/v1/webhooks/logistics` | M2 | Sync | Simulated inbound shipment status webhook |
| GET | `/api/v1/dashboard/map-data` | M2 | Sync | Aggregated warehouse + active-route data for Control Tower |
| GET | `/api/v1/health` | M2 | Sync | DB/Redis connectivity check |

### 1.5 Third-Party API Setup (Zero-Cost / Free Tiers)

**Google Maps Distance Matrix API**
1. Google Cloud Console → new project → enable "Distance Matrix API."
2. Create an API key, restrict it to that API + your server's IP/referrer.
3. Free tier covers light dev/demo usage; store the key as `GOOGLE_MAPS_API_KEY` in `.env`.
4. **Fallback:** if `GOOGLE_MAPS_API_KEY` is unset or the API call fails/times out, automatically fall back to a local Haversine great-circle calculation (`services/haversine.js`) — this keeps local dev and CI fully functional with zero external dependency.

**Google Gemini API (Google AI Studio, free tier)**
1. Go to Google AI Studio → "Get API key" → create a free key.
2. Use a fast, low-cost model (e.g. `gemini-1.5-flash`) since this is a short explanatory text generation, not a heavy reasoning task.
3. Store as `GEMINI_API_KEY` in `.env`.
4. **Prompt template** (built entirely from deterministic values already computed — never from raw user input, to keep this safe and consistent):
   ```
   A warehouse routing engine chose Warehouse {chosenName} ({chosenDistanceKm}km) over
   alternatives [{alt1Name} ({alt1DistanceKm}km, penalty {alt1Penalty})...].
   Chosen warehouse cost breakdown: distance_cost={x}, packaging_cost={y}, depletion_penalty={z}.
   In 2-3 plain-language sentences, explain why this warehouse was chosen over the closer/cheaper
   alternatives, referencing the specific numbers. No greetings, no markdown, no disclaimers.
   ```
5. **Fallback on failure/quota exhaustion:** if the Gemini call errors or times out (set a hard 3s timeout), fall back to a deterministic template string built from the same inputs (e.g. `"Routed to ${name} (${distance}km) over ${altName} because the depletion penalty of ${penalty} outweighed the ${diff}km distance savings."`). Store this with `source='fallback_template'` in `ai_explanations` so the UI can optionally show a subtle "AI explanation unavailable, showing computed summary" note.

**Mock Webhook Simulator:** internal only — `POST /api/v1/webhooks/logistics` accepts `{ shipment_id, status }`, validates the status transition is legal (`PICKED_UP → IN_TRANSIT → DELIVERED`, no skipping/reversing), and logs to `webhook_events`. No external service involved.

### 1.6 Team Ownership (updated)

| Member | Owns |
|---|---|
| **M1 — Core Algorithms & DB Lead** | Schema incl. `ai_explanations` table, migrations, Redis locks, ACID transactions, bin-packing, cost function |
| **M2 — API & Orchestration Lead** | Express server, Maps + Haversine fallback, **Gemini service + `/explain` endpoint**, webhook simulator, checkout controller, flash-test endpoint, stress scripts |
| **M3 — Frontend & Geospatial Lead** | React, Tailwind, Mapbox Control Tower, Order Simulator, Recharts analytics, **AI Explainability widget** |

---

## PART 2 — ANTIGRAVITY AGENT PROMPTS (12, SEQUENTIAL)

---

### Week 1 — Member 1 (Core Algorithms & Database Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 1 (Core Algorithms & Database Lead).
BRANCH: feat/m1-w1-db-foundation

TASKS:
1. Initialize /server/db with numbered SQL migrations: 001_warehouses.sql, 002_skus.sql, 003_inventories.sql, 004_orders.sql, 005_order_items.sql, 006_shipments.sql, 007_lock_audit.sql, 008_webhook_events.sql, 009_ai_explanations.sql. Use this exact schema:
   [paste schema from Section 1.2 of the Hybrid Master Plan, including ai_explanations and webhook_events]
   Note: ai_explanations.order_id must be UNIQUE and must never be referenced BY any other table (it is a leaf table by design — the checkout path must never depend on it).
2. Write db/migrate.js (idempotent runner) and db/seed.js (5 warehouses, 10 SKUs, randomized inventory).
3. Add .env.example with DATABASE_URL, REDIS_URL, GOOGLE_MAPS_API_KEY, GEMINI_API_KEY placeholders (Member 2 will use the last two).
4. Document in README.md that ai_explanations is intentionally decoupled from the transactional core — call this out explicitly as a design note so future contributors don't add foreign keys pointing into it from transactional tables.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: one commit per migration file, one for migrate.js, one for seed.js, one for README/env notes. Use conventional-commit messages.
```

---

### Week 1 — Member 2 (API & Logistics Orchestration Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 2 (API & Logistics Orchestration Lead).
BRANCH: feat/m2-w1-server-scaffold

TASKS:
1. Scaffold Express in /server under an /api/v1 router prefix (do not edit Member 1's db/ files).
2. Add config/env.js, middleware/errorHandler.js, middleware/requestLogger.js.
3. Add route stubs (501 Not Implemented) for exactly:
   POST /api/v1/orders/checkout
   GET  /api/v1/orders/:id
   GET  /api/v1/orders/:id/explain
   POST /api/v1/orders/flash-test
   GET  /api/v1/warehouses
   POST /api/v1/webhooks/logistics
   GET  /api/v1/dashboard/map-data
4. Implement GET /api/v1/health fully: pings Postgres and Redis, returns { status, db, redis }.
5. Install express, pg, ioredis, dotenv, cors, helmet, morgan. Add package.json dev/start/test scripts.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) scaffold+config, (b) middleware, (c) route stubs, (d) health check. Use conventional-commit messages.
```

---

### Week 1 — Member 3 (Frontend & Geospatial Visualization Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 3 (Frontend & Geospatial Lead).
BRANCH: feat/m3-w1-frontend-scaffold

TASKS:
1. Scaffold React (Vite) in /client, install and configure Tailwind.
2. Set up react-router-dom pages (placeholder components): ControlTowerDashboard, OrderSimulator, Analytics.
3. Build a Layout with sidebar nav to those pages.
4. Create src/lib/apiClient.js targeting the /api/v1 prefix, with methods: checkout(), getOrder(id), getExplanation(id), getWarehouses(), getMapData(), triggerFlashTest(params).
5. Create a placeholder AIExplanationWidget component (src/components/AIExplanationWidget.jsx) — empty shell for now, just accepts an orderId prop and renders "Explanation pending" — will be wired up in Week 2.
6. Add .env.example with VITE_API_URL and VITE_MAPBOX_TOKEN. Confirm clean build with no console errors.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) Vite+Tailwind setup, (b) routing+pages, (c) Layout/sidebar, (d) apiClient.js, (e) AIExplanationWidget placeholder. Use conventional-commit messages.
```

---

### Week 2 — Member 1 (Core Algorithms & Database Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 1 (Core Algorithms & Database Lead).
BRANCH: feat/m1-w2-routing-algorithms

TASKS:
1. Implement /server/algorithms/costFunction.js exactly per Section 1.3 of the Hybrid Master Plan (distance × 0.5 + packaging base + depletion penalty tiers).
2. Implement /server/algorithms/binPacking.js using First-Fit Decreasing over SMALL/MEDIUM/LARGE tiers, returning SPLIT_SHIPMENT groups when needed.
3. Implement /server/algorithms/routingEngine.js combining both to produce a ranked warehouse decision, and make sure it also returns a structured "alternatives" array (rejected warehouses + why) — this is required input for Member 2's Gemini prompt in Week 2, so the shape matters: { chosen: {...}, alternatives: [{ name, distanceKm, penalty, totalCost }] }.
4. Add a helper /server/db/aiExplanations.js exposing insertExplanation(orderId, text, modelUsed, source, latencyMs) and getExplanation(orderId) for Member 2 to use against the ai_explanations table — do not build the Gemini call itself, only the DB access helper.
5. Write Jest unit tests for all three algorithm modules (normal fit, boundary fit, split trigger, zero-stock exclusion, low-stock penalty, alternatives array shape).

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) costFunction+tests, (b) binPacking+tests, (c) routingEngine+alternatives+tests, (d) aiExplanations.js DB helper. Use conventional-commit messages.
```

---

### Week 2 — Member 2 (API & Logistics Orchestration Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 2 (API & Logistics Orchestration Lead).
BRANCH: feat/m2-w2-maps-and-gemini

TASKS:
1. Implement /server/services/googleMaps.js (Distance Matrix API wrapper) with automatic fallback to /server/services/haversine.js when GOOGLE_MAPS_API_KEY is unset or the call fails/times out (3s timeout).
2. Implement GET /api/v1/warehouses fully (join against Member 1's schema).
3. Implement GET /api/v1/orders/:id fully (order + items + shipments).
4. Implement /server/services/geminiClient.js: builds the prompt template from Section 1.5 of the Hybrid Master Plan using routingEngine's { chosen, alternatives } output, calls the Gemini API (model gemini-1.5-flash, 3s hard timeout), and on any failure/timeout/quota error returns a deterministic fallback string built from the same inputs instead of throwing.
5. Implement GET /api/v1/orders/:id/explain fully: check ai_explanations via Member 1's db/aiExplanations.js helper first (cache hit → return immediately), on cache miss call geminiClient, store the result via insertExplanation with the correct `source` field, then return it.
6. Implement POST /api/v1/webhooks/logistics with legal status-transition validation, logging to webhook_events.
7. Add integration tests (supertest) for all endpoints above, including a test that mocks Gemini failure and asserts the fallback path is used and still returns 200.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) googleMaps.js+haversine, (b) GET /warehouses, (c) GET /orders/:id, (d) geminiClient.js, (e) GET /orders/:id/explain, (f) webhook simulator, (g) integration tests. Use conventional-commit messages.
```

---

### Week 2 — Member 3 (Frontend & Geospatial Visualization Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 3 (Frontend & Geospatial Lead).
BRANCH: feat/m3-w2-map-and-explainability

TASKS:
1. Integrate Mapbox GL JS into ControlTowerDashboard, plotting warehouses from apiClient.getWarehouses() with low-stock vs healthy marker styling and a legend.
2. Wire up the AIExplanationWidget placeholder from Week 1: it should poll or single-call apiClient.getExplanation(orderId) after an order is placed, show a "Generating explanation…" loading state, then render the returned text. If the response's `source` field is `fallback_template`, show a small subtle badge like "computed summary" instead of "AI explanation" — do not treat this as an error state, just a quieter label.
3. Add loading/error states for the map data fetch (skeleton + retry).
4. Make layout responsive.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) Mapbox integration+markers, (b) AIExplanationWidget wiring incl. fallback-source badge, (c) loading/error states, (d) responsive fixes. Use conventional-commit messages.
```

---

### Week 3 — Member 1 (Core Algorithms & Database Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 1 (Core Algorithms & Database Lead).
BRANCH: feat/m1-w3-concurrency-engine

TASKS:
1. Implement /server/services/redisLock.js: acquireLock(sku, ttlMs=5000) via SETNX+PX returning a token, releaseLock(sku, token) via Lua compare-and-delete script.
2. Implement /server/db/transactions/checkoutTransaction.js: strict ACID transaction (UPDATE ... WHERE available_qty >= X with rowcount check → InsufficientStockError on 0 rows; INSERT orders/order_items/shipments), idempotency-key short-circuit on replay. Confirm this transaction has zero code path that touches ai_explanations — the two must remain fully decoupled per the hybrid design.
3. Insert rows into lock_audit for every lock attempt (acquired, waited_ms).
4. Write concurrency tests: N parallel checkout attempts on one SKU, assert exactly correct number succeed with zero overselling, and assert the fast synchronous path completes without any dependency on Gemini/network calls (mock googleMaps/gemini entirely out in these tests to prove true decoupling).

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) redisLock.js, (b) checkoutTransaction.js, (c) lock_audit instrumentation, (d) concurrency+decoupling tests. Use conventional-commit messages.
```

---

### Week 3 — Member 2 (API & Logistics Orchestration Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 2 (API & Logistics Orchestration Lead).
BRANCH: feat/m2-w3-checkout-and-flashtest

TASKS:
1. Implement POST /api/v1/orders/checkout fully: resolve eligible warehouses, call routingEngine, acquire per-SKU Redis locks, run checkoutTransaction, release locks in finally. CRITICAL: this handler must NOT call geminiClient or await anything AI-related — return the 201 response immediately after the transaction commits, with the full costBreakdown and alternatives array included in the payload (the frontend will separately call /explain).
2. Require and validate Idempotency-Key header (400 if missing).
3. Implement POST /api/v1/orders/flash-test: accepts { sku, qty, concurrency }, fires N simulated concurrent checkout calls server-side, returns { successCount, rateLimited429Count, conflict409Count, avgLatencyMs, p95LatencyMs }. This replaces any need for a separate CLI stress script — Member 3's UI will trigger this endpoint directly.
4. Implement GET /api/v1/dashboard/map-data: aggregates warehouse locations + recent order routes (last N orders with warehouse→customer coordinates) for the Control Tower map overlay.
5. Add integration tests: happy path checkout (assert response time is fast and contains no explanation text), insufficient stock, lock contention, missing idempotency key, duplicate idempotency key replay, flash-test endpoint under load.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) checkout orchestration (sync-only, no AI), (b) idempotency validation, (c) flash-test endpoint, (d) dashboard/map-data endpoint, (e) integration tests. Use conventional-commit messages.
```

---

### Week 3 — Member 3 (Frontend & Geospatial Visualization Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 3 (Frontend & Geospatial Lead).
BRANCH: feat/m3-w3-order-simulator

TASKS:
1. Build OrderSimulator: pick customer location, add SKUs/quantities, submit checkout with a generated Idempotency-Key. On success, immediately render the deterministic result (chosen warehouse, cost breakdown, box size/split info) — do NOT wait for the AI explanation to render this.
2. Immediately after the checkout response renders, trigger the AIExplanationWidget for that order (from Week 2) so the explanation streams in separately once ready — this should visually and functionally demonstrate the async decoupling to a demo audience.
3. Handle 429 (show Retry-After countdown) and 409 (insufficient stock) distinctly.
4. Replace any client-side flash-sale loop with a "Simulate Flash Sale" button that calls the new server-side POST /api/v1/orders/flash-test and renders the returned stats (successCount, rate-limited count, conflict count, latency) in a results panel.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) OrderSimulator form+checkout, (b) async AIExplanationWidget trigger, (c) 429/409 handling, (d) server-side flash-test button+results panel. Use conventional-commit messages.
```

---

### Week 4 — Member 1 (Core Algorithms & Database Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 1 (Core Algorithms & Database Lead).
BRANCH: feat/m1-w4-hardening-and-splits

TASKS:
1. Extend routingEngine.js for full multi-group SPLIT_SHIPMENT support: recursively call selectOptimalWarehouse per bin-packing group, excluding already-committed stock, returning an ordered shipment plan array with per-group alternatives arrays (needed for Member 2's per-shipment explanation prompts).
2. Add performance indexes based on Member 2's Week 3 flash-test results (document before/after timing in PERFORMANCE_NOTES.md).
3. Add input sanity guards (max items per order, qty upper bound) to routingEngine and binPacking.
4. Add tests for 3+ warehouse split scenarios.
5. Add a Mermaid ERD to README.md covering all 9 tables including the decoupled ai_explanations leaf table.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) recursive split routing, (b) performance indexes+notes, (c) input guards, (d) split tests, (e) Mermaid ERD. Use conventional-commit messages.
```

---

### Week 4 — Member 2 (API & Logistics Orchestration Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 2 (API & Logistics Orchestration Lead).
BRANCH: feat/m2-w4-api-hardening

TASKS:
1. Add rate limiting middleware on POST /api/v1/orders/checkout (separate from the SKU-level Redis lock).
2. Add request validation (zod/joi) across all endpoints with clear 400s.
3. Update /explain to support the multi-shipment case from Member 1's Week 4 changes — generate (or fetch cached) explanations per shipment group and return an array.
4. Harden geminiClient.js: add exponential backoff retry (max 2 retries) before falling back to the template, and add a circuit breaker that stops calling Gemini for N minutes after M consecutive failures (falls straight to template during that window) so a Gemini outage can't create latency pressure on /explain calls at scale.
5. Add structured logging (pino/winston) with request-id correlation across checkout → lock → transaction, and separately across explain → gemini → cache-write.
6. Write API_CONTRACT.md documenting every /api/v1 endpoint's request/response shape, status codes, and headers — this is the source of truth for Member 3's final pass.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) rate limiting, (b) request validation, (c) multi-shipment /explain support, (d) Gemini retry+circuit breaker, (e) structured logging, (f) API_CONTRACT.md. Use conventional-commit messages.
```

---

### Week 4 — Member 3 (Frontend & Geospatial Visualization Lead)

**Copy and paste this into Antigravity:**

```text
PROJECT CONTEXT: We are building the Distributed Supply Chain Routing & Inventory Balancing Engine using a Hybrid Architecture (Deterministic Core + Async Gemini AI Explainability).
CURRENT ROLE: You are acting as Member 3 (Frontend & Geospatial Lead).
BRANCH: feat/m3-w4-analytics-and-polish

TASKS:
1. Build Analytics page with Recharts: orders fulfilled per warehouse (bar), average routing cost over time (line), flash-test 429/409 rate stat panel, and an "AI explanation source" breakdown chart (% gemini vs % fallback_template — this doubles as a live health indicator for the Gemini integration).
2. Update ControlTowerDashboard map to draw the routing path (warehouse → customer) for a selected order, and for split shipments draw each shipment's route in a distinct color, using GET /api/v1/dashboard/map-data.
3. Update AIExplanationWidget to handle the multi-shipment explanation array from Member 2's Week 4 changes — render one explanation block per shipment.
4. Reconcile all API calls against Member 2's finalized API_CONTRACT.md; fix any drift.
5. Final visual polish: consistent spacing, empty states, and a plain-language "How this works" panel explaining both the deterministic routing math and the async AI explanation layer for demo audiences.

GIT RULES — NON-NEGOTIABLE FOR THIS SESSION:
1. NEVER run `git push` on your own initiative. Local commits only.
2. After making local commits, STOP and ask exactly: "Ready to push to GitHub — proceed? (yes/no)"
3. Commit granularity: separate commits for (a) Analytics page+charts, (b) map routing path overlay incl. splits, (c) multi-shipment AIExplanationWidget update, (d) API_CONTRACT.md reconciliation, (e) final polish+info panel. Use conventional-commit messages.
```

---

## Notes for the Team Lead

- The one hard architectural rule to enforce across all 12 sessions: **nothing in the checkout path may `await` a Gemini call.** Every session that touches `POST /api/v1/orders/checkout` explicitly reiterates this — treat any drift from it as a bug, not a style choice, since it's the entire point of the hybrid design.
- `ai_explanations` is a leaf table by design (Week 1, Member 1) — no other table should ever gain a foreign key into it. This is what guarantees you can wipe/regenerate all AI explanations without any risk to order or inventory integrity.
- Same cross-week dependency and branch/merge discipline as the deterministic-only plan: M1 → M2 → M3 each week, in order, with a merge to `main` between every session.
