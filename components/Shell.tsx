"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";

const Icon = {
  console: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>
  ),
  orders: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/></svg>
  ),
  inventory: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>
  ),
  picks: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M6 17V9a2 2 0 0 1 2-2h8"/></svg>
  ),
  exceptions: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>
  ),
  audit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="9"/></svg>
  ),
};

const NAV = [
  { href: "/", label: "Ops Console", icon: Icon.console, title: "Ops Console", sub: "Run engines · live state" },
  { href: "/orders", label: "Orders", icon: Icon.orders, title: "Orders", sub: "Priority-ranked queue with rationale" },
  { href: "/inventory", label: "Inventory & Scarcity", icon: Icon.inventory, title: "Inventory & Scarcity", sub: "Availability, allocation & conflicts" },
  { href: "/picks", label: "Pick Batches & Route", icon: Icon.picks, title: "Pick Batches & Route", sub: "Batched by urgency, optimized routes" },
  { href: "/exceptions", label: "Exceptions", icon: Icon.exceptions, title: "Exceptions", sub: "Inject, auto-resolve, escalate" },
  { href: "/audit", label: "Audit", icon: Icon.audit, title: "Audit Trail", sub: "Every decision, explained" },
];

const DRAWER_BREAKPOINT = 1360;

const NARROW_QUERY = `(max-width: ${DRAWER_BREAKPOINT}px)`;

/**
 * Subscribes to the viewport width as an external store. On narrow screens the
 * sidebar defaults to a closed drawer; on wide screens it stays pinned open.
 * Server rendering assumes wide, matching the desktop-first CSS.
 */
function useIsNarrow(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(NARROW_QUERY);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  );
}

/** Shown until the first /api/state response lands, so pages never flash "no data". */
function LoadingState() {
  return (
    <div className="card">
      <div className="empty">
        <div className="icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="spin"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
        </div>
        <h3>Loading warehouse state</h3>
        <p>Reading current orders, inventory and decisions from the database.</p>
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { state, dispatch, pending, ready, connected, error, dismissError } = useStore();
  const isNarrow = useIsNarrow();
  // null means "follow the viewport default"; a boolean is an explicit user choice.
  const [navChoice, setNavChoice] = useState<boolean | null>(null);
  const navOpen = navChoice ?? !isNarrow;

  const current = NAV.find((n) => n.href === pathname) ?? NAV[0];
  const openExceptions = state.exceptions.filter(
    (e) => e.state !== "Resolved" && e.state !== "Closed"
  ).length;

  const closeOnMobile = useCallback(() => {
    if (isNarrow) setNavChoice(false);
  }, [isNarrow]);

  return (
    <div className="shell">
      <aside className={`sidebar${navOpen ? " open" : " closed"}`}>
        <div className="brand">
          <div className="brand-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/></svg>
          </div>
          <div>
            <div className="brand-name">WarehouseOS</div>
            <div className="brand-tag">Decision Engine</div>
          </div>
        </div>

        <div className="nav-section">Operations</div>
        <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={`nav-item${pathname === n.href ? " active" : ""}`}
              onClick={closeOnMobile}
            >
              {n.icon}
              <span>{n.label}</span>
              {n.href === "/exceptions" && openExceptions > 0 && (
                <span className="nav-badge num">{openExceptions}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className={`pulse-dot${connected ? " live" : " offline"}`} />
            <span>
              {connected
                ? state.seeded
                  ? "Live · SQLite · synced"
                  : "Live · awaiting seed data"
                : "Reconnecting to server…"}
            </span>
          </div>
        </div>
      </aside>

      {navOpen && <div className="nav-overlay" onClick={() => setNavChoice(false)} />}

      <div className="main">
        <header className="topbar">
          <button
            className="icon-btn"
            aria-label={navOpen ? "Hide navigation" : "Show navigation"}
            onClick={() => setNavChoice(!navOpen)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
          </button>
          <div>
            <h1>{current.title}</h1>
            <div className="sub">{current.sub}</div>
          </div>
          <div className="topbar-right">
            {pending && <span className="chip chip-p2">engine running…</span>}
            {state.lastRun.priority && (
              <span className="chip chip-neutral num">priority run {state.lastRun.priority}</span>
            )}
            {state.lastRun.allocation && (
              <span className="chip chip-neutral num">allocation {state.lastRun.allocation}</span>
            )}
            {state.seeded && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: 12 }}
                disabled={pending}
                onClick={() => dispatch({ type: "reset" })}
              >
                Reset demo
              </button>
            )}
          </div>
        </header>
        <div className="content">
          {error && (
            <div className="banner banner-error" role="alert">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>
              <span>{error}</span>
              <button className="btn btn-ghost" style={{ marginLeft: "auto", fontSize: 12 }} onClick={dismissError}>
                Dismiss
              </button>
            </div>
          )}
          {ready ? children : <LoadingState />}
        </div>
      </div>
    </div>
  );
}
