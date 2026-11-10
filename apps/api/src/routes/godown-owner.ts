import { Adjustment, Bill, Exception, FuelEntry, Payment, Trip, type TripAttrs } from "@repo/db";
import { businessDate, formatRupees } from "@repo/shared";
import { Router } from "express";
import type { HydratedDocument } from "mongoose";
import { z } from "zod";
import { allow, notFound, param, parse, rejected, zId } from "../http.js";
import { raise, record, sameId } from "../services.js";
import { decideAdjustment, liveBoard } from "./office.js";

export const godown: Router = Router();
godown.use(allow("godown"));

function expectedReturns(trip: HydratedDocument<TripAttrs>, bills: { _id: unknown; lines: { productId: unknown; name: string; unit?: string | null; quantity: number }[] }[]) {
  const totals = new Map<string, { productId: string; name: string; unit: string; expected: number }>();
  for (const entry of trip.bills) {
    const bill = bills.find((b) => sameId(b._id, entry.billId));
    if (!bill) continue;
    for (const line of bill.lines) {
      let returned = 0;
      if (entry.result === "not_delivered") returned = line.quantity;
      if (entry.result === "partial") {
        const item = entry.items.find((i) => sameId(i.productId, line.productId));
        returned = line.quantity - (item?.deliveredQty ?? line.quantity);
      }
      if (returned <= 0) continue;
      const key = String(line.productId);
      const row = totals.get(key) ?? { productId: key, name: line.name, unit: line.unit ?? "", expected: 0 };
      row.expected += returned;
      totals.set(key, row);
    }
  }
  return [...totals.values()];
}

godown.get("/pending", async (_req, res) => {
  const trips = await Trip.find({ status: { $in: ["ended", "checked"] }, godownCountedAt: null })
    .populate("driverId", "name")
    .populate("vehicleId", "number")
    .populate("beatId", "name");
  const rows = await Promise.all(
    trips.map(async (trip) => {
      const bills = await Bill.find({ _id: { $in: trip.bills.map((b) => b.billId) } }).lean();
      const returns = expectedReturns(trip, bills);
      return {
        _id: trip._id,
        driver: trip.driverId,
        vehicle: trip.vehicleId,
        beat: trip.beatId,
        date: trip.date,
        // Names only: the godown must count without seeing the expected quantities.
        products: returns.map(({ productId, name, unit }) => ({ productId, name, unit })),
      };
    }),
  );
  const goodsReturns = await Adjustment.find({ kind: "goods_return", status: "pending" })
    .populate("billId", "billNo")
    .populate("shopId", "name")
    .populate("staffId", "name")
    .lean();
  const counted = await Trip.find({ godownCountedAt: { $ne: null } }).sort({ godownCountedAt: -1 }).limit(10).populate("driverId", "name").populate("vehicleId", "number").lean();
  res.json({ trips: rows.filter((r) => r.products.length > 0), goodsReturns, counted });
});

godown.post("/trips/:id/count", async (req, res) => {
  const body = parse(z.object({ lines: z.array(z.object({ productId: zId, counted: z.number().min(0) })) }), req.body);
  const trip = await Trip.findById(param(req, "id"));
  if (!trip) throw notFound("Trip");
  if (!["ended", "checked"].includes(trip.status)) throw rejected("This vehicle has not returned yet.");
  if (trip.godownCountedAt) throw rejected("This vehicle has already been counted.");
  const bills = await Bill.find({ _id: { $in: trip.bills.map((b) => b.billId) } }).lean();
  const expected = expectedReturns(trip, bills);
  if (expected.some((row) => !body.lines.find((l) => l.productId === row.productId))) throw rejected("Count every product listed.");
  const count = expected.map((row) => ({ productId: row.productId, name: row.name, expected: row.expected, counted: body.lines.find((l) => l.productId === row.productId)!.counted }));
  trip.godownCount = count as never;
  trip.godownCountedBy = req.staff._id;
  trip.godownCountedAt = new Date();
  await trip.save();
  const mismatches = count.filter((row) => row.counted !== row.expected);
  for (const row of mismatches) {
    await raise("goods_mismatch", `${row.name}: godown counted ${row.counted}, delivery record expects ${row.expected}`, { staffId: trip.driverId, tripId: trip._id });
  }
  await record(req.staff, "godown.counted", `Returned goods counted for trip, ${mismatches.length} mismatch(es)`, { billIds: trip.bills.map((b) => b.billId) });
  res.json({ matched: mismatches.length === 0, mismatches: mismatches.length });
});

godown.post("/adjustments/:id/receive", async (req, res) => {
  const body = parse(z.object({ received: z.boolean(), note: z.string().trim().default("") }), req.body);
  const item = await Adjustment.findById(param(req, "id"));
  if (!item || item.kind !== "goods_return") throw notFound("Goods return");
  if (item.status !== "pending") throw rejected("This has already been decided.");
  if (!body.received && !body.note) throw rejected("Write what was wrong with the goods.");
  await decideAdjustment(item, body.received, body.note, req);
  res.json({ ok: true });
});

export const owner: Router = Router();
owner.use(allow("owner"));

owner.get("/summary", async (_req, res) => {
  const date = businessDate();
  const [board, payments, exceptions, overrides, fuel, pendingBills] = await Promise.all([
    liveBoard(date),
    Payment.find({ date, status: { $in: ["claimed", "confirmed", "qr_shown"] } }).lean(),
    Exception.find({ status: "open" }).sort({ createdAt: -1 }).populate("staffId", "name role").populate("billId", "billNo").lean(),
    Exception.find({ type: "override_used" }).sort({ createdAt: -1 }).limit(20).populate("staffId", "name").populate("resolvedBy", "name").lean(),
    FuelEntry.find({ date }).lean(),
    Bill.find({ stage: { $ne: "closed" } }, "amountPaise confirmedPaise adjustedPaise").lean(),
  ]);
  const byMode = (mode: string, statuses: string[]) =>
    payments.filter((p) => p.mode === mode && statuses.includes(p.status)).reduce((s, p) => s + p.amountPaise, 0);
  const moneyAtRisk = exceptions.filter((e) => ["cash_short", "cheque_missing"].includes(e.type)).reduce((s, e) => s + (e.amountPaise ?? 0), 0);
  res.json({
    date,
    collected: {
      cash: { unconfirmed: byMode("cash", ["claimed"]), confirmed: byMode("cash", ["confirmed"]) },
      cheque: { unconfirmed: byMode("cheque", ["claimed"]), confirmed: byMode("cheque", ["confirmed"]) },
      upi: { unconfirmed: byMode("upi", ["claimed", "qr_shown"]), confirmed: byMode("upi", ["confirmed"]) },
    },
    moneyAtRiskPaise: moneyAtRisk,
    moneyAtRiskLabel: formatRupees(moneyAtRisk),
    outstandingPaise: pendingBills.reduce((s, b) => s + b.amountPaise - b.confirmedPaise - b.adjustedPaise, 0),
    fuel: { paise: fuel.reduce((s, f) => s + f.amountPaise, 0), lowMileage: fuel.filter((f) => f.lowMileage).length },
    exceptions,
    overrides,
    board,
  });
});
