import {
  Adjustment,
  Beat,
  BeatPlan,
  BeatRun,
  type BeatRunAttrs,
  Bill,
  Exception,
  Order,
  Payment,
  Photo,
  Product,
  ReceiptBook,
  Shop,
  Visit,
  type VisitAttrs,
  nextCounter,
  runInTransaction,
} from "@repo/db";
import {
  NO_ORDER_REASONS,
  SKIP_REASONS,
  allocateOldestFirst,
  businessDate,
  businessWeekday,
  buildUpiUrl,
  distanceMeters,
  formatRupees,
} from "@repo/shared";
import { Router, type Request } from "express";
import type { HydratedDocument, Types } from "mongoose";
import { z } from "zod";
import { allow, notFound, param, parse, rejected, zDate, zGps, zId, zPaise } from "../http.js";
import { type GpsPoint, addMargTask, getSettings, openPaise, raise, record, rejectPayment, sameId } from "../services.js";

export const field: Router = Router();
field.use(allow("salesman", "collection_agent"));

type RunDoc = HydratedDocument<BeatRunAttrs>;
type VisitDoc = HydratedDocument<VisitAttrs>;

/** Creates today's beat from the weekly plan the first time anyone needs it. */
export async function ensureRun(staffId: Types.ObjectId, date = businessDate()) {
  const existing = await BeatRun.findOne({ date, staffId });
  if (existing) return existing;
  const plan = await BeatPlan.findOne({ staffId, weekday: businessWeekday(date) });
  if (!plan) return null;
  return BeatRun.create({ date, staffId, beatId: plan.beatId });
}

async function ownRun(req: Request): Promise<RunDoc> {
  const run = await BeatRun.findById(param(req, "id"));
  if (!run || !sameId(run.staffId, req.staff._id)) throw notFound("Beat");
  return run;
}

async function ownVisit(req: Request): Promise<{ visit: VisitDoc; run: RunDoc }> {
  const visit = await Visit.findById(param(req, "id"));
  if (!visit || !sameId(visit.staffId, req.staff._id)) throw notFound("Visit");
  const run = await BeatRun.findById(visit.runId);
  if (!run) throw notFound("Beat");
  return { visit, run };
}

function mustBeInShop(visit: VisitDoc) {
  if (visit.status !== "checked_in") throw rejected("Check in at this shop first.");
}

async function flagIfLate(req: Request, deviceAt: Date | undefined, what: string, runId: unknown) {
  if (!deviceAt) return;
  const settings = await getSettings();
  const delayMinutes = (Date.now() - deviceAt.getTime()) / 60000;
  if (delayMinutes > settings.lateEntryMinutes) {
    await raise("late_entry", `${req.staff.name}: ${what} reached the office ${Math.round(delayMinutes)} minutes late`, {
      staffId: req.staff._id,
      runId: runId as string,
    });
  }
}

const billsForShop = async (run: RunDoc, shopId: unknown) => {
  const ids = run.bills.filter((b) => sameId(b.shopId, shopId) && b.acceptedAt).map((b) => b.billId);
  return Bill.find({ _id: { $in: ids }, stage: "with_collector" }).sort({ billDate: 1, billNo: 1 });
};

function setOutcome(run: RunDoc, billId: unknown, outcome: string) {
  const entry = run.bills.find((b) => sameId(b.billId, billId));
  if (entry) entry.outcome = outcome;
}

