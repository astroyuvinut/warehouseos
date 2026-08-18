"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { DOCK } from "@/lib/seed";
import { BandChip, EmptyState, StatusChip } from "@/components/ui";
import { RouteComparison } from "@/components/charts";

export default function PicksPage() {
  const { state, dispatch, pending } = useStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  const canBatch = state.allocations.length > 0;
  const selected = state.batches.find((b) => b.batchId === selectedId) ?? state.batches[0] ?? null;
  const binById = Object.fromEntries(state.bins.map((b) => [b.binId, b]));

  // SVG geometry: warehouse grid 0-100 mapped into a 640×360 viewBox with padding.
  const px = (x: number) => 40 + (x / 100) * 560;
  const py = (y: number) => 24 + (y / 100) * 312;
  const routeBins = selected ? selected.route.map((id) => binById[id]).filter(Boolean) : [];
  const routePoints = [
    { x: px(DOCK.x), y: py(DOCK.y) },
    ...routeBins.map((b) => ({ x: px(b.x), y: py(b.y) })),
    { x: px(DOCK.x), y: py(DOCK.y) },
  ];

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h2>Pick Batches</h2>
          <span className="sub">Separated by SLA band · clustered by zone · capacity-capped</span>
          <button
            className="btn btn-primary"
            style={{ marginLeft: "auto" }}
            disabled={!canBatch || pending}
            title={canBatch ? undefined : "Run allocation first"}
            onClick={() => dispatch({ type: "runBatching" })}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V9a2 2 0 0 1 2-2h8"/></svg>
            Batch &amp; Optimize Route
          </button>
        </div>
        {state.batches.length === 0 ? (
          <EmptyState
            title="No batches yet"
            hint="Once inventory is allocated, the pick optimizer builds urgency-pure batches and routes them with nearest-neighbor + 2-opt."
          />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Batch</th><th>Band</th><th>Lines</th><th>Route stops</th><th>Distance</th><th>Est. walk</th><th>Why this batch</th>
                </tr>
              </thead>
              <tbody>
                {state.batches.map((b) => (
                  <tr
                    key={b.batchId}
                    className="clickable"
                    onClick={() => setSelectedId(b.batchId)}
                    style={selected?.batchId === b.batchId ? { background: "var(--primary-soft)" } : undefined}
                  >
                    <td className="num" style={{ fontWeight: 600 }}>{b.batchId}</td>
                    <td><BandChip band={b.slaBand} /></td>
                    <td className="num">{b.taskIds.length}</td>
                    <td className="num" style={{ color: "var(--muted)" }}>{b.route.join(" → ")}</td>
                    <td className="num">{b.distance}u</td>
                    <td className="num">{b.estWalkTimeMin} min</td>
                    <td style={{ color: "var(--muted)", fontSize: 12.5, maxWidth: 340 }}>{b.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <RouteComparison state={state} />

      {selected && (
        <div className="grid-2">
          <div className="card">
            <div className="card-head">
              <h2>Route Preview — {selected.batchId}</h2>
              <span className="sub num" style={{ marginLeft: "auto" }}>
                {selected.distance}u · {selected.estWalkTimeMin} min
              </span>
            </div>
            <div className="card-body">
              <svg viewBox="0 0 640 360" style={{ width: "100%", height: "auto" }} role="img" aria-label="Warehouse route preview">
                {/* aisle guides */}
                {[12, 24, 40, 52, 84].map((x) => (
                  <line key={x} x1={px(x)} y1={py(4)} x2={px(x)} y2={py(96)} stroke="#f1f3f4" strokeWidth="14" strokeLinecap="round" />
                ))}
                {/* route path */}
                <polyline
                  points={routePoints.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="url(#routeGrad)"
                  strokeWidth="2.5"
                  strokeDasharray="6 5"
                  strokeLinecap="round"
                />
                <defs>
                  <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#1a73e8" />
                    <stop offset="100%" stopColor="#188038" />
                  </linearGradient>
                </defs>
                {/* all bins */}
                {state.bins.map((b) => {
                  const onRoute = selected.route.includes(b.binId);
                  return (
                    <g key={b.binId}>
                      <rect
                        x={px(b.x) - 9}
                        y={py(b.y) - 9}
                        width="18"
                        height="18"
                        rx="4"
                        fill={onRoute ? "#e8f0fe" : "#f8f9fa"}
                        stroke={onRoute ? "#1a73e8" : "#dadce0"}
                        strokeWidth="1.2"
                      />
                      <text x={px(b.x)} y={py(b.y) - 14} textAnchor="middle" fontSize="9.5" fill={onRoute ? "#1967d2" : "#80868b"} fontFamily="inherit">
                        {b.binId}
                      </text>
                    </g>
                  );
                })}
                {/* stop order markers */}
                {routeBins.map((b, i) => (
                  <g key={`stop-${b.binId}`}>
                    <circle cx={px(b.x)} cy={py(b.y)} r="8" fill="#1a73e8" />
                    <text x={px(b.x)} y={py(b.y) + 3.5} textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#fff">
                      {i + 1}
                    </text>
                  </g>
                ))}
                {/* dock */}
                <g>
                  <rect x={px(DOCK.x) - 12} y={py(DOCK.y) - 12} width="24" height="24" rx="6" fill="#e6f4ea" stroke="#188038" strokeWidth="1.4" />
                  <text x={px(DOCK.x)} y={py(DOCK.y) + 26} textAnchor="middle" fontSize="9.5" fill="#137333">DOCK</text>
                </g>
              </svg>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h2>Pick Sequence</h2>
            </div>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr><th>#</th><th>Task</th><th>Order</th><th>SKU</th><th>Bin</th><th>Qty</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {state.pickTasks
                    .filter((t) => t.batchId === selected.batchId)
                    .sort((a, b) => (a.sequence ?? 99) - (b.sequence ?? 99))
                    .map((t, i) => (
                      <tr key={t.pickTaskId}>
                        <td>
                          <span className="route-step"><span className="idx">{t.sequence ?? i + 1}</span></span>
                        </td>
                        <td className="num" style={{ color: "var(--faint)" }}>{t.pickTaskId}</td>
                        <td className="num">{t.orderId}</td>
                        <td className="num">{t.skuId}</td>
                        <td className="num">{t.binId}</td>
                        <td className="num">{t.qty}</td>
                        <td><StatusChip status={t.status} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
