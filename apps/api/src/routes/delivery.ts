import {
  Beat,
  Bill,
  CashAdvance,
  FuelEntry,
  Payment,
  Photo,
  Shop,
  Trip,
  type TripAttrs,
  Vehicle,
  runInTransaction,
} from "@repo/db";
import { NOT_DELIVERED_REASONS, PARTIAL_REASONS, businessDate, distanceMeters, formatRupees } from "@repo/shared";
import { Router, type Request } from "express";
import type { HydratedDocument, Types } from "mongoose";
import { z } from "zod";
import { allow, notFound, param, parse, rejected, zDate, zGps, zId, zPaise } from "../http.js";
import { addMargTask, getSettings, openPaise, raise, record, sameId } from "../services.js";

export const delivery: Router = Router();
delivery.use(allow("driver", "helper"));

type TripDoc = HydratedDocument<TripAttrs>;

async function ownTrip(req: Request): Promise<TripDoc> {
  const trip = await Trip.findById(param(req, "id"));
  if (!trip || (!sameId(trip.driverId, req.staff._id) && !sameId(trip.helperId, req.staff._id))) throw notFound("Trip");
  return trip;
}

function currentTripFilter(staffId: Types.ObjectId) {
  return { $or: [{ driverId: staffId }, { helperId: staffId }], date: businessDate() };
}

delivery.get("/today", async (req, res) => {
  const trip = await Trip.findOne(currentTripFilter(req.staff._id)).sort({ createdAt: -1 });
  if (!trip) {
    res.json({ trip: null });
    return;
  }
  const [beat, vehicle, shops, bills] = await Promise.all([
    Beat.findById(trip.beatId).lean(),
    Vehicle.findById(trip.vehicleId).lean(),
    Shop.find({ _id: { $in: trip.stops.map((s) => s.shopId) } }).lean(),
    Bill.find({ _id: { $in: trip.bills.map((b) => b.billId) } }).lean(),
  ]);
  const billRows = trip.bills.map((entry) => {
    const bill = bills.find((b) => sameId(b._id, entry.billId))!;
    return { ...JSON.parse(JSON.stringify(entry)), bill: { ...bill, openPaise: openPaise(bill) } };
  });
  res.json({
    trip: trip.toObject(),
    beat,
    vehicle,
    myRole: sameId(trip.driverId, req.staff._id) ? "driver" : "helper",
    stops: trip.stops
      .map((stop) => ({
        ...JSON.parse(JSON.stringify(stop)),
        shop: shops.find((s) => sameId(s._id, stop.shopId)),
        bills: billRows.filter((b) => sameId(b.shopId, stop.shopId)),
      }))
      .sort((a, b) => a.sequence - b.sequence),
  });
});

delivery.post("/trips/:id/accept", async (req, res) => {
  const trip = await ownTrip(req);
  if (trip.status !== "planned") throw rejected("This load sheet is already accepted.");
  const isDriver = sameId(trip.driverId, req.staff._id);
  if (isDriver) trip.driverAcceptedAt = new Date();
  else trip.helperAcceptedAt = new Date();
  if (trip.driverAcceptedAt && trip.helperAcceptedAt) trip.status = "accepted";
  await trip.save();
  await record(req.staff, "trip.accepted", `${req.staff.name} accepted the load sheet`, {
    billIds: trip.bills.map((b) => b.billId),
  });
  res.json({ ok: true });
});

delivery.post("/trips/:id/start", allow("driver"), async (req, res) => {
  const body = parse(z.object({ odometer: z.number().int().positive(), photoId: zId, gps: zGps }), req.body);
  const trip = await ownTrip(req);
  if (trip.status === "planned") throw rejected("Both driver and helper must accept the load sheet first.");
  if (trip.status !== "accepted") throw rejected("This trip has already started.");
  const vehicle = await Vehicle.findById(trip.vehicleId);
  if (!vehicle) throw notFound("Vehicle");
  if (body.odometer < vehicle.lastOdometer) throw rejected(`Odometer cannot be below the last reading of ${vehicle.lastOdometer} km.`);
  trip.status = "started";
  trip.startedAt = new Date();
  trip.startGps = body.gps;
  trip.startOdometer = body.odometer;
  trip.startPhotoId = body.photoId as never;
  vehicle.lastOdometer = body.odometer;
  await runInTransaction(async () => {
    await trip.save();
    await vehicle.save();
    await record(req.staff, "trip.started", `Trip started at ${body.odometer} km`, { gps: body.gps });
  });
  res.json({ ok: true });
});

