// Pure state-transition logic for WarehouseOS. Runs on the server (API routes)
// but has no server dependencies, so unit tests and offline demos can use it too.
import { planException, runAllocation, runBatching, scoreOrder } from "./engines";
import { buildSeedState, buildStressState } from "./seed";
import type { AuditEntry, ExceptionType, WarehouseState, WhException } from "./types";

export const emptyState: WarehouseState = {
  seeded: false,
  simMinute: 0,
  skus: [],
  bins: [],
  inventory: [],
  orders: [],
  lines: [],
  allocations: [],
  pickTasks: [],
  batches: [],
  exceptions: [],
  audit: [],
  lastRun: {},
};

export type Action =
  | { type: "seed"; scale?: number }
  | { type: "reset" }
  | { type: "recomputePriorities" }
  | { type: "runAllocation" }
  | { type: "runBatching" }
  | { type: "injectException"; exceptionType: ExceptionType }
  | { type: "resolveException"; id: string };

function entryFactory(startSeq: number) {
  let seq = startSeq;
  return function entry(
    engine: AuditEntry["engine"],
    action: string,
    entityType: string,
    entityId: string,
    reason: string,
    before?: string,
    after?: string
  ): AuditEntry {
    seq += 1;
    return {
      auditId: `AUD-${String(seq).padStart(4, "0")}`,
      seq,
      actor: "engine",
      engine,
      action,
      entityType,
      entityId,
      reason,
      before,
      after,
      atLabel: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    };
  };
}