field.get("/today", async (req, res) => {
  const date = businessDate();
  const run = await ensureRun(req.staff._id, date);
  if (!run) {
    res.json({ date, run: null });
    return;
  }
  const [beat, shops, visits, bills, payments, orders, exceptions, book] = await Promise.all([
    Beat.findById(run.beatId).lean(),
    Shop.find({ beatId: run.beatId }).sort({ sequence: 1 }).lean(),
    Visit.find({ runId: run._id }).lean(),
    Bill.find({ _id: { $in: run.bills.map((b) => b.billId) } }).sort({ billDate: 1 }).lean(),
    Payment.find({ runId: run._id, status: { $nin: ["cancelled", "rejected"] } }).lean(),
    Order.countDocuments({ visitId: { $in: await Visit.find({ runId: run._id }).distinct("_id") } }),
    Exception.find({ staffId: req.staff._id, status: "open" }).sort({ createdAt: -1 }).lean(),
    openBookFor(req.staff._id),
  ]);
  const rows = shops.map((shop) => {
    const shopBills = bills.filter((b) => sameId(b.shopId, shop._id));
    return {
      shop,
      visit: visits.find((v) => sameId(v.shopId, shop._id)) ?? null,
      billCount: shopBills.length,
      pendingPaise: shopBills.reduce((sum, b) => sum + openPaise(b), 0),
    };
  });
  const total = (mode: string) => payments.filter((p) => p.mode === mode).reduce((s, p) => s + p.amountPaise, 0);
  res.json({
    date,
    run: run.toObject(),
    beat,
    shops: rows,
    bills: bills.map((b) => ({
      ...b,
      openPaise: openPaise(b),
      shopName: shops.find((s) => sameId(s._id, b.shopId))?.name,
      entry: run.bills.find((e) => sameId(e.billId, b._id)),
    })),
    exceptions,
    receiptBook: book,
    totals: { cashPaise: total("cash"), chequePaise: total("cheque"), upiPaise: total("upi"), orders },
  });
});

async function openBookFor(staffId: Types.ObjectId) {
  const book = await ReceiptBook.findOne({ staffId, closed: false }).sort({ fromSerial: 1 }).lean();
  if (!book) return null;
  const last = await Payment.findOne({ receiptNo: { $gte: book.fromSerial, $lte: book.toSerial } })
    .sort({ receiptNo: -1 })
    .lean();
  return { ...book, nextSerial: (last?.receiptNo ?? book.fromSerial - 1) + 1 };
}

field.post("/runs/:id/accept", async (req, res) => {
  const body = parse(z.object({ notReceivedBillIds: z.array(zId).default([]) }), req.body);
  const run = await ownRun(req);
  if (run.status !== "issued") throw rejected("There are no bills waiting to be accepted.");
  await runInTransaction(async () => {
    const now = new Date();
    for (const entry of run.bills) {
      const bill = await Bill.findById(entry.billId);
      if (!bill) continue;
      if (body.notReceivedBillIds.includes(String(entry.billId))) {
        entry.notReceived = true;
        bill.stage = "in_file";
        bill.holderStaffId = null;
        bill.holderLabel = "Office";
        await bill.save();
        await raise("bill_not_handed", `${req.staff.name} says bill ${bill.billNo} was not handed over`, {
          staffId: req.staff._id,
          runId: run._id,
          billId: bill._id,
        });
        await record(req.staff, "bill.not_received", `Bill ${bill.billNo} marked not received`, {
          billIds: [bill._id],
          shopId: bill.shopId,
        });
      } else {
        entry.acceptedAt = now;
        bill.stage = "with_collector";
        bill.holderStaffId = req.staff._id;
        bill.holderLabel = req.staff.name;
        await bill.save();
        await record(req.staff, "bill.accepted", `Bill ${bill.billNo} accepted by ${req.staff.name}`, {
          billIds: [bill._id],
          shopId: bill.shopId,
        });
      }
    }
    run.status = "accepted";
    await run.save();
  });
  res.json({ ok: true });
});

const gpsBody = z.object({ gps: zGps, deviceAt: z.coerce.date().optional() });

field.post("/runs/:id/start", async (req, res) => {
  const body = parse(gpsBody, req.body);
  const run = await ownRun(req);
  if (!["planned", "accepted"].includes(run.status)) {
    throw rejected(run.status === "issued" ? "Accept your bills before starting." : "This beat has already started.");
  }
  run.status = "started";
  run.startedAt = new Date();
  run.startGps = body.gps;
  await run.save();
  await record(req.staff, "beat.started", `${req.staff.name} started the beat`, { gps: body.gps, deviceAt: body.deviceAt });
  await flagIfLate(req, body.deviceAt, "beat start", run._id);
  res.json({ ok: true });
});

