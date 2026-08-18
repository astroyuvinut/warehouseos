"use client";

import { useState } from "react";
import { naiveBaseline, TIER_WEIGHT } from "@/lib/engines";
import { DOCK } from "@/lib/seed";
import type { WarehouseState } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Shared chart chrome
 * ------------------------------------------------------------------ */

/** Hover tooltip. Values are always reachable without it (labels or table view). */
function useTip() {
  const [tip, setTip] = useState<{ x: number; y: number; title: string; body: string } | null>(null);
  const bind = (title: string, body: string) => ({
    onMouseEnter: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, title, body }),
    onMouseMove: (e: React.MouseEvent) => setTip({ x: e.clientX, y: e.clientY, title, body }),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent) => {
      const r = (e.target as HTMLElement).getBoundingClientRect();
      setTip({ x: r.left + r.width / 2, y: r.top, title, body });
    },
    onBlur: () => setTip(null),
    tabIndex: 0,
  });
  const node = tip ? (
    <div className="viz-tip" style={{ left: tip.x, top: tip.y }} role="status">
      <strong>{tip.title}</strong>
      <span>{tip.body}</span>
    </div>
  ) : null;
  return { bind, node };
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="viz-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className="viz-swatch" style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ *
 * 1 · Impact — what the batching engine actually bought
 * Form: the story is one number, so a hero figure carries it and two
 * emphasis bars (one hue, two shades) supply the comparison.
 * ------------------------------------------------------------------ */

