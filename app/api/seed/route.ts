import { jsonError, runAction } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SCALE = 2000;

/** POST {} seeds the demo dataset; POST { "scale": 200 } seeds a stress dataset. */
export async function POST(req: Request) {
  let scale: number | undefined;
  try {
    const text = await req.text();
    if (text.trim()) {
      const body = JSON.parse(text) as { scale?: unknown };
      if (body.scale !== undefined) {
        if (typeof body.scale !== "number" || !Number.isFinite(body.scale) || body.scale < 1) {
          return jsonError("scale must be a positive number", 400);
        }
        if (body.scale > MAX_SCALE) {
          return jsonError(`scale is capped at ${MAX_SCALE} orders`, 400);
        }
        scale = Math.floor(body.scale);
      }
    }
  } catch {
    return jsonError('body must be JSON, e.g. { "scale": 200 }', 400);
  }

  return runAction({ type: "seed", scale });
}
