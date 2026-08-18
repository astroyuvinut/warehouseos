import { DOCK } from "./seed";
import type {
  Allocation,
  Batch,
  Bin,
  ExceptionType,
  Order,
  PickTask,
  PriorityBand,
  ScoreBreakdown,
  WarehouseState,
  WhException,
} from "./types";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const TIER_WEIGHT: Record<string, number> = {
  Bronze: 0.2,
  Silver: 0.4,
  Gold: 0.7,
  Enterprise: 1.0,
};

// ---------------- Priority Scoring Engine ----------------
// score = 0.35*SLA_urgency + 0.20*tier + 0.20*value + 0.15*stockout_risk + 0.10*age

export function scoreOrder(order: Order, simMinute: number): { score: number; band: PriorityBand; breakdown: ScoreBreakdown } {
  const minutesToDue = order.slaDueOffsetMin - simMinute;
  const ageMin = order.createdAtOffsetMin + simMinute;
  const slaUrgency = clamp(1 - minutesToDue / 240, 0, 1);
  const tier = TIER_WEIGHT[order.customerTier];
  const value = clamp(order.orderValue / 1000, 0, 1);
  const age = clamp(ageMin / 480, 0, 1);
  const score = 0.35 * slaUrgency + 0.2 * tier + 0.2 * value + 0.15 * order.stockoutRisk + 0.1 * age;
  const band: PriorityBand = score >= 0.7 ? "P0" : score >= 0.55 ? "P1" : score >= 0.4 ? "P2" : "P3";
  const reasons: string[] = [];
  if (minutesToDue <= 60) reasons.push(`SLA due in ${minutesToDue} min — urgency ${slaUrgency.toFixed(2)}`);
  else reasons.push(`SLA due in ${minutesToDue} min`);
  reasons.push(`${order.customerTier} tier weight ${tier.toFixed(2)}`);
  if (order.stockoutRisk >= 0.5) reasons.push(`High stockout risk ${(order.stockoutRisk * 100).toFixed(0)}%`);
  if (value >= 0.9) reasons.push(`High order value $${order.orderValue.toLocaleString()}`);
  if (age >= 0.5) reasons.push(`Aging order — ${Math.round(ageMin)} min in queue`);
  return { score, band, breakdown: { slaUrgency, tier, value, stockoutRisk: order.stockoutRisk, age, reasons } };
}

// ---------------- Allocation Under Scarcity Engine ----------------
// Hard constraints: never break picked allocations, never go negative.

export interface AllocationResult {
  allocations: Allocation[];
  inventory: WarehouseState["inventory"];
  lineAllocated: Record<string, number>;
  events: { action: string; entityId: string; reason: string; before?: string; after?: string }[];
  newExceptions: Omit<WhException, "exceptionId" | "createdAtLabel">[];
}

