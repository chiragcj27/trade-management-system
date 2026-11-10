import {
  Adjustment,
  type AdjustmentAttrs,
  Beat,
  BeatPlan,
  BeatRun,
  type BeatRunAttrs,
  Bill,
  CashAdvance,
  Event,
  Exception,
  FuelEntry,
  MargTask,
  Order,
  Payment,
  Product,
  ReceiptBook,
  Settings,
  Shop,
  Staff,
  Trip,
  type TripAttrs,
  Vehicle,
  Visit,
  runInTransaction,
} from "@repo/db";
import { type ExceptionType, ROLES, businessDate, businessWeekday, formatRupees } from "@repo/shared";
import { Router, type Request, type RequestHandler } from "express";
import type { HydratedDocument, Types } from "mongoose";
import { z } from "zod";
import { allow, notFound, param, parse, rejected, zDate, zId, zPaise } from "../http.js";
import {
  addMargTask,
  bounceCheque,
  confirmCashPayments,
  confirmPayment,
  getSettings,
  openPaise,
  paperReturned,
  raise,
  record,
  rejectPayment,
  reopenBills,
  sameId,
  settleBill,
} from "../services.js";
import { ensureRun } from "./field.js";

export const office: Router = Router();
const adminOnly: RequestHandler = allow("admin");
const oversight: RequestHandler = allow("admin", "owner");

const BLOCKING: ExceptionType[] = ["missing_bill", "cash_short", "cheque_missing"];

// ---------- Live board and queues ----------

export async function liveBoard(date = businessDate()) {
  const [runs, trips] = await Promise.all([
    BeatRun.find({ date }).populate("staffId", "name role").populate("beatId", "name plannedMinutes").lean(),
    Trip.find({ date }).populate("driverId", "name").populate("helperId", "name").populate("beatId", "name plannedKm").populate("vehicleId", "number").lean(),
  ]);
  const runRows = await Promise.all(
    runs.map(async (run) => {
      const beat = run.beatId as unknown as { _id: Types.ObjectId; name: string; plannedMinutes: number };
      const [visits, shops, payments] = await Promise.all([
        Visit.find({ runId: run._id }).populate("shopId", "name").lean(),
        Shop.countDocuments({ beatId: beat._id }),
        Payment.find({ runId: run._id, status: { $in: ["claimed", "confirmed"] } }, "amountPaise").lean(),
      ]);
      const current = visits.find((v) => v.status === "checked_in");
      return {
        _id: run._id,
        staff: run.staffId,
        beat,
        status: run.status,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        billsHeld: run.bills.length,
        shopsDone: visits.length,
        shopsSkipped: visits.filter((v) => v.status === "skipped").length,
        shopsTotal: shops,
        currentShop: (current?.shopId as unknown as { name: string } | undefined)?.name ?? null,
        currentSince: current?.checkInAt ?? null,
        collectedPaise: payments.reduce((s, p) => s + p.amountPaise, 0),
      };
    }),
  );
  return {
    date,
    runs: runRows,
    trips: trips.map((t) => ({
      _id: t._id,
      driver: t.driverId,
      helper: t.helperId,
      beat: t.beatId,
      vehicle: t.vehicleId,
      status: t.status,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
      startOdometer: t.startOdometer,
      endOdometer: t.endOdometer,
      stopsDone: t.stops.filter((s) => s.arrivedAt).length,
      stopsTotal: t.stops.length,
      billsDone: t.bills.filter((b) => b.result !== "pending").length,
      billsTotal: t.bills.length,
    })),
  };
}

office.get("/board", oversight, async (_req, res) => {
  const date = businessDate();
  const [
    board,
    newOrders,
    toLoad,
    inFile,
    runsToCheck,
    tripsToCheck,
    upi,
    cheques,
    marg,
    fuel,
    exceptions,
    locationRequests,
    adjustments,
  ] = await Promise.all([
    liveBoard(date),
    Order.countDocuments({ status: "new" }),
    Bill.countDocuments({ stage: "billed" }),
    Bill.countDocuments({ stage: "in_file" }),
    BeatRun.countDocuments({ status: "ended" }),
    Trip.countDocuments({ status: "ended" }),
    Payment.countDocuments({ mode: "upi", status: "claimed" }),
    Payment.countDocuments({ mode: "cheque", chequeStatus: { $in: ["received", "deposited"] } }),
    MargTask.countDocuments({ status: "pending" }),
    FuelEntry.countDocuments({ status: "submitted" }),
    Exception.countDocuments({ status: "open" }),
    Shop.countDocuments({ locationRequest: { $ne: null } }),
    Adjustment.countDocuments({ status: "pending", kind: "cash_discount" }),
  ]);
  res.json({
    ...board,
    queues: { newOrders, toLoad, inFile, toCheck: runsToCheck + tripsToCheck, upi, cheques, marg, fuel, exceptions, locationRequests, adjustments },
  });
});

office.get("/exceptions", oversight, async (req, res) => {
  const status = req.query.status === "all" ? {} : { status: "open" };
  const items = await Exception.find(status)
    .sort({ createdAt: -1 })
    .limit(200)
    .populate("staffId", "name role")
    .populate("resolvedBy", "name")
    .populate("billId", "billNo")
    .lean();
  res.json({ items });
});

