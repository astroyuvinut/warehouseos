"use client";

import type { PriorityBand } from "@/lib/types";

export function BandChip({ band }: { band: PriorityBand | null }) {
  if (!band) return <span className="chip chip-neutral">unscored</span>;
  const cls = { P0: "chip-p0", P1: "chip-p1", P2: "chip-p2", P3: "chip-p3" }[band];
  return <span className={`chip ${cls}`}>{band}</span>;
}

export function StatusChip({ status }: { status: string }) {
  const map: Record<string, string> = {
    New: "chip-neutral",
    Allocated: "chip-p2",
    Picking: "chip-warning",
    Packed: "chip-success",
    Shipped: "chip-success",
    Held: "chip-danger",
    Open: "chip-neutral",
    Batched: "chip-p2",
    Picked: "chip-success",
    Exception: "chip-danger",
    Detected: "chip-danger",
    Classified: "chip-warning",
    Resolved: "chip-success",
    "Needs Review": "chip-warning",
    Closed: "chip-neutral",
  };
  return <span className={`chip ${map[status] ?? "chip-neutral"}`}>{status}</span>;
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      </div>
      <h3>{title}</h3>
      <p style={{ fontSize: 12.5, maxWidth: 380, margin: "0 auto 14px" }}>{hint}</p>
      {action}
    </div>
  );
}

export function StatePath({ path, current }: { path: string[]; current: string }) {
  const currentIdx = path.indexOf(current);
  return (
    <div className="statepath">
      {path.map((st, i) => (
        <span key={st} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span className="arrow">→</span>}
          <span className={`st${i < currentIdx ? " done" : i === currentIdx ? " current" : ""}`}>{st}</span>
        </span>
      ))}
    </div>
  );
}