field.post("/runs/:id/end", async (req, res) => {
  const body = parse(gpsBody, req.body);
  const run = await ownRun(req);
  if (run.status !== "started") throw rejected("This beat is not running.");
  const [shops, visits, openQr] = await Promise.all([
    Shop.find({ beatId: run.beatId }, "_id").lean(),
    Visit.find({ runId: run._id }).lean(),
    Payment.countDocuments({ runId: run._id, status: "qr_shown" }),
  ]);
  if (visits.some((v) => v.status === "checked_in")) throw rejected("Check out of the current shop first.");
  if (openQr > 0) throw rejected("A UPI QR is still open. Confirm it or cancel it first.");
  const remaining = shops.length - visits.length;
  if (remaining > 0) throw rejected(`${remaining} shop(s) still need a visit or a skip reason.`);

  run.status = "ended";
  run.endedAt = new Date();
  run.endGps = body.gps;
  await run.save();
  await record(req.staff, "beat.ended", `${req.staff.name} ended the beat`, { gps: body.gps, deviceAt: body.deviceAt });
  const beat = await Beat.findById(run.beatId);
  if (beat && run.startedAt) {
    const minutes = Math.round((run.endedAt.getTime() - run.startedAt.getTime()) / 60000);
    if (minutes > beat.plannedMinutes) {
      await raise("beat_overrun", `${req.staff.name} took ${minutes} minutes against ${beat.plannedMinutes} planned`, {
        staffId: req.staff._id,
        runId: run._id,
      });
    }
  }
  res.json({ ok: true });
});

field.post("/runs/:id/skip", async (req, res) => {
  const body = parse(
    z.object({ shopId: zId, reason: z.enum(SKIP_REASONS), gps: zGps }),
    req.body,
  );
  const run = await ownRun(req);
  if (run.status !== "started") throw rejected("Start the beat first.");
  const shop = await Shop.findOne({ _id: body.shopId, beatId: run.beatId });
  if (!shop) throw notFound("Shop");
  await Visit.create({
    runId: run._id,
    shopId: shop._id,
    staffId: req.staff._id,
    status: "skipped",
    skipReason: body.reason,
    checkInGps: body.gps,
    checkInAt: new Date(),
  });
  for (const entry of run.bills) {
    if (sameId(entry.shopId, shop._id) && entry.acceptedAt) entry.outcome = "returned_as_is";
  }
  await run.save();
  await raise("skipped_shop", `${req.staff.name} skipped ${shop.name}: ${body.reason}`, { staffId: req.staff._id, runId: run._id });
  await record(req.staff, "visit.skipped", `${shop.name} skipped`, { shopId: shop._id, gps: body.gps, reason: body.reason });
  res.json({ ok: true });
});