export function runAllocation(state: WarehouseState): AllocationResult {
  const events: AllocationResult["events"] = [];
  const newExceptions: AllocationResult["newExceptions"] = [];

  // Preserve picked allocations verbatim; everything unpicked is re-planned.
  const picked = state.allocations.filter((a) => a.picked);
  const allocations: Allocation[] = [...picked];

  const available: Record<string, Record<string, number>> = {};
  for (const row of state.inventory) {
    available[row.skuId] = available[row.skuId] || {};
    available[row.skuId][row.binId] = (available[row.skuId][row.binId] || 0) + row.onHand;
  }
  for (const a of picked) {
    available[a.skuId][a.binId] -= a.qty;
  }

  const lineAllocated: Record<string, number> = {};
  for (const a of picked) lineAllocated[a.lineId] = (lineAllocated[a.lineId] || 0) + a.qty;

  const orderById = Object.fromEntries(state.orders.map((o) => [o.orderId, o]));
  const rankedLines = [...state.lines].sort(
    (a, b) => (orderById[b.orderId].priorityScore ?? 0) - (orderById[a.orderId].priorityScore ?? 0)
  );

  let allocSeq = 1;
  for (const line of rankedLines) {
    const order = orderById[line.orderId];
    const alreadyPicked = lineAllocated[line.lineId] || 0;
    let remaining = line.qtyRequired - alreadyPicked;
    if (remaining <= 0) continue;

    const bins = Object.entries(available[line.skuId] || {})
      .filter(([, qty]) => qty > 0)
      .sort((a, b) => b[1] - a[1]);

    for (const [binId, qty] of bins) {
      if (remaining <= 0) break;
      const take = Math.min(qty, remaining);
      allocations.push({
        allocationId: `AL-${String(allocSeq++).padStart(3, "0")}`,
        orderId: line.orderId,
        lineId: line.lineId,
        skuId: line.skuId,
        binId,
        qty: take,
        picked: false,
        action: "allocate",
        reason: `${order.priorityBand} rank ${(order.priorityScore ?? 0).toFixed(3)} — allocated ${take} from ${binId} (deepest stock first)`,
      });
      available[line.skuId][binId] -= take;
      remaining -= take;
    }

    if (remaining > 0) {
      // Shortage on a line. Decide: partial / steal / hold / cross-dock.
      const band = order.priorityBand ?? "P3";
      if (band === "P0" || band === "P1") {
        // Try steal from strictly lower-priority unpicked allocations.
        const victims = allocations
          .filter(
            (a) =>
              !a.picked &&
              a.skuId === line.skuId &&
              a.orderId !== line.orderId &&
              (orderById[a.orderId].priorityScore ?? 0) < (order.priorityScore ?? 0)
          )
          .sort((a, b) => (orderById[a.orderId].priorityScore ?? 0) - (orderById[b.orderId].priorityScore ?? 0));

        for (const victim of victims) {
          if (remaining <= 0) break;
          const take = Math.min(victim.qty, remaining);
          victim.qty -= take;
          lineAllocated[victim.lineId] = (lineAllocated[victim.lineId] || 0) - take;
          allocations.push({
            allocationId: `AL-${String(allocSeq++).padStart(3, "0")}`,
            orderId: line.orderId,
            lineId: line.lineId,
            skuId: line.skuId,
            binId: victim.binId,
            qty: take,
            picked: false,
            action: "steal",
            reason: `Reclaimed ${take} from ${victim.orderId} (${orderById[victim.orderId].priorityBand}, not yet picked) — ${band} order outranks it`,
          });
          events.push({
            action: "Reallocated under scarcity",
            entityId: line.orderId,
            reason: `Moved ${take}× ${line.skuId} from ${victim.orderId} to ${line.orderId}: higher priority and victim allocation was not picked. Picked work is never broken.`,
            before: `${victim.orderId} held ${victim.qty + take}`,
            after: `${victim.orderId} holds ${victim.qty}`,
          });
          remaining -= take;
        }
      }

      if (remaining > 0) {
        const allocatedSoFar = line.qtyRequired - remaining;
        const coverage = allocatedSoFar / line.qtyRequired;
        if (coverage >= 0.6) {
          const last = allocations.filter((a) => a.lineId === line.lineId && !a.picked).pop();
          if (last) last.action = "partial";
          events.push({
            action: "Partial ship approved",
            entityId: line.orderId,
            reason: `${line.skuId}: ${allocatedSoFar}/${line.qtyRequired} covered (${Math.round(coverage * 100)}% ≥ 60% threshold) — partial ship keeps SLA alive`,
          });
        } else {
          newExceptions.push({
            type: "Missing",
            state: "Needs Review",
            orderId: line.orderId,
            skuId: line.skuId,
            binId: bins[0]?.[0] ?? "—",
            qty: remaining,
            recommendedAction: `Hold ${line.orderId} for ${remaining}× ${line.skuId}; flag as cross-dock candidate on next inbound`,
            resolutionPath: ["Detected", "Classified", "Needs Review"],
            autoResolvable: false,
          });
          events.push({
            action: "Shortage hold",
            entityId: line.orderId,
            reason: `${line.skuId} short ${remaining} after allocation + steal attempts — held with cross-dock suggestion`,
          });
        }
      }
    }

    lineAllocated[line.lineId] = allocations
      .filter((a) => a.lineId === line.lineId)
      .reduce((s, a) => s + a.qty, 0);
  }

  // Rebuild reserved counts.
  const inventory = state.inventory.map((row) => {
    const reserved = allocations
      .filter((a) => a.skuId === row.skuId && a.binId === row.binId)
      .reduce((s, a) => s + a.qty, 0);
    return { ...row, reserved: Math.min(reserved, row.onHand) };
  });

  return { allocations, inventory, lineAllocated, events, newExceptions };
}