delivery.post("/trips/:id/arrive", async (req, res) => {
  const body = parse(z.object({ shopId: zId, gps: zGps }), req.body);
  const trip = await ownTrip(req);
  if (trip.status !== "started") throw rejected("Start the trip first.");
  const stop = trip.stops.find((s) => sameId(s.shopId, body.shopId));
  if (!stop) throw notFound("Stop");
  if (stop.arrivedAt) throw rejected("Arrival is already marked.");
  const shop = await Shop.findById(body.shopId);
  const settings = await getSettings();
  if (shop?.location?.lat != null && shop.location.lng != null) {
    const distance = distanceMeters(body.gps, { lat: shop.location.lat, lng: shop.location.lng });
    if (distance > settings.checkInRadiusMeters) {
      await raise("outside_shop", `${req.staff.name} tried to mark arrival at ${shop.name} from ${distance} m away`, {
        staffId: req.staff._id,
        tripId: trip._id,
      });
      throw rejected(`You are ${distance} m from ${shop.name}. Arrival works within ${settings.checkInRadiusMeters} m.`, "outside_shop");
    }
  }
  stop.arrivedAt = new Date();
  stop.arrivedGps = body.gps;
  await trip.save();
  await record(req.staff, "trip.arrived", `Arrived at ${shop?.name ?? "shop"}`, { shopId: body.shopId, gps: body.gps });
  res.json({ ok: true });
});

delivery.post("/trips/:id/depart", async (req, res) => {
  const body = parse(z.object({ shopId: zId }), req.body);
  const trip = await ownTrip(req);
  const stop = trip.stops.find((s) => sameId(s.shopId, body.shopId));
  if (!stop?.arrivedAt) throw rejected("Mark arrival first.");
  const pending = trip.bills.filter((b) => sameId(b.shopId, body.shopId) && b.result === "pending");
  if (pending.length > 0) throw rejected("Record a result for every bill at this shop first.");
  stop.departedAt = new Date();
  await trip.save();
  const settings = await getSettings();
  const minutes = (stop.departedAt.getTime() - stop.arrivedAt.getTime()) / 60000;
  if (minutes > settings.maxStopMinutes) {
    await raise("long_stop", `Vehicle spent ${Math.round(minutes)} minutes at one stop`, { staffId: trip.driverId, tripId: trip._id });
  }
  res.json({ ok: true });
});

