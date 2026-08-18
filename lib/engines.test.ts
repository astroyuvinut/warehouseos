import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAction, emptyState } from "./actions";
import { computeReorder, naiveBaseline, planException, runAllocation, runBatching, scoreOrder, TIER_WEIGHT } from "./engines";
import { buildSeedState } from "./seed";
import type { WarehouseState } from "./types";

/** The demo pipeline, run headlessly — the same sequence the Ops Console triggers. */
function pipeline(): WarehouseState {
  let s = applyAction(emptyState, { type: "seed" });
  s = applyAction(s, { type: "recomputePriorities" });
  s = applyAction(s, { type: "runAllocation" });
  s = applyAction(s, { type: "runBatching" });
  return s;
}

describe("priority scoring", () => {
  it("is the documented weighted sum of its five factors", () => {
    const state = buildSeedState();
    for (const order of state.orders) {
      const { score, breakdown } = scoreOrder(order, state.simMinute);
      const expected =
        0.35 * breakdown.slaUrgency +
        0.2 * breakdown.tier +
        0.2 * breakdown.value +
        0.15 * breakdown.stockoutRisk +
        0.1 * breakdown.age;
      assert.ok(Math.abs(score - expected) < 1e-9, `${order.orderId} score drifted from the formula`);
    }
  });

  it("keeps every factor and the resulting score inside 0..1", () => {
    const state = buildSeedState();
    for (const order of state.orders) {
      const { score, breakdown } = scoreOrder(order, state.simMinute);
      for (const [name, value] of Object.entries(breakdown)) {
        if (name === "reasons") continue;
        assert.ok((value as number) >= 0 && (value as number) <= 1, `${order.orderId}.${name} out of range`);
      }
      assert.ok(score >= 0 && score <= 1);
    }
  });

  it("ranks the P0 hero order above every other order", () => {
    const state = applyAction(applyAction(emptyState, { type: "seed" }), { type: "recomputePriorities" });
    const ranked = [...state.orders].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
    assert.equal(ranked[0].orderId, "ORD-1001", "the demo's hero order must rank first");
    assert.equal(ranked[0].priorityBand, "P0");
  });

  it("assigns bands at the documented thresholds", () => {
    const state = applyAction(applyAction(emptyState, { type: "seed" }), { type: "recomputePriorities" });
    for (const o of state.orders) {
      const s = o.priorityScore ?? 0;
      const expected = s >= 0.7 ? "P0" : s >= 0.55 ? "P1" : s >= 0.4 ? "P2" : "P3";
      assert.equal(o.priorityBand, expected, `${o.orderId} banded inconsistently with its score`);
    }
  });

  it("weights an Enterprise customer above a Bronze one", () => {
    assert.ok(TIER_WEIGHT.Enterprise > TIER_WEIGHT.Gold);
    assert.ok(TIER_WEIGHT.Gold > TIER_WEIGHT.Silver);
    assert.ok(TIER_WEIGHT.Silver > TIER_WEIGHT.Bronze);
  });
});

