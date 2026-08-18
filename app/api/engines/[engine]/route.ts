import { jsonError, runAction } from "../../_lib";
import type { Action } from "@/lib/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINES: Record<string, Action> = {
  priority: { type: "recomputePriorities" },
  allocation: { type: "runAllocation" },
  batching: { type: "runBatching" },
};

export async function POST(_req: Request, ctx: { params: Promise<{ engine: string }> }) {
  const { engine } = await ctx.params;
  const action = ENGINES[engine];
  if (!action) {
    return jsonError(`unknown engine "${engine}" — expected one of ${Object.keys(ENGINES).join(", ")}`, 404);
  }
  return runAction(action);
}
