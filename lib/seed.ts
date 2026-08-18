import type { Bin, InventoryRow, Order, OrderLine, SKU, WarehouseState } from "./types";

// Deterministic demo dataset. Every value is hand-placed so the demo
// tells the same story on every run: SKU-1004 is scarce and contested,
// ORD-1001 is the P0 hero order, and aisles 1/2/7 shape the pick routes.

const skus: SKU[] = [
  { skuId: "SKU-1001", name: "Ceramic Brake Pad Set", unit: "set", avgDailyDemand: 24, leadTimeDays: 3, demandStdDev: 7, reorderPoint: 0, safetyStock: 0 },
  { skuId: "SKU-1002", name: "Hydraulic Seal Kit", unit: "kit", avgDailyDemand: 18, leadTimeDays: 4, demandStdDev: 6, reorderPoint: 0, safetyStock: 0 },
  { skuId: "SKU-1003", name: "Lithium Cell 21700", unit: "pc", avgDailyDemand: 60, leadTimeDays: 5, demandStdDev: 15, reorderPoint: 0, safetyStock: 0 },
  { skuId: "SKU-1004", name: "Precision Steel Bracket", unit: "pc", avgDailyDemand: 20, leadTimeDays: 3, demandStdDev: 8, reorderPoint: 0, safetyStock: 0 },
  { skuId: "SKU-1005", name: "Thermal Interface Pad", unit: "pc", avgDailyDemand: 35, leadTimeDays: 2, demandStdDev: 9, reorderPoint: 0, safetyStock: 0 },
  { skuId: "SKU-1006", name: "M8 Titanium Bolt Pack", unit: "pack", avgDailyDemand: 40, leadTimeDays: 2, demandStdDev: 10, reorderPoint: 0, safetyStock: 0 },
  { skuId: "SKU-1007", name: "Servo Motor NEMA-17", unit: "pc", avgDailyDemand: 12, leadTimeDays: 6, demandStdDev: 4, reorderPoint: 0, safetyStock: 0 },
  { skuId: "SKU-1008", name: "Polycarbonate Lens 52mm", unit: "pc", avgDailyDemand: 28, leadTimeDays: 3, demandStdDev: 8, reorderPoint: 0, safetyStock: 0 },
];

// Warehouse grid: x = aisle position (0-100), y = depth (0-100). Dock at (0, 50).
const bins: Bin[] = [
  { binId: "A1-01", zone: "A", aisle: 1, x: 12, y: 18 },
  { binId: "A1-03", zone: "A", aisle: 1, x: 12, y: 42 },
  { binId: "A1-07", zone: "A", aisle: 1, x: 12, y: 78 },
  { binId: "A2-02", zone: "A", aisle: 2, x: 24, y: 30 },
  { binId: "A2-04", zone: "A", aisle: 2, x: 24, y: 58 },
  { binId: "B3-01", zone: "B", aisle: 3, x: 40, y: 20 },
  { binId: "B3-05", zone: "B", aisle: 3, x: 40, y: 66 },
  { binId: "B4-02", zone: "B", aisle: 4, x: 52, y: 34 },
  { binId: "B4-06", zone: "B", aisle: 4, x: 52, y: 74 },
  { binId: "C7-01", zone: "C", aisle: 7, x: 84, y: 16 },
  { binId: "C7-04", zone: "C", aisle: 7, x: 84, y: 52 },
  { binId: "C7-08", zone: "C", aisle: 7, x: 84, y: 88 },
];

const inventory: InventoryRow[] = [
  { skuId: "SKU-1001", binId: "A1-01", onHand: 46, reserved: 0 },
  { skuId: "SKU-1002", binId: "A1-03", onHand: 32, reserved: 0 },
  { skuId: "SKU-1003", binId: "A2-02", onHand: 120, reserved: 0 },
  { skuId: "SKU-1003", binId: "C7-01", onHand: 40, reserved: 0 },
  { skuId: "SKU-1004", binId: "A2-04", onHand: 10, reserved: 0 }, // scarce, contested
  { skuId: "SKU-1005", binId: "B3-01", onHand: 64, reserved: 0 },
  { skuId: "SKU-1005", binId: "B3-05", onHand: 22, reserved: 0 },
  { skuId: "SKU-1006", binId: "B4-02", onHand: 90, reserved: 0 },
  { skuId: "SKU-1007", binId: "C7-04", onHand: 8, reserved: 0 },
  { skuId: "SKU-1008", binId: "C7-08", onHand: 55, reserved: 0 },
  { skuId: "SKU-1008", binId: "A1-07", onHand: 12, reserved: 0 },
];