export function ImpactComparison({ state }: { state: WarehouseState }) {
  const { bind, node } = useTip();
  if (!state.batches.length) return null;

  const base = naiveBaseline(state);
  const optWalk = Math.round(state.batches.reduce((s, b) => s + b.estWalkTimeMin, 0) * 10) / 10;
  const optDist = state.batches.reduce((s, b) => s + b.distance, 0);
  if (base.walkMin <= 0) return null;

  const savedMin = Math.round((base.walkMin - optWalk) * 10) / 10;
  const savedPct = Math.round((savedMin / base.walkMin) * 100);
  const rows = [
    {
      key: "baseline",
      label: "One order per trip",
      sub: `${base.trips} trips · FIFO, unoptimized`,
      value: base.walkMin,
      color: "var(--viz-deemphasis)",
    },
    {
      key: "optimized",
      label: "WarehouseOS batching",
      sub: `${state.batches.length} batches · zone-clustered, 2-opt`,
      value: optWalk,
      color: "var(--series-1)",
    },
  ];

  return (
    <div className="card">
      <div className="card-head">
        <h2>Engine Impact</h2>
        <span className="sub">Same picks, same warehouse — measured against a conventional WMS</span>
      </div>
      <div className="card-body viz-impact">
        <div className="viz-hero">
          <span className="viz-hero-value">{savedPct}%</span>
          <span className="viz-hero-label">less walking</span>
          <span className="viz-hero-sub">
            {savedMin} minutes saved per pick wave · {base.distance - optDist} fewer distance units
          </span>
        </div>

        <div className="viz-bars">
          {rows.map((r) => (
            <div key={r.key} className="viz-row">
              <div className="viz-row-head">
                <span className="viz-row-label">{r.label}</span>
                <span className="viz-row-sub">{r.sub}</span>
              </div>
              <div className="viz-track">
                <div
                  className="viz-bar"
                  style={{ width: `${(r.value / base.walkMin) * 100}%`, background: r.color }}
                  {...bind(r.label, `${r.value} min of walking · ${r.sub}`)}
                />
                <span className="viz-bar-value num">{r.value} min</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 2 · Priority score composition
 * Form: part-to-whole across many long-named items → horizontal stacked
 * bars. Five nominal factors → categorical slots 1–5, fixed order.
 * Three of those slots sit under 3:1 on white, so the table view below
 * is the required relief channel, not an optional extra.
 * ------------------------------------------------------------------ */

const FACTORS = [
  { key: "slaUrgency", label: "SLA urgency", weight: 0.35, color: "var(--series-1)" },
  { key: "tier", label: "Customer tier", weight: 0.2, color: "var(--series-2)" },
  { key: "value", label: "Order value", weight: 0.2, color: "var(--series-3)" },
  { key: "stockoutRisk", label: "Stockout risk", weight: 0.15, color: "var(--series-4)" },
  { key: "age", label: "Age in queue", weight: 0.1, color: "var(--series-5)" },
] as const;

export function PriorityComposition({ state }: { state: WarehouseState }) {
  const { bind, node } = useTip();
  const [showTable, setShowTable] = useState(false);

  const scored = state.orders
    .filter((o) => o.scoreBreakdown !== null && o.priorityScore !== null)
    .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  if (!scored.length) return null;

  const max = Math.max(...scored.map((o) => o.priorityScore ?? 0));

  return (
    <div className="card">
      <div className="card-head">
        <h2>What Drives Each Score</h2>
        <span className="sub">Weighted contribution of every factor — the ranking, decomposed</span>
        <button
          className="btn btn-ghost"
          style={{ marginLeft: "auto", fontSize: 12 }}
          onClick={() => setShowTable((v) => !v)}
        >
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      <div className="card-body">
        <Legend items={FACTORS.map((f) => ({ label: `${f.label} · ${f.weight}`, color: f.color }))} />

        {showTable ? (
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Order</th>
                  {FACTORS.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
                {scored.map((o) => (
                  <tr key={o.orderId}>
                    <td className="num" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{o.orderId}</td>
                    {FACTORS.map((f) => (
                      <td key={f.key} className="num">
                        {((o.scoreBreakdown![f.key] as number) * f.weight).toFixed(3)}
                      </td>
                    ))}
                    <td className="num" style={{ fontWeight: 600 }}>{(o.priorityScore ?? 0).toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="viz-stack-list">
            {scored.map((o) => {
              const b = o.scoreBreakdown!;
              return (
                <div key={o.orderId} className="viz-row">
                  <div className="viz-row-head">
                    <span className="viz-row-label num">{o.orderId}</span>
                    <span className="viz-row-sub">{o.customer}</span>
                  </div>
                  <div className="viz-track">
                    <div className="viz-stack" style={{ width: `${((o.priorityScore ?? 0) / max) * 100}%` }}>
                      {FACTORS.map((f) => {
                        const contribution = (b[f.key] as number) * f.weight;
                        const share = ((o.priorityScore ?? 0) > 0 ? contribution / (o.priorityScore ?? 1) : 0) * 100;
                        if (share <= 0) return null;
                        return (
                          <div
                            key={f.key}
                            className="viz-seg"
                            style={{ width: `${share}%`, background: f.color }}
                            {...bind(
                              `${o.orderId} · ${f.label}`,
                              `contributes ${contribution.toFixed(3)} of ${(o.priorityScore ?? 0).toFixed(3)} — raw ${(b[f.key] as number).toFixed(2)} × weight ${f.weight}`
                            )}
                          />
                        );
                      })}
                    </div>
                    <span className="viz-bar-value num">{(o.priorityScore ?? 0).toFixed(3)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 3 · Scarcity allocation flow (Sankey)
 * Scarce units leaving one SKU and splitting across competing orders.
 * Ribbon color is a *state* (allocated / partial / reclaimed / short),
 * so it wears status tokens and every ribbon carries a text label.
 * ------------------------------------------------------------------ */

const ACTION_STYLE: Record<string, { color: string; label: string }> = {
  allocate: { color: "var(--success)", label: "allocated" },
  partial: { color: "var(--warning)", label: "partial ship" },
  steal: { color: "var(--primary)", label: "reclaimed" },
  hold: { color: "var(--danger)", label: "held" },
  "cross-dock": { color: "var(--danger)", label: "cross-dock" },
};

export function AllocationFlow({ state }: { state: WarehouseState }) {
  const { bind, node } = useTip();

  // The story lives on contested SKUs: demand exceeding what is on the shelf.
  const contested = state.skus
    .map((sku) => {
      const onHand = state.inventory.filter((r) => r.skuId === sku.skuId).reduce((s, r) => s + r.onHand, 0);
      const demand = state.lines.filter((l) => l.skuId === sku.skuId).reduce((s, l) => s + l.qtyRequired, 0);
      return { sku, onHand, demand };
    })
    .filter((x) => x.demand > x.onHand)
    .sort((a, b) => b.demand - b.onHand - (a.demand - a.onHand));

  if (!contested.length || !state.allocations.length) return null;
  const target = contested[0];

  const flows = state.allocations
    .filter((a) => a.skuId === target.sku.skuId && a.qty > 0)
    .map((a) => ({
      orderId: a.orderId,
      qty: a.qty,
      action: a.action,
      band: state.orders.find((o) => o.orderId === a.orderId)?.priorityBand ?? "P3",
      reason: a.reason,
    }))
    .sort((a, b) => b.qty - a.qty);

  const allocated = flows.reduce((s, f) => s + f.qty, 0);
  const shortfall = Math.max(0, target.demand - allocated);
  const shortOrders = state.exceptions
    .filter((e) => e.skuId === target.sku.skuId)
    .map((e) => e.orderId);

  const all = [
    ...flows.map((f) => ({ ...f, kind: "flow" as const })),
    ...(shortfall > 0
      ? [
          {
            orderId: shortOrders[0] ?? "unfilled demand",
            qty: shortfall,
            action: "hold",
            band: "—",
            reason: `No stock remains — held with a cross-dock suggestion on the next inbound`,
            kind: "short" as const,
          },
        ]
      : []),
  ];

  // Geometry: one source column, one target column, ribbons between. The left
  // gutter is wide enough for a full SKU name so the label is never clipped.
  const H = Math.max(150, all.length * 46 + 24);
  const W = 980;
  const srcX = 200;
  const dstX = 620;
  const total = target.demand;
  const scale = (H - 24) / total;

  let srcCursor = 12;
  let dstCursor = 12;
  const ribbons = all.map((f) => {
    const h = Math.max(3, f.qty * scale);
    const sy = srcCursor;
    const dy = dstCursor;
    srcCursor += h + 2;
    dstCursor += h + 2;
    const style = ACTION_STYLE[f.action] ?? ACTION_STYLE.allocate;
    const mid = (srcX + dstX) / 2;
    const d = `M ${srcX} ${sy} C ${mid} ${sy}, ${mid} ${dy}, ${dstX} ${dy} L ${dstX} ${dy + h} C ${mid} ${dy + h}, ${mid} ${sy + h}, ${srcX} ${sy + h} Z`;
    return { ...f, h, sy, dy, d, style };
  });

  return (
    <div className="card">
      <div className="card-head">
        <h2>Where the Scarce Units Went</h2>
        <span className="sub">
          {target.sku.skuId} · {target.onHand} on hand against {target.demand} demanded
        </span>
      </div>
      <div className="card-body">
        <div className="viz-scroll">
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Allocation of ${target.sku.skuId}`}>
            {/* source column */}
            <rect x={srcX - 14} y={12} width={12} height={H - 24} rx={4} fill="var(--viz-deemphasis)" />
            <text x={0} y={20} className="viz-svg-label">
              {target.sku.name}
            </text>
            <text x={0} y={36} className="viz-svg-muted">
              {target.demand} demanded · {target.onHand} on hand
            </text>

            {ribbons.map((r) => (
              <g key={`${r.orderId}-${r.action}-${r.sy}`}>
                <path
                  d={r.d}
                  fill={r.style.color}
                  opacity={r.kind === "short" ? 0.28 : 0.42}
                  {...bind(
                    `${r.orderId} · ${r.style.label}`,
                    `${r.qty} units — ${r.reason}`
                  )}
                />
                <rect x={dstX} y={r.dy} width={12} height={r.h} rx={4} fill={r.style.color} />
                {r.h >= 26 ? (
                  <>
                    <text x={dstX + 20} y={r.dy + r.h / 2 - 1} className="viz-svg-label">
                      {r.orderId}
                    </text>
                    <text x={dstX + 20} y={r.dy + r.h / 2 + 13} className="viz-svg-muted">
                      {r.qty} units · {r.style.label}
                      {r.band !== "—" ? ` · ${r.band}` : ""}
                    </text>
                  </>
                ) : (
                  /* Too thin for two stacked lines — one line, rest in the tooltip. */
                  <text x={dstX + 20} y={r.dy + r.h / 2 + 4} className="viz-svg-label">
                    {r.orderId}
                    <tspan className="viz-svg-muted"> · {r.qty} units · {r.style.label}</tspan>
                  </text>
                )}
              </g>
            ))}
          </svg>
        </div>
      </div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 3b · Route comparison — the same picks, walked two ways
 * Both maps share one viewBox and one projection, so the only thing
 * that differs between them is the path. One hue per side (before /
 * after), because the subject is total path shape, not which trip is
 * which — colouring eight trips separately would bury the comparison.
 * ------------------------------------------------------------------ */

const MAP_W = 620;
const MAP_H = 350;
const mapX = (x: number) => 36 + (x / 100) * 548;
const mapY = (y: number) => 22 + (y / 100) * 306;

function RouteMap({
  title,
  meta,
  routes,
  bins,
  stroke,
  opacity,
}: {
  title: string;
  meta: string;
  routes: string[][];
  bins: WarehouseState["bins"];
  stroke: string;
  opacity: number;
}) {
  const binById = Object.fromEntries(bins.map((b) => [b.binId, b]));
  const dock = { x: mapX(DOCK.x), y: mapY(DOCK.y) };
  const visited = new Set(routes.flat());

  return (
    <figure className="viz-map">
      <figcaption>
        <span className="viz-map-title">{title}</span>
        <span className="viz-map-meta num">{meta}</span>
      </figcaption>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} role="img" aria-label={`${title} — ${meta}`}>
        {[12, 24, 40, 52, 84].map((x) => (
          <line key={x} x1={mapX(x)} y1={mapY(4)} x2={mapX(x)} y2={mapY(96)} stroke="#f1f3f4" strokeWidth="13" strokeLinecap="round" />
        ))}

        {routes.map((route, i) => {
          const pts = [dock, ...route.map((id) => binById[id]).filter(Boolean).map((b) => ({ x: mapX(b.x), y: mapY(b.y) })), dock];
          return (
            <polyline
              key={i}
              points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={opacity}
            />
          );
        })}

        {bins.map((b) => (
          <rect
            key={b.binId}
            x={mapX(b.x) - 7}
            y={mapY(b.y) - 7}
            width="14"
            height="14"
            rx="3.5"
            fill={visited.has(b.binId) ? "#fff" : "#f8f9fa"}
            stroke={visited.has(b.binId) ? stroke : "#dadce0"}
            strokeWidth="1.2"
          />
        ))}

        <rect x={dock.x - 11} y={dock.y - 11} width="22" height="22" rx="6" fill="#e6f4ea" stroke="#188038" strokeWidth="1.4" />
        <text x={dock.x} y={dock.y + 24} textAnchor="middle" fontSize="9.5" fill="#137333">
          DOCK
        </text>
      </svg>
    </figure>
  );
}

export function RouteComparison({ state }: { state: WarehouseState }) {
  if (!state.batches.length) return null;
  const base = naiveBaseline(state);
  if (!base.perOrder.length) return null;

  const optWalk = Math.round(state.batches.reduce((s, b) => s + b.estWalkTimeMin, 0) * 10) / 10;
  const optDist = state.batches.reduce((s, b) => s + b.distance, 0);

  return (
    <div className="card">
      <div className="card-head">
        <h2>The Same Picks, Walked Two Ways</h2>
        <span className="sub">Identical work and identical warehouse — only the routing differs</span>
      </div>
      <div className="card-body">
        <div className="viz-map-pair">
          <RouteMap
            title="One order per trip"
            meta={`${base.trips} trips · ${base.distance.toLocaleString()}u · ${base.walkMin} min`}
            routes={base.perOrder.map((o) => o.route)}
            bins={state.bins}
            stroke="#9aa0a6"
            opacity={0.75}
          />
          <RouteMap
            title="WarehouseOS batching"
            meta={`${state.batches.length} batches · ${optDist.toLocaleString()}u · ${optWalk} min`}
            routes={state.batches.map((b) => b.route)}
            bins={state.bins}
            stroke="var(--series-1)"
            opacity={0.9}
          />
        </div>
        <p className="viz-foot">
          Left: every order released on its own, so the picker returns to the dock between orders and crosses the
          same aisles repeatedly. Right: the same lines grouped into urgency-pure, zone-clustered batches and
          sequenced with nearest-neighbour + 2-opt.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 4 · SLA countdown
 * Time remaining per order against the deadline, ordered by urgency.
 * Band colour is the app's existing severity language and every row
 * carries its band as text, so nothing depends on hue alone.
 * ------------------------------------------------------------------ */

const BAND_COLOR: Record<string, string> = {
  P0: "var(--danger)",
  P1: "var(--warning)",
  P2: "var(--primary)",
  P3: "var(--faint)",
};

export function SlaTimeline({ state }: { state: WarehouseState }) {
  const { bind, node } = useTip();
  const scored = state.orders
    .filter((o) => o.priorityBand !== null)
    .map((o) => ({ ...o, remaining: o.slaDueOffsetMin - state.simMinute }))
    .sort((a, b) => a.remaining - b.remaining);
  if (!scored.length) return null;

  const horizon = Math.max(...scored.map((o) => o.remaining), 60);

  return (
    <div className="card">
      <div className="card-head">
        <h2>SLA Countdown</h2>
        <span className="sub">Time left before each order breaches — shortest first</span>
      </div>
      <div className="card-body">
        <div className="viz-stack-list">
          {scored.map((o) => (
            <div key={o.orderId} className="viz-row">
              <div className="viz-row-head">
                <span className="viz-row-label num">{o.orderId}</span>
                <span className="viz-row-sub">
                  {o.priorityBand} · {o.customer}
                </span>
              </div>
              <div className="viz-track">
                <div
                  className="viz-bar"
                  style={{
                    width: `${Math.max(2, (o.remaining / horizon) * 100)}%`,
                    background: BAND_COLOR[o.priorityBand ?? "P3"],
                  }}
                  {...bind(
                    `${o.orderId} · ${o.priorityBand}`,
                    `${o.remaining} minutes to SLA · ${o.customerTier} tier (weight ${TIER_WEIGHT[o.customerTier].toFixed(2)}) · $${o.orderValue.toLocaleString()}`
                  )}
                />
                <span className="viz-bar-value num">{o.remaining} min</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 5 · Inventory coverage
 * A ratio against a limit per SKU → meter, with the reorder point
 * marked on the same track.
 * ------------------------------------------------------------------ */

export function CoverageChart({ state }: { state: WarehouseState }) {
  const { bind, node } = useTip();
  if (!state.skus.length) return null;

  // One measure only: committed demand, split into what stock can cover and what
  // it can't. The reorder point is a lead-time threshold on a different scale —
  // it lives in the table above rather than distorting this axis.
  const rows = state.skus
    .map((sku) => {
      const onHand = state.inventory.filter((r) => r.skuId === sku.skuId).reduce((s, r) => s + r.onHand, 0);
      const demand = state.lines.filter((l) => l.skuId === sku.skuId).reduce((s, l) => s + l.qtyRequired, 0);
      return { sku, onHand, demand, covered: Math.min(onHand, demand), short: Math.max(0, demand - onHand) };
    })
    .filter((r) => r.demand > 0)
    .sort((a, b) => b.short - a.short || b.demand - a.demand);
  if (!rows.length) return null;

  const maxDemand = Math.max(...rows.map((r) => r.demand));

  return (
    <div className="card">
      <div className="card-head">
        <h2>Demand Coverage</h2>
        <span className="sub">Committed demand per SKU, split into what stock can cover and what it cannot</span>
      </div>
      <div className="card-body">
        <Legend
          items={[
            { label: "On hand", color: "var(--series-1)" },
            { label: "Uncovered demand", color: "var(--danger)" },
          ]}
        />
        <div className="viz-stack-list" style={{ marginTop: 14 }}>
          {rows.map((r) => (
            <div key={r.sku.skuId} className="viz-row">
              <div className="viz-row-head">
                <span className="viz-row-label num">{r.sku.skuId}</span>
                <span className="viz-row-sub">{r.sku.name}</span>
              </div>
              <div className="viz-track">
                <div className="viz-stack" style={{ width: `${(r.demand / maxDemand) * 100}%` }}>
                  <div
                    className="viz-seg"
                    style={{ width: `${(r.covered / r.demand) * 100}%`, background: "var(--series-1)" }}
                    {...bind(
                      `${r.sku.skuId} · covered`,
                      `${r.covered} of ${r.demand} demanded units are on the shelf (${r.onHand} on hand)`
                    )}
                  />
                  {r.short > 0 && (
                    <div
                      className="viz-seg"
                      style={{ width: `${(r.short / r.demand) * 100}%`, background: "var(--danger)" }}
                      {...bind(`${r.sku.skuId} · short`, `${r.short} units of committed demand cannot be filled from stock`)}
                    />
                  )}
                </div>
                <span className="viz-bar-value num">
                  {r.covered}/{r.demand}
                  {r.short > 0 ? ` · short ${r.short}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
        <p className="viz-foot">
          Bar length is committed demand; the split is what stock can cover. Replenishment thresholds
          (<span className="mono">ROP = demand × lead time + 1.65·σ·√LT</span>) sit on a different time scale and are in the
          table above rather than on this axis.
        </p>
      </div>
      {node}
    </div>
  );
}
