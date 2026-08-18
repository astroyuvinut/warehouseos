// The one place where a decision actually happens: load current state from
// SQLite, run the engine, persist the result, tell every connected client.
// node:sqlite is synchronous and Node is single-threaded, so a request's
// read-modify-write cycle is atomic with respect to other requests.
import { applyAction, type Action } from "../actions";
import type { WarehouseState } from "../types";
import { loadState, saveState } from "./db";
import { broadcast, currentVersion } from "./bus";

export interface MutationResult {
  state: WarehouseState;
  version: number;
  /** Wall-clock time inside the engines, so the UI can show it under load. */
  engineMs: number;
}

export function readState(): { state: WarehouseState; version: number } {
  return { state: loadState(), version: currentVersion() };
}

/** Run one or more actions as a single atomic step — one write, one broadcast. */
export function mutate(...actions: Action[]): MutationResult {
  const before = loadState();

  const started = performance.now();
  let after = before;
  for (const action of actions) after = applyAction(after, action);
  const engineMs = Math.round((performance.now() - started) * 100) / 100;

  if (after === before) {
    // Engine declined the action (unmet precondition) — no write, no broadcast.
    return { state: before, version: currentVersion(), engineMs };
  }
  saveState(after);
  return { state: after, version: broadcast(), engineMs };
}