field.post("/runs/:id/visits", async (req, res) => {
  const body = parse(gpsBody.extend({ shopId: zId }), req.body);
  const run = await ownRun(req);
  if (run.status !== "started") throw rejected("Start the beat first.");
  const shop = await Shop.findOne({ _id: body.shopId, beatId: run.beatId });
  if (!shop) throw notFound("Shop");
  const visits = await Visit.find({ runId: run._id }).sort({ checkInAt: 1 });
  if (visits.some((v) => v.status === "checked_in")) throw rejected("Check out of the current shop first.");
  if (visits.some((v) => sameId(v.shopId, shop._id))) throw rejected("This shop is already done for today.");

  const settings = await getSettings();
  let distance: number | null = null;
  if (shop.location?.lat != null && shop.location.lng != null) {
    distance = distanceMeters(body.gps, { lat: shop.location.lat, lng: shop.location.lng });
    if (distance > settings.checkInRadiusMeters) {
      await raise("outside_shop", `${req.staff.name} tried to check in at ${shop.name} from ${distance} m away`, {
        staffId: req.staff._id,
        runId: run._id,
      });
      await record(req.staff, "visit.blocked", `Check-in at ${shop.name} refused, ${distance} m away`, {
        shopId: shop._id,
        gps: body.gps,
      });
      throw rejected(`You are ${distance} m from ${shop.name}. Check-in works within ${settings.checkInRadiusMeters} m.`, "outside_shop");
    }
  } else {
    shop.location = body.gps;
    await shop.save();
    await record(req.staff, "shop.location_captured", `Location saved and locked for ${shop.name}`, { shopId: shop._id, gps: body.gps });
  }

  const shops = await Shop.find({ beatId: run.beatId }).sort({ sequence: 1 }).lean();
  const done = new Set(visits.map((v) => String(v.shopId)));
  const expected = shops.find((s) => !done.has(String(s._id)));
  if (expected && !sameId(expected._id, shop._id)) {
    await raise("out_of_sequence", `${req.staff.name} went to ${shop.name} before ${expected.name}`, { staffId: req.staff._id, runId: run._id });
  }

  const previous = visits.filter((v) => v.status === "checked_out").at(-1);
  if (previous?.checkOutAt) {
    const gapMinutes = (Date.now() - previous.checkOutAt.getTime()) / 60000;
    if (gapMinutes > settings.maxGapMinutes) {
      await raise("long_gap", `${req.staff.name} took ${Math.round(gapMinutes)} minutes to reach ${shop.name}`, { staffId: req.staff._id, runId: run._id });
    }
    const point = previous.checkOutGps ?? previous.checkInGps;
    if (point?.lat != null && point.lng != null && gapMinutes > 0) {
      const km = distanceMeters(body.gps, { lat: point.lat, lng: point.lng }) / 1000;
      if (km / (gapMinutes / 60) > 120 && km > 1) {
        await raise("speed_jump", `${req.staff.name} moved ${km.toFixed(1)} km in ${gapMinutes.toFixed(0)} minutes before ${shop.name}`, { staffId: req.staff._id, runId: run._id });
      }
    }
  }

  const visit = await Visit.create({
    runId: run._id,
    shopId: shop._id,
    staffId: req.staff._id,
    status: "checked_in",
    checkInAt: new Date(),
    checkInGps: body.gps,
    checkInDistanceM: distance,
  });
  await record(req.staff, "visit.checked_in", `Checked in at ${shop.name}`, { shopId: shop._id, gps: body.gps, deviceAt: body.deviceAt });
  await flagIfLate(req, body.deviceAt, `check-in at ${shop.name}`, run._id);
  res.json({ visitId: visit._id });
});

field.post("/shops/:id/location-request", async (req, res) => {
  const body = parse(z.object({ gps: zGps, reason: z.string().trim().min(3) }), req.body);
  const shop = await Shop.findById(param(req, "id"));
  if (!shop) throw notFound("Shop");
  shop.locationRequest = { lat: body.gps.lat, lng: body.gps.lng, staffId: req.staff._id, at: new Date(), reason: body.reason };
  await shop.save();
  await record(req.staff, "shop.location_requested", `Location change requested for ${shop.name}`, { shopId: shop._id, gps: body.gps, reason: body.reason });
  res.json({ ok: true });
});

field.get("/visits/:id", async (req, res) => {
  const { visit, run } = await ownVisit(req);
  const [shop, bills, products, order, payments, adjustments, book, settings, lastOrder] = await Promise.all([
    Shop.findById(visit.shopId).lean(),
    billsForShop(run, visit.shopId),
    Product.find({ active: true }).sort({ priority: 1 }).lean(),
    visit.orderId ? Order.findById(visit.orderId).lean() : null,
    Payment.find({ visitId: visit._id }).sort({ createdAt: 1 }).lean(),
    Adjustment.find({ visitId: visit._id }).sort({ createdAt: 1 }).lean(),
    openBookFor(req.staff._id),
    getSettings(),
    Order.findOne({ shopId: visit.shopId, visitId: { $ne: visit._id } }).sort({ createdAt: -1 }).lean(),
  ]);
  const lastQty = new Map((lastOrder?.lines ?? []).map((l) => [String(l.productId), l.quantity] as const));
  res.json({
    visit: visit.toObject(),
    runStatus: run.status,
    shop,
    bills: bills.map((b) => ({
      ...b.toObject(),
      openPaise: openPaise(b),
      outcome: run.bills.find((e) => sameId(e.billId, b._id))?.outcome ?? null,
    })),
    products: products.map((p) => ({ ...p, lastQty: lastQty.get(String(p._id)) ?? null })),
    order,
    payments,
    adjustments,
    receiptBook: book,
    firm: { name: settings.firmName, upiConfigured: Boolean(settings.firmUpiId) },
  });
});

