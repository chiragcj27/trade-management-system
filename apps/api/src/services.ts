import {
  Adjustment,
  Bill,
  type BillAttrs,
  Event,
  Exception,
  MargTask,
  Payment,
  type PaymentAttrs,
  Settings,
  Shop,
  type StaffAttrs,
} from "@repo/db";
import { type ExceptionType, EXCEPTION_LABEL, businessDate, formatRupees } from "@repo/shared";
import type { HydratedDocument, Types } from "mongoose";

type Staff = HydratedDocument<StaffAttrs>;
type BillDoc = HydratedDocument<BillAttrs>;
type PaymentDoc = HydratedDocument<PaymentAttrs>;
type Id = Types.ObjectId | string;
export interface GpsPoint {
  lat: number;
  lng: number;
  accuracy?: number | undefined;
}

export const sameId = (a: unknown, b: unknown) => String(a) === String(b);

export function openPaise(bill: { amountPaise: number; confirmedPaise: number; claimedPaise: number; adjustedPaise: number }) {
  return bill.amountPaise - bill.confirmedPaise - bill.claimedPaise - bill.adjustedPaise;
}

export async function getSettings() {
  return (await Settings.findOne()) ?? (await Settings.create({}));
}

export async function record(
  actor: Staff | null,
  action: string,
  summary: string,
  extra: {
    billIds?: Id[];
    shopId?: Id | null;
    gps?: GpsPoint | null;
    reason?: string | null;
    deviceAt?: Date | null;
    data?: unknown;
  } = {},
) {
  await new Event({
    actorId: actor?._id ?? null,
    actorName: actor?.name ?? "System",
    action,
    summary,
    billIds: extra.billIds ?? [],
    shopId: extra.shopId ?? null,
    gps: extra.gps ?? null,
    reason: extra.reason ?? null,
    deviceAt: extra.deviceAt ?? null,
    data: extra.data ?? null,
  }).save();
}

const SEVERITY: Partial<Record<ExceptionType, "critical" | "warning" | "info">> = {
  missing_bill: "critical",
  cash_short: "critical",
  cash_over: "warning",
  paper_missing: "critical",
  goods_mismatch: "critical",
  receipt_gap: "critical",
  cheque_missing: "critical",
  cheque_bounced: "critical",
  bill_not_handed: "warning",
  discount_review: "warning",
  outside_shop: "warning",
  late_entry: "warning",
  speed_jump: "warning",
  low_mileage: "warning",
  km_over_plan: "warning",
  override_used: "warning",
  same_person_check: "warning",
  long_stop: "info",
  long_gap: "info",
  beat_overrun: "info",
  skipped_shop: "info",
  out_of_sequence: "info",
};

export async function raise(
  type: ExceptionType,
  message: string,
  refs: {
    staffId?: Id | null;
    runId?: Id | null;
    tripId?: Id | null;
    billId?: Id | null;
    paymentId?: Id | null;
    amountPaise?: number | null;
    status?: "open" | "resolved";
    resolvedBy?: Id | null;
    resolution?: string | null;
  } = {},
) {
  await new Exception({
    type,
    severity: SEVERITY[type] ?? "info",
    message,
    date: businessDate(),
    resolvedAt: refs.status === "resolved" ? new Date() : null,
    ...refs,
  }).save();
}

export const exceptionTitle = (type: ExceptionType) => EXCEPTION_LABEL[type];

export async function addMargTask(
  kind: string,
  description: string,
  amountPaise: number,
  billIds: Id[],
  paymentId: Id | null = null,
) {
  await new MargTask({ kind, description, amountPaise, billIds, paymentId }).save();
}

/** Closes a returned bill once its money is confirmed and every Marg entry for it is ticked. */
export async function settleBill(billId: Id) {
  const bill = await Bill.findById(billId);
  if (!bill || bill.stage !== "settling") return;
  if (openPaise(bill) > 0 || bill.claimedPaise > 0) return;
  const [pendingAdjustments, pendingTasks] = await Promise.all([
    Adjustment.countDocuments({ billId, status: "pending" }),
    MargTask.countDocuments({ billIds: billId, status: "pending" }),
  ]);
  if (pendingAdjustments > 0 || pendingTasks > 0) return;
  bill.stage = "closed";
  bill.holderLabel = "Closed file";
  await bill.save();
  await record(null, "bill.closed", `Bill ${bill.billNo} closed`, { billIds: [bill._id], shopId: bill.shopId });
}

