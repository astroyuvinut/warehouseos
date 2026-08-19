"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { BandChip } from "@/components/ui";
import { ImpactComparison } from "@/components/charts";

export default function OpsConsole() {
  const { state, dispatch, pending, engineMs } = useStore();

  if (!state.seeded) {
    return (
      <div className="card">
        <div className="hero">
          <span className="chip chip-p2">Hackathon demo · deterministic dataset</span>
          <h1>Warehouses don&apos;t fail because they lack data. They fail because decisions are late.</h1>
          <p>
            WarehouseOS continuously prioritizes orders, allocates scarce inventory, optimizes pick
            routes, and resolves exceptions — and explains every decision it makes.
          </p>
          {/* Full pipeline leads: a visitor arriving cold gets a populated
              dashboard in one click. Stepping through engine by engine stays
              available for a narrated demo. */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <button className="btn btn-primary" disabled={pending} onClick={() => dispatch({ type: "runPipeline" })}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              {pending ? "Running…" : "Seed & run everything"}
            </button>
            <button className="btn" disabled={pending} onClick={() => dispatch({ type: "seed" })}>
              Seed data only
            </button>
          </div>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            Seeds a deterministic 8-order warehouse and runs all three engines.
          </span>
        </div>
      </div>
    );
  }

  const scored = state.orders.filter((o) => o.priorityScore !== null);
  const p0 = scored.filter((o) => o.priorityBand === "P0").length;
  const p1 = scored.filter((o) => o.priorityBand === "P1").length;
  const openExc = state.exceptions.filter((e) => e.state !== "Resolved" && e.state !== "Closed");
  const totalWalk = state.batches.reduce((s, b) => s + b.estWalkTimeMin, 0);
  const scarce = state.skus
    .map((sku) => {
      const onHand = state.inventory.filter((r) => r.skuId === sku.skuId).reduce((s, r) => s + r.onHand, 0);
      const demand = state.lines.filter((l) => l.skuId === sku.skuId).reduce((s, l) => s + l.qtyRequired, 0);
      return { sku, onHand, demand };
    })
    .filter((x) => x.demand > x.onHand);

  const steps = [
    {
      n: 1,
      title: "Recompute Priorities",
      desc: "Score every order on SLA urgency, tier, value, stockout risk and age.",
      done: !!state.lastRun.priority,
      action: () => dispatch({ type: "recomputePriorities" }),
      enabled: true,
      last: state.lastRun.priority,
    },
    {
      n: 2,
      title: "Run Allocation",
      desc: "Allocate scarce inventory to highest-impact orders. Picked work is never broken.",
      done: !!state.lastRun.allocation,
      action: () => dispatch({ type: "runAllocation" }),
      enabled: !!state.lastRun.priority,
      last: state.lastRun.allocation,
    },
    {
      n: 3,
      title: "Batch & Optimize Picks",
      desc: "Cluster by zone within SLA bands; nearest-neighbor + 2-opt routing.",
      done: !!state.lastRun.picking,
      action: () => dispatch({ type: "runBatching" }),
      enabled: !!state.lastRun.allocation,
      last: state.lastRun.picking,
    },
  ];

  const recentDecisions = [...state.audit].slice(-5).reverse();

  return (
    <>
      <div className="kpi-grid">
        <div className="card kpi">
          <span className="label">Open Orders</span>
          <span className="value num">{state.orders.length}</span>
          <span className="delta">{scored.length ? `${p0} at P0 · ${p1} at P1` : "not yet scored"}</span>
        </div>
        <div className="card kpi">
          <span className="label">Scarce SKUs</span>
          <span className="value num">{scarce.length}</span>
          <span className={`delta ${scarce.length ? "bad" : "good"}`}>
            {scarce.length ? `demand exceeds on-hand (${scarce.map((s) => s.sku.skuId).join(", ")})` : "supply covers demand"}
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Open Exceptions</span>
          <span className="value num">{openExc.length}</span>
          <span className={`delta ${openExc.length ? "bad" : "good"}`}>
            {openExc.length ? `${openExc.filter((e) => e.autoResolvable).length} auto-resolvable` : "queue clear"}
          </span>
        </div>
        <div className="card kpi">
          <span className="label">Est. Walk Time</span>
          <span className="value num">{state.batches.length ? `${totalWalk.toFixed(1)}m` : "—"}</span>
          <span className="delta">{state.batches.length ? `across ${state.batches.length} optimized batches` : "no batches yet"}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Decision Pipeline</h2>
          <span className="sub">Run each engine in order — every action lands in the audit trail</span>
          <div className="card-head-actions">
            {engineMs !== null && (
              <span className="chip chip-success num" title="Server-side engine time for the last run">
                engines ran in {engineMs} ms
              </span>
            )}
            <button
              className="btn"
              style={{ fontSize: 12.5 }}
              disabled={pending}
              title="Seed 200 orders and run the full pipeline — shows the engines under load"
              onClick={() => dispatch({ type: "runPipeline", scale: 200 })}
            >
              Stress test · 200 orders
            </button>
            <button
              className="btn btn-primary"
              style={{ fontSize: 12.5 }}
              disabled={pending}
              title="Run every engine in sequence"
              onClick={() => dispatch({ type: "runPipeline" })}
            >
              Run all
            </button>
          </div>
        </div>
        <div className="card-body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
          {steps.map((s) => (
            <div
              key={s.n}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-sm)",
                padding: "16px 18px",
                background: "var(--surface-2)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className="num"
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 7,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 650,
                    background: s.done ? "var(--success-soft)" : "var(--primary-soft)",
                    color: s.done ? "var(--success-strong)" : "var(--primary-strong)",
                  }}
                >
                  {s.done ? "✓" : s.n}
                </span>
                <strong style={{ fontSize: 13.5 }}>{s.title}</strong>
                {s.last && <span className="chip chip-neutral num" style={{ marginLeft: "auto" }}>{s.last}</span>}
              </div>
              <p style={{ fontSize: 12.5, color: "var(--muted)", flex: 1 }}>{s.desc}</p>
              <button className={`btn ${s.done ? "" : "btn-primary"}`} disabled={!s.enabled || pending} onClick={s.action}>
                {s.done ? "Run again" : "Run"}
              </button>
            </div>
          ))}
        </div>
      </div>

      <ImpactComparison state={state} />

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h2>Scarcity Alerts</h2>
            <Link href="/inventory" className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12 }}>
              Inventory →
            </Link>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scarce.length === 0 && <span style={{ color: "var(--muted)", fontSize: 13 }}>No shortages detected.</span>}
            {scarce.map(({ sku, onHand, demand }) => (
              <div key={sku.skuId} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span className="chip chip-danger">short {demand - onHand}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 560, fontSize: 13 }}>{sku.name}</div>
                  <div className="num" style={{ fontSize: 12, color: "var(--muted)" }}>
                    {sku.skuId} · on-hand {onHand} vs demand {demand}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Latest Decisions</h2>
            <Link href="/audit" className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12 }}>
              Full audit →
            </Link>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {recentDecisions.map((a) => (
              <div key={a.auditId} style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
                <span className="chip chip-neutral" style={{ flexShrink: 0 }}>{a.engine}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 560 }}>{a.action}</div>
                  <div style={{ color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {a.reason}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {scored.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>Top of Queue</h2>
            <span className="sub">Highest-priority orders right now</span>
            <Link href="/orders" className="btn btn-ghost card-head-action" style={{ fontSize: 12 }}>
              All orders →
            </Link>
          </div>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th><th>Customer</th><th>Band</th><th className="hide-sm">Score</th><th>SLA due</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {[...scored]
                  .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
                  .slice(0, 4)
                  .map((o) => (
                    <tr key={o.orderId}>
                      <td className="num td-primary" data-label="Order" style={{ fontWeight: 600 }}>{o.orderId}</td>
                      <td data-label="Customer">{o.customer}</td>
                      <td data-label="Band"><BandChip band={o.priorityBand} /></td>
                      <td className="num hide-sm" data-label="Score">{(o.priorityScore ?? 0).toFixed(3)}</td>
                      <td className="num" data-label="SLA due">{o.slaDueOffsetMin} min</td>
                      <td data-label="Status">{o.status}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
