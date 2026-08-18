import { NextResponse } from "next/server";
import { readState } from "@/lib/server/service";
import { naiveBaseline } from "@/lib/engines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What the batching engine actually bought, measured against a conventional WMS. */
export function GET() {
  const { state, version } = readState();
  if (!state.batches.length) {
    return NextResponse.json({ ok: true, version, available: false, reason: "no batches yet — run the picking engine" });
  }

  const baseline = naiveBaseline(state);
  const optimizedWalkMin = Math.round(state.batches.reduce((s, b) => s + b.estWalkTimeMin, 0) * 10) / 10;
  const optimizedDistance = state.batches.reduce((s, b) => s + b.distance, 0);
  const savedMin = Math.round((baseline.walkMin - optimizedWalkMin) * 10) / 10;

  return NextResponse.json({
    ok: true,
    version,
    available: true,
    baseline: {
      label: "One order per trip (FIFO, unoptimized)",
      walkMin: baseline.walkMin,
      distance: baseline.distance,
      trips: baseline.trips,
      perOrder: baseline.perOrder,
    },
    optimized: {
      label: "WarehouseOS batched + 2-opt",
      walkMin: optimizedWalkMin,
      distance: optimizedDistance,
      trips: state.batches.length,
    },
    savedMin,
    savedPct: baseline.walkMin > 0 ? Math.round((savedMin / baseline.walkMin) * 100) : 0,
  });
}