delivery.post("/trips/:id/bills/:billId/result", async (req, res) => {
  const body = parse(
    z.object({
      clientRef: z.string().min(8),
      result: z.enum(["credit_delivered", "cash_paid", "credit_paid_cash", "partial", "not_delivered"]),
      reason: z.string().optional(),
      cashPaise: z.number().int().min(0).default(0),
      photoId: zId.optional(),
      gps: zGps,
      items: z.array(z.object({ productId: zId, deliveredQty: z.number().min(0) })).optional(),
    }),
    req.body,
  );
  const trip = await ownTrip(req);
  if (trip.status !== "started") throw rejected("Start the trip first.");
  const entry = trip.bills.find((b) => sameId(b.billId, param(req, "billId")));
  if (!entry) throw notFound("Bill");
  if (entry.result !== "pending") throw rejected("A result is already saved for this bill.");
  const stop = trip.stops.find((s) => sameId(s.shopId, entry.shopId));
  if (!stop?.arrivedAt) throw rejected("Mark arrival at the shop first.");
  const bill = await Bill.findById(entry.billId);
  if (!bill) throw notFound("Bill");

  if (body.result !== "not_delivered" && !body.photoId) throw rejected("Take a photo of the signed copy.");
  if (body.photoId && !(await Photo.exists({ _id: body.photoId }))) throw notFound("Photo");
  if (body.result === "credit_delivered" && bill.kind !== "credit") throw rejected("A cash bill must be recorded as paid, partly delivered or not delivered.");
  if (body.result === "credit_paid_cash" && bill.kind !== "credit") throw rejected("This bill is already a cash bill.");
  if (body.result === "cash_paid" && bill.kind !== "cash") throw rejected("This bill is a credit bill.");
  if (["cash_paid", "credit_paid_cash"].includes(body.result) && body.cashPaise <= 0) throw rejected("Enter the cash received.");
  if (body.result === "not_delivered" && !NOT_DELIVERED_REASONS.includes(body.reason as never)) throw rejected("Choose why it was not delivered.");
  if (body.result === "partial" && !PARTIAL_REASONS.includes(body.reason as never)) throw rejected("Choose why it was partly delivered.");
  if (body.result === "not_delivered" && body.cashPaise > 0) throw rejected("No cash can be recorded on an undelivered bill.");

  let items: { productId: unknown; name: string; unit?: string | null; billedQty: number; deliveredQty: number }[] = [];
  let returnedValue = 0;
  if (body.result === "partial") {
    items = bill.lines.map((line) => {
      const delivered = body.items?.find((i) => sameId(i.productId, line.productId))?.deliveredQty;
      if (delivered == null) throw rejected(`Enter the delivered quantity for ${line.name}.`);
      if (delivered > line.quantity) throw rejected(`${line.name}: delivered is more than billed.`);
      returnedValue += (line.quantity - delivered) * (line.ratePaise ?? 0);
      return { productId: line.productId, name: line.name, unit: line.unit, billedQty: line.quantity, deliveredQty: delivered };
    });
    if (items.every((i) => i.deliveredQty === i.billedQty)) throw rejected("Nothing was short, so record this as a full delivery.");
    if (items.every((i) => i.deliveredQty === 0)) throw rejected("Nothing was delivered, so record this as not delivered.");
  }
  if (body.cashPaise > bill.amountPaise - returnedValue) throw rejected(`Cash is more than the ${formatRupees(bill.amountPaise - returnedValue)} due.`);

  await runInTransaction(async () => {
    entry.result = body.result;
    entry.reason = body.reason ?? null;
    entry.cashPaise = body.cashPaise;
    entry.photoId = (body.photoId ?? null) as never;
    entry.at = new Date();
    entry.gps = body.gps;
    entry.items = items as never;
    await trip.save();

    if (body.result === "partial" && returnedValue > 0) {
      bill.amountPaise -= returnedValue;
      await addMargTask("credit_note", `Credit note on ${bill.billNo} for goods not delivered`, returnedValue, [bill._id]);
    }
    if (body.result !== "not_delivered") {
      bill.stage = "awaiting_paper";
      bill.signedPhotoId = (body.photoId ?? null) as never;
    }
    if (body.cashPaise > 0) {
      await new Payment({
        mode: "cash",
        status: "claimed",
        source: "delivery",
        amountPaise: body.cashPaise,
        allocations: [{ billId: bill._id, amountPaise: body.cashPaise }],
        shopId: bill.shopId,
        staffId: trip.driverId,
        tripId: trip._id,
        date: businessDate(),
        gps: body.gps,
        clientRef: body.clientRef,
      }).save();
      bill.claimedPaise += body.cashPaise;
    }
    await bill.save();
    await record(req.staff, `delivery.${body.result}`, `Bill ${bill.billNo}: ${body.result.replaceAll("_", " ")}`, {
      billIds: [bill._id],
      shopId: bill.shopId,
      gps: body.gps,
      reason: body.reason,
    });
  });
  res.json({ ok: true });
});

