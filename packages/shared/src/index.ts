export const ROLES = ["salesman", "collection_agent", "driver", "helper", "godown", "admin", "owner"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  salesman: "Salesman",
  collection_agent: "Collection agent",
  driver: "Driver",
  helper: "Helper",
  godown: "Godown",
  admin: "Office admin",
  owner: "Owner",
};

export const ROLE_HOME: Record<Role, string> = {
  salesman: "/sales",
  collection_agent: "/sales",
  driver: "/delivery",
  helper: "/delivery",
  godown: "/godown",
  admin: "/office",
  owner: "/owner",
};

export const SKIP_REASONS = ["Shop closed", "Owner absent", "Road blocked", "Told to come later"] as const;
export const NO_ORDER_REASONS = ["Stock is enough", "Owner absent", "Payment pending first", "Buying elsewhere"] as const;
export const NOT_DELIVERED_REASONS = ["Shop closed", "Shop refused", "Goods damaged", "Could not reach shop"] as const;
export const PARTIAL_REASONS = ["Shop took less", "Goods damaged", "Short loaded"] as const;

export const DELIVERY_RESULT_LABEL = {
  pending: "Not done",
  credit_delivered: "Delivered on credit",
  cash_paid: "Cash bill paid",
  credit_paid_cash: "Credit bill paid in cash",
  partial: "Partly delivered",
  not_delivered: "Not delivered",
} as const;
export type DeliveryResult = keyof typeof DELIVERY_RESULT_LABEL;

export const BILL_STAGE_LABEL = {
  billed: "Waiting to load",
  on_vehicle: "On the vehicle",
  awaiting_paper: "Signed copy awaited",
  in_file: "In beat file",
  issued: "Issued, not accepted",
  with_collector: "With collector",
  settling: "Back, money being confirmed",
  closed: "Closed",
} as const;
export type BillStage = keyof typeof BILL_STAGE_LABEL;

export const PAYMENT_MODE_LABEL: Record<string, string> = { cash: "Cash", cheque: "Cheque", upi: "UPI" };

export const OUTCOME_LABEL = {
  paid: "Paid",
  part_paid: "Part paid",
  later: "Will pay later",
  returned_as_is: "Returned as it is",
} as const;
export type BillOutcome = keyof typeof OUTCOME_LABEL;

export const EXCEPTION_LABEL = {
  missing_bill: "Bill not returned",
  bill_not_handed: "Bill not handed over",
  cash_short: "Cash short",
  cash_over: "Cash over",
  paper_missing: "Signed copy not returned",
  goods_mismatch: "Returned goods do not match",
  receipt_gap: "Receipt number gap",
  cheque_missing: "Cheque not handed in",
  cheque_bounced: "Cheque bounced",
  discount_review: "Discount to review",
  skipped_shop: "Shop skipped",
  out_of_sequence: "Shop visited out of order",
  long_stop: "Long stop",
  long_gap: "Long gap between shops",
  beat_overrun: "Beat ran over plan",
  outside_shop: "Attempt away from shop",
  late_entry: "Entry sent late",
  speed_jump: "Impossible travel speed",
  low_mileage: "Low mileage",
  km_over_plan: "Kilometres over plan",
  override_used: "Admin override used",
  same_person_check: "Same person issued and checked",
} as const;
export type ExceptionType = keyof typeof EXCEPTION_LABEL;

/** All money in the system is stored as whole paise so totals never drift. */
export function formatRupees(paise: number): string {
  const rupees = paise / 100;
  const hasPaise = paise % 100 !== 0;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The firm's working date (YYYY-MM-DD), always in India time whatever the server's timezone. */
export function businessDate(at: Date = new Date()): string {
  return new Date(at.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function businessWeekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export interface OpenBill {
  id: string;
  openPaise: number;
}

export interface Allocation {
  billId: string;
  amountPaise: number;
}

/**
 * Applies a payment bill to bill. Callers pass bills oldest first, so an older
 * bill is always cleared before a newer one receives anything.
 */
export function allocateOldestFirst(bills: OpenBill[], amountPaise: number): Allocation[] {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0) {
    throw new RangeError("Amount must be more than zero.");
  }
  const total = bills.reduce((sum, b) => sum + Math.max(b.openPaise, 0), 0);
  if (amountPaise > total) {
    throw new RangeError(`Amount is more than the ${formatRupees(total)} pending on these bills.`);
  }
  const allocations: Allocation[] = [];
  let left = amountPaise;
  for (const bill of bills) {
    if (left === 0) break;
    const applied = Math.min(left, Math.max(bill.openPaise, 0));
    if (applied > 0) {
      allocations.push({ billId: bill.id, amountPaise: applied });
      left -= applied;
    }
  }
  return allocations;
}

export interface UpiRequest {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  reference: string;
  note: string;
}

export function buildUpiUrl(request: UpiRequest): string {
  const params = [
    ["pa", request.upiId],
    ["pn", request.payeeName],
    ["am", (request.amountPaise / 100).toFixed(2)],
    ["cu", "INR"],
    ["tr", request.reference],
    ["tn", request.note],
  ];
  return `upi://pay?${params.map(([k, v]) => `${k}=${encodeURIComponent(v ?? "")}`).join("&")}`;
}