office.post("/exceptions/:id/resolve", adminOnly, async (req, res) => {
  const body = parse(z.object({ reason: z.string().trim().min(3, "Write a reason") }), req.body);
  const item = await Exception.findById(param(req, "id"));
  if (!item) throw notFound("Exception");
  if (item.status !== "open") throw rejected("This has already been resolved.");
  await runInTransaction(async () => {
    if (["missing_bill", "paper_missing"].includes(item.type) && item.billId) {
      const bill = await Bill.findById(item.billId);
      if (bill) await paperReturned(bill, req.staff);
    }
    if (["cash_short", "cash_over"].includes(item.type)) {
      const payments = await confirmCashPayments(item.runId ? { runId: item.runId } : { tripId: item.tripId! });
      for (const payment of payments) await confirmPayment(payment, req.staff);
    }
    if (item.type === "cheque_missing" && item.paymentId) {
      const payment = await Payment.findById(item.paymentId);
      if (payment) await confirmPayment(payment, req.staff);
    }
    item.status = "resolved";
    item.resolvedBy = req.staff._id;
    item.resolvedAt = new Date();
    item.resolution = body.reason;
    await item.save();
    await record(req.staff, "exception.resolved", `Resolved: ${item.message}`, { reason: body.reason, billIds: item.billId ? [item.billId] : [] });
  });
  res.json({ ok: true });
});

// ---------- Orders to bills ----------

office.get("/orders", adminOnly, async (_req, res) => {
  const items = await Order.find({ status: "new" })
    .sort({ createdAt: 1 })
    .populate("shopId", "name")
    .populate("beatId", "name")
    .populate("staffId", "name")
    .lean();
  res.json({ items });
});

office.post("/orders/:id/bill", adminOnly, async (req, res) => {
  const body = parse(
    z.object({ billNo: z.string().trim().min(1), billDate: zDate, kind: z.enum(["cash", "credit"]), amountPaise: zPaise }),
    req.body,
  );
  const order = await Order.findById(param(req, "id"));
  if (!order) throw notFound("Order");
  if (order.status !== "new") throw rejected("This order is already billed.");
  await runInTransaction(async () => {
    const bill = await new Bill({
      billNo: body.billNo,
      billDate: body.billDate,
      kind: body.kind,
      shopId: order.shopId,
      beatId: order.beatId,
      orderId: order._id,
      lines: order.lines,
      originalAmountPaise: body.amountPaise,
      amountPaise: body.amountPaise,
      stage: "billed",
    }).save();
    order.status = "billed";
    order.billId = bill._id;
    await order.save();
    await record(req.staff, "bill.created", `Bill ${bill.billNo} entered for order ${order.orderNo}`, { billIds: [bill._id], shopId: bill.shopId });
  });
  res.json({ ok: true });
});

// ---------- Bills and the trail ----------