// ---------------- Pick Batching & Route Optimization ----------------

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function routeDistance(stops: Bin[]): number {
  let d = 0;
  let prev: { x: number; y: number } = DOCK;
  for (const s of stops) {
    d += dist(prev, s);
    prev = s;
  }
  d += dist(prev, DOCK);
  return d;
}

function nearestNeighborTwoOpt(stops: Bin[]): Bin[] {
  if (stops.length <= 1) return stops;
  // Nearest neighbor from dock
  const remaining = [...stops];
  const route: Bin[] = [];
  let cur: { x: number; y: number } = DOCK;
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    remaining.forEach((s, i) => {
      const d = dist(cur, s);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    route.push(next);
    cur = next;
  }
  // 2-opt improvement
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (routeDistance(candidate) < routeDistance(route) - 1e-9) {
          route.splice(0, route.length, ...candidate);
          improved = true;
        }
      }
    }
  }
  return route;
}

export interface BatchingResult {
  batches: Batch[];
  pickTasks: PickTask[];
  events: { action: string; entityId: string; reason: string }[];
}

const WALK_MIN_PER_UNIT = 0.06; // grid units → minutes
const PICK_MIN_PER_LINE = 0.5;
const MAX_LINES_PER_BATCH = 6;

export function runBatching(state: WarehouseState): BatchingResult {
  const orderById = Object.fromEntries(state.orders.map((o) => [o.orderId, o]));
  const binById = Object.fromEntries(state.bins.map((b) => [b.binId, b]));
  const events: BatchingResult["events"] = [];

  // Pick tasks from unpicked allocations; keep already-picked tasks stable.
  const keep = state.pickTasks.filter((t) => t.status === "Picked");
  let taskSeq = keep.length + 1;
  const tasks: PickTask[] = [
    ...keep,
    ...state.allocations
      .filter((a) => !a.picked && a.qty > 0 && (a.action === "allocate" || a.action === "partial" || a.action === "steal"))
      .map((a) => ({
        pickTaskId: `PT-${String(taskSeq++).padStart(3, "0")}`,
        orderId: a.orderId,
        skuId: a.skuId,
        binId: a.binId,
        qty: a.qty,
        batchId: null,
        sequence: null,
        status: "Open" as const,
        band: orderById[a.orderId].priorityBand ?? "P3",
      })),
  ];

  // Band separation: never mix P0 with lower urgency.
  const bandOrder: PriorityBand[] = ["P0", "P1", "P2", "P3"];
  const batches: Batch[] = [];
  let batchSeq = 1;

  for (const band of bandOrder) {
    const bandTasks = tasks.filter((t) => t.status === "Open" && t.band === band);
    if (!bandTasks.length) continue;

    // Greedy zone clustering: group by zone, then chunk by capacity.
    const byZone: Record<string, PickTask[]> = {};
    for (const t of bandTasks) {
      const zone = binById[t.binId].zone;
      (byZone[zone] = byZone[zone] || []).push(t);
    }
    const ordered = Object.values(byZone).flat();
    for (let i = 0; i < ordered.length; i += MAX_LINES_PER_BATCH) {
      const chunk = ordered.slice(i, i + MAX_LINES_PER_BATCH);
      const uniqueBins = [...new Map(chunk.map((t) => [t.binId, binById[t.binId]])).values()];
      const routedBins = nearestNeighborTwoOpt(uniqueBins);
      const distance = routeDistance(routedBins);
      const est = distance * WALK_MIN_PER_UNIT + chunk.length * PICK_MIN_PER_LINE;
      const batchId = `B-${String(batchSeq++).padStart(2, "0")}`;
      const binRank = Object.fromEntries(routedBins.map((b, idx) => [b.binId, idx]));
      chunk
        .sort((a, b) => binRank[a.binId] - binRank[b.binId])
        .forEach((t, idx) => {
          t.batchId = batchId;
          t.sequence = idx + 1;
          t.status = "Batched";
        });
      const zones = [...new Set(chunk.map((t) => binById[t.binId].zone))].join("+");
      batches.push({
        batchId,
        slaBand: band,
        taskIds: chunk.map((t) => t.pickTaskId),
        route: routedBins.map((b) => b.binId),
        estWalkTimeMin: Math.round(est * 10) / 10,
        distance: Math.round(distance),
        reason: `${band} tasks only (no urgency mixing) · zone ${zones} density keeps dispersion low · nearest-neighbor + 2-opt route`,
      });
      events.push({
        action: `Batch ${batchId} created`,
        entityId: batchId,
        reason: `${chunk.length} lines, zones ${zones}, est walk ${Math.round(est * 10) / 10} min over ${Math.round(distance)} units`,
      });
    }
  }

  return { batches, pickTasks: tasks, events };
}