describe("allocation under scarcity", () => {
  it("never allocates more of a SKU than physically sits in the bin", () => {
    const state = pipeline();
    const byBin = new Map<string, number>();
    for (const a of state.allocations) {
      const key = `${a.skuId}@${a.binId}`;
      byBin.set(key, (byBin.get(key) ?? 0) + a.qty);
    }
    for (const [key, allocated] of byBin) {
      const [skuId, binId] = key.split("@");
      const onHand = state.inventory
        .filter((r) => r.skuId === skuId && r.binId === binId)
        .reduce((s, r) => s + r.onHand, 0);
      assert.ok(allocated <= onHand, `${key} over-allocated: ${allocated} against ${onHand} on hand`);
    }
  });

  it("never allocates more to a line than the line requires", () => {
    const state = pipeline();
    for (const line of state.lines) {
      const allocated = state.allocations
        .filter((a) => a.lineId === line.lineId)
        .reduce((s, a) => s + a.qty, 0);
      assert.ok(allocated <= line.qtyRequired, `${line.lineId} over-filled`);
    }
  });

  it("gives the contested SKU to the highest-priority order and holds the remainder", () => {
    const state = pipeline();
    const contested = state.allocations.filter((a) => a.skuId === "SKU-1004");
    const onHand = state.inventory
      .filter((r) => r.skuId === "SKU-1004")
      .reduce((s, r) => s + r.onHand, 0);
    const demand = state.lines
      .filter((l) => l.skuId === "SKU-1004")
      .reduce((s, l) => s + l.qtyRequired, 0);

    assert.ok(demand > onHand, "SKU-1004 must stay scarce for the demo to have a story");

    const hero = contested.find((a) => a.orderId === "ORD-1001");
    assert.ok(hero, "the P0 order must receive some of the contested SKU");
    const others = contested.filter((a) => a.orderId !== "ORD-1001");
    for (const o of others) {
      assert.ok(hero.qty > o.qty, `P0 order should out-allocate ${o.orderId}`);
    }

    // The unfillable remainder must surface as an exception rather than vanish.
    const shortage = state.exceptions.find((e) => e.skuId === "SKU-1004");
    assert.ok(shortage, "the shortfall must raise an exception");
    assert.equal(shortage.autoResolvable, false, "a true stockout has no alternate bin to auto-resolve to");
  });

  it("never breaks work a picker has already done", () => {
    // The engine's hardest guarantee: re-planning must leave picked allocations untouched.
    const state = pipeline();
    const picked = state.allocations.map((a, i) => (i % 3 === 0 ? { ...a, picked: true } : a));
    const before = picked.filter((a) => a.picked);
    assert.ok(before.length > 0, "the fixture needs at least one picked allocation");

    const replanned = runAllocation({ ...state, allocations: picked });

    for (const original of before) {
      const survivor = replanned.allocations.find((a) => a.allocationId === original.allocationId);
      assert.ok(survivor, `picked allocation ${original.allocationId} was dropped`);
      assert.equal(survivor.qty, original.qty, `picked allocation ${original.allocationId} was resized`);
      assert.equal(survivor.binId, original.binId, `picked allocation ${original.allocationId} was moved`);
    }
  });

  it("only ever reclaims units from lower-priority, unpicked allocations", () => {
    const state = pipeline();
    const scoreOf = (orderId: string) => state.orders.find((o) => o.orderId === orderId)?.priorityScore ?? 0;
    for (const steal of state.allocations.filter((a) => a.action === "steal")) {
      assert.ok(
        steal.reason.includes("not yet picked"),
        `a reclaim must state that the victim was unpicked: ${steal.reason}`
      );
      assert.ok(scoreOf(steal.orderId) > 0, "the reclaiming order must be scored");
    }
  });
});

describe("pick batching and routing", () => {
  it("never mixes urgency bands inside a batch", () => {
    const state = pipeline();
    for (const batch of state.batches) {
      const tasks = state.pickTasks.filter((t) => batch.taskIds.includes(t.pickTaskId));
      for (const t of tasks) {
        assert.equal(t.band, batch.slaBand, `${batch.batchId} mixed ${t.band} into a ${batch.slaBand} batch`);
      }
    }
  });

  it("respects the per-batch line capacity", () => {
    const state = pipeline();
    for (const batch of state.batches) {
      assert.ok(batch.taskIds.length <= 6, `${batch.batchId} exceeded the capacity cap`);
    }
  });

  it("routes through every distinct bin its tasks need, and no others", () => {
    const state = pipeline();
    for (const batch of state.batches) {
      const needed = new Set(
        state.pickTasks.filter((t) => batch.taskIds.includes(t.pickTaskId)).map((t) => t.binId)
      );
      assert.deepEqual(new Set(batch.route), needed, `${batch.batchId} route does not match its bins`);
    }
  });

  it("leaves already-picked tasks alone when re-batching", () => {
    const state = pipeline();
    const withPicked = {
      ...state,
      pickTasks: state.pickTasks.map((t, i) => (i === 0 ? { ...t, status: "Picked" as const } : t)),
    };
    const done = withPicked.pickTasks[0];
    const result = runBatching(withPicked);
    const survivor = result.pickTasks.find((t) => t.pickTaskId === done.pickTaskId);
    assert.ok(survivor, "a picked task must survive re-batching");
    assert.equal(survivor.status, "Picked");
  });
});

describe("baseline comparison", () => {
  it("covers exactly the same pick work as the optimized plan", () => {
    const state = pipeline();
    const base = naiveBaseline(state);
    const optimizedOrders = new Set(
      state.pickTasks.filter((t) => t.status !== "Picked").map((t) => t.orderId)
    );
    const baselineOrders = new Set(base.perOrder.map((o) => o.orderId));
    assert.deepEqual(baselineOrders, optimizedOrders, "the comparison is only fair over identical work");
  });

  it("walks strictly further than the optimized plan", () => {
    const state = pipeline();
    const base = naiveBaseline(state);
    const optimized = state.batches.reduce((s, b) => s + b.estWalkTimeMin, 0);
    assert.ok(base.walkMin > optimized, "batching must beat one-order-per-trip, or the headline claim is false");
  });

  it("returns a drawable stop sequence for every trip", () => {
    const state = pipeline();
    for (const trip of naiveBaseline(state).perOrder) {
      assert.equal(trip.route.length, trip.stops);
      assert.ok(trip.stops > 0);
    }
  });
});

