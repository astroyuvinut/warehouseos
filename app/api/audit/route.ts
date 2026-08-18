import { NextResponse } from "next/server";
import { readState } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const engine = searchParams.get("engine");
  const entityId = searchParams.get("entityId");
  const limit = Number(searchParams.get("limit") ?? 0);
  const { state, version } = readState();

  let audit = [...state.audit].sort((a, b) => b.seq - a.seq);
  if (engine) audit = audit.filter((a) => a.engine === engine);
  if (entityId) audit = audit.filter((a) => a.entityId === entityId);
  if (limit > 0) audit = audit.slice(0, limit);

  return NextResponse.json({ ok: true, version, count: audit.length, audit });
}
