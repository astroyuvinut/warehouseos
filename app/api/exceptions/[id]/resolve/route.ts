import { jsonError, runAction } from "../../../_lib";
import { readState } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { state } = readState();
  const exc = state.exceptions.find((e) => e.exceptionId === id);
  if (!exc) return jsonError(`exception ${id} not found`, 404);
  if (exc.state === "Resolved" || exc.state === "Closed") {
    return jsonError(`exception ${id} is already ${exc.state.toLowerCase()}`, 409);
  }
  return runAction({ type: "resolveException", id });
}
