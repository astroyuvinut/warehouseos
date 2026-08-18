"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { BandChip, EmptyState, StatusChip } from "@/components/ui";
import { PriorityComposition, SlaTimeline } from "@/components/charts";
import type { Order } from "@/lib/types";

const WEIGHTS = [
  { key: "slaUrgency", label: "SLA urgency", weight: 0.35 },
  { key: "tier", label: "Customer tier", weight: 0.2 },
  { key: "value", label: "Order value", weight: 0.2 },
  { key: "stockoutRisk", label: "Stockout risk", weight: 0.15 },
  { key: "age", label: "Order age", weight: 0.1 },
] as const;

export default function OrdersPage() {
  const { state, dispatch, pending } = useStore();
  const [selected, setSelected] = useState<Order | null>(null);

  if (!state.seeded) {
    return (
      <div className="card">
        <EmptyState
          title="No data yet"
          hint="Seed the deterministic demo dataset from the Ops Console to load orders."
          action={<button className="btn btn-primary" disabled={pending} onClick={() => dispatch({ type: "seed" })}>Seed Demo Data</button>}
        />
      </div>
    );
  }

  const scored = state.orders.some((o) => o.priorityScore !== null);
  const orders = [...state.orders].sort((a, b) => (b.priorityScore ?? -1) - (a.priorityScore ?? -1));
  const sel = selected ? state.orders.find((o) => o.orderId === selected.orderId) ?? null : null;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Order Queue</h2>
          <span className="sub">
            {scored ? "Ranked by priority score — click a row for the reasoning" : "Unscored — run the priority engine"}
          </span>
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto" }}
            disabled={pending}
            onClick={() => dispatch({ type: "recomputePriorities" })}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/></svg>
            Recompute Priorities
          </button>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Rank</th><th>Order</th><th>Customer</th><th>Tier</th><th>Band</th>
                <th>Score</th><th>SLA due</th><th>Value</th><th>Risk</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o, i) => {
                const urgent = o.slaDueOffsetMin - state.simMinute <= 60;
                return (
                  <tr key={o.orderId} className="clickable" onClick={() => setSelected(o)}>
                    <td className="num" style={{ color: "var(--faint)" }}>{scored ? i + 1 : "—"}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{o.orderId}</td>
                    <td>{o.customer}</td>
                    <td style={{ color: "var(--muted)" }}>{o.customerTier}</td>
                    <td><BandChip band={o.priorityBand} /></td>
                    <td className="num">{o.priorityScore !== null ? o.priorityScore.toFixed(3) : "—"}</td>
                    <td className="num" style={{ color: urgent ? "var(--danger-strong)" : undefined, fontWeight: urgent ? 600 : undefined }}>
                      {o.slaDueOffsetMin - state.simMinute} min
                    </td>
                    <td className="num">${o.orderValue.toLocaleString()}</td>
                    <td className="num">{Math.round(o.stockoutRisk * 100)}%</td>
                    <td><StatusChip status={o.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {scored && (
        <div className="grid-2">
          <PriorityComposition state={state} />
          <SlaTimeline state={state} />
        </div>
      )}

      {sel && (
        <>
          <div className="drawer-overlay" onClick={() => setSelected(null)} />
          <div className="drawer">
            <div className="drawer-head">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <strong className="num" style={{ fontSize: 15 }}>{sel.orderId}</strong>
                  <BandChip band={sel.priorityBand} />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  {sel.customer} · {sel.customerTier}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ marginLeft: "auto" }} onClick={() => setSelected(null)}>
                ✕
              </button>
            </div>
            <div className="drawer-body">
              {sel.scoreBreakdown ? (
                <>
                  <div>
                    <div className="section-title" style={{ marginBottom: 10 }}>
                      Score composition — {(sel.priorityScore ?? 0).toFixed(3)}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {WEIGHTS.map((w) => {
                        const v = sel.scoreBreakdown![w.key];
                        return (
                          <div className="factor" key={w.key}>
                            <span className="name">{w.label} <span style={{ color: "var(--faint)" }}>×{w.weight}</span></span>
                            <div className="bar"><div style={{ width: `${v * 100}%` }} /></div>
                            <span className="val">{(v * w.weight).toFixed(3)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="section-title" style={{ marginBottom: 10 }}>Why this rank</div>
                    <ul className="reason-list">
                      {sel.scoreBreakdown.reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </div>
                </>
              ) : (
                <p style={{ color: "var(--muted)", fontSize: 13 }}>
                  Not scored yet — run the priority engine to see the reasoning.
                </p>
              )}

              <div>
                <div className="section-title" style={{ marginBottom: 10 }}>Lines</div>
                <div className="table-wrap" style={{ border: "1px solid var(--line)", borderRadius: 8 }}>
                  <table className="data">
                    <thead>
                      <tr><th>SKU</th><th>Req</th><th>Alloc</th><th>Picked</th></tr>
                    </thead>
                    <tbody>
                      {state.lines
                        .filter((l) => l.orderId === sel.orderId)
                        .map((l) => (
                          <tr key={l.lineId}>
                            <td className="num">{l.skuId}</td>
                            <td className="num">{l.qtyRequired}</td>
                            <td className="num" style={{ color: l.qtyAllocated < l.qtyRequired && l.qtyAllocated > 0 ? "var(--warning-strong)" : undefined }}>
                              {l.qtyAllocated}
                            </td>
                            <td className="num">{l.qtyPicked}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