delivery.post("/trips/:id/end", allow("driver"), async (req, res) => {
  const body = parse(z.object({ odometer: z.number().int().positive(), photoId: zId, gps: zGps }), req.body);
  const trip = await ownTrip(req);
  if (trip.status !== "started") throw rejected("This trip is not running.");
  if (trip.bills.some((b) => b.result === "pending")) throw rejected("Every bill needs a result before ending the trip.");
  if (body.odometer <= (trip.startOdometer ?? 0)) throw rejected(`Closing odometer must be above the opening ${trip.startOdometer} km.`);
  const [vehicle, beat] = await Promise.all([Vehicle.findById(trip.vehicleId), Beat.findById(trip.beatId)]);
  if (!vehicle) throw notFound("Vehicle");
  await runInTransaction(async () => {
    trip.status = "ended";
    trip.endedAt = new Date();
    trip.endGps = body.gps;
    trip.endOdometer = body.odometer;
    trip.endPhotoId = body.photoId as never;
    vehicle.lastOdometer = body.odometer;
    await trip.save();
    await vehicle.save();
    await record(req.staff, "trip.ended", `Trip ended at ${body.odometer} km`, { gps: body.gps });
    const km = body.odometer - (trip.startOdometer ?? 0);
    if (beat && km > beat.plannedKm * 1.2) {
      await raise("km_over_plan", `${vehicle.number} ran ${km} km against ${beat.plannedKm} km planned`, {
        staffId: trip.driverId,
        tripId: trip._id,
      });
    }
  });
  res.json({ ok: true });
});

// ---------- Fuel ----------

delivery.get("/fuel", async (req, res) => {
  const trip = await Trip.findOne(currentTripFilter(req.staff._id)).sort({ createdAt: -1 }).lean();
  const [entries, advance, vehicle] = await Promise.all([
    FuelEntry.find({ staffId: req.staff._id }).sort({ createdAt: -1 }).limit(10).lean(),
    CashAdvance.findOne({ staffId: req.staff._id, status: "open" }).lean(),
    trip ? Vehicle.findById(trip.vehicleId).lean() : null,
  ]);
  res.json({ entries, advance, vehicle, tripId: trip?._id ?? null });
});

delivery.post("/fuel", async (req, res) => {
  const body = parse(
    z.object({
      odometer: z.number().int().positive(),
      litres: z.number().positive(),
      amountPaise: zPaise,
      pumpName: z.string().trim().default(""),
      pumpBillNo: z.string().trim().min(1),
      pumpBillDate: zDate,
      odometerPhotoId: zId,
      meterPhotoId: zId,
      billPhotoId: zId,
      gps: zGps,
    }),
    req.body,
  );
  const trip = await Trip.findOne(currentTripFilter(req.staff._id)).sort({ createdAt: -1 });
  if (!trip) throw rejected("You have no trip today.");
  const vehicle = await Vehicle.findById(trip.vehicleId);
  if (!vehicle) throw notFound("Vehicle");
  const previous = await FuelEntry.findOne({ vehicleId: vehicle._id }).sort({ odometer: -1 });
  if (previous && body.odometer <= previous.odometer) {
    throw rejected(`Odometer must be above the last fuel reading of ${previous.odometer} km.`);
  }
  const kmSinceLast = previous ? body.odometer - previous.odometer : null;
  // Kilometres since the last fill were run on the previous fill's litres.
  const kmPerLitre = previous && kmSinceLast != null ? Math.round((kmSinceLast / previous.litres) * 10) / 10 : null;
  const settings = await getSettings();
  const lowest = vehicle.normalKmPerLitre * (1 - settings.mileageTolerancePercent / 100);
  const lowMileage = kmPerLitre != null && kmPerLitre < lowest;
  const advance = await CashAdvance.findOne({ staffId: req.staff._id, status: "open" });

  await runInTransaction(async () => {
    await new FuelEntry({
      ...body,
      date: businessDate(),
      vehicleId: vehicle._id,
      staffId: req.staff._id,
      tripId: trip._id,
      advanceId: advance?._id ?? null,
      duplicateKey: `${body.pumpBillNo.toLowerCase()}|${body.pumpBillDate}|${body.amountPaise}`,
      kmSinceLast,
      kmPerLitre,
      lowMileage,
    }).save();
    await record(req.staff, "fuel.entered", `${body.litres} L for ${formatRupees(body.amountPaise)} on ${vehicle.number}`, { gps: body.gps });
    if (lowMileage) {
      await raise("low_mileage", `${vehicle.number} gave ${kmPerLitre} km/L against a normal of ${vehicle.normalKmPerLitre}`, {
        staffId: req.staff._id,
        tripId: trip._id,
      });
    }
  });
  res.json({ kmPerLitre, lowMileage });
});