// ---------------- Baseline: what the same work costs without the engine ----------------
// A conventional WMS releases orders one at a time in arrival order: the picker
// walks the bins for a single order and returns to the dock before starting the
// next one, in whatever order the lines were entered. Same picks, same physical
// warehouse — no batching across orders and no route optimization. This is the
// honest comparison for the batching engine's output.

export interface BaselineResult {
  walkMin: number;
  distance: number;
  trips: number;
  /** `route` is the unoptimized stop sequence, kept so the trip can be drawn on the map. */
  perOrder: { orderId: string; stops: number; distance: number; walkMin: number; route: string[] }[];
}

export function naiveBaseline(state: WarehouseState): BaselineResult {
  const binById = Object.fromEntries(state.bins.map((b) => [b.binId, b]));
  const pickable = state.allocations.filter(
    (a) => !a.picked && a.qty > 0 && (a.action === "allocate" || a.action === "partial" || a.action === "steal")
  );

  // FIFO release: oldest order first, matching how the work would actually arrive.
  const orderIds = [...new Set(pickable.map((a) => a.orderId))].sort(
    (a, b) =>
      (state.orders.find((o) => o.orderId === b)?.createdAtOffsetMin ?? 0) -
      (state.orders.find((o) => o.orderId === a)?.createdAtOffsetMin ?? 0)
  );

  const perOrder: BaselineResult["perOrder"] = [];
  for (const orderId of orderIds) {
    const lines = pickable.filter((a) => a.orderId === orderId);
    // Unoptimized stop sequence: bins in the order the lines were allocated.
    const stops: Bin[] = [];
    for (const a of lines) {
      if (!stops.some((s) => s.binId === a.binId)) stops.push(binById[a.binId]);
    }
    const distance = routeDistance(stops);
    perOrder.push({
      orderId,
      stops: stops.length,
      distance: Math.round(distance),
      walkMin: Math.round((distance * WALK_MIN_PER_UNIT + lines.length * PICK_MIN_PER_LINE) * 10) / 10,
      route: stops.map((s) => s.binId),
    });
  }

  const distance = perOrder.reduce((s, o) => s + o.distance, 0);
  const walkMin = perOrder.reduce((s, o) => s + o.walkMin, 0);
  return {
    walkMin: Math.round(walkMin * 10) / 10,
    distance: Math.round(distance),
    trips: perOrder.length,
    perOrder,
  };
}