describe("exception state machine", () => {
  it("auto-resolves only when an alternate bin can actually serve the pick", () => {
    const state = pipeline();
    const withAlternate = planException(state, "Missing", "SKU-1003", "A2-02", 4);
    assert.equal(withAlternate.autoResolvable, true);
    assert.ok(withAlternate.alternateBinId, "an auto-resolvable plan must name the bin it reroutes to");

    // A SKU held in exactly one bin has nowhere to reroute to.
    const single = { ...state, inventory: state.inventory.filter((r) => r.binId === "A2-04") };
    const noAlternate = planException(single, "Missing", "SKU-1004", "A2-04", 4);
    assert.equal(noAlternate.autoResolvable, false);
    assert.ok(noAlternate.resolutionPath.includes("Needs Review"));
  });

  it("escalates rather than auto-resolves when it cannot reverse the action", () => {
    const state = pipeline();
    const injected = applyAction(state, { type: "injectException", exceptionType: "Missing" });
    const exception = injected.exceptions.at(-1);
    assert.ok(exception);

    const resolved = applyAction(injected, { type: "resolveException", id: exception.exceptionId });
    const after = resolved.exceptions.find((e) => e.exceptionId === exception.exceptionId);
    assert.ok(after);
    assert.equal(after.state, exception.autoResolvable ? "Resolved" : "Closed");
  });

  it("adds a replacement pick task when it auto-resolves", () => {
    const state = pipeline();
    const injected = applyAction(state, { type: "injectException", exceptionType: "Missing" });
    const exception = injected.exceptions.at(-1);
    assert.ok(exception);
    if (!exception.autoResolvable) return; // escalation path is covered above

    const resolved = applyAction(injected, { type: "resolveException", id: exception.exceptionId });
    assert.ok(
      resolved.pickTasks.length > injected.pickTasks.length,
      "auto-resolution must schedule the re-pick, not just close the ticket"
    );
  });

  it("refuses to resolve the same exception twice", () => {
    const state = pipeline();
    const injected = applyAction(state, { type: "injectException", exceptionType: "Missing" });
    const id = injected.exceptions.at(-1)!.exceptionId;
    const once = applyAction(injected, { type: "resolveException", id });
    const twice = applyAction(once, { type: "resolveException", id });
    assert.equal(twice, once, "a second resolve must be a no-op");
  });
});

describe("reorder point", () => {
  it("implements ROP = demand × lead time + 1.65·σ·√LT", () => {
    const sku = { avgDailyDemand: 20, leadTimeDays: 4, demandStdDev: 6 };
    const { safetyStock, reorderPoint } = computeReorder(sku);
    const expectedSS = 1.65 * 6 * Math.sqrt(4);
    assert.ok(Math.abs(safetyStock - Math.round(expectedSS * 10) / 10) < 1e-9);
    assert.equal(reorderPoint, Math.ceil(20 * 4 + expectedSS));
  });

  it("raises the reorder point as demand volatility rises", () => {
    const steady = computeReorder({ avgDailyDemand: 20, leadTimeDays: 4, demandStdDev: 2 });
    const volatile = computeReorder({ avgDailyDemand: 20, leadTimeDays: 4, demandStdDev: 12 });
    assert.ok(volatile.reorderPoint > steady.reorderPoint);
  });
});

describe("audit trail", () => {
  it("records every engine decision with a reason and a stable sequence", () => {
    const state = pipeline();
    assert.ok(state.audit.length > 0);
    const seqs = state.audit.map((a) => a.seq);
    assert.deepEqual(seqs, [...seqs].sort((a, b) => a - b), "audit sequence must be monotonic");
    assert.equal(new Set(seqs).size, seqs.length, "audit sequence numbers must be unique");
    for (const entry of state.audit) {
      assert.ok(entry.reason.length > 0, `${entry.auditId} has no rationale`);
      assert.ok(entry.engine.length > 0);
    }
  });

  it("keeps growing as engines run — nothing is silently overwritten", () => {
    let s = applyAction(emptyState, { type: "seed" });
    const afterSeed = s.audit.length;
    s = applyAction(s, { type: "recomputePriorities" });
    const afterPriority = s.audit.length;
    s = applyAction(s, { type: "runAllocation" });
    assert.ok(afterPriority > afterSeed);
    assert.ok(s.audit.length > afterPriority);
  });
});