const orders: Order[] = [
  { orderId: "ORD-1001", customer: "Northwind Robotics", customerTier: "Enterprise", createdAtOffsetMin: 150, slaDueOffsetMin: 45, orderValue: 1840, stockoutRisk: 0.72, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
  { orderId: "ORD-1002", customer: "Helios Automotive", customerTier: "Gold", createdAtOffsetMin: 120, slaDueOffsetMin: 60, orderValue: 500, stockoutRisk: 0.6, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
  { orderId: "ORD-1003", customer: "Cascade Medical", customerTier: "Gold", createdAtOffsetMin: 300, slaDueOffsetMin: 95, orderValue: 920, stockoutRisk: 0.35, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
  { orderId: "ORD-1004", customer: "Bluepeak Drones", customerTier: "Silver", createdAtOffsetMin: 90, slaDueOffsetMin: 180, orderValue: 640, stockoutRisk: 0.55, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
  { orderId: "ORD-1005", customer: "Iron Harbor Marine", customerTier: "Silver", createdAtOffsetMin: 420, slaDueOffsetMin: 240, orderValue: 380, stockoutRisk: 0.2, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
  { orderId: "ORD-1006", customer: "Quanta Labs", customerTier: "Enterprise", createdAtOffsetMin: 60, slaDueOffsetMin: 130, orderValue: 1250, stockoutRisk: 0.3, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
  { orderId: "ORD-1007", customer: "Verde Cyclery", customerTier: "Bronze", createdAtOffsetMin: 200, slaDueOffsetMin: 320, orderValue: 210, stockoutRisk: 0.15, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
  { orderId: "ORD-1008", customer: "Atlas Fabrication", customerTier: "Bronze", createdAtOffsetMin: 45, slaDueOffsetMin: 400, orderValue: 150, stockoutRisk: 0.1, status: "New", priorityScore: null, priorityBand: null, scoreBreakdown: null },
];

const lines: OrderLine[] = [
  // ORD-1001 (P0 hero): needs scarce SKU-1004 x8 + brake pads
  { lineId: "L-1001-1", orderId: "ORD-1001", skuId: "SKU-1004", qtyRequired: 8, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1001-2", orderId: "ORD-1001", skuId: "SKU-1001", qtyRequired: 4, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1001-3", orderId: "ORD-1001", skuId: "SKU-1006", qtyRequired: 6, qtyAllocated: 0, qtyPicked: 0 },
  // ORD-1002 (worked example order)
  { lineId: "L-1002-1", orderId: "ORD-1002", skuId: "SKU-1002", qtyRequired: 3, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1002-2", orderId: "ORD-1002", skuId: "SKU-1005", qtyRequired: 10, qtyAllocated: 0, qtyPicked: 0 },
  // ORD-1003
  { lineId: "L-1003-1", orderId: "ORD-1003", skuId: "SKU-1003", qtyRequired: 24, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1003-2", orderId: "ORD-1003", skuId: "SKU-1007", qtyRequired: 2, qtyAllocated: 0, qtyPicked: 0 },
  // ORD-1004: also wants scarce SKU-1004 x6 → conflict with ORD-1001
  { lineId: "L-1004-1", orderId: "ORD-1004", skuId: "SKU-1004", qtyRequired: 6, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1004-2", orderId: "ORD-1004", skuId: "SKU-1008", qtyRequired: 5, qtyAllocated: 0, qtyPicked: 0 },
  // ORD-1005
  { lineId: "L-1005-1", orderId: "ORD-1005", skuId: "SKU-1002", qtyRequired: 4, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1005-2", orderId: "ORD-1005", skuId: "SKU-1006", qtyRequired: 8, qtyAllocated: 0, qtyPicked: 0 },
  // ORD-1006: servo motors are tight (8 on hand, needs 6)
  { lineId: "L-1006-1", orderId: "ORD-1006", skuId: "SKU-1007", qtyRequired: 6, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1006-2", orderId: "ORD-1006", skuId: "SKU-1003", qtyRequired: 40, qtyAllocated: 0, qtyPicked: 0 },
  // ORD-1007
  { lineId: "L-1007-1", orderId: "ORD-1007", skuId: "SKU-1001", qtyRequired: 2, qtyAllocated: 0, qtyPicked: 0 },
  { lineId: "L-1007-2", orderId: "ORD-1007", skuId: "SKU-1008", qtyRequired: 6, qtyAllocated: 0, qtyPicked: 0 },
  // ORD-1008
  { lineId: "L-1008-1", orderId: "ORD-1008", skuId: "SKU-1005", qtyRequired: 4, qtyAllocated: 0, qtyPicked: 0 },
];

export function buildSeedState(): WarehouseState {
  return {
    seeded: true,
    simMinute: 0,
    skus: skus.map((s) => ({ ...s })),
    bins: bins.map((b) => ({ ...b })),
    inventory: inventory.map((r) => ({ ...r })),
    orders: orders.map((o) => ({ ...o })),
    lines: lines.map((l) => ({ ...l })),
    allocations: [],
    pickTasks: [],
    batches: [],
    exceptions: [],
    audit: [],
    lastRun: {},
  };
}

export const DOCK = { x: 0, y: 50 };

// ---------------- Stress dataset ----------------
// Answers the obvious question: does any of this hold up beyond eight orders?
// Deterministic (seeded LCG), so the numbers are reproducible run to run, and
// stock is scaled with the order count so the warehouse stays plausibly loaded
// rather than collapsing into one giant stockout.

const TIERS = ["Bronze", "Silver", "Gold", "Enterprise"] as const;
const COMPANIES = [
  "Northwind", "Helios", "Cascade", "Bluepeak", "Iron Harbor", "Quanta", "Verde", "Atlas",
  "Meridian", "Silverline", "Kestrel", "Radiant", "Copperfield", "Vantage", "Orbital", "Thornton",
];
const SUFFIX = ["Robotics", "Automotive", "Medical", "Drones", "Marine", "Labs", "Cyclery", "Fabrication", "Systems", "Industrial"];

export function buildStressState(orderCount = 200): WarehouseState {
  let seed = 20260819;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];

  const stressOrders: Order[] = [];
  const stressLines: OrderLine[] = [];

  for (let i = 0; i < orderCount; i++) {
    const orderId = `ORD-${String(2000 + i).padStart(4, "0")}`;
    const tier = pick(TIERS);
    stressOrders.push({
      orderId,
      customer: `${pick(COMPANIES)} ${pick(SUFFIX)}`,
      customerTier: tier,
      createdAtOffsetMin: Math.round(rnd() * 480),
      slaDueOffsetMin: Math.round(20 + rnd() * 400),
      orderValue: Math.round(80 + rnd() * 1900),
      stockoutRisk: Math.round(rnd() * 90) / 100,
      status: "New",
      priorityScore: null,
      priorityBand: null,
      scoreBreakdown: null,
    });

    const lineCount = 1 + Math.floor(rnd() * 3);
    const used = new Set<string>();
    for (let l = 0; l < lineCount; l++) {
      const sku = pick(skus);
      if (used.has(sku.skuId)) continue;
      used.add(sku.skuId);
      stressLines.push({
        lineId: `L-${orderId}-${l + 1}`,
        orderId,
        skuId: sku.skuId,
        qtyRequired: 1 + Math.floor(rnd() * 12),
        qtyAllocated: 0,
        qtyPicked: 0,
      });
    }
  }

  // Scale stock with demand, but keep SKU-1004 deliberately scarce so the
  // contested-allocation story still has a protagonist at any size.
  const scale = Math.max(1, Math.round(orderCount / 8));
  const stressInventory: InventoryRow[] = inventory.map((r) => ({
    ...r,
    onHand: r.skuId === "SKU-1004" ? r.onHand * Math.max(1, Math.round(scale * 0.35)) : r.onHand * scale,
  }));

  return {
    seeded: true,
    simMinute: 0,
    skus: skus.map((s) => ({ ...s })),
    bins: bins.map((b) => ({ ...b })),
    inventory: stressInventory,
    orders: stressOrders,
    lines: stressLines,
    allocations: [],
    pickTasks: [],
    batches: [],
    exceptions: [],
    audit: [],
    lastRun: {},
  };
}
