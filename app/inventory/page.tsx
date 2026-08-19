"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { computeReorder } from "@/lib/engines";
import { EmptyState } from "@/components/ui";
import { AllocationFlow, CoverageChart } from "@/components/charts";

const ACTION_CHIP: Record<string, string> = {
  allocate: "chip-p2",
  partial: "chip-warning",
  steal: "chip-danger",
  hold: "chip-danger",
  "cross-dock": "chip-warning",
};

export default function InventoryPage() {
  const { state, dispatch, pending } = useStore();
  const [query, setQuery] = useState("");

  if (!state.seeded) {
    return (
      <div className="card">
        <EmptyState
          title="No data yet"
          hint="Seed the deterministic demo dataset from the Ops Console to load inventory."
          action={<button className="btn btn-primary" disabled={pending} onClick={() => dispatch({ type: "seed" })}>Seed Demo Data</button>}
        />
      </div>
    );
  }

  const rows = state.skus
    .filter(
      (s) =>
        s.skuId.toLowerCase().includes(query.toLowerCase()) ||
        s.name.toLowerCase().includes(query.toLowerCase())
    )
    .map((sku) => {
      const inv = state.inventory.filter((r) => r.skuId === sku.skuId);
      const onHand = inv.reduce((s, r) => s + r.onHand, 0);
      const reserved = inv.reduce((s, r) => s + r.reserved, 0);
      const demand = state.lines.filter((l) => l.skuId === sku.skuId).reduce((s, l) => s + l.qtyRequired, 0);
      const reorder = computeReorder(sku);
      return { sku, inv, onHand, reserved, demand, reorder };
    });

  const canAllocate = state.orders.some((o) => o.priorityScore !== null);

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Stock Position</h2>
          <input
            className="field card-head-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search SKU…"
          />
          <button
            className="btn btn-primary card-head-action"
            disabled={!canAllocate || pending}
            title={canAllocate ? undefined : "Run the priority engine first"}
            onClick={() => dispatch({ type: "runAllocation" })}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7"/></svg>
            Run Allocation
          </button>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>SKU</th><th>Name</th><th className="hide-sm">Bins</th><th>Availability</th>
                <th>On-hand</th><th className="hide-sm">Reserved</th><th>Demand</th><th className="hide-sm">ROP / SS</th><th>Signal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ sku, inv, onHand, reserved, demand, reorder }) => {
                const free = onHand - reserved;
                const pct = onHand === 0 ? 0 : (free / onHand) * 100;
                const short = demand > onHand;
                const belowRop = onHand < reorder.reorderPoint;
                return (
                  <tr key={sku.skuId}>
                    <td className="num td-primary" data-label="SKU" style={{ fontWeight: 600 }}>{sku.skuId}</td>
                    <td data-label="Name">{sku.name}</td>
                    <td className="num hide-sm" data-label="Bins" style={{ color: "var(--muted)" }}>{inv.map((r) => r.binId).join(", ")}</td>
                    <td className="td-bar" data-label="Availability">
                      <div className="availbar">
                        <div
                          style={{
                            width: `${pct}%`,
                            background: short ? "var(--danger)" : pct < 40 ? "var(--warning)" : "var(--success)",
                          }}
                        />
                      </div>
                    </td>
                    <td className="num" data-label="On-hand">{onHand}</td>
                    <td className="num hide-sm" data-label="Reserved" style={{ color: reserved ? "var(--primary-strong)" : "var(--faint)" }}>{reserved}</td>
                    <td className="num" data-label="Demand">{demand}</td>
                    <td className="num hide-sm" data-label="ROP / SS" style={{ color: "var(--muted)" }}>{reorder.reorderPoint} / {reorder.safetyStock}</td>
                    <td data-label="Signal">
                      {short ? (
                        <span className="chip chip-danger">short {demand - onHand}</span>
                      ) : belowRop ? (
                        <span className="chip chip-warning">reorder {reorder.suggestedOrderQty}</span>
                      ) : (
                        <span className="chip chip-success">healthy</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <CoverageChart state={state} />
      <AllocationFlow state={state} />

      <div className="card">
        <div className="card-head">
          <h2>Allocation Plan</h2>
          <span className="sub">
            {state.allocations.length
              ? "Who got what — and why. Picked allocations are immutable."
              : "Run allocation to see the plan"}
          </span>
        </div>
        {state.allocations.length === 0 ? (
          <EmptyState
            title="No allocations yet"
            hint="Score priorities, then run the allocation engine. Scarce SKUs will show partial ships, steals and holds with reasons."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th className="hide-sm">ID</th><th>Order</th><th>SKU</th><th>Bin</th><th>Qty</th><th>Action</th><th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {state.allocations.map((a) => (
                  <tr key={a.allocationId}>
                    <td className="num hide-sm" data-label="ID" style={{ color: "var(--faint)" }}>{a.allocationId}</td>
                    <td className="num td-primary" data-label="Order" style={{ fontWeight: 600 }}>{a.orderId}</td>
                    <td className="num" data-label="SKU">{a.skuId}</td>
                    <td className="num" data-label="Bin">{a.binId}</td>
                    <td className="num" data-label="Qty">{a.qty}</td>
                    <td data-label="Action">
                      <span className={`chip ${ACTION_CHIP[a.action]}`}>{a.action}</span>
                      {a.picked && <span className="chip chip-success" style={{ marginLeft: 6 }}>picked · locked</span>}
                    </td>
                    <td className="td-wide" data-label="Reason" style={{ color: "var(--muted)", fontSize: 12.5, maxWidth: 380 }}>{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
