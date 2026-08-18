"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { EmptyState, StatePath, StatusChip } from "@/components/ui";
import type { ExceptionType } from "@/lib/types";

const TYPES: ExceptionType[] = ["Missing", "Damaged", "Short Pick", "QC Fail"];

export default function ExceptionsPage() {
  const { state, dispatch, pending } = useStore();
  const [type, setType] = useState<ExceptionType>("Missing");

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

  const canInject = state.pickTasks.some((t) => t.status === "Batched");
  const open = state.exceptions.filter((e) => e.state !== "Resolved" && e.state !== "Closed");
  const closed = state.exceptions.filter((e) => e.state === "Resolved" || e.state === "Closed");

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Inject Exception</h2>
          <span className="sub">Simulate reality hitting the floor — targets the highest-priority batched pick</span>
        </div>
        <div className="card-body" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          {TYPES.map((t) => (
            <button
              key={t}
              className="btn"
              onClick={() => setType(t)}
              style={
                type === t
                  ? { background: "var(--primary-soft)", borderColor: "#d2e3fc", color: "var(--primary-strong)" }
                  : undefined
              }
            >
              {t}
            </button>
          ))}
          <button
            className="btn btn-danger"
            style={{ marginLeft: "auto" }}
            disabled={!canInject || pending}
            title={canInject ? undefined : "Batch picks first — the injection targets a batched pick task"}
            onClick={() => dispatch({ type: "injectException", exceptionType: type })}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>
            Inject {type}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Exception Queue</h2>
          <span className="sub">{open.length ? `${open.length} open` : "queue clear"}</span>
        </div>
        {state.exceptions.length === 0 ? (
          <EmptyState
            title="No exceptions"
            hint="Inject one above, or let the allocator open shortage holds automatically. The state machine recommends the next best path for each."
          />
        ) : (
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[...open, ...closed].map((e) => (
              <div
                key={e.exceptionId}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: "var(--radius-sm)",
                  background: "var(--surface-2)",
                  padding: "16px 18px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  opacity: e.state === "Resolved" || e.state === "Closed" ? 0.65 : 1,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span className="num" style={{ fontWeight: 650, color: "var(--faint)" }}>{e.exceptionId}</span>
                  <StatusChip status={e.state} />
                  <span className="chip chip-neutral">{e.type}</span>
                  <span className="num" style={{ fontSize: 12.5, color: "var(--muted)" }}>
                    {e.qty}× {e.skuId} · bin {e.binId} · {e.orderId}
                  </span>
                  <span className="num" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--faint)" }}>
                    {e.createdAtLabel}
                  </span>
                </div>

                <StatePath path={["Detected", "Classified", e.autoResolvable ? "Auto-Resolve" : "Needs Review", e.autoResolvable ? "Resolved" : "Closed"]} current={e.state === "Needs Review" ? "Needs Review" : e.state} />

                <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 260, fontSize: 12.5, color: "var(--muted)" }}>
                    <span style={{ color: "var(--text)", fontWeight: 560 }}>Recommended: </span>
                    {e.recommendedAction}
                  </div>
                  {e.state !== "Resolved" && e.state !== "Closed" && (
                    <button
                      className={`btn ${e.autoResolvable ? "btn-primary" : ""}`}
                      disabled={pending}
                      onClick={() => dispatch({ type: "resolveException", id: e.exceptionId })}
                    >
                      {e.autoResolvable ? "Auto-resolve" : "Acknowledge & close"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
