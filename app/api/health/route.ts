import { NextResponse } from "next/server";
import { readState } from "@/lib/server/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  try {
    const { state, version } = readState();
    return NextResponse.json({
      ok: true,
      status: "healthy",
      db: "sqlite",
      version,
      seeded: state.seeded,
      counts: {
        skus: state.skus.length,
        orders: state.orders.length,
        allocations: state.allocations.length,
        batches: state.batches.length,
        exceptions: state.exceptions.length,
        audit: state.audit.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, status: "unhealthy", error: err instanceof Error ? err.message : "unknown" },
      { status: 503 }
    );
  }
}