/** The paper is physically back in the office: unpaid bills return to the file, the rest wait to close. */
export async function paperReturned(bill: BillDoc, actor: Staff) {
  bill.stage = openPaise(bill) > 0 ? "in_file" : "settling";
  bill.holderStaffId = null;
  bill.holderLabel = "Office";
  await bill.save();
  await record(actor, "bill.paper_back", `Bill ${bill.billNo} received back in office`, {
    billIds: [bill._id],
    shopId: bill.shopId,
  });
  await settleBill(bill._id);
}

export async function confirmPayment(payment: PaymentDoc, actor: Staff) {
  if (payment.status === "confirmed") return;
  const billIds = payment.allocations.map((a) => a.billId);
  for (const allocation of payment.allocations) {
    await Bill.updateOne(
      { _id: allocation.billId },
      { $inc: { claimedPaise: -allocation.amountPaise, confirmedPaise: allocation.amountPaise } },
    );
  }
  payment.status = "confirmed";
  payment.confirmedBy = actor._id;
  payment.confirmedAt = new Date();
  await payment.save();
  const shop = await Shop.findById(payment.shopId);
  const bills = await Bill.find({ _id: { $in: billIds } }, "billNo");
  const billNos = bills.map((b) => b.billNo).join(", ");
  await addMargTask(
    "payment",
    `Enter ${payment.mode} receipt from ${shop?.name ?? "shop"} against ${billNos}`,
    payment.amountPaise,
    billIds,
    payment._id,
  );
  await record(actor, "payment.confirmed", `${formatRupees(payment.amountPaise)} ${payment.mode} confirmed`, {
    billIds,
    shopId: payment.shopId,
  });
}

export async function rejectPayment(payment: PaymentDoc, actor: Staff, reason: string) {
  if (payment.status !== "claimed") return;
  for (const allocation of payment.allocations) {
    await Bill.updateOne({ _id: allocation.billId }, { $inc: { claimedPaise: -allocation.amountPaise } });
  }
  payment.status = "rejected";
  payment.statusReason = reason;
  payment.confirmedBy = actor._id;
  payment.confirmedAt = new Date();
  await payment.save();
  await reopenBills(payment.allocations.map((a) => a.billId));
  await record(actor, "payment.rejected", `${formatRupees(payment.amountPaise)} ${payment.mode} rejected`, {
    billIds: payment.allocations.map((a) => a.billId),
    shopId: payment.shopId,
    reason,
  });
}

/** A bill that was finishing but now has money owing goes back to the file for collection. */
export async function reopenBills(billIds: Id[]) {
  const bills = await Bill.find({ _id: { $in: billIds }, stage: { $in: ["settling", "closed"] } });
  for (const bill of bills) {
    if (openPaise(bill) > 0) {
      bill.stage = "in_file";
      bill.holderLabel = "Office";
      await bill.save();
    }
  }
}

export async function bounceCheque(payment: PaymentDoc, actor: Staff, reason: string) {
  const billIds = payment.allocations.map((a) => a.billId);
  const wasConfirmed = payment.status === "confirmed";
  for (const allocation of payment.allocations) {
    await Bill.updateOne(
      { _id: allocation.billId },
      { $inc: wasConfirmed ? { confirmedPaise: -allocation.amountPaise } : { claimedPaise: -allocation.amountPaise } },
    );
  }
  payment.status = "rejected";
  payment.chequeStatus = "bounced";
  payment.statusReason = reason;
  await payment.save();
  await reopenBills(billIds);
  if (wasConfirmed) {
    await addMargTask(
      "cheque_reversal",
      `Reverse bounced cheque ${payment.chequeNo ?? ""}`,
      payment.amountPaise,
      billIds,
      payment._id,
    );
  }
  await raise("cheque_bounced", `Cheque ${payment.chequeNo ?? ""} bounced: ${reason}`, {
    staffId: payment.staffId,
    paymentId: payment._id,
    amountPaise: payment.amountPaise,
  });
  await record(actor, "cheque.bounced", `Cheque ${payment.chequeNo ?? ""} bounced, bills reopened`, {
    billIds,
    shopId: payment.shopId,
    reason,
  });
}

export function confirmCashPayments(filter: { runId?: Id; tripId?: Id }) {
  return Payment.find({ ...filter, mode: "cash", status: "claimed" });
}
