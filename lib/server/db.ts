// SQLite persistence for WarehouseOS, using Node's built-in node:sqlite driver.
// State is stored normalized across 11 tables; loadState/saveState convert
// between the relational form and the in-memory WarehouseState the engines use.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { emptyState } from "../actions";
import type {
  Allocation,
  AuditEntry,
  Batch,
  Bin,
  InventoryRow,
  Order,
  OrderLine,
  PickTask,
  SKU,
  WarehouseState,
  WhException,
} from "../types";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS skus (
  sku_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  avg_daily_demand REAL NOT NULL,
  lead_time_days REAL NOT NULL,
  demand_std_dev REAL NOT NULL,
  reorder_point REAL NOT NULL,
  safety_stock REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS bins (
  bin_id TEXT PRIMARY KEY,
  zone TEXT NOT NULL,
  aisle INTEGER NOT NULL,
  x REAL NOT NULL,
  y REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  sku_id TEXT NOT NULL REFERENCES skus(sku_id),
  bin_id TEXT NOT NULL REFERENCES bins(bin_id),
  on_hand INTEGER NOT NULL,
  reserved INTEGER NOT NULL,
  PRIMARY KEY (sku_id, bin_id)
);
CREATE TABLE IF NOT EXISTS orders (
  order_id TEXT PRIMARY KEY,
  customer TEXT NOT NULL,
  customer_tier TEXT NOT NULL,
  created_at_offset_min REAL NOT NULL,
  sla_due_offset_min REAL NOT NULL,
  order_value REAL NOT NULL,
  stockout_risk REAL NOT NULL,
  status TEXT NOT NULL,
  priority_score REAL,
  priority_band TEXT,
  score_breakdown TEXT
);
CREATE TABLE IF NOT EXISTS order_lines (
  line_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(order_id),
  sku_id TEXT NOT NULL REFERENCES skus(sku_id),
  qty_required INTEGER NOT NULL,
  qty_allocated INTEGER NOT NULL,
  qty_picked INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS allocations (
  allocation_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  line_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  bin_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  picked INTEGER NOT NULL,
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  rowid_order INTEGER PRIMARY KEY AUTOINCREMENT
);
CREATE TABLE IF NOT EXISTS pick_tasks (
  pick_task_id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  bin_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  batch_id TEXT,
  sequence INTEGER,
  status TEXT NOT NULL,
  band TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS batches (
  batch_id TEXT PRIMARY KEY,
  sla_band TEXT NOT NULL,
  task_ids TEXT NOT NULL,
  route TEXT NOT NULL,
  est_walk_time_min REAL NOT NULL,
  distance REAL NOT NULL,
  reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS exceptions (
  exception_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  state TEXT NOT NULL,
  order_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  bin_id TEXT NOT NULL,
  qty INTEGER NOT NULL,
  recommended_action TEXT NOT NULL,
  resolution_path TEXT NOT NULL,
  auto_resolvable INTEGER NOT NULL,
  created_at_label TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  audit_id TEXT PRIMARY KEY,
  seq INTEGER NOT NULL,
  actor TEXT NOT NULL,
  engine TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  before_txt TEXT,
  after_txt TEXT,
  at_label TEXT NOT NULL
);
`;

function open(): DatabaseSync {
  // Hosts that mount a persistent disk (Render, Railway, Fly) point this at the
  // mount path; locally it falls back to ./data, which is gitignored.
  const dir = process.env.WAREHOUSEOS_DATA_DIR || path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new DatabaseSync(path.join(dir, "warehouse.db"));
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  return db;
}

// Singleton across dev hot-reloads and route modules.
const g = globalThis as unknown as { __whDb?: DatabaseSync };
export function getDb(): DatabaseSync {
  if (!g.__whDb) g.__whDb = open();
  return g.__whDb;
}

const j = (v: unknown) => JSON.stringify(v);

export function loadState(): WarehouseState {
  const db = getDb();
  const meta: Record<string, string> = {};
  for (const row of db.prepare("SELECT key, value FROM meta").all() as { key: string; value: string }[]) {
    meta[row.key] = row.value;
  }
  if (meta.seeded !== "1") return emptyState;

  const skus = (db.prepare("SELECT * FROM skus").all() as Record<string, unknown>[]).map(
    (r): SKU => ({
      skuId: r.sku_id as string,
      name: r.name as string,
      unit: r.unit as string,
      avgDailyDemand: r.avg_daily_demand as number,
      leadTimeDays: r.lead_time_days as number,
      demandStdDev: r.demand_std_dev as number,
      reorderPoint: r.reorder_point as number,
      safetyStock: r.safety_stock as number,
    })
  );
  const bins = (db.prepare("SELECT * FROM bins").all() as Record<string, unknown>[]).map(
    (r): Bin => ({
      binId: r.bin_id as string,
      zone: r.zone as string,
      aisle: Number(r.aisle),
      x: r.x as number,
      y: r.y as number,
    })
  );
  const inventory = (db.prepare("SELECT * FROM inventory").all() as Record<string, unknown>[]).map(
    (r): InventoryRow => ({
      skuId: r.sku_id as string,
      binId: r.bin_id as string,
      onHand: Number(r.on_hand),
      reserved: Number(r.reserved),
    })
  );
  const orders = (db.prepare("SELECT * FROM orders").all() as Record<string, unknown>[]).map(
    (r): Order => ({
      orderId: r.order_id as string,
      customer: r.customer as string,
      customerTier: r.customer_tier as Order["customerTier"],
      createdAtOffsetMin: r.created_at_offset_min as number,
      slaDueOffsetMin: r.sla_due_offset_min as number,
      orderValue: r.order_value as number,
      stockoutRisk: r.stockout_risk as number,
      status: r.status as Order["status"],
      priorityScore: r.priority_score === null ? null : (r.priority_score as number),
      priorityBand: r.priority_band === null ? null : (r.priority_band as Order["priorityBand"]),
      scoreBreakdown: r.score_breakdown === null ? null : JSON.parse(r.score_breakdown as string),
    })
  );
  const lines = (db.prepare("SELECT * FROM order_lines").all() as Record<string, unknown>[]).map(
    (r): OrderLine => ({
      lineId: r.line_id as string,
      orderId: r.order_id as string,
      skuId: r.sku_id as string,
      qtyRequired: Number(r.qty_required),
      qtyAllocated: Number(r.qty_allocated),
      qtyPicked: Number(r.qty_picked),
    })
  );
  const allocations = (
    db.prepare("SELECT * FROM allocations ORDER BY rowid_order").all() as Record<string, unknown>[]
  ).map(
    (r): Allocation => ({
      allocationId: r.allocation_id as string,
      orderId: r.order_id as string,
      lineId: r.line_id as string,
      skuId: r.sku_id as string,
      binId: r.bin_id as string,
      qty: Number(r.qty),
      picked: Number(r.picked) === 1,
      action: r.action as Allocation["action"],
      reason: r.reason as string,
    })
  );
  const pickTasks = (db.prepare("SELECT * FROM pick_tasks ORDER BY pick_task_id").all() as Record<string, unknown>[]).map(
    (r): PickTask => ({
      pickTaskId: r.pick_task_id as string,
      orderId: r.order_id as string,
      skuId: r.sku_id as string,
      binId: r.bin_id as string,
      qty: Number(r.qty),
      batchId: r.batch_id === null ? null : (r.batch_id as string),
      sequence: r.sequence === null ? null : Number(r.sequence),
      status: r.status as PickTask["status"],
      band: r.band as PickTask["band"],
    })
  );
  const batches = (db.prepare("SELECT * FROM batches ORDER BY batch_id").all() as Record<string, unknown>[]).map(
    (r): Batch => ({
      batchId: r.batch_id as string,
      slaBand: r.sla_band as Batch["slaBand"],
      taskIds: JSON.parse(r.task_ids as string),
      route: JSON.parse(r.route as string),
      estWalkTimeMin: r.est_walk_time_min as number,
      distance: r.distance as number,
      reason: r.reason as string,
    })
  );
  const exceptions = (db.prepare("SELECT * FROM exceptions ORDER BY exception_id").all() as Record<string, unknown>[]).map(
    (r): WhException => ({
      exceptionId: r.exception_id as string,
      type: r.type as WhException["type"],
      state: r.state as WhException["state"],
      orderId: r.order_id as string,
      skuId: r.sku_id as string,
      binId: r.bin_id as string,
      qty: Number(r.qty),
      recommendedAction: r.recommended_action as string,
      resolutionPath: JSON.parse(r.resolution_path as string),
      autoResolvable: Number(r.auto_resolvable) === 1,
      createdAtLabel: r.created_at_label as string,
    })
  );
  const audit = (db.prepare("SELECT * FROM audit_log ORDER BY seq").all() as Record<string, unknown>[]).map(
    (r): AuditEntry => ({
      auditId: r.audit_id as string,
      seq: Number(r.seq),
      actor: r.actor as string,
      engine: r.engine as AuditEntry["engine"],
      action: r.action as string,
      entityType: r.entity_type as string,
      entityId: r.entity_id as string,
      reason: r.reason as string,
      before: r.before_txt === null ? undefined : (r.before_txt as string),
      after: r.after_txt === null ? undefined : (r.after_txt as string),
      atLabel: r.at_label as string,
    })
  );

  return {
    seeded: true,
    simMinute: Number(meta.simMinute ?? 0),
    skus,
    bins,
    inventory,
    orders,
    lines,
    allocations,
    pickTasks,
    batches,
    exceptions,
    audit,
    lastRun: meta.lastRun ? JSON.parse(meta.lastRun) : {},
  };
}

export function saveState(state: WarehouseState): void {
  const db = getDb();
  db.exec("BEGIN");
  try {
    for (const t of [
      "audit_log",
      "exceptions",
      "batches",
      "pick_tasks",
      "allocations",
      "order_lines",
      "orders",
      "inventory",
      "bins",
      "skus",
      "meta",
    ]) {
      db.exec(`DELETE FROM ${t}`);
    }

    const setMeta = db.prepare("INSERT INTO meta (key, value) VALUES (?, ?)");
    setMeta.run("seeded", state.seeded ? "1" : "0");
    setMeta.run("simMinute", String(state.simMinute));
    setMeta.run("lastRun", j(state.lastRun));

    if (!state.seeded) {
      db.exec("COMMIT");
      return;
    }

    const insSku = db.prepare("INSERT INTO skus VALUES (?,?,?,?,?,?,?,?)");
    for (const s of state.skus)
      insSku.run(s.skuId, s.name, s.unit, s.avgDailyDemand, s.leadTimeDays, s.demandStdDev, s.reorderPoint, s.safetyStock);

    const insBin = db.prepare("INSERT INTO bins VALUES (?,?,?,?,?)");
    for (const b of state.bins) insBin.run(b.binId, b.zone, b.aisle, b.x, b.y);

    const insInv = db.prepare("INSERT INTO inventory VALUES (?,?,?,?)");
    for (const r of state.inventory) insInv.run(r.skuId, r.binId, r.onHand, r.reserved);

    const insOrder = db.prepare("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (const o of state.orders)
      insOrder.run(
        o.orderId,
        o.customer,
        o.customerTier,
        o.createdAtOffsetMin,
        o.slaDueOffsetMin,
        o.orderValue,
        o.stockoutRisk,
        o.status,
        o.priorityScore,
        o.priorityBand,
        o.scoreBreakdown ? j(o.scoreBreakdown) : null
      );

    const insLine = db.prepare("INSERT INTO order_lines VALUES (?,?,?,?,?,?)");
    for (const l of state.lines) insLine.run(l.lineId, l.orderId, l.skuId, l.qtyRequired, l.qtyAllocated, l.qtyPicked);

    const insAlloc = db.prepare(
      "INSERT INTO allocations (allocation_id, order_id, line_id, sku_id, bin_id, qty, picked, action, reason) VALUES (?,?,?,?,?,?,?,?,?)"
    );
    for (const a of state.allocations)
      insAlloc.run(a.allocationId, a.orderId, a.lineId, a.skuId, a.binId, a.qty, a.picked ? 1 : 0, a.action, a.reason);

    const insTask = db.prepare("INSERT INTO pick_tasks VALUES (?,?,?,?,?,?,?,?,?)");
    for (const t of state.pickTasks)
      insTask.run(t.pickTaskId, t.orderId, t.skuId, t.binId, t.qty, t.batchId, t.sequence, t.status, t.band);

    const insBatch = db.prepare("INSERT INTO batches VALUES (?,?,?,?,?,?,?)");
    for (const b of state.batches)
      insBatch.run(b.batchId, b.slaBand, j(b.taskIds), j(b.route), b.estWalkTimeMin, b.distance, b.reason);

    const insExc = db.prepare("INSERT INTO exceptions VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (const e of state.exceptions)
      insExc.run(
        e.exceptionId,
        e.type,
        e.state,
        e.orderId,
        e.skuId,
        e.binId,
        e.qty,
        e.recommendedAction,
        j(e.resolutionPath),
        e.autoResolvable ? 1 : 0,
        e.createdAtLabel
      );

    const insAudit = db.prepare("INSERT INTO audit_log VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    for (const a of state.audit)
      insAudit.run(
        a.auditId,
        a.seq,
        a.actor,
        a.engine,
        a.action,
        a.entityType,
        a.entityId,
        a.reason,
        a.before ?? null,
        a.after ?? null,
        a.atLabel
      );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
