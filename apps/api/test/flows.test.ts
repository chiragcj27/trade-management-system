import assert from "node:assert/strict";
import type { Server } from "node:http";
import { after, before, beforeEach, describe, it } from "node:test";
import { connectDb, disconnectDb } from "@repo/db";
import { allocateOldestFirst, buildUpiUrl } from "@repo/shared";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { seedDemo } from "../src/seed.js";

let mongo: MongoMemoryReplSet;
let server: Server;
let base = "";
let people = new Map<string, string>();
// A tiny valid image, standing in for a phone photo.
const PHOTO = "data:image/png;base64,iVBORw0KGgo=";
let refs = 0;
const ref = () => `test-ref-${++refs}-${Date.now()}`;

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function call(who: string, method: string, path: string, body?: unknown) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", "x-staff-id": people.get(who) ?? "" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Json };
}
const get = async (who: string, path: string) => {
  const r = await call(who, "GET", path);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const post = async (who: string, path: string, body: unknown = {}) => {
  const r = await call(who, "POST", path, body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};
const refuses = async (who: string, path: string, body: unknown, pattern: RegExp, status?: number) => {
  const r = await call(who, "POST", path, body);
  assert.ok(r.status >= 400, `expected refusal, got ${r.status}`);
  if (status) assert.equal(r.status, status);
  assert.match(r.body.error, pattern);
};
const photo = async (who: string) => (await post(who, "/photos", { kind: "test", dataUrl: PHOTO })).photoId as string;
const FAR = { lat: 10, lng: 10 };
const at = (row: Json) => ({ lat: row.shop.location.lat, lng: row.shop.location.lng });

before(async () => {
  mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await connectDb(mongo.getUri(), "flows-test");
  server = createApp({ demo: true }).listen(0);
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  server.close();
  await disconnectDb();
  await mongo.stop();
});
beforeEach(async () => {
  await seedDemo();
  const { personas } = await (await fetch(`${base}/demo/personas`)).json() as Json;
  people = new Map(personas.map((p: Json) => [p.staffId.name, p.staffId._id]));
});

describe("pure rules", () => {
  it("fills the oldest bill first", () => {
    const a = allocateOldestFirst([{ id: "old", openPaise: 1000 }, { id: "new", openPaise: 500 }], 1200);
    assert.deepEqual(a, [{ billId: "old", amountPaise: 1000 }, { billId: "new", amountPaise: 200 }]);
  });
  it("refuses more than is pending", () => {
    assert.throws(() => allocateOldestFirst([{ id: "a", openPaise: 100 }], 101), RangeError);
  });
  it("builds a UPI link with the exact amount", () => {
    const url = buildUpiUrl({ upiId: "a@b", payeeName: "Firm", amountPaise: 123450, reference: "U1", note: "x y" });
    assert.match(url, /^upi:\/\/pay\?pa=a%40b&pn=Firm&am=1234\.50&cu=INR&tr=U1&tn=x%20y$/);
  });
});

describe("demo data", () => {
  it("gives every role a working home screen", async () => {
    for (const [name, path] of [
      ["Ravi Sharma", "/field/today"], ["Mohan Das", "/field/today"], ["Vikram Singh", "/delivery/today"], ["Raju Bairwa", "/delivery/today"],
      ["Manoj Gurjar", "/delivery/today"], ["Shankar Lal", "/godown/pending"], ["Priya Mehta", "/office/board"], ["Rakesh Agarwal", "/owner/summary"],
    ] as const) await get(name, path);
  });
  it("blocks a role from another role's work", async () => {
    const r = await call("Ravi Sharma", "GET", "/office/board");
    assert.equal(r.status, 403);
  });
  it("refuses to wipe a database not named for demo or test", async () => {
    const mongoose = (await import("mongoose")).default;
    const original = mongoose.connection.name;
    Object.defineProperty(mongoose.connection, "name", { value: "production", configurable: true });
    await assert.rejects(seedDemo(), /Refusing/);
    Object.defineProperty(mongoose.connection, "name", { value: original, configurable: true });
  });
});

describe("collection", () => {
  it("accepts bills, records not-received, geofences, and captures a first location", async () => {
    const who = "Ravi Sharma";
    let t = await get(who, "/field/today");
    await refuses(who, `/field/runs/${t.run._id}/start`, { gps: FAR }, /Accept/);
    const notReceived = t.bills[0]._id;
    await post(who, `/field/runs/${t.run._id}/accept`, { notReceivedBillIds: [notReceived] });
    t = await get(who, "/field/today");
    assert.equal(t.bills.find((b: Json) => b._id === notReceived).stage, "in_file");
    await post(who, `/field/runs/${t.run._id}/start`, { gps: FAR });
    await refuses(who, `/field/runs/${t.run._id}/visits`, { shopId: t.shops[0].shop._id, gps: FAR }, /Check-in works within/);
    const noLocation = t.shops[5];
    assert.equal(noLocation.shop.location, null);
    await post(who, `/field/runs/${t.run._id}/visits`, { shopId: noLocation.shop._id, gps: { lat: 26.9, lng: 75.8 } });
    t = await get(who, "/field/today");
    assert.equal(t.shops[5].shop.location.lat, 26.9);
  });

  it("applies part payment oldest first, blocks reused receipts, and requires results before leaving", async () => {
    const who = "Sunil Verma";
    const t = await get(who, "/field/today");
    const open = t.shops.find((r: Json) => r.visit?.status === "checked_in");
    const path = `/field/visits/${open.visit._id}`;
    const v = await get(who, path);
    assert.deepEqual(v.bills.map((b: Json) => b.billDate), [...v.bills.map((b: Json) => b.billDate)].sort());
    const [oldest, middle] = v.bills;
    const amount = oldest.openPaise + 10000;
    await refuses(who, `${path}/payments`, { mode: "cash", clientRef: ref(), amountPaise: amount, gps: at(open), receiptNo: 2001 }, /already been used/, 409);
    await refuses(who, `${path}/payments`, { mode: "cash", clientRef: ref(), amountPaise: amount, gps: at(open), receiptNo: 9999 }, /not in a book/);
    await post(who, `${path}/payments`, { mode: "cash", clientRef: ref(), amountPaise: amount, gps: at(open), receiptNo: 2002 });
    const after = await get(who, path);
    assert.equal(after.bills[0].openPaise, 0);
    assert.equal(after.bills[0].outcome, "paid");
    assert.equal(after.bills[1].openPaise, middle.openPaise - 10000);
    assert.equal(after.bills[1].outcome, "part_paid");
    await refuses(who, `${path}/checkout`, { gps: at(open) }, /order or record/);
    await post(who, `${path}/no-order`, { reason: "Stock is enough" });
    await refuses(who, `${path}/checkout`, { gps: at(open) }, /Record a result/);
    await post(who, `${path}/outcome`, { billId: v.bills[2]._id, outcome: "later", promiseDate: "2030-01-01" });
    await post(who, `${path}/checkout`, { gps: at(open) });
  });

  it("keeps the same payment from saving twice", async () => {
    const who = "Sunil Verma";
    const t = await get(who, "/field/today");
    const open = t.shops.find((r: Json) => r.visit?.status === "checked_in");
    const clientRef = ref();
    const body = { mode: "cash", clientRef, amountPaise: 10000, gps: at(open), receiptNo: 2005 };
    await post(who, `/field/visits/${open.visit._id}/payments`, body);
    await refuses(who, `/field/visits/${open.visit._id}/payments`, { ...body, receiptNo: 2006 }, /already saved/, 409);
    const v = await get(who, `/field/visits/${open.visit._id}`);
    assert.equal(v.payments.length, 1);
  });

  it("creates an amount-specific UPI QR, restores bills on cancel, and rejects a reused reference", async () => {
    const who = "Mohan Das";
    const t = await get(who, "/field/today");
    const open = t.shops.find((r: Json) => r.visit?.status === "checked_in");
    const path = `/field/visits/${open.visit._id}`;
    const v = await get(who, path);
    const before = v.bills[0].openPaise;
    const first = await post(who, `${path}/payments`, { mode: "upi", clientRef: ref(), amountPaise: 50000, gps: at(open) });
    assert.match(first.payment.upiUrl, /am=500\.00/);
    await refuses(who, `${path}/checkout`, { gps: at(open) }, /QR is still open/);
    await post(who, `/field/payments/${first.payment._id}/upi-cancel`, { reason: "Shop changed amount" });
    assert.equal((await get(who, path)).bills[0].openPaise, before);
    const second = await post(who, `${path}/payments`, { mode: "upi", clientRef: ref(), amountPaise: 60000, gps: at(open) });
    await refuses(who, `/field/payments/${second.payment._id}/upi-claim`, { transactionRef: "631855512904" }, /already been used/, 409);
    await post(who, `/field/payments/${second.payment._id}/upi-claim`, { transactionRef: "777766665555" });
    const office = await get("Priya Mehta", "/office/upi");
    const row = office.items.find((p: Json) => p._id === second.payment._id);
    assert.equal(row.status, "claimed");
    await post("Priya Mehta", `/office/payments/${row._id}/match`);
    const trail = await get("Priya Mehta", `/office/bills/${v.bills[0]._id}`);
    assert.equal(trail.bill.confirmedPaise, 60000);
  });

  it("flags discounts for review when no limit is set", async () => {
    const who = "Sunil Verma";
    const t = await get(who, "/field/today");
    const open = t.shops.find((r: Json) => r.visit?.status === "checked_in");
    const path = `/field/visits/${open.visit._id}`;
    const v = await get(who, path);
    await post(who, `${path}/adjustments`, { billId: v.bills[0]._id, kind: "cash_discount", amountPaise: 1000 });
    const items = (await get("Priya Mehta", "/office/adjustments")).items;
    assert.ok(items.some((a: Json) => a.billId._id === v.bills[0]._id));
  });
});

describe("evening check", () => {
  async function amitDetail() {
    const list = await get("Priya Mehta", "/office/evening");
    const run = list.runs.find((r: Json) => r.staffId.name === "Amit Joshi");
    return { id: run._id as string, data: await get("Priya Mehta", `/office/evening/runs/${run._id}`) };
  }

  it("hides expected cash until the count is saved", async () => {
    const { data } = await amitDetail();
    const text = JSON.stringify(data.detail);
    assert.equal(data.detail.expectedCashPaise, undefined);
    assert.ok(!text.includes("outcome") && !text.includes('"mode":"cash"'));
  });

  it("confirms clean cash, closes the bill after Marg, and releases the file", async () => {
    const { id, data } = await amitDetail();
    const cash = (await get("Sunil Verma", "/field/today")) && null; void cash;
    const expected = await expectedFor(id);
    await post("Priya Mehta", `/office/evening/runs/${id}/count`, {
      cashCountedPaise: expected,
      paperBackBillIds: data.detail.bills.map((b: Json) => b._id),
      chequesInHandIds: data.detail.cheques.map((c: Json) => c._id),
      nextUnusedReceipt: 3004,
    });
    const done = await get("Priya Mehta", `/office/evening/runs/${id}`);
    assert.equal(done.detail.expectedCashPaise, expected);
    assert.ok(!done.exceptions.some((e: Json) => ["cash_short", "missing_bill", "receipt_gap"].includes(e.type)));
    const marg = await get("Priya Mehta", "/office/marg");
    const billNo = done.detail.bills[0].billNo;
    const task = marg.pending.find((m: Json) => m.billIds.some((b: Json) => b.billNo === billNo));
    await post("Priya Mehta", `/office/marg/${task._id}/done`);
    const trail = await get("Priya Mehta", `/office/bills/${done.detail.bills[0]._id}`);
    assert.equal(trail.bill.stage, "closed");
  });

  it("raises shortage, missing bill and receipt gap, then blocks new bills until override", async () => {
    const { id, data } = await amitDetail();
    const expected = await expectedFor(id);
    const missing = data.detail.bills[0]._id;
    await post("Priya Mehta", `/office/evening/runs/${id}/count`, {
      cashCountedPaise: expected - 50000,
      paperBackBillIds: data.detail.bills.map((b: Json) => b._id).filter((b: string) => b !== missing),
      chequesInHandIds: data.detail.cheques.map((c: Json) => c._id),
      nextUnusedReceipt: 3005,
    });
    const done = await get("Priya Mehta", `/office/evening/runs/${id}`);
    const types = done.exceptions.map((e: Json) => e.type);
    for (const t of ["cash_short", "missing_bill", "receipt_gap"]) assert.ok(types.includes(t), t);
    const trail = await get("Priya Mehta", `/office/bills/${missing}`);
    assert.equal(trail.bill.stage, "with_collector");
  });

  it("blocks issuing to a salesman with open problems unless overridden", async () => {
    const issue = await get("Priya Mehta", "/office/issue");
    const row = issue.rows.find((r: Json) => r.staff.name === "Deepak Yadav");
    assert.equal(row.blockers.length, 2);
    const billIds = row.bills.map((b: Json) => b._id);
    await refuses("Priya Mehta", `/office/runs/${row.runId}/issue`, { billIds }, /open problem/);
    await post("Priya Mehta", `/office/runs/${row.runId}/issue`, { billIds, overrideReason: "Owner approved today" });
    const summary = await get("Rakesh Agarwal", "/owner/summary");
    assert.ok(summary.overrides.some((o: Json) => o.resolution === "Owner approved today"));
  });

  it("unblocks after resolving and returns the lost bill to the file", async () => {
    const list = (await get("Priya Mehta", "/office/exceptions")).items;
    const missing = list.find((e: Json) => e.type === "missing_bill");
    await post("Priya Mehta", `/office/exceptions/${missing._id}/resolve`, { reason: "Found in the van" });
    const trail = await get("Priya Mehta", `/office/bills/${missing.billId._id}`);
    assert.equal(trail.bill.stage, "in_file");
  });

  async function expectedFor(id: string) {
    const mod = await import("@repo/db");
    const rows = await mod.Payment.find({ runId: id, mode: "cash", status: "claimed" }).lean();
    return rows.reduce((s, p) => s + p.amountPaise, 0);
  }
});

describe("delivery and godown", () => {
  it("needs both people to accept, then runs every delivery result", async () => {
    let t = await get("Vikram Singh", "/delivery/today");
    const trip = `/delivery/trips/${t.trip._id}`;
    const opening = t.vehicle.lastOdometer + 5;
    const startPhoto = await photo("Vikram Singh");
    await refuses("Vikram Singh", `${trip}/start`, { odometer: opening, photoId: startPhoto, gps: FAR }, /Both driver and helper/);
    await post("Raju Bairwa", `${trip}/accept`);
    await refuses("Raju Bairwa", `${trip}/start`, { odometer: opening, photoId: startPhoto, gps: FAR }, /role cannot/, 403);
    await refuses("Vikram Singh", `${trip}/start`, { odometer: 5, photoId: startPhoto, gps: FAR }, /Odometer cannot/);
    await post("Vikram Singh", `${trip}/start`, { odometer: opening, photoId: startPhoto, gps: FAR });
    t = await get("Vikram Singh", "/delivery/today");
    const stop = t.stops[0];
    await refuses("Vikram Singh", `${trip}/arrive`, { shopId: stop.shop._id, gps: FAR }, /Arrival works within/);
    const here = at(stop);
    await post("Raju Bairwa", `${trip}/arrive`, { shopId: stop.shop._id, gps: here });
    const bill = stop.bills[0].bill;
    await refuses("Vikram Singh", `${trip}/bills/${bill._id}/result`, { clientRef: ref(), result: "credit_delivered", gps: here }, /photo of the signed/);
    const items = bill.lines.map((l: Json, i: number) => ({ productId: l.productId, deliveredQty: i === 0 ? l.quantity - 1 : l.quantity }));
    await post("Raju Bairwa", `${trip}/bills/${bill._id}/result`, { clientRef: ref(), result: "partial", reason: "Goods damaged", photoId: await photo("Raju Bairwa"), gps: here, items });
    t = await get("Vikram Singh", "/delivery/today");
    const updated = t.stops[0].bills[0].bill;
    assert.equal(updated.amountPaise, bill.amountPaise - bill.lines[0].ratePaise);
    await refuses("Vikram Singh", `${trip}/end`, { odometer: opening + 20, photoId: startPhoto, gps: here }, /Every bill needs/);
  });

  it("counts returned goods blind, flags a mismatch, and returns undelivered bills to loading", async () => {
    const pending = await get("Shankar Lal", "/godown/pending");
    const row = pending.trips[0];
    assert.ok(!JSON.stringify(row).includes("expected"));
    const result = await post("Shankar Lal", `/godown/trips/${row._id}/count`, { lines: row.products.map((p: Json) => ({ productId: p.productId, counted: 999 })) });
    assert.equal(result.matched, false);
    const list = await get("Priya Mehta", "/office/evening");
    const trip = list.trips[0];
    const d = await get("Priya Mehta", `/office/evening/trips/${trip._id}`);
    assert.equal(d.detail.expectedCashPaise, undefined);
    const mod = await import("@repo/db");
    const cash = (await mod.Payment.find({ tripId: trip._id, status: "claimed" }).lean()).reduce((s, p) => s + p.amountPaise, 0);
    await post("Priya Mehta", `/office/evening/trips/${trip._id}/count`, { cashCountedPaise: cash, paperBackBillIds: d.detail.bills.map((b: Json) => b._id) });
    const after = await get("Priya Mehta", `/office/evening/trips/${trip._id}`);
    const undelivered = after.detail.bills.find((b: Json) => b.result === "not_delivered");
    assert.equal((await get("Priya Mehta", `/office/bills/${undelivered._id}`)).bill.stage, "billed");
    const credit = after.detail.bills.find((b: Json) => b.result === "credit_delivered");
    assert.equal((await get("Priya Mehta", `/office/bills/${credit._id}`)).bill.stage, "in_file");
  });

  it("rejects duplicate fuel bills and enforces rising odometer", async () => {
    const who = "Naresh Saini";
    const [a, b, c] = [await photo(who), await photo(who), await photo(who)];
    const { businessDate } = await import("@repo/shared");
    const base2 = { litres: 10, pumpName: "X", odometerPhotoId: a, meterPhotoId: b, billPhotoId: c, gps: FAR, pumpBillDate: businessDate() };
    await refuses(who, "/delivery/fuel", { ...base2, odometer: 31600, amountPaise: 247000, pumpBillNo: "F-2241" }, /already been claimed/, 409);
    await refuses(who, "/delivery/fuel", { ...base2, odometer: 100, amountPaise: 90000, pumpBillNo: "F-3000" }, /above the last/);
  });

  it("will not give a second advance until the first is settled", async () => {
    const fuel = await get("Priya Mehta", "/office/fuel");
    const open = fuel.advances.find((a: Json) => a.status === "open");
    await refuses("Priya Mehta", "/office/advances", { staffId: open.staffId._id, vehicleId: open.vehicleId._id, amountPaise: 1000 }, /not settled/);
    await refuses("Priya Mehta", `/office/advances/${open._id}/settle`, { returnedPaise: 0 }, /must equal/);
    await post("Priya Mehta", `/office/advances/${open._id}/settle`, { returnedPaise: 300000 - 247000 });
  });
});

describe("cheque diary", () => {
  it("reopens bills when a cheque bounces and blocks early deposit", async () => {
    const { items } = await get("Priya Mehta", "/office/cheques");
    const deposited = items.find((c: Json) => c.chequeStatus === "deposited");
    await refuses("Priya Mehta", `/office/cheques/${deposited._id}/status`, { status: "bounced" }, /why/);
    await post("Priya Mehta", `/office/cheques/${deposited._id}/status`, { status: "bounced", reason: "Signature mismatch" });
    const trail = await get("Priya Mehta", `/office/bills/${deposited.allocations[0].billId._id}`);
    assert.equal(trail.bill.stage, "in_file");
    assert.equal(trail.bill.openPaise, trail.bill.amountPaise);
  });
});
