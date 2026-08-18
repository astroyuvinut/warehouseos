# WarehouseOS — Operations Decision Engine

> WarehouseOS turns warehouse chaos into on-time shipments by making real-time fulfillment decisions under scarcity.

WarehouseOS is not a record-keeping UI. It is an **operations decision engine** that chooses the next best action — and explains why. It continuously prioritizes orders, allocates scarce inventory without breaking already-picked work, batches picks to cut walking time, and auto-resolves floor exceptions with a full audit trail.

**Full-stack:** every decision runs on the server, persists to SQLite, and is pushed live to every connected client.

## Demo steps (3 minutes)

1. **Ops Console → Seed Demo Data** — loads a deterministic dataset (8 SKUs, 12 bins, 8 orders) into the database. Same story every run.
2. **Recompute Priorities** — every order is scored on SLA urgency, tier, value, stockout risk and age. Click any order row for the full score composition and human-readable reasons.
3. **Run Allocation** — scarce units go to the highest-impact orders. Watch SKU-1004 (10 on hand, 14 demanded): the P0 order gets 8, the P3 order gets a shortage hold with a cross-dock suggestion. **Already-picked work is never broken.**
4. **Batch & Optimize Picks** — urgency-pure batches, greedy zone clustering, nearest-neighbor + 2-opt routing, with a live route preview on the warehouse map.
5. **Exceptions → Inject Missing** — reality hits. The state machine classifies it and recommends the next best path: alternate bin re-pick (auto-resolve), or hold/cross-dock (escalate). Auto-resolving adds the re-pick task to the affected batch.
6. **Audit** — every decision logged: engine, inputs, outputs, before/after diff, and rationale. Filter by order or engine, export JSON.

### What the engine bought you

The Ops Console leads with the number that matters: **42% less walking**. WarehouseOS replays the
same picks through a conventional WMS — one order per trip, FIFO, no route optimization — and
measures the difference. On the seeded dataset that is 82.8 minutes of walking against 47.9, over
1,245 distance units against 665. The baseline is a real engine (`naiveBaseline` in `lib/engines.ts`),
not a hardcoded number, and it is exposed at `GET /api/impact`.

**Pick Batches → "The same picks, walked two ways"** puts that number on the map. Both panels share one
projection, so the only difference is the routing: eight separate dock round-trips crossing the same aisles
on the left, four zone-clustered loops on the right.

Four more views turn the engines' reasoning into something you can read at a glance:

- **What drives each score** — every order's priority decomposed into the five weighted factors, so
  the ranking is visibly principled rather than arbitrary. The top order's SLA-urgency block dwarfs
  everything else; the bottom three have no SLA contribution at all.
- **Where the scarce units went** — a flow diagram of the contested SKU splitting across competing
  orders, with the unfillable remainder branching off as a held shortfall.
- **SLA countdown** — time remaining per order, shortest first.
- **Demand coverage** — committed demand per SKU, split into what stock can cover and what it cannot.

Every mark has a hover tooltip carrying the engine's own rationale, and the score chart has a table
view so no value is reachable only through colour.

### The two showstoppers

**Open the app in two browser windows side by side.** Run an engine in one — the other updates instantly. Every client subscribes to a server-sent event stream, so the warehouse floor and the ops desk always see the same state.

**Kill the server mid-demo and restart it (`Ctrl-C`, `npm run dev`).** Nothing is lost. State lives in SQLite, not in the browser.

### Does it scale?

**Stress test · 200 orders** on the Ops Console seeds a 200-order warehouse and runs the whole
pipeline in one click. Every engine run reports its own server-side time next to the pipeline —
scoring, allocating, batching and routing **200 orders / 376 lines lands in about 35 ms**, producing
57 batches and surfacing 40 shortage exceptions. The advantage widens with volume rather than
narrowing: the batching engine saves 42% of walking on the 8-order demo and **62% at 200 orders**,
because a denser order book gives the zone clustering more to work with.

## Architecture

```
Browser (React client)
    │  POST /api/engines/:engine          ── run a decision
    │  GET  /api/state                    ── read current world
    │  GET  /api/events  (SSE, held open) ── live push to every client
    ▼
Next.js route handlers  (app/api/*)
    ▼
Service layer  (lib/server/service.ts)    ── load → decide → persist → broadcast
    ▼
Decision engines  (lib/engines.ts)        ── pure functions, zero I/O
    ▼
SQLite  (lib/server/db.ts, 11 tables)     ── normalized, queryable, durable
```

- **Engines are pure functions.** `lib/engines.ts` and `lib/actions.ts` have no database or network imports — they take state, return state. That makes every decision unit-testable and lets the whole engine layer move behind FastAPI or a queue worker unchanged.
- **The server is authoritative.** The client never computes a decision; it POSTs an intent and renders what comes back. Two clients cannot diverge.
- **Storage is real SQL, not a JSON blob.** Orders, lines, allocations, pick tasks, batches, exceptions and the audit log are normalized across 11 tables, so the data is queryable outside the app:

  ```sql
  SELECT o.order_id, o.priority_band, SUM(a.qty) AS units
  FROM orders o LEFT JOIN allocations a ON a.order_id = o.order_id
  GROUP BY o.order_id ORDER BY o.priority_score DESC;
  ```