// ---------------- Exception State Machine ----------------

export interface ExceptionPlan {
  recommendedAction: string;
  resolutionPath: string[];
  autoResolvable: boolean;
  inventoryDelta?: { skuId: string; binId: string; qty: number };
  alternateBinId?: string;
}

export function planException(
  state: WarehouseState,
  type: ExceptionType,
  skuId: string,
  binId: string,
  qty: number
): ExceptionPlan {
  const alternates = state.inventory.filter(
    (r) => r.skuId === skuId && r.binId !== binId && r.onHand - r.reserved > 0
  );
  const alt = alternates.sort((a, b) => b.onHand - b.reserved - (a.onHand - a.reserved))[0];

  switch (type) {
    case "Damaged":
      if (alt)
        return {
          recommendedAction: `Decrement ${qty}× ${skuId} at ${binId}; reallocate from alternate bin ${alt.binId}`,
          resolutionPath: ["Detected", "Classified", "Auto-Resolve", "Resolved"],
          autoResolvable: true,
          inventoryDelta: { skuId, binId, qty: -qty },
          alternateBinId: alt.binId,
        };
      return {
        recommendedAction: `Decrement ${qty}× ${skuId} at ${binId}; no alternate stock — open shortage hold`,
        resolutionPath: ["Detected", "Classified", "Needs Review"],
        autoResolvable: false,
        inventoryDelta: { skuId, binId, qty: -qty },
      };
    case "Missing":
      if (alt)
        return {
          recommendedAction: `Trigger cycle count on ${binId}; re-route picker to alternate bin ${alt.binId} (${alt.onHand - alt.reserved} free)`,
          resolutionPath: ["Detected", "Classified", "Auto-Resolve", "Resolved"],
          autoResolvable: true,
          alternateBinId: alt.binId,
        };
      return {
        recommendedAction: `Trigger cycle count on ${binId}; no alternate stock — hold with cross-dock suggestion`,
        resolutionPath: ["Detected", "Classified", "Needs Review"],
        autoResolvable: false,
      };
    case "Short Pick":
      return {
        recommendedAction: `Confirm picked qty; create new pick task for remaining ${qty}× ${skuId}${alt ? ` from ${alt.binId}` : " — no stock, hold"}`,
        resolutionPath: alt
          ? ["Detected", "Classified", "Auto-Resolve", "Resolved"]
          : ["Detected", "Classified", "Needs Review"],
        autoResolvable: !!alt,
        alternateBinId: alt?.binId,
      };
    case "QC Fail":
      return {
        recommendedAction: `Quarantine ${qty}× ${skuId} at ${binId}${alt ? `; reallocate from ${alt.binId}` : "; flag cross-dock on next inbound"}`,
        resolutionPath: alt
          ? ["Detected", "Classified", "Auto-Resolve", "Resolved"]
          : ["Detected", "Classified", "Needs Review"],
        autoResolvable: !!alt,
        inventoryDelta: { skuId, binId, qty: -qty },
        alternateBinId: alt?.binId,
      };
  }
}

// ---------------- Reorder Point + Safety Stock ----------------

export function computeReorder(sku: { avgDailyDemand: number; leadTimeDays: number; demandStdDev: number }) {
  const z = 1.65; // ~95% service level
  const safetyStock = z * sku.demandStdDev * Math.sqrt(sku.leadTimeDays);
  const reorderPoint = sku.avgDailyDemand * sku.leadTimeDays + safetyStock;
  return {
    safetyStock: Math.round(safetyStock * 10) / 10,
    reorderPoint: Math.ceil(reorderPoint),
    suggestedOrderQty: Math.ceil(sku.avgDailyDemand * 7), // one-week heuristic
  };
}
