import { getState } from "../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return getState();
}
