import { runAction } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST() {
  return runAction({ type: "reset" });
}