office.get("/bills", oversight, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const stage = typeof req.query.stage === "string" ? req.query.stage : "";
  const filter: Record<string, unknown> = {};
  if (stage) filter.stage = stage;
  if (q) {
    const shops = await Shop.find({ name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, "_id").lean();
    filter.$or = [{ billNo: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { shopId: { $in: shops.map((s) => s._id) } }];
  }
  const items = await Bill.find(filter).sort({ billDate: -1, billNo: -1 }).limit(100).populate("shopId", "name").lean();
  res.json({ items: items.map((b) => ({ ...b, openPaise: openPaise(b) })) });
});

office.get("/bills/:id", oversight, async (req, res) => {
  const bill = await Bill.findById(param(req, "id")).populate("shopId", "name phone").populate("beatId", "name").lean();
  if (!bill) throw notFound("Bill");
  const [events, payments, adjustments] = await Promise.all([
    Event.find({ billIds: bill._id }).sort({ at: 1 }).lean(),
    Payment.find({ "allocations.billId": bill._id }).sort({ createdAt: 1 }).populate("staffId", "name").lean(),
    Adjustment.find({ billId: bill._id }).sort({ createdAt: 1 }).lean(),
  ]);
  res.json({ bill: { ...bill, openPaise: openPaise(bill) }, events, payments, adjustments });
});

office.get("/shops/:id/statement", adminOnly, async (req, res) => {
  const shop = await Shop.findById(param(req, "id")).lean();
  if (!shop) throw notFound("Shop");
  const settings = await getSettings();
  const bills = (await Bill.find({ shopId: shop._id, stage: { $ne: "closed" } }).sort({ billDate: 1 }).lean())
    .map((b) => ({ ...b, openPaise: openPaise(b) + b.claimedPaise }))
    .filter((b) => b.openPaise > 0);
  const total = bills.reduce((s, b) => s + b.openPaise, 0);
  const text = [
    `${settings.firmName}: pending bills for ${shop.name}`,
    ...bills.map((b) => `${b.billNo} dated ${b.billDate}: ${formatRupees(b.openPaise)}`),
    `Total pending: ${formatRupees(total)}`,
    "If you have already paid any of these, please call the office.",
  ].join("\n");
  res.json({ shop, bills, totalPaise: total, text });
});

// ---------- Load sheet ----------

office.get("/load", adminOnly, async (_req, res) => {
  const [bills, beats, vehicles, drivers, helpers, trips] = await Promise.all([
    Bill.find({ stage: "billed" }).sort({ billDate: 1 }).populate("shopId", "name sequence").lean(),
    Beat.find().sort({ name: 1 }).lean(),
    Vehicle.find().sort({ number: 1 }).lean(),
    Staff.find({ role: "driver", active: true }).sort({ name: 1 }).lean(),
    Staff.find({ role: "helper", active: true }).sort({ name: 1 }).lean(),
    Trip.find({ date: businessDate() }, "driverId helperId vehicleId status").lean(),
  ]);
  res.json({ bills, beats, vehicles, drivers, helpers, trips });
});

office.post("/trips", adminOnly, async (req, res) => {
  const body = parse(
    z.object({ beatId: zId, vehicleId: zId, driverId: zId, helperId: zId, billIds: z.array(zId).min(1, "Select at least one bill") }),
    req.body,
  );
  const bills = await Bill.find({ _id: { $in: body.billIds }, stage: "billed", beatId: body.beatId });
  if (bills.length !== body.billIds.length) throw rejected("Some bills are not available for this beat.");
  const date = businessDate();
  const busy = await Trip.findOne({
    date,
    status: { $in: ["planned", "accepted", "started"] },
    $or: [{ driverId: { $in: [body.driverId, body.helperId] } }, { helperId: { $in: [body.driverId, body.helperId] } }, { vehicleId: body.vehicleId }],
  });
  if (busy) throw rejected("That driver, helper or vehicle is already on an open trip today.");
  const shops = await Shop.find({ _id: { $in: bills.map((b) => b.shopId) } }).lean();
  const [driver, helper] = await Promise.all([Staff.findById(body.driverId), Staff.findById(body.helperId)]);
  await runInTransaction(async () => {
    await new Trip({
      date,
      beatId: body.beatId,
      vehicleId: body.vehicleId,
      driverId: body.driverId,
      helperId: body.helperId,
      createdBy: req.staff._id,
      stops: shops.map((s) => ({ shopId: s._id, sequence: s.sequence })),
      bills: bills.map((b) => ({ billId: b._id, shopId: b.shopId })),
    }).save();
    for (const bill of bills) {
      bill.stage = "on_vehicle";
      bill.holderLabel = `${driver?.name} and ${helper?.name}`;
      await bill.save();
    }
    await record(req.staff, "trip.created", `Load sheet made for ${driver?.name} and ${helper?.name}`, { billIds: bills.map((b) => b._id) });
  });
  res.json({ ok: true });
});

// ---------- Issuing bills ----------

async function blockersFor(staffId: Types.ObjectId) {
  return Exception.find({ staffId, status: "open", type: { $in: BLOCKING } }).lean();
}

office.get("/issue", adminOnly, async (_req, res) => {
  const date = businessDate();
  const weekday = businessWeekday(date);
  const collectors = await Staff.find({ role: { $in: ["salesman", "collection_agent"] }, active: true }).sort({ name: 1 }).lean();
  const rows = [];
  for (const staff of collectors) {
    const plan = await BeatPlan.findOne({ staffId: staff._id, weekday }).populate("beatId", "name").lean();
    if (!plan) continue;
    const run = await ensureRun(staff._id, date);
    if (!run) continue;
    const beat = plan.beatId as unknown as { _id: Types.ObjectId; name: string };
    const [shops, bills, blockers] = await Promise.all([
      Shop.find({ beatId: beat._id }).sort({ sequence: 1 }).lean(),
      run.status === "planned" ? Bill.find({ beatId: beat._id, stage: "in_file" }).sort({ billDate: 1 }).lean() : [],
      blockersFor(staff._id),
    ]);
    const shopOrder = new Map(shops.map((s, i) => [String(s._id), i]));
    rows.push({
      runId: run._id,
      status: run.status,
      staff,
      beat,
      issuedCount: run.bills.length,
      blockers,
      bills: bills
        .map((b) => ({ ...b, openPaise: openPaise(b), shopName: shops.find((s) => sameId(s._id, b.shopId))?.name }))
        .sort((a, b) => (shopOrder.get(String(a.shopId)) ?? 0) - (shopOrder.get(String(b.shopId)) ?? 0) || a.billDate.localeCompare(b.billDate)),
    });
  }
  res.json({ rows });
});

office.post("/runs/:id/issue", adminOnly, async (req, res) => {
  const body = parse(z.object({ billIds: z.array(zId).min(1, "Select at least one bill"), overrideReason: z.string().trim().optional() }), req.body);
  const run = await BeatRun.findById(param(req, "id"));
  if (!run) throw notFound("Beat");
  if (run.status !== "planned") throw rejected("Bills have already been issued for this beat.");
  const staff = await Staff.findById(run.staffId);
  const blockers = await blockersFor(run.staffId);
  if (blockers.length > 0 && !body.overrideReason) {
    throw rejected(`${staff?.name} has ${blockers.length} open problem(s). Resolve them or give an override reason.`, "blocked");
  }
  const bills = await Bill.find({ _id: { $in: body.billIds }, stage: "in_file", beatId: run.beatId });
  if (bills.length !== body.billIds.length) throw rejected("Some bills are not available in this beat's file.");
  await runInTransaction(async () => {
    run.bills = bills.map((b) => ({ billId: b._id, shopId: b.shopId })) as never;
    run.status = "issued";
    run.issuedBy = req.staff._id;
    run.issuedAt = new Date();
    await run.save();
    for (const bill of bills) {
      bill.stage = "issued";
      bill.holderStaffId = run.staffId;
      bill.holderLabel = `Issued to ${staff?.name}`;
      await bill.save();
      await record(req.staff, "bill.issued", `Bill ${bill.billNo} issued to ${staff?.name}`, { billIds: [bill._id], shopId: bill.shopId });
    }
    if (body.overrideReason && blockers.length > 0) {
      await raise("override_used", `Bills issued to ${staff?.name} despite ${blockers.length} open problem(s)`, {
        staffId: run.staffId,
        runId: run._id,
        status: "resolved",
        resolvedBy: req.staff._id,
        resolution: body.overrideReason,
      });
    }
  });
  res.json({ ok: true });
});

// ---------- Evening check ----------

office.get("/evening", adminOnly, async (_req, res) => {
  const [runs, trips, recent] = await Promise.all([
    BeatRun.find({ status: "ended" }).populate("staffId", "name role").populate("beatId", "name").lean(),
    Trip.find({ status: "ended" }).populate("driverId", "name").populate("helperId", "name").populate("beatId", "name").populate("vehicleId", "number").lean(),
    BeatRun.find({ status: "checked" }).sort({ checkedAt: -1 }).limit(10).populate("staffId", "name role").populate("beatId", "name").lean(),
  ]);
  res.json({ runs, trips, recent });
});

async function runDetail(run: HydratedDocument<BeatRunAttrs>, blind: boolean) {
  const [bills, shops, payments, book, adjustments] = await Promise.all([
    Bill.find({ _id: { $in: run.bills.map((b) => b.billId) } }).sort({ billDate: 1 }).lean(),
    Shop.find({ beatId: run.beatId }).lean(),
    Payment.find({ runId: run._id, status: { $nin: ["cancelled"] } }).sort({ createdAt: 1 }).lean(),
    ReceiptBook.findOne({ staffId: run.staffId, closed: false }).lean(),
    Adjustment.find({ runId: run._id }).lean(),
  ]);
  const cheques = payments.filter((p) => p.mode === "cheque");
  const billRows = bills.map((bill) => {
    const entry = run.bills.find((e) => sameId(e.billId, bill._id));
    return {
      _id: bill._id,
      billNo: bill.billNo,
      billDate: bill.billDate,
      shopName: shops.find((s) => sameId(s._id, bill.shopId))?.name,
      amountPaise: bill.amountPaise,
      notReceived: entry?.notReceived ?? false,
      paperBack: entry?.paperBack ?? null,
      ...(blind
        ? {}
        : {
            outcome: entry?.outcome ?? null,
            promiseDate: bill.promiseDate,
            payments: payments
              .filter((p) => p.allocations.some((a) => sameId(a.billId, bill._id)))
              .map((p) => ({ mode: p.mode, status: p.status, chequeNo: p.chequeNo, amountPaise: p.allocations.find((a) => sameId(a.billId, bill._id))?.amountPaise })),
          }),
    };
  });
  return {
    blind,
    bills: billRows,
    cheques: cheques.map((c) => ({ _id: c._id, chequeNo: c.chequeNo, chequeBank: c.chequeBank, chequeDate: c.chequeDate, amountPaise: c.amountPaise, status: c.status, photoId: c.photoId })),
    receiptBook: book,
    ...(blind
      ? {}
      : {
          upi: payments.filter((p) => p.mode === "upi").map((p) => ({ _id: p._id, amountPaise: p.amountPaise, status: p.status, upiTransactionRef: p.upiTransactionRef })),
          adjustments,
          expectedCashPaise: run.expectedCashPaise,
          countedCashPaise: run.countedCashPaise,
        }),
  };
}

const runToCheck = async (req: Request) => {
  const run = await BeatRun.findById(param(req, "id"));
  if (!run) throw notFound("Beat");
  return run;
};

office.get("/evening/runs/:id", adminOnly, async (req, res) => {
  const run = await runToCheck(req);
  const staff = await Staff.findById(run.staffId, "name role").lean();
  const beat = await Beat.findById(run.beatId, "name").lean();
  const exceptions = await Exception.find({ runId: run._id }).sort({ createdAt: 1 }).lean();
  res.json({
    run: { _id: run._id, status: run.status, date: run.date, startedAt: run.startedAt, endedAt: run.endedAt },
    staff,
    beat,
    detail: await runDetail(run, run.status !== "checked"),
    exceptions: run.status === "checked" ? exceptions : [],
  });
});

office.post("/evening/runs/:id/count", adminOnly, async (req, res) => {
  const body = parse(
    z.object({
      cashCountedPaise: z.number().int().min(0),
      paperBackBillIds: z.array(zId),
      chequesInHandIds: z.array(zId),
      nextUnusedReceipt: z.number().int().positive().optional(),
    }),
    req.body,
  );
  const run = await runToCheck(req);
  if (run.status !== "ended") throw rejected("This beat is not waiting for its evening check.");
  const staff = await Staff.findById(run.staffId);
  await runInTransaction(async () => {
    const cash = await confirmCashPayments({ runId: run._id });
    const expected = cash.reduce((s, p) => s + p.amountPaise, 0);
    run.expectedCashPaise = expected;
    run.countedCashPaise = body.cashCountedPaise;
    run.status = "checked";
    run.checkedBy = req.staff._id;
    run.checkedAt = new Date();

    const difference = body.cashCountedPaise - expected;
    if (difference === 0) {
      for (const payment of cash) await confirmPayment(payment, req.staff);
    } else {
      await raise(difference < 0 ? "cash_short" : "cash_over", `${staff?.name}: cash ${difference < 0 ? "short" : "over"} by ${formatRupees(Math.abs(difference))}`, {
        staffId: run.staffId,
        runId: run._id,
        amountPaise: Math.abs(difference),
      });
    }

    for (const cheque of await Payment.find({ runId: run._id, mode: "cheque", status: "claimed" })) {
      if (body.chequesInHandIds.includes(String(cheque._id))) {
        await confirmPayment(cheque, req.staff);
      } else {
        await raise("cheque_missing", `${staff?.name}: cheque ${cheque.chequeNo} was not handed in`, {
          staffId: run.staffId,
          runId: run._id,
          paymentId: cheque._id,
          amountPaise: cheque.amountPaise,
        });
      }
    }

    for (const entry of run.bills) {
      if (entry.notReceived) continue;
      const bill = await Bill.findById(entry.billId);
      if (!bill) continue;
      const back = body.paperBackBillIds.includes(String(entry.billId));
      entry.paperBack = back;
      if (back) {
        await paperReturned(bill, req.staff);
      } else {
        await raise("missing_bill", `${staff?.name} did not return bill ${bill.billNo}`, {
          staffId: run.staffId,
          runId: run._id,
          billId: bill._id,
          amountPaise: openPaise(bill),
        });
        await record(req.staff, "bill.missing", `Bill ${bill.billNo} not returned by ${staff?.name}`, { billIds: [bill._id], shopId: bill.shopId });
      }
    }

    if (run.issuedBy && sameId(run.issuedBy, req.staff._id)) {
      await raise("same_person_check", `${req.staff.name} both issued bills to and checked ${staff?.name}`, { staffId: req.staff._id, runId: run._id });
    }

    if (body.nextUnusedReceipt) {
      const book = await ReceiptBook.findOne({ staffId: run.staffId, closed: false });
      if (book) {
        const from = Math.max(book.checkedUpto + 1, book.fromSerial);
        const used = new Set(
          (await Payment.find({ receiptNo: { $gte: from, $lt: body.nextUnusedReceipt } }, "receiptNo").lean()).map((p) => p.receiptNo),
        );
        const gaps: number[] = [];
        for (let n = from; n < body.nextUnusedReceipt; n++) if (!used.has(n)) gaps.push(n);
        if (gaps.length > 0) {
          await raise("receipt_gap", `${staff?.name}: receipt page(s) ${gaps.join(", ")} used but not entered in the app`, { staffId: run.staffId, runId: run._id });
        }
        book.checkedUpto = body.nextUnusedReceipt - 1;
        await book.save();
      }
    }
    await run.save();
    await record(req.staff, "evening.checked", `Evening check done for ${staff?.name}: counted ${formatRupees(body.cashCountedPaise)}, expected ${formatRupees(expected)}`, {});
  });
  res.json({ ok: true });
});

async function tripDetail(trip: HydratedDocument<TripAttrs>, blind: boolean) {
  const [bills, shops] = await Promise.all([
    Bill.find({ _id: { $in: trip.bills.map((b) => b.billId) } }).lean(),
    Shop.find({ _id: { $in: trip.stops.map((s) => s.shopId) } }, "name").lean(),
  ]);
  return {
    blind,
    bills: trip.bills.map((entry) => {
      const bill = bills.find((b) => sameId(b._id, entry.billId))!;
      return {
        _id: bill._id,
        billNo: bill.billNo,
        kind: bill.kind,
        amountPaise: bill.amountPaise,
        shopName: shops.find((s) => sameId(s._id, entry.shopId))?.name,
        paperBack: entry.paperBack,
        ...(blind ? {} : { result: entry.result, reason: entry.reason, cashPaise: entry.cashPaise, photoId: entry.photoId }),
      };
    }),
    ...(blind ? {} : { expectedCashPaise: trip.expectedCashPaise, countedCashPaise: trip.countedCashPaise, godownCount: trip.godownCount }),
  };
}

office.get("/evening/trips/:id", adminOnly, async (req, res) => {
  const trip = await Trip.findById(param(req, "id"));
  if (!trip) throw notFound("Trip");
  const [driver, helper, beat, vehicle, exceptions] = await Promise.all([
    Staff.findById(trip.driverId, "name").lean(),
    Staff.findById(trip.helperId, "name").lean(),
    Beat.findById(trip.beatId, "name").lean(),
    Vehicle.findById(trip.vehicleId, "number").lean(),
    Exception.find({ tripId: trip._id }).sort({ createdAt: 1 }).lean(),
  ]);
  res.json({
    trip: { _id: trip._id, status: trip.status, date: trip.date, startOdometer: trip.startOdometer, endOdometer: trip.endOdometer, godownCountedAt: trip.godownCountedAt },
    driver,
    helper,
    beat,
    vehicle,
    detail: await tripDetail(trip, trip.status !== "checked"),
    exceptions: trip.status === "checked" ? exceptions : [],
  });
});

office.post("/evening/trips/:id/count", adminOnly, async (req, res) => {
  const body = parse(z.object({ cashCountedPaise: z.number().int().min(0), paperBackBillIds: z.array(zId) }), req.body);
  const trip = await Trip.findById(param(req, "id"));
  if (!trip) throw notFound("Trip");
  if (trip.status !== "ended") throw rejected("This trip is not waiting for its evening check.");
  const driver = await Staff.findById(trip.driverId);
  await runInTransaction(async () => {
    const cash = await confirmCashPayments({ tripId: trip._id });
    const expected = cash.reduce((s, p) => s + p.amountPaise, 0);
    trip.expectedCashPaise = expected;
    trip.countedCashPaise = body.cashCountedPaise;
    trip.status = "checked";
    trip.checkedBy = req.staff._id;
    trip.checkedAt = new Date();
    const difference = body.cashCountedPaise - expected;
    if (difference === 0) {
      for (const payment of cash) await confirmPayment(payment, req.staff);
    } else {
      await raise(difference < 0 ? "cash_short" : "cash_over", `${driver?.name}: delivery cash ${difference < 0 ? "short" : "over"} by ${formatRupees(Math.abs(difference))}`, {
        staffId: trip.driverId,
        tripId: trip._id,
        amountPaise: Math.abs(difference),
      });
    }
    for (const entry of trip.bills) {
      const bill = await Bill.findById(entry.billId);
      if (!bill) continue;
      const back = body.paperBackBillIds.includes(String(entry.billId));
      entry.paperBack = back;
      if (entry.result === "not_delivered") {
        bill.stage = "billed";
        bill.holderLabel = "Office";
        await bill.save();
        await record(req.staff, "bill.returned_undelivered", `Bill ${bill.billNo} back in office, undelivered`, { billIds: [bill._id], shopId: bill.shopId });
        continue;
      }
      if (back) {
        await paperReturned(bill, req.staff);
      } else {
        await raise("paper_missing", `Signed copy of ${bill.billNo} did not come back from ${driver?.name}`, {
          staffId: trip.driverId,
          tripId: trip._id,
          billId: bill._id,
        });
      }
    }
    await trip.save();
    await record(req.staff, "evening.checked", `Evening check done for ${driver?.name}'s trip: counted ${formatRupees(body.cashCountedPaise)}, expected ${formatRupees(expected)}`, {});
  });
  res.json({ ok: true });
});

// ---------- UPI ----------

office.get("/upi", adminOnly, async (_req, res) => {
  const items = await Payment.find({ mode: "upi" }).sort({ createdAt: -1 }).limit(100).populate("shopId", "name").populate("staffId", "name").populate("allocations.billId", "billNo").lean();
  res.json({ items });
});

office.post("/payments/:id/match", adminOnly, async (req, res) => {
  const payment = await Payment.findById(param(req, "id"));
  if (!payment || payment.mode !== "upi") throw notFound("UPI payment");
  if (payment.status !== "claimed") throw rejected("This payment is not waiting for a bank match.");
  await runInTransaction(async () => {
    await confirmPayment(payment, req.staff);
    for (const a of payment.allocations) await settleBill(a.billId);
  });
  res.json({ ok: true });
});

office.post("/payments/:id/reject", adminOnly, async (req, res) => {
  const body = parse(z.object({ reason: z.string().trim().min(3, "Write a reason") }), req.body);
  const payment = await Payment.findById(param(req, "id"));
  if (!payment || payment.mode !== "upi") throw notFound("UPI payment");
  if (payment.status !== "claimed") throw rejected("This payment is not waiting for a bank match.");
  await runInTransaction(async () => {
    await rejectPayment(payment, req.staff, body.reason);
    await raise("cash_short", `UPI ${formatRupees(payment.amountPaise)} (${payment.upiTransactionRef}) was not found in the bank`, {
      staffId: payment.staffId,
      amountPaise: payment.amountPaise,
      status: "resolved",
      resolvedBy: req.staff._id,
      resolution: body.reason,
    });
  });
  res.json({ ok: true });
});

// ---------- Cheque diary ----------

office.get("/cheques", oversight, async (_req, res) => {
  const items = await Payment.find({ mode: "cheque" }).sort({ chequeDate: 1 }).populate("shopId", "name").populate("staffId", "name").populate("allocations.billId", "billNo").lean();
  res.json({ items, today: businessDate() });
});

office.post("/cheques/:id/status", adminOnly, async (req, res) => {
  const body = parse(z.object({ status: z.enum(["deposited", "cleared", "bounced"]), reason: z.string().trim().optional() }), req.body);
  const cheque = await Payment.findById(param(req, "id"));
  if (!cheque || cheque.mode !== "cheque") throw notFound("Cheque");
  if (cheque.status === "claimed") throw rejected("Confirm this cheque at the evening check first.");
  const order = { received: ["deposited"], deposited: ["cleared", "bounced"] } as Record<string, string[]>;
  if (!order[cheque.chequeStatus ?? ""]?.includes(body.status)) throw rejected(`A ${cheque.chequeStatus} cheque cannot be marked ${body.status}.`);
  if (body.status === "deposited" && cheque.chequeDate && cheque.chequeDate > businessDate()) {
    throw rejected(`This cheque is dated ${cheque.chequeDate} and cannot be deposited yet.`);
  }
  if (body.status === "bounced" && !body.reason) throw rejected("Write why the cheque bounced.");
  await runInTransaction(async () => {
    if (body.status === "bounced") {
      await bounceCheque(cheque, req.staff, body.reason!);
    } else {
      cheque.chequeStatus = body.status;
      await cheque.save();
      await record(req.staff, `cheque.${body.status}`, `Cheque ${cheque.chequeNo} ${body.status}`, {
        billIds: cheque.allocations.map((a) => a.billId),
        shopId: cheque.shopId,
      });
    }
  });
  res.json({ ok: true });
});

// ---------- Marg list ----------

office.get("/marg", adminOnly, async (_req, res) => {
  const [pending, done] = await Promise.all([
    MargTask.find({ status: "pending" }).sort({ createdAt: 1 }).populate("billIds", "billNo").lean(),
    MargTask.find({ status: "done" }).sort({ doneAt: -1 }).limit(20).populate("billIds", "billNo").populate("doneBy", "name").lean(),
  ]);
  res.json({ pending, done });
});

office.post("/marg/:id/done", adminOnly, async (req, res) => {
  const body = parse(z.object({ actualAmountPaise: zPaise.optional() }), req.body);
  const task = await MargTask.findById(param(req, "id"));
  if (!task) throw notFound("Marg entry");
  if (task.status !== "pending") throw rejected("This entry is already ticked.");
  await runInTransaction(async () => {
    if (task.kind === "credit_note" && body.actualAmountPaise && body.actualAmountPaise !== task.amountPaise) {
      const difference = body.actualAmountPaise - task.amountPaise;
      await Bill.updateOne({ _id: task.billIds[0] }, { $inc: { amountPaise: -difference } });
      task.amountPaise = body.actualAmountPaise;
    }
    task.status = "done";
    task.doneBy = req.staff._id;
    task.doneAt = new Date();
    await task.save();
    await record(req.staff, "marg.done", `Entered in Marg: ${task.description}`, { billIds: task.billIds });
    for (const billId of task.billIds) await settleBill(billId);
    await reopenBills(task.billIds);
  });
  res.json({ ok: true });
});

// ---------- Discounts ----------

office.get("/adjustments", adminOnly, async (_req, res) => {
  const items = await Adjustment.find({ status: "pending" }).sort({ createdAt: 1 }).populate("billId", "billNo amountPaise").populate("shopId", "name").populate("staffId", "name").lean();
  res.json({ items });
});

office.post("/adjustments/:id/decide", adminOnly, async (req, res) => {
  const body = parse(z.object({ approve: z.boolean(), note: z.string().trim().default("") }), req.body);
  const item = await Adjustment.findById(param(req, "id"));
  if (!item) throw notFound("Adjustment");
  if (item.status !== "pending") throw rejected("This has already been decided.");
  if (item.kind === "goods_return") throw rejected("Goods returns are decided when godown receives the goods.");
  if (!body.approve && !body.note) throw rejected("Write why this is rejected.");
  await decideAdjustment(item, body.approve, body.note, req);
  res.json({ ok: true });
});

export async function decideAdjustment(
  item: HydratedDocument<AdjustmentAttrs>,
  approve: boolean,
  note: string,
  req: Request,
) {
  await runInTransaction(async () => {
    item.status = approve ? "approved" : "rejected";
    item.decidedBy = req.staff._id;
    item.decidedAt = new Date();
    item.decisionNote = note;
    await item.save();
    const bill = await Bill.findById(item.billId);
    if (!bill) return;
    const label = item.kind === "cash_discount" ? "Cash discount" : "Goods return";
    if (approve) {
      await addMargTask(item.kind, `Enter ${label.toLowerCase()} on ${bill.billNo}`, item.amountPaise, [bill._id]);
    } else {
      bill.adjustedPaise -= item.amountPaise;
      await bill.save();
      await reopenBills([bill._id]);
    }
    await Exception.updateMany(
      { type: "discount_review", billId: bill._id, status: "open" },
      { status: "resolved", resolvedBy: req.staff._id, resolvedAt: new Date(), resolution: approve ? "Approved" : `Rejected: ${note}` },
    );
    await record(req.staff, `adjustment.${approve ? "approved" : "rejected"}`, `${label} of ${formatRupees(item.amountPaise)} on ${bill.billNo} ${approve ? "approved" : "rejected"}`, {
      billIds: [bill._id],
      shopId: bill.shopId,
      reason: note,
    });
  });
}

// ---------- Fuel ----------

office.get("/fuel", oversight, async (_req, res) => {
  const [entries, advances, drivers, vehicles] = await Promise.all([
    FuelEntry.find().sort({ createdAt: -1 }).limit(50).populate("staffId", "name").populate("vehicleId", "number normalKmPerLitre").lean(),
    CashAdvance.find().sort({ createdAt: -1 }).limit(30).populate("staffId", "name").populate("vehicleId", "number").lean(),
    Staff.find({ role: "driver", active: true }, "name").lean(),
    Vehicle.find({}, "number").lean(),
  ]);
  res.json({ entries, advances, drivers, vehicles });
});

office.post("/fuel/:id/review", adminOnly, async (req, res) => {
  const body = parse(z.object({ accept: z.boolean(), note: z.string().trim().default("") }), req.body);
  const entry = await FuelEntry.findById(param(req, "id"));
  if (!entry) throw notFound("Fuel entry");
  if (entry.status !== "submitted") throw rejected("This entry has already been reviewed.");
  if (!body.accept && !body.note) throw rejected("Write why this is rejected.");
  entry.status = body.accept ? "accepted" : "rejected";
  entry.reviewNote = body.note;
  await entry.save();
  await record(req.staff, `fuel.${entry.status}`, `Fuel bill ${entry.pumpBillNo} ${entry.status}`, { reason: body.note });
  res.json({ ok: true });
});

office.post("/advances", adminOnly, async (req, res) => {
  const body = parse(z.object({ staffId: zId, vehicleId: zId, amountPaise: zPaise }), req.body);
  if (await CashAdvance.exists({ staffId: body.staffId, status: "open" })) {
    throw rejected("This driver already has an advance that is not settled.");
  }
  await CashAdvance.create({ ...body, givenBy: req.staff._id });
  await record(req.staff, "advance.given", `Fuel advance of ${formatRupees(body.amountPaise)} given`);
  res.json({ ok: true });
});

office.post("/advances/:id/settle", adminOnly, async (req, res) => {
  const body = parse(z.object({ returnedPaise: z.number().int().min(0) }), req.body);
  const advance = await CashAdvance.findById(param(req, "id"));
  if (!advance) throw notFound("Advance");
  if (advance.status !== "open") throw rejected("This advance is already settled.");
  const bills = await FuelEntry.find({ advanceId: advance._id, status: { $ne: "rejected" } }, "amountPaise").lean();
  const billed = bills.reduce((s, b) => s + b.amountPaise, 0);
  if (billed + body.returnedPaise !== advance.amountPaise) {
    throw rejected(`Fuel bills of ${formatRupees(billed)} plus cash returned must equal the ${formatRupees(advance.amountPaise)} advance.`);
  }
  advance.status = "settled";
  advance.returnedPaise = body.returnedPaise;
  advance.settledAt = new Date();
  await advance.save();
  await record(req.staff, "advance.settled", `Advance of ${formatRupees(advance.amountPaise)} settled, ${formatRupees(body.returnedPaise)} returned`);
  res.json({ ok: true });
});

// ---------- Receipt books ----------

office.get("/receipt-books", adminOnly, async (_req, res) => {
  const [books, staff] = await Promise.all([
    ReceiptBook.find().sort({ fromSerial: 1 }).populate("staffId", "name").lean(),
    Staff.find({ role: { $in: ["salesman", "collection_agent"] }, active: true }, "name").sort({ name: 1 }).lean(),
  ]);
  res.json({ books, staff });
});

office.post("/receipt-books", adminOnly, async (req, res) => {
  const body = parse(z.object({ staffId: zId, fromSerial: z.number().int().positive(), toSerial: z.number().int().positive() }), req.body);
  if (body.toSerial < body.fromSerial) throw rejected("Last page must be after the first page.");
  const overlap = await ReceiptBook.exists({ fromSerial: { $lte: body.toSerial }, toSerial: { $gte: body.fromSerial } });
  if (overlap) throw rejected("These page numbers overlap with a book already issued.");
  await ReceiptBook.create(body);
  await record(req.staff, "receipt_book.issued", `Receipt book ${body.fromSerial} to ${body.toSerial} issued`);
  res.json({ ok: true });
});

// ---------- Shop locations ----------

office.get("/location-requests", adminOnly, async (_req, res) => {
  const items = await Shop.find({ locationRequest: { $ne: null } }).populate("locationRequest.staffId", "name").lean();
  res.json({ items });
});

office.post("/shops/:id/location-decision", adminOnly, async (req, res) => {
  const body = parse(z.object({ approve: z.boolean() }), req.body);
  const shop = await Shop.findById(param(req, "id"));
  if (!shop?.locationRequest) throw notFound("Location request");
  const request = shop.locationRequest;
  if (body.approve) shop.location = { lat: request.lat, lng: request.lng };
  shop.locationRequest = null;
  await shop.save();
  await record(req.staff, `shop.location_${body.approve ? "approved" : "rejected"}`, `Location change for ${shop.name} ${body.approve ? "approved" : "rejected"}`, { shopId: shop._id });
  res.json({ ok: true });
});

// ---------- Masters and settings ----------

const zMasters = {
  staff: z.object({ name: z.string().trim().min(2), phone: z.string().trim().default(""), role: z.enum(ROLES), active: z.boolean().default(true) }),
  beats: z.object({ name: z.string().trim().min(2), plannedMinutes: z.number().int().positive().default(300), plannedKm: z.number().positive().default(40) }),
  shops: z.object({ name: z.string().trim().min(2), phone: z.string().trim().default(""), address: z.string().trim().default(""), beatId: zId, sequence: z.number().int().positive() }),
  products: z.object({ name: z.string().trim().min(2), unit: z.string().trim().default("box"), priority: z.number().int().positive(), ratePaise: z.number().int().min(0).default(0), active: z.boolean().default(true) }),
  vehicles: z.object({ number: z.string().trim().min(2), normalKmPerLitre: z.number().positive().default(12) }),
};
type MasterKind = keyof typeof zMasters;

function masterModel(kind: string) {
  const models = { staff: Staff, beats: Beat, shops: Shop, products: Product, vehicles: Vehicle } as Record<string, unknown>;
  const model = models[kind];
  if (!model) throw notFound("List");
  return model as typeof Staff;
}

office.get("/masters", adminOnly, async (_req, res) => {
  const [staff, beats, shops, products, vehicles, plans] = await Promise.all([
    Staff.find().sort({ role: 1, name: 1 }).lean(),
    Beat.find().sort({ name: 1 }).lean(),
    Shop.find().sort({ beatId: 1, sequence: 1 }).populate("beatId", "name").lean(),
    Product.find().sort({ priority: 1 }).lean(),
    Vehicle.find().sort({ number: 1 }).lean(),
    BeatPlan.find().lean(),
  ]);
  res.json({ staff, beats, shops, products, vehicles, plans });
});

office.post("/masters/:kind", adminOnly, async (req, res) => {
  const kind = param(req, "kind") as MasterKind;
  if (!zMasters[kind]) throw notFound("List");
  const body = parse(zMasters[kind], req.body) as object;
  const doc = await masterModel(kind).create(body as never);
  await record(req.staff, `master.${kind}.created`, `Added to ${kind}: ${(body as { name?: string; number?: string }).name ?? (body as { number?: string }).number}`);
  res.json({ _id: (doc as unknown as { _id: unknown })._id });
});

office.patch("/masters/:kind/:id", adminOnly, async (req, res) => {
  const kind = param(req, "kind") as MasterKind;
  if (!zMasters[kind]) throw notFound("List");
  const body = parse(zMasters[kind].partial() as z.ZodType, req.body) as object;
  const doc = await masterModel(kind).findByIdAndUpdate(param(req, "id"), body, { new: true });
  if (!doc) throw notFound("Record");
  await record(req.staff, `master.${kind}.updated`, `Updated in ${kind}: ${(doc as unknown as { name?: string; number?: string }).name ?? (doc as unknown as { number?: string }).number}`, { data: body });
  res.json({ ok: true });
});

office.post("/beat-plans", adminOnly, async (req, res) => {
  const body = parse(z.object({ staffId: zId, weekday: z.number().int().min(0).max(6), beatId: zId.nullable() }), req.body);
  if (body.beatId) {
    await BeatPlan.updateOne({ staffId: body.staffId, weekday: body.weekday }, { beatId: body.beatId }, { upsert: true });
  } else {
    await BeatPlan.deleteOne({ staffId: body.staffId, weekday: body.weekday });
  }
  await record(req.staff, "beat_plan.updated", "Weekly beat plan changed", { data: body });
  res.json({ ok: true });
});

office.get("/settings", adminOnly, async (_req, res) => {
  res.json(await getSettings());
});

office.patch("/settings", adminOnly, async (req, res) => {
  const body = parse(
    z.object({
      checkInRadiusMeters: z.number().int().min(20),
      discountLimitPercent: z.number().min(0).max(100).nullable(),
      maxStopMinutes: z.number().int().positive(),
      maxGapMinutes: z.number().int().positive(),
      mileageTolerancePercent: z.number().min(0).max(100),
      lateEntryMinutes: z.number().int().positive(),
      firmName: z.string().trim(),
      firmUpiId: z.string().trim(),
    }).partial(),
    req.body,
  );
  await getSettings();
  await Settings.updateOne({}, body);
  await record(req.staff, "settings.updated", "Settings changed", { data: body });
  res.json({ ok: true });
});