field.post("/visits/:id/checkout", async (req, res) => {
  const body = parse(gpsBody, req.body);
  const { visit, run } = await ownVisit(req);
  mustBeInShop(visit);
  if (req.staff.role === "salesman" && !visit.orderId && !visit.noOrderReason) {
    throw rejected("Create the order or record why there is no order before leaving.");
  }
  const openQr = await Payment.countDocuments({ visitId: visit._id, status: "qr_shown" });
  if (openQr > 0) throw rejected("A UPI QR is still open. Confirm it or cancel it first.");
  const bills = await billsForShop(run, visit.shopId);
  const unresolved = bills.filter((b) => !run.bills.find((e) => sameId(e.billId, b._id))?.outcome);
  if (unresolved.length > 0) {
    throw rejected(`Record a result for ${unresolved.map((b) => b.billNo).join(", ")} before leaving.`);
  }
  visit.status = "checked_out";
  visit.checkOutAt = new Date();
  visit.checkOutGps = body.gps;
  await visit.save();
  const shop = await Shop.findById(visit.shopId);
  await record(req.staff, "visit.checked_out", `Checked out of ${shop?.name ?? "shop"}`, { shopId: visit.shopId, gps: body.gps, deviceAt: body.deviceAt });
  const settings = await getSettings();
  const minutes = visit.checkInAt ? (visit.checkOutAt.getTime() - visit.checkInAt.getTime()) / 60000 : 0;
  if (minutes > settings.maxStopMinutes) {
    await raise("long_stop", `${req.staff.name} spent ${Math.round(minutes)} minutes at ${shop?.name ?? "shop"}`, { staffId: req.staff._id, runId: run._id });
  }
  await flagIfLate(req, body.deviceAt, "check-out", run._id);
  res.json({ ok: true });
});

field.post("/visits/:id/order", allow("salesman"), async (req, res) => {
  const body = parse(
    z.object({
      clientRef: z.string().min(8),
      lines: z.array(z.object({ productId: zId, quantity: z.number().positive() })).min(1, "Add at least one product"),
    }),
    req.body,
  );
  const { visit, run } = await ownVisit(req);
  mustBeInShop(visit);
  if (visit.orderId) throw rejected("An order is already saved for this visit.");
  const products = await Product.find({ _id: { $in: body.lines.map((l) => l.productId) } }).lean();
  const lines = body.lines.map((line) => {
    const product = products.find((p) => sameId(p._id, line.productId));
    if (!product) throw notFound("Product");
    return { productId: product._id, name: product.name, unit: product.unit, quantity: line.quantity, ratePaise: product.ratePaise };
  });
  const orderNo = await nextCounter("order");
  await runInTransaction(async () => {
    const [order] = await Order.create(
      [{ orderNo, shopId: visit.shopId, beatId: run.beatId, staffId: req.staff._id, visitId: visit._id, lines, clientRef: body.clientRef }],
      { ordered: true },
    );
    visit.orderId = order!._id;
    visit.noOrderReason = null;
    await visit.save();
    await record(req.staff, "order.created", `Order ${orderNo} created with ${lines.length} item(s)`, { shopId: visit.shopId });
  });
  res.json({ ok: true });
});

field.post("/visits/:id/no-order", allow("salesman"), async (req, res) => {
  const body = parse(z.object({ reason: z.enum(NO_ORDER_REASONS) }), req.body);
  const { visit } = await ownVisit(req);
  mustBeInShop(visit);
  if (visit.orderId) throw rejected("An order is already saved for this visit.");
  visit.noOrderReason = body.reason;
  await visit.save();
  await record(req.staff, "order.none", "No order taken", { shopId: visit.shopId, reason: body.reason });
  res.json({ ok: true });
});

