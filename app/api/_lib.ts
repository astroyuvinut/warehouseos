import { NextResponse } from "next/server";
import { mutate, readState } from "@/lib/server/service";
import type { Action } from "@/lib/actions";

export const jsonError = (message: string, status: number) =>
  NextResponse.json({ ok: false, error: message }, { status });

/** Run one or more engine actions and return the new state — the shape every mutation route uses. */
export function runAction(...actions: Action[]) {
  try {
    const { state, version, engineMs } = mutate(...actions);
    return NextResponse.json({ ok: true, version, engineMs, state });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "engine failure", 500);
  }
}

export function getState() {
  try {
    const { state, version } = readState();
    return NextResponse.json({ ok: true, version, state });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "read failure", 500);
  }
}
