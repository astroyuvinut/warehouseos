import { NextResponse } from "next/server";
import { readState } from "@/lib/server/service";
import { computeReorder } from "@/lib/engines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const scarceOnly = searchParams.get("scarce") === "true";
  const { state, version } = readState();

  const rows = state.skus.map((sku) => {
    const bins = state.inventory.filter((r) => r.skuId === sku.skuId);
    const onHand = bins.reduce((s, r) => s + r.onHand, 0);
    const reserved = bins.reduce((s, r) => s + r.reserved, 0);
    const demand = state.lines
      .filter((l) => l.skuId === sku.skuId)
      .reduce((s, l) => s + l.qtyRequired, 0);
    return {
      ...sku,
      ...computeReorder(sku),
      onHand,
      reserved,
      available: onHand - reserved,
      demand,
      short: Math.max(0, demand - onHand),
      scarce: demand > onHand,
      belowReorderPoint: onHand <= computeReorder(sku).reorderPoint,
      bins,
    };
  });

  const filtered = scarceOnly ? rows.filter((r) => r.scarce) : rows;
  return NextResponse.json({ ok: true, version, count: filtered.length, inventory: filtered });
}