field.post("/visits/:id/adjustments", async (req, res) => {
  const body = parse(
    z.object({
      billId: zId,
      kind: z.enum(["cash_discount", "goods_return"]),
      amountPaise: zPaise,
      note: z.string().trim().default(""),
    }),
    req.body,
  );
  const { visit, run } = await ownVisit(req);
  mustBeInShop(visit);
  const bill = (await billsForShop(run, visit.shopId)).find((b) => sameId(b._id, body.billId));
  if (!bill) throw notFound("Bill");
  if (body.amountPaise > openPaise(bill)) throw rejected("This is more than the amount pending on the bill.");
  const settings = await getSettings();
  const percent = (body.amountPaise / bill.amountPaise) * 100;
  const withinLimit =
    body.kind === "cash_discount" && settings.discountLimitPercent != null && percent <= settings.discountLimitPercent;

  await runInTransaction(async () => {
    await new Adjustment({
      kind: body.kind,
      status: withinLimit ? "approved" : "pending",
      billId: bill._id,
      shopId: visit.shopId,
      staffId: req.staff._id,
      runId: run._id,
      visitId: visit._id,
      amountPaise: body.amountPaise,
      note: body.note,
    }).save();
    bill.adjustedPaise += body.amountPaise;
    await bill.save();
    if (openPaise(bill) === 0) setOutcome(run, bill._id, "paid");
    await run.save();
    const label = body.kind === "cash_discount" ? "Cash discount" : "Goods return";
    if (withinLimit) {
      await addMargTask("cash_discount", `Enter cash discount on ${bill.billNo}`, body.amountPaise, [bill._id]);
    } else if (body.kind === "cash_discount") {
      await raise("discount_review", `${label} of ${formatRupees(body.amountPaise)} on ${bill.billNo} needs review`, {
        staffId: req.staff._id,
        runId: run._id,
        billId: bill._id,
        amountPaise: body.amountPaise,
      });
    }
    await record(req.staff, `adjustment.${body.kind}`, `${label} of ${formatRupees(body.amountPaise)} recorded on ${bill.billNo}`, {
      billIds: [bill._id],
      shopId: visit.shopId,
    });
  });
  res.json({ ok: true });
});

field.post("/visits/:id/outcome", async (req, res) => {
  const body = parse(
    z.object({
      billId: zId,
      outcome: z.enum(["later", "returned_as_is"]),
      promiseDate: zDate.optional(),
    }),
    req.body,
  );
  const { visit, run } = await ownVisit(req);
  mustBeInShop(visit);
  const bill = (await billsForShop(run, visit.shopId)).find((b) => sameId(b._id, body.billId));
  if (!bill) throw notFound("Bill");
  if (body.outcome === "later" && !body.promiseDate) throw rejected("Choose the date the shop will pay.");
  const entry = run.bills.find((e) => sameId(e.billId, bill._id));
  if (entry?.outcome === "paid") throw rejected("This bill is already fully paid.");
  if (bill.claimedPaise === 0 || body.outcome === "later") {
    setOutcome(run, bill._id, body.outcome);
  }
  bill.promiseDate = body.outcome === "later" ? (body.promiseDate ?? null) : null;
  await bill.save();
  await run.save();
  await record(req.staff, "bill.outcome", `Bill ${bill.billNo}: ${body.outcome === "later" ? `will pay on ${body.promiseDate}` : "returned as it is"}`, {
    billIds: [bill._id],
    shopId: visit.shopId,
  });
  res.json({ ok: true });
});

const paymentBody = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("cash"), clientRef: z.string().min(8), amountPaise: zPaise, gps: zGps, receiptNo: z.number().int().positive() }),
  z.object({
    mode: z.literal("cheque"),
    clientRef: z.string().min(8),
    amountPaise: zPaise,
    gps: zGps,
    chequeNo: z.string().trim().min(3),
    chequeBank: z.string().trim().min(2),
    chequeDate: zDate,
    photoId: zId,
  }),
  z.object({ mode: z.literal("upi"), clientRef: z.string().min(8), amountPaise: zPaise, gps: zGps }),
]);

