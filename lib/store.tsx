"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ExceptionType, WarehouseState } from "./types";

// Declared here rather than imported from lib/actions so the seed dataset and
// engine code stay out of the client bundle.
const emptyState: WarehouseState = {
  seeded: false,
  simMinute: 0,
  skus: [],
  bins: [],
  inventory: [],
  orders: [],
  lines: [],
  allocations: [],
  pickTasks: [],
  batches: [],
  exceptions: [],
  audit: [],
  lastRun: {},
};

export type Action =
  | { type: "seed"; scale?: number }
  | { type: "reset" }
  | { type: "recomputePriorities" }
  | { type: "runAllocation" }
  | { type: "runBatching" }
  | { type: "runPipeline"; scale?: number }
  | { type: "injectException"; exceptionType: ExceptionType }
  | { type: "resolveException"; id: string };

/** Every client action maps to one backend endpoint. */
function endpointFor(action: Action): { url: string; body?: unknown } {
  switch (action.type) {
    case "seed":
      return { url: "/api/seed", body: action.scale ? { scale: action.scale } : undefined };
    case "runPipeline":
      return { url: "/api/pipeline", body: action.scale ? { scale: action.scale } : undefined };
    case "reset":
      return { url: "/api/reset" };
    case "recomputePriorities":
      return { url: "/api/engines/priority" };
    case "runAllocation":
      return { url: "/api/engines/allocation" };
    case "runBatching":
      return { url: "/api/engines/batching" };
    case "injectException":
      return { url: "/api/exceptions", body: { type: action.exceptionType } };
    case "resolveException":
      return { url: `/api/exceptions/${action.id}/resolve` };
  }
}

interface StoreValue {
  state: WarehouseState;
  dispatch: (action: Action) => void;
  /** True while a mutation is in flight — buttons disable themselves. */
  pending: boolean;
  /** True once the server state has loaded, so pages can avoid a false "empty" flash. */
  ready: boolean;
  /** Live-sync stream health, surfaced in the sidebar. */
  connected: boolean;
  /** Engine time for the most recent run, in ms — the answer to "does it scale?". */
  engineMs: number | null;
  error: string | null;
  dismissError: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WarehouseState>(emptyState);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [engineMs, setEngineMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Version of the state we currently hold, so SSE bumps we caused ourselves
  // don't trigger a redundant refetch.
  const versionRef = useRef(-1);
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error ?? "failed to load state");
      versionRef.current = data.version;
      setState(data.state);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "cannot reach the server");
    } finally {
      setReady(true);
    }
  }, []);

  // Live sync. The server sends a `sync` frame immediately on connect, and our
  // version starts at -1, so this same subscription performs the initial load —
  // no separate fetch-on-mount effect needed.
  useEffect(() => {
    const es = new EventSource("/api/events");

    es.onopen = () => setConnected(true);

    es.addEventListener("sync", (ev) => {
      setConnected(true);
      try {
        const { version } = JSON.parse((ev as MessageEvent).data) as { version: number };
        if (version !== versionRef.current) void refresh();
      } catch {
        void refresh();
      }
    });

    // If the stream never establishes (blocked by a proxy), fall back to a plain
    // fetch so the app still works, just without live updates.
    es.onerror = () => {
      setConnected(false);
      if (versionRef.current === -1) void refresh();
    };

    return () => es.close();
  }, [refresh]);

  const dispatch = useCallback((action: Action) => {
    if (inFlight.current) return; // ignore double-clicks; the engine is authoritative
    inFlight.current = true;
    setPending(true);
    const { url, body } = endpointFor(action);

    void (async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? `request failed (${res.status})`);
        versionRef.current = data.version;
        setState(data.state);
        setEngineMs(typeof data.engineMs === "number" ? data.engineMs : null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "the engine could not complete that action");
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    })();
  }, []);

  const value = useMemo(
    () => ({ state, dispatch, pending, ready, connected, engineMs, error, dismissError: () => setError(null) }),
    [state, dispatch, pending, ready, connected, engineMs, error]
  );
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
