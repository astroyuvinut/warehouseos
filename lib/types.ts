export type Tier = "Bronze" | "Silver" | "Gold" | "Enterprise";
export type PriorityBand = "P0" | "P1" | "P2" | "P3";
export type OrderStatus = "New" | "Allocated" | "Picking" | "Packed" | "Shipped" | "Held";
export type AllocationAction = "allocate" | "partial" | "steal" | "hold" | "cross-dock";
export type ExceptionType = "Damaged" | "Missing" | "Short Pick" | "QC Fail";
export type ExceptionState = "Detected" | "Classified" | "Resolved" | "Needs Review" | "Closed";
export type PickStatus = "Open" | "Batched" | "Picked" | "Exception";

export interface SKU {
  skuId: string;
  name: string;
  unit: string;
  avgDailyDemand: number;
  leadTimeDays: number;
  demandStdDev: number;
  reorderPoint: number;
  safetyStock: number;
}

export interface Bin {
  binId: string;
  zone: string;
  aisle: number;
  x: number;
  y: number;
}

export interface InventoryRow {
  skuId: string;
  binId: string;
  onHand: number;
  reserved: number;
}

export interface OrderLine {
  lineId: string;
  orderId: string;
  skuId: string;
  qtyRequired: number;
  qtyAllocated: number;
  qtyPicked: number;
}

export interface Order {
  orderId: string;
  customer: string;
  customerTier: Tier;
  createdAtOffsetMin: number; // minutes before "now"
  slaDueOffsetMin: number; // minutes after "now"
  orderValue: number;
  stockoutRisk: number;
  status: OrderStatus;
  priorityScore: number | null;
  priorityBand: PriorityBand | null;
  scoreBreakdown: ScoreBreakdown | null;
}

export interface ScoreBreakdown {
  slaUrgency: number;
  tier: number;
  value: number;
  stockoutRisk: number;
  age: number;
  reasons: string[];
}

export interface Allocation {
  allocationId: string;
  orderId: string;
  lineId: string;
  skuId: string;
  binId: string;
  qty: number;
  picked: boolean;
  action: AllocationAction;
  reason: string;
}

export interface PickTask {
  pickTaskId: string;
  orderId: string;
  skuId: string;
  binId: string;
  qty: number;
  batchId: string | null;
  sequence: number | null;
  status: PickStatus;
  band: PriorityBand;
}

export interface Batch {
  batchId: string;
  slaBand: PriorityBand;
  taskIds: string[];
  route: string[]; // ordered binIds
  estWalkTimeMin: number;
  distance: number;
  reason: string;
}

export interface WhException {
  exceptionId: string;
  type: ExceptionType;
  state: ExceptionState;
  orderId: string;
  skuId: string;
  binId: string;
  qty: number;
  recommendedAction: string;
  resolutionPath: string[];
  autoResolvable: boolean;
  createdAtLabel: string;
}

export interface AuditEntry {
  auditId: string;
  seq: number;
  actor: string;
  engine: "Priority" | "Allocation" | "Picking" | "Exception" | "Reorder" | "System";
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  before?: string;
  after?: string;
  atLabel: string;
}

export interface WarehouseState {
  seeded: boolean;
  simMinute: number; // simulated minutes elapsed since seed
  skus: SKU[];
  bins: Bin[];
  inventory: InventoryRow[];
  orders: Order[];
  lines: OrderLine[];
  allocations: Allocation[];
  pickTasks: PickTask[];
  batches: Batch[];
  exceptions: WhException[];
  audit: AuditEntry[];
  lastRun: { priority?: string; allocation?: string; picking?: string };
}