field.post("/visits/:id/payments", async (req, res) => {
  const body = parse(paymentBody, req.body);
  const { visit, run } = await ownVisit(req);
  mustBeInShop(visit);
  const bills = await billsForShop(run, visit.shopId);
  const allocations = allocateOldestFirst(bills.map((b) => ({ id: String(b._id), openPaise: openPaise(b) })), body.amountPaise);
  const settings = await getSettings();
  const date = businessDate();

  if (body.mode === "cash") {
    const book = await ReceiptBook.findOne({
      staffId: req.staff._id,
      closed: false,
      fromSerial: { $lte: body.receiptNo },
      toSerial: { $gte: body.receiptNo },
    });
    if (!book) throw rejected("This receipt number is not in a book issued to you.");
  }
  if (body.mode === "cheque" && !(await Photo.exists({ _id: body.photoId }))) throw notFound("Cheque photo");
  if (body.mode === "upi" && !settings.firmUpiId) throw rejected("The firm's UPI ID is not set up yet.");

  let upiUrl: string | null = null;
  let qrRef: string | undefined;
  if (body.mode === "upi") {
    const shop = await Shop.findById(visit.shopId);
    qrRef = `U${date.replaceAll("-", "").slice(2)}${String(await nextCounter(`qr-${date}`)).padStart(3, "0")}`;
    const billNos = bills.filter((b) => allocations.some((a) => a.billId === String(b._id))).map((b) => b.billNo);
    upiUrl = buildUpiUrl({
      upiId: settings.firmUpiId,
      payeeName: settings.firmName,
      amountPaise: body.amountPaise,
      reference: qrRef,
      note: `${shop?.name ?? "Shop"} ${billNos.join(" ")}`.slice(0, 70),
    });
  }

  const payment = await runInTransaction(async () => {
    const created = await new Payment({
      mode: body.mode,
      status: body.mode === "upi" ? "qr_shown" : "claimed",
      source: "collection",
      amountPaise: body.amountPaise,
      allocations,
      shopId: visit.shopId,
      staffId: req.staff._id,
      runId: run._id,
      visitId: visit._id,
      date,
      gps: body.gps,
      clientRef: body.clientRef,
      ...(body.mode === "cash" ? { receiptNo: body.receiptNo } : {}),
      ...(body.mode === "cheque"
        ? { chequeNo: body.chequeNo, chequeBank: body.chequeBank, chequeDate: body.chequeDate, chequeStatus: "received", photoId: body.photoId }
        : {}),
      ...(body.mode === "upi" ? { qrRef, upiUrl } : {}),
    }).save();
    for (const allocation of allocations) {
      const bill = bills.find((b) => String(b._id) === allocation.billId)!;
      bill.claimedPaise += allocation.amountPaise;
      await bill.save();
      setOutcome(run, bill._id, openPaise(bill) === 0 ? "paid" : "part_paid");
      if (openPaise(bill) === 0) {
        bill.promiseDate = null;
        await bill.save();
      }
    }
    await run.save();
    await record(req.staff, `payment.${body.mode}`, `${formatRupees(body.amountPaise)} by ${body.mode} recorded`, {
      billIds: allocations.map((a) => a.billId),
      shopId: visit.shopId,
      gps: body.gps,
    });
    return created;
  });
  res.json({ payment: payment.toObject() });
});

field.post("/payments/:id/upi-claim", async (req, res) => {
  const body = parse(z.object({ transactionRef: z.string().trim().min(6) }), req.body);
  const payment = await Payment.findById(param(req, "id"));
  if (!payment || !sameId(payment.staffId, req.staff._id)) throw notFound("Payment");
  if (payment.status !== "qr_shown") throw rejected("This QR is not open.");
  payment.status = "claimed";
  payment.upiTransactionRef = body.transactionRef;
  await payment.save();
  await record(req.staff, "payment.upi_claimed", `UPI reference ${body.transactionRef} entered for ${formatRupees(payment.amountPaise)}`, {
    billIds: payment.allocations.map((a) => a.billId),
    shopId: payment.shopId,
  });
  res.json({ ok: true });
});

field.post("/payments/:id/upi-cancel", async (req, res) => {
  const body = parse(z.object({ reason: z.string().trim().min(3) }), req.body);
  const payment = await Payment.findById(param(req, "id"));
  if (!payment || !sameId(payment.staffId, req.staff._id)) throw notFound("Payment");
  if (payment.status !== "qr_shown") throw rejected("This QR is not open.");
  await runInTransaction(async () => {
    payment.status = "claimed";
    await rejectPayment(payment, req.staff, body.reason);
    payment.status = "cancelled";
    await payment.save();
    const run = await BeatRun.findById(payment.runId);
    if (run) {
      for (const allocation of payment.allocations) {
        const entry = run.bills.find((e) => sameId(e.billId, allocation.billId));
        if (!entry) continue;
        const bill = await Bill.findById(allocation.billId);
        entry.outcome = bill && bill.claimedPaise > 0 ? "part_paid" : null;
      }
      await run.save();
    }
  });
  res.json({ ok: true });
});
