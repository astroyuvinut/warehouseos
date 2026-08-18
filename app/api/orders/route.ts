import { NextResponse } from "next/server";
import { readState } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const band = searchParams.get("band");
  const status = searchParams.get("status");
  const { state, version } = readState();

  let orders = [...state.orders].sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0));
  if (band) orders = orders.filter((o) => o.priorityBand === band);
  if (status) orders = orders.filter((o) => o.status === status);

  // Each order carries its lines so a single call is enough to render a queue.
  const withLines = orders.map((o) => ({
    ...o,
    lines: state.lines.filter((l) => l.orderId === o.orderId),
  }));

  return NextResponse.json({ ok: true, version, count: withLines.length, orders: withLines });
}