- `lib/seed.ts` — deterministic dataset, hand-placed to tell one story (scarce SKU-1004, P0 hero order ORD-1001, zones A/B/C).
- `app/*` — six screens: Ops Console, Orders, Inventory & Scarcity, Pick Batches & Route, Exceptions, Audit.

## API

Every screen is backed by a real HTTP API — you can drive the entire demo from a terminal.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness + row counts per table |
| `GET` | `/api/state` | Full world state |
| `GET` | `/api/events` | SSE stream; emits `sync` on every change |
| `POST` | `/api/seed` | Load the deterministic dataset — `{"scale":200}` for the stress set |
| `POST` | `/api/pipeline` | Seed if needed, then run all three engines atomically |
| `POST` | `/api/reset` | Clear everything |
| `POST` | `/api/engines/priority` | Run the priority scoring engine |
| `POST` | `/api/engines/allocation` | Run scarcity allocation |
| `POST` | `/api/engines/batching` | Run pick batching + routing |
| `GET` | `/api/orders?band=P0&status=Held` | Priority-ranked orders with their lines |
| `GET` | `/api/inventory?scarce=true` | Stock, availability, reorder points |
| `GET` | `/api/impact` | Optimized result vs. the FIFO baseline |
| `GET` | `/api/audit?engine=Allocation&limit=20` | Filtered decision log |
| `GET` | `/api/exceptions` | Exception queue |
| `POST` | `/api/exceptions` | Inject one — `{"type":"Missing"}` |
| `POST` | `/api/exceptions/:id/resolve` | Auto-resolve or acknowledge |

Mutations return `{ ok, version, state }`. Failures return `{ ok: false, error }` with a real status code — `404` unknown engine, `400` invalid exception type, `409` exception already resolved.

Run the whole pipeline headless:

```bash
curl -X POST localhost:3000/api/seed
curl -X POST localhost:3000/api/engines/priority
curl -X POST localhost:3000/api/engines/allocation
curl -X POST localhost:3000/api/engines/batching
curl "localhost:3000/api/orders?band=P0"
```

## Decision logic

| Engine | Rule |
| --- | --- |
| Priority scoring | `0.35·SLA + 0.20·tier + 0.20·value + 0.15·risk + 0.10·age` → P0–P3 bands |
| Scarcity allocation | Rank demand by score; allocate top-down; partial ship if ≥60% covered; steal only from unpicked lower-priority allocations; else hold/cross-dock |
| Pick optimization | Band-pure batches, zone clustering, capacity cap, nearest-neighbor + 2-opt route from dock |
| Exception machine | Detected → Classified → Auto-Resolve?/Needs Review → Resolved/Closed; only reversible actions auto-resolve |
| Reorder point | `SS = 1.65·σ·√LT`, `ROP = demand·LT + SS` |
| Baseline (for comparison) | One order per trip in arrival order, unoptimized stop sequence |

## Charts

Hand-rolled in HTML and inline SVG against the app's own design tokens — no charting dependency, so
they match the rest of the interface rather than looking like a library's defaults. The categorical
palette is fixed-order and validated for colourblind separation (worst adjacent ΔE 9.1 in OKLab,
normal-vision 19.6); three of its slots fall below 3:1 on white, which is why the score chart ships
the table view. Bar length always encodes one measure — the reorder point deliberately stays off the
coverage axis, since a lead-time threshold and immediate committed demand don't share a scale.

## Run locally

```bash
npm install
npm run dev   # http://localhost:3000
```

Requires **Node 22.5+** (uses the built-in `node:sqlite` driver — no native build step, no database server to install). The database is created automatically at `data/warehouse.db` on first write.

```bash
npm run build && npm start   # production
```

### Tests

```bash
npm test    # 25 tests, no network, no database
```

The engines are pure functions, so the suite runs them directly through Node's built-in test runner.
It covers the properties the demo actually claims: the scoring formula matches the documented weights,
allocation never exceeds what is on the shelf, **picked work is never broken or moved by a re-plan**,
batches never mix urgency bands, exceptions only auto-resolve when an alternate bin can really serve
the pick, and the optimized route always beats the baseline over an identical set of picks.

### Deploying

Deploy to any host that runs a **single persistent Node process with a writable disk** — Render, Railway, Fly.io, or a plain VPS. SQLite state lives on disk and the live-sync bus is in-process, so the app should not be spread across serverless instances without swapping the storage layer for Postgres and the bus for Redis pub/sub. Both are isolated behind `lib/server/db.ts` and `lib/server/bus.ts`, so that swap touches two files and no engine code.

A `Dockerfile` (multi-stage, Next standalone output, non-root, health-checked) and a `render.yaml`
blueprint are included. On Render: **New → Blueprint**, point it at this repo, and it provisions the
service with a 1 GB disk mounted at `/data`. The one setting that matters is `WAREHOUSEOS_DATA_DIR`,
which must point at the mounted volume — without a persistent disk the database resets on every
redeploy. Keep the service at a single instance.

```bash
docker build -t warehouseos .
docker run -p 3000:3000 -v warehouseos-data:/data warehouseos
```
