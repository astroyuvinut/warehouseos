"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { EmptyState } from "@/components/ui";

const ENGINES = ["All", "Priority", "Allocation", "Picking", "Exception", "System"] as const;

export default function AuditPage() {
  const { state, dispatch, pending } = useStore();
  const [engine, setEngine] = useState<(typeof ENGINES)[number]>("All");
  const [orderFilter, setOrderFilter] = useState("All");

  const orderIds = useMemo(
    () => ["All", ...new Set(state.audit.map((a) => a.entityId).filter((id) => id.startsWith("ORD")))],
    [state.audit]
  );

  if (!state.seeded) {
    return (
      <div className="card">
        <EmptyState
          title="No data yet"
          hint="Seed the deterministic demo dataset from the Ops Console first."
          action={<button className="btn btn-primary" disabled={pending} onClick={() => dispatch({ type: "seed" })}>Seed Demo Data</button>}
        />
      </div>
    );
  }

  const filtered = [...state.audit]
    .reverse()
    .filter((a) => engine === "All" || a.engine === engine)
    .filter((a) => orderFilter === "All" || a.entityId === orderFilter || a.reason.includes(orderFilter));

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(state.audit, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "warehouseos-audit.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2>Decision Log</h2>
        <span className="sub num">{filtered.length} of {state.audit.length} entries</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={orderFilter}
            onChange={(e) => setOrderFilter(e.target.value)}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--line-strong)",
              borderRadius: 8,
              padding: "6px 10px",
              color: "var(--text)",
              fontSize: 12.5,
            }}
          >
            {orderIds.map((id) => (
              <option key={id} value={id}>{id === "All" ? "All orders" : id}</option>
            ))}
          </select>
          {ENGINES.map((e) => (
            <button
              key={e}
              className="btn btn-ghost"
              style={
                engine === e
                  ? { background: "var(--primary-soft)", color: "var(--primary-strong)" }
                  : { fontSize: 12.5, color: "var(--muted)" }
              }
              onClick={() => setEngine(e)}
            >
              {e}
            </button>
          ))}
          <button className="btn" onClick={exportJson}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/></svg>
            Export JSON
          </button>
        </div>
      </div>
      <div className="card-body">
        {filtered.length === 0 ? (
          <EmptyState title="Nothing logged yet" hint="Run the engines — every decision lands here with inputs, outputs and rationale." />
        ) : (
          <div className="timeline">
            {filtered.map((a) => (
              <div key={a.auditId} className={`tl-item engine-${a.engine}`}>
                <div className="tl-head">
                  <span className="action">{a.action}</span>
                  <span className="chip chip-neutral">{a.engine}</span>
                  <span className="meta">{a.entityType} · {a.entityId}</span>
                  <span className="meta">{a.atLabel}</span>
                </div>
                <div className="tl-reason">{a.reason}</div>
                {(a.before || a.after) && (
                  <div className="tl-diff">
                    {a.before && <span className="before">{a.before}</span>}
                    <span style={{ color: "var(--faint)" }}>→</span>
                    {a.after && <span className="after">{a.after}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
