import { jsonError, runAction } from "../_lib";
import { readState } from "@/lib/server/service";
import type { Action } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Runs the whole decision pipeline in one atomic step. Exists so a live demo
 * can never be derailed by a misclick or a half-run pipeline — and so the
 * engines can be timed end to end under load.
 *
 * POST {}              → run the engines over whatever is already seeded
 * POST { "scale": 200 } → seed a stress dataset first, then run them
 */
export async function POST(req: Request) {
  let scale: number | undefined;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { scale?: unknown };
      if (body.scale !== undefined) {
        if (typeof body.scale !== "number" || !Number.isFinite(body.scale) || body.scale < 1 || body.scale > 2000) {
          return jsonError("scale must be a number between 1 and 2000", 400);
        }
        scale = Math.floor(body.scale);
      }
    }
  } catch {
    return jsonError('body must be JSON, e.g. { "scale": 200 }', 400);
  }

  const { state } = readState();
  const needsSeed = scale !== undefined || !state.seeded;

  const steps: Action[] = [
    ...(needsSeed ? [{ type: "seed" as const, scale }] : []),
    { type: "recomputePriorities" },
    { type: "runAllocation" },
    { type: "runBatching" },
  ];

  return runAction(...steps);
}