export function applyAction(state: WarehouseState, action: Action): WarehouseState {
  const entry = entryFactory(state.audit.reduce((m, a) => Math.max(m, a.seq), 0));

  switch (action.type) {
    case "seed": {
      const stress = typeof action.scale === "number" && action.scale > 0;
      const seeded = stress ? buildStressState(action.scale) : buildSeedState();
      const freshEntry = entryFactory(0);
      return {
        ...seeded,
        audit: [
          freshEntry(
            "System",
            stress ? `Seeded ${seeded.orders.length}-order stress dataset` : "Seeded demo data",
            "dataset",
            stress ? `stress-${seeded.orders.length}` : "seed-v1",
            `${seeded.skus.length} SKUs, ${seeded.bins.length} bins, ${seeded.orders.length} orders, ${seeded.lines.length} lines — deterministic dataset for reproducible ${stress ? "load testing" : "demo"}`
          ),
        ],
      };
    }

    case "reset": {
      return emptyState;
    }

    case "recomputePriorities": {
      const audit: AuditEntry[] = [];
      const orders = state.orders.map((o) => {
        const { score, band, breakdown } = scoreOrder(o, state.simMinute);
        const bandChanged = o.priorityBand !== null && o.priorityBand !== band;
        if (o.priorityScore === null || bandChanged) {
          audit.push(
            entry(
              "Priority",
              o.priorityScore === null ? "Scored order" : "Re-banded order",
              "order",
              o.orderId,
              breakdown.reasons.join("; "),
              o.priorityScore === null ? "unscored" : `${o.priorityBand} ${(o.priorityScore ?? 0).toFixed(3)}`,
              `${band} ${score.toFixed(3)}`
            )
          );
        }
        return { ...o, priorityScore: score, priorityBand: band, scoreBreakdown: breakdown };
      });
      return {
        ...state,
        orders,
        audit: [...state.audit, ...audit],
        lastRun: { ...state.lastRun, priority: new Date().toLocaleTimeString() },
      };
    }

    case "runAllocation": {
      if (!state.orders.some((o) => o.priorityScore !== null)) return state;
      const result = runAllocation(state);
      const audit: AuditEntry[] = [];
      for (const a of result.allocations.filter((x) => !x.picked)) {
        audit.push(entry("Allocation", `Allocated ${a.qty}× ${a.skuId}`, "allocation", a.allocationId, a.reason));
      }
      for (const ev of result.events) {
        audit.push(entry("Allocation", ev.action, "order", ev.entityId, ev.reason, ev.before, ev.after));
      }
      let excSeq = state.exceptions.length;
      const newExceptions: WhException[] = result.newExceptions.map((e) => ({
        ...e,
        exceptionId: `EXC-${String(++excSeq).padStart(3, "0")}`,
        createdAtLabel: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      }));
      for (const e of newExceptions) {
        audit.push(entry("Exception", `Opened ${e.type} exception`, "exception", e.exceptionId, e.recommendedAction));
      }
      const lines = state.lines.map((l) => ({ ...l, qtyAllocated: result.lineAllocated[l.lineId] ?? 0 }));
      const orders = state.orders.map((o) => {
        const orderLines = lines.filter((l) => l.orderId === o.orderId);
        const full = orderLines.every((l) => l.qtyAllocated >= l.qtyRequired);
        const none = orderLines.every((l) => l.qtyAllocated === 0);
        const held = newExceptions.some((e) => e.orderId === o.orderId);
        return { ...o, status: held ? "Held" : none ? o.status : full ? "Allocated" : "Allocated" } as typeof o;
      });
      return {
        ...state,
        allocations: result.allocations,
        inventory: result.inventory,
        lines,
        orders,
        exceptions: [...state.exceptions, ...newExceptions],
        audit: [...state.audit, ...audit],
        lastRun: { ...state.lastRun, allocation: new Date().toLocaleTimeString() },
      };
    }

    case "runBatching": {
      if (!state.allocations.length) return state;
      const result = runBatching(state);
      const audit = result.events.map((ev) => entry("Picking", ev.action, "batch", ev.entityId, ev.reason));
      return {
        ...state,
        batches: result.batches,
        pickTasks: result.pickTasks,
        audit: [...state.audit, ...audit],
        lastRun: { ...state.lastRun, picking: new Date().toLocaleTimeString() },
      };
    }

    case "injectException": {
      // Target a high-priority batched pick — preferring one whose SKU has alternate
      // stock, so the auto-resolve path (re-route to alternate bin) can be demonstrated.
      const orderById = Object.fromEntries(state.orders.map((o) => [o.orderId, o]));
      const hasAlternate = (skuId: string, binId: string) =>
        state.inventory.some((r) => r.skuId === skuId && r.binId !== binId && r.onHand - r.reserved > 0);
      const candidates = [...state.pickTasks]
        .filter((t) => t.status === "Batched")
        .sort((a, b) => (orderById[b.orderId].priorityScore ?? 0) - (orderById[a.orderId].priorityScore ?? 0));
      const target = candidates.find((t) => hasAlternate(t.skuId, t.binId)) ?? candidates[0] ?? null;
      if (!target) return state;

      const plan = planException(state, action.exceptionType, target.skuId, target.binId, target.qty);
      const exceptionId = `EXC-${String(state.exceptions.length + 1).padStart(3, "0")}`;
      const exc: WhException = {
        exceptionId,
        type: action.exceptionType,
        state: "Classified",
        orderId: target.orderId,
        skuId: target.skuId,
        binId: target.binId,
        qty: target.qty,
        recommendedAction: plan.recommendedAction,
        resolutionPath: plan.resolutionPath,
        autoResolvable: plan.autoResolvable,
        createdAtLabel: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      // Physical reality: stock at that bin is gone/damaged for Missing/Damaged/QC Fail.
      const inventory =
        action.exceptionType === "Short Pick"
          ? state.inventory
          : state.inventory.map((r) =>
              r.skuId === target.skuId && r.binId === target.binId
                ? { ...r, onHand: Math.max(0, r.onHand - target.qty), reserved: Math.max(0, r.reserved - target.qty) }
                : r
            );

      // Risk on the affected order spikes — priorities will visibly reshuffle on recompute.
      const orders = state.orders.map((o) =>
        o.orderId === target.orderId ? { ...o, stockoutRisk: Math.min(1, o.stockoutRisk + 0.25) } : o
      );

      const pickTasks = state.pickTasks.map((t) =>
        t.pickTaskId === target.pickTaskId ? { ...t, status: "Exception" as const } : t
      );

      return {
        ...state,
        inventory,
        orders,
        pickTasks,
        exceptions: [...state.exceptions, exc],
        audit: [
          ...state.audit,
          entry(
            "Exception",
            `Injected ${action.exceptionType}`,
            "exception",
            exceptionId,
            `${target.qty}× ${target.skuId} at ${target.binId} on ${target.orderId} — ${plan.recommendedAction}`,
            `pick task ${target.pickTaskId} batched`,
            `pick task ${target.pickTaskId} in exception`
          ),
        ],
      };
    }

    case "resolveException": {
      const exc = state.exceptions.find((e) => e.exceptionId === action.id);
      if (!exc || exc.state === "Resolved" || exc.state === "Closed") return state;

      const plan = planException(state, exc.type, exc.skuId, exc.binId, exc.qty);
      const audit: AuditEntry[] = [];
      let pickTasks = state.pickTasks;
      let batches = state.batches;

      if (plan.autoResolvable && plan.alternateBinId) {
        // Re-pick from alternate bin: new task appended to the affected batch, route re-optimized.
        const failed = state.pickTasks.find(
          (t) => t.orderId === exc.orderId && t.skuId === exc.skuId && t.status === "Exception"
        );
        const newTaskId = `PT-${String(state.pickTasks.length + 1).padStart(3, "0")}`;
        const band = state.orders.find((o) => o.orderId === exc.orderId)?.priorityBand ?? "P1";
        const batchId = failed?.batchId ?? state.batches[0]?.batchId ?? null;
        pickTasks = [
          ...state.pickTasks,
          {
            pickTaskId: newTaskId,
            orderId: exc.orderId,
            skuId: exc.skuId,
            binId: plan.alternateBinId,
            qty: exc.qty,
            batchId,
            sequence: null,
            status: "Batched",
            band,
          },
        ];
        if (batchId) {
          batches = state.batches.map((b) =>
            b.batchId === batchId
              ? {
                  ...b,
                  taskIds: [...b.taskIds, newTaskId],
                  route: [...b.route.filter((r) => r !== exc.binId), plan.alternateBinId!],
                  reason: b.reason + ` · re-pick ${exc.skuId} from ${plan.alternateBinId} after ${exc.type.toLowerCase()}`,
                }
              : b
          );
        }
        audit.push(
          entry(
            "Exception",
            `Auto-resolved ${exc.type}`,
            "exception",
            exc.exceptionId,
            `${plan.recommendedAction} — reversible action, safe to auto-apply. New pick task ${newTaskId} added${batchId ? ` to ${batchId}` : ""}.`,
            "Classified",
            "Resolved"
          )
        );
      } else {
        audit.push(
          entry(
            "Exception",
            `Escalation acknowledged`,
            "exception",
            exc.exceptionId,
            `${plan.recommendedAction} — not reversible automatically, operator confirmed the recommended path.`,
            exc.state,
            "Closed"
          )
        );
      }

      const exceptions = state.exceptions.map((e) =>
        e.exceptionId === action.id
          ? { ...e, state: plan.autoResolvable ? ("Resolved" as const) : ("Closed" as const) }
          : e
      );

      return { ...state, exceptions, pickTasks, batches, audit: [...state.audit, ...audit] };
    }

    default:
      return state;
  }
}
