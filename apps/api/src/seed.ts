import {
  Adjustment,
  Beat,
  BeatPlan,
  BeatRun,
  Bill,
  CashAdvance,
  Counter,
  DemoPersona,
  Event,
  Exception,
  FuelEntry,
  MargTask,
  Order,
  Payment,
  Photo,
  Product,
  ReceiptBook,
  Settings,
  Shop,
  Staff,
  Trip,
  Vehicle,
  Visit,
} from "@repo/db";
import { type ExceptionType, type Role, addDays, businessDate, formatRupees } from "@repo/shared";
import mongoose, { Types } from "mongoose";

const CENTER = { lat: 26.9124, lng: 75.7873 };
const ago = (minutes: number) => new Date(Date.now() - minutes * 60000);
const svg = (label: string, color: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320"><rect width="480" height="320" fill="${color}"/><rect x="24" y="24" width="432" height="272" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="10 8"/><text x="240" y="150" fill="#fff" font-family="sans-serif" font-size="26" text-anchor="middle">${label}</text><text x="240" y="190" fill="#fff" font-family="sans-serif" font-size="16" text-anchor="middle">Demo photo</text></svg>`,
  );

function assertSafeDatabase() {
  const name = mongoose.connection.name;
  if (!/demo|test/i.test(name)) {
    throw new Error(`Refusing to load demo data into database "${name}". Its name must contain "demo" or "test".`);
  }
}

/** Wipes and rebuilds the demo database, with every date relative to today. */
export async function seedDemo() {
  assertSafeDatabase();
  await Promise.all(
    [Adjustment, Beat, BeatPlan, BeatRun, Bill, CashAdvance, Counter, DemoPersona, Event, Exception, FuelEntry, MargTask, Order, Payment, Photo, Product, ReceiptBook, Settings, Shop, Staff, Trip, Vehicle, Visit].map(
      (model) => (model as typeof Staff).deleteMany({}),
    ),
  );

  const today = businessDate();
  const yesterday = addDays(today, -1);
  const weekdays = [0, 1, 2, 3, 4, 5, 6];

  await Settings.create({ firmName: "Demo Distributors", firmUpiId: "demo.distributor@example", discountLimitPercent: null });

  // ---------- Masters ----------
  const staffDoc = (name: string, role: Role, phone: string) => new Staff({ name, role, phone });
  const admin = staffDoc("Priya Mehta", "admin", "9800000001");
  const ownerStaff = staffDoc("Rakesh Agarwal", "owner", "9800000002");
  const godownStaff = staffDoc("Shankar Lal", "godown", "9800000003");
  const ravi = staffDoc("Ravi Sharma", "salesman", "9800000011");
  const sunil = staffDoc("Sunil Verma", "salesman", "9800000012");
  const amit = staffDoc("Amit Joshi", "salesman", "9800000013");
  const deepak = staffDoc("Deepak Yadav", "salesman", "9800000014");
  const gopal = staffDoc("Gopal Meena", "salesman", "9800000015");
  const mohan = staffDoc("Mohan Das", "collection_agent", "9800000021");
  const imran = staffDoc("Imran Khan", "collection_agent", "9800000022");
  const vikram = staffDoc("Vikram Singh", "driver", "9800000031");
  const harish = staffDoc("Harish Kumar", "driver", "9800000032");
  const naresh = staffDoc("Naresh Saini", "driver", "9800000033");
  const manoj = staffDoc("Manoj Gurjar", "driver", "9800000034");
  const raju = staffDoc("Raju Bairwa", "helper", "9800000041");
  const pappu = staffDoc("Pappu Jat", "helper", "9800000042");
  const kallu = staffDoc("Kallu Ram", "helper", "9800000043");
  const chotu = staffDoc("Chotu Lal", "helper", "9800000044");
  await Staff.insertMany([admin, ownerStaff, godownStaff, ravi, sunil, amit, deepak, gopal, mohan, imran, vikram, harish, naresh, manoj, raju, pappu, kallu, chotu]);

  const photoIds = {
    signed: new Types.ObjectId(),
    cheque: new Types.ObjectId(),
    odometer: new Types.ObjectId(),
    meter: new Types.ObjectId(),
    fuelBill: new Types.ObjectId(),
  };
  await Photo.insertMany([
    { _id: photoIds.signed, kind: "signed_bill", mime: "image/svg+xml", data: svg("Signed bill copy", "#2343A6"), takenBy: harish._id },
    { _id: photoIds.cheque, kind: "cheque", mime: "image/svg+xml", data: svg("Cheque", "#11694A"), takenBy: sunil._id },
    { _id: photoIds.odometer, kind: "odometer", mime: "image/svg+xml", data: svg("Odometer", "#54607A"), takenBy: naresh._id },
    { _id: photoIds.meter, kind: "pump_meter", mime: "image/svg+xml", data: svg("Pump meter", "#875300"), takenBy: naresh._id },
    { _id: photoIds.fuelBill, kind: "fuel_bill", mime: "image/svg+xml", data: svg("Fuel bill", "#AD2219"), takenBy: naresh._id },
  ]);

  const productRows: [string, string, number][] = [
    ["Tea 250 g", "carton", 180000], ["Glucose biscuit family pack", "carton", 96000], ["Detergent powder 1 kg", "bag", 145000],
    ["Bath soap 100 g", "carton", 132000], ["Salt 1 kg", "bag", 42000], ["Refined oil 1 L", "carton", 216000],
    ["Toothpaste 100 g", "carton", 168000], ["Instant noodles", "carton", 72000], ["Dish wash bar", "carton", 84000],
    ["Hair oil 200 ml", "carton", 192000], ["Spice mix 100 g", "carton", 110000], ["Matchbox bundle", "bundle", 26000],
  ];
  const products = productRows.map(([name, unit, ratePaise], i) => new Product({ name, unit, ratePaise, priority: i + 1 }));
  await Product.insertMany(products);

  const beatNames: [string, number, number][] = [
    ["Sadar Bazaar", 300, 35], ["Station Road", 300, 40], ["Civil Lines", 270, 30], ["Mandi Road", 330, 45],
    ["Bapu Bazaar", 240, 28], ["Malviya Nagar", 300, 42], ["Industrial Area", 360, 55],
  ];
  const beats = beatNames.map(([name, plannedMinutes, plannedKm]) => new Beat({ name, plannedMinutes, plannedKm }));
  await Beat.insertMany(beats);
  const [sadar, station, civil, mandi, bapu, malviya, industrial] = beats as [typeof beats[0], typeof beats[0], typeof beats[0], typeof beats[0], typeof beats[0], typeof beats[0], typeof beats[0]];

  const shopNames: Record<string, string[]> = {
    "Sadar Bazaar": ["Gupta Kirana", "Agarwal Traders", "Sharma General", "New India Stores", "Khandelwal Mart", "Janta Provision"],
    "Station Road": ["Shree Traders", "Om General", "Balaji Stores", "Laxmi Stores", "Ganesh Kirana", "Rathi Mart"],
    "Civil Lines": ["Shiv Traders", "Krishna Stores", "Modern Provision", "Royal Mart", "City Super", "Mahaveer Kirana"],
    "Mandi Road": ["Mandi Traders", "Jain Provision", "Kisan Stores", "Goyal General", "Bansal Kirana", "Saini Mart"],
    "Bapu Bazaar": ["Bapu Stores", "Rajasthan Traders", "Heritage Mart", "Pink City Kirana", "Tiwari General", "Lucky Stores"],
    "Malviya Nagar": ["Malviya Mart", "Sector Stores", "Green Provision", "Family Kirana", "Daily Needs", "Ashok General"],
    "Industrial Area": ["Factory Canteen Store", "Worker Mart", "Highway Kirana", "Zone Traders", "Unity Stores", "Sunrise General"],
  };
  const shopsOf = new Map<string, InstanceType<typeof Shop>[]>();
  beats.forEach((beat, b) => {
    const rows = shopNames[beat.name]!.map(
      (name, i) =>
        new Shop({
          name,
          beatId: beat._id,
          sequence: i + 1,
          phone: `97000${String(b).padStart(2, "0")}${String(i).padStart(3, "0")}`,
          address: `${i + 11}, ${beat.name}`,
          location: { lat: CENTER.lat + b * 0.02 + i * 0.002, lng: CENTER.lng + b * 0.015 + i * 0.002 },
        }),
    );
    shopsOf.set(String(beat._id), rows);
  });
  const shop = (beat: { _id: unknown }, i: number) => shopsOf.get(String(beat._id))![i]!;
  shop(sadar, 5).location = null as never; // First visit captures and locks this location.
  shop(sadar, 2).locationRequest = { lat: CENTER.lat + 0.006, lng: CENTER.lng + 0.009, staffId: ravi._id, at: ago(300), reason: "Shop moved to the next lane" };
  await Shop.insertMany([...shopsOf.values()].flat());

  const plan = (staff: { _id: unknown }, beat: { _id: unknown }) => weekdays.map((weekday) => ({ staffId: staff._id, weekday, beatId: beat._id }));
  await BeatPlan.insertMany([
    ...plan(ravi, sadar), ...plan(sunil, station), ...plan(amit, civil), ...plan(deepak, mandi),
    ...plan(gopal, bapu), ...plan(mohan, malviya), ...plan(imran, industrial),
  ]);

  const vehicleFor = (number: string, normalKmPerLitre: number, lastOdometer: number) => new Vehicle({ number, normalKmPerLitre, lastOdometer });
  const v1 = vehicleFor("RJ14 GA 1021", 12, 48210);
  const v2 = vehicleFor("RJ14 GB 3307", 11, 63190);
  const v3 = vehicleFor("RJ14 GC 7788", 12, 31460);
  const v4 = vehicleFor("RJ14 GD 4512", 13, 12780);
  await Vehicle.insertMany([v1, v2, v3, v4]);

  await ReceiptBook.insertMany([
    { staffId: ravi._id, fromSerial: 1001, toSerial: 1050 },
    { staffId: sunil._id, fromSerial: 2001, toSerial: 2050, checkedUpto: 2000 },
    { staffId: amit._id, fromSerial: 3001, toSerial: 3050, checkedUpto: 3000 },
    { staffId: deepak._id, fromSerial: 4001, toSerial: 4050, checkedUpto: 4000 },
    { staffId: gopal._id, fromSerial: 5001, toSerial: 5050 },
    { staffId: mohan._id, fromSerial: 6001, toSerial: 6050 },
    { staffId: imran._id, fromSerial: 7001, toSerial: 7050, checkedUpto: 7002 },
  ]);

  // ---------- Builders ----------
  const allBills: InstanceType<typeof Bill>[] = [];
  const payments: InstanceType<typeof Payment>[] = [];
  const visits: InstanceType<typeof Visit>[] = [];
  const adjustments: InstanceType<typeof Adjustment>[] = [];
  const exceptions: InstanceType<typeof Exception>[] = [];
  const tasks: InstanceType<typeof MargTask>[] = [];
  const orders: InstanceType<typeof Order>[] = [];
  const events: InstanceType<typeof Event>[] = [];
  let billCounter = 2040;
  let refCounter = 0;
  let orderCounter = 500;
  const ref = () => `seed-${++refCounter}-reference`;

  const event = (actor: { _id: unknown; name: string } | null, action: string, summary: string, at: Date, billIds: unknown[] = [], extra: object = {}) =>
    events.push(new Event({ actorId: actor?._id ?? null, actorName: actor?.name ?? "System", action, summary, at, billIds, ...extra }));

  type BillOptions = { daysOld: number; beat: (typeof beats)[0]; shopIndex: number; kind?: "cash" | "credit"; stage: string; holder?: { _id: Types.ObjectId; name: string } | null; holderLabel?: string; size?: number };
  function bill(o: BillOptions) {
    const seedValue = billCounter;
    const size = o.size ?? (seedValue % 3) + 2;
    const lines = Array.from({ length: size }, (_, i) => {
      const product = products[(seedValue + i * 3) % products.length]!;
      return { productId: product._id, name: product.name, unit: product.unit, quantity: ((seedValue + i) % 4) + 2, ratePaise: product.ratePaise };
    });
    const amountPaise = lines.reduce((sum, l) => sum + l.quantity * l.ratePaise, 0);
    const billNo = `B-${billCounter++}`;
    const billDate = addDays(today, -o.daysOld);
    const target = shop(o.beat, o.shopIndex);
    const doc = new Bill({
      billNo, billDate, kind: o.kind ?? "credit", shopId: target._id, beatId: o.beat._id, lines,
      originalAmountPaise: amountPaise, amountPaise, stage: o.stage,
      holderStaffId: o.holder?._id ?? null, holderLabel: o.holderLabel ?? o.holder?.name ?? "Office",
    });
    allBills.push(doc);
    const created = ago(o.daysOld * 1440 + 600);
    event(admin, "bill.created", `Bill ${billNo} entered for ${target.name}`, created, [doc._id]);
    if (!["billed"].includes(o.stage)) event(admin, "trip.created", `Bill ${billNo} loaded on vehicle`, new Date(created.getTime() + 3600000), [doc._id]);
    if (!["billed", "on_vehicle"].includes(o.stage)) {
      event(harish, "delivery.credit_delivered", `Bill ${billNo} delivered, shop signed`, new Date(created.getTime() + 7200000), [doc._id]);
    }
    if (!["billed", "on_vehicle", "awaiting_paper"].includes(o.stage)) {
      event(admin, "bill.paper_back", `Signed copy of ${billNo} filed in ${o.beat.name}`, new Date(created.getTime() + 28800000), [doc._id]);
    }
    return doc;
  }

  function issueEntries(staff: { _id: Types.ObjectId; name: string }, list: InstanceType<typeof Bill>[], accepted: boolean) {
    for (const doc of list) {
      event(admin, "bill.issued", `Bill ${doc.billNo} issued to ${staff.name}`, ago(accepted ? 200 : 25), [doc._id]);
      if (accepted) event(staff, "bill.accepted", `Bill ${doc.billNo} accepted by ${staff.name}`, ago(195), [doc._id]);
    }
    return list.map((doc) => ({ billId: doc._id, shopId: doc.shopId, acceptedAt: accepted ? ago(195) : null, outcome: null as string | null, paperBack: null as boolean | null, notReceived: false }));
  }

  function visit(run: { _id: Types.ObjectId }, staff: { _id: Types.ObjectId; name: string }, target: InstanceType<typeof Shop>, startedAgo: number, stayed: number | null, extra: object = {}) {
    const doc = new Visit({
      runId: run._id, shopId: target._id, staffId: staff._id,
      status: stayed == null ? "checked_in" : "checked_out",
      checkInAt: ago(startedAgo), checkInGps: target.location, checkInDistanceM: 18,
      checkOutAt: stayed == null ? null : ago(startedAgo - stayed), checkOutGps: stayed == null ? null : target.location,
      ...extra,
    });
    visits.push(doc);
    event(staff, "visit.checked_in", `Checked in at ${target.name}`, ago(startedAgo), [], { shopId: target._id, gps: target.location });
    if (stayed != null) event(staff, "visit.checked_out", `Checked out of ${target.name}`, ago(startedAgo - stayed), [], { shopId: target._id, gps: target.location });
    return doc;
  }

  type PaymentExtra = { status?: string; receiptNo?: number; chequeNo?: string; chequeBank?: string; chequeDate?: string; chequeStatus?: string; photoId?: Types.ObjectId; qrRef?: string; upiUrl?: string; upiTransactionRef?: string; confirmedBy?: Types.ObjectId; confirmedAt?: Date; statusReason?: string; date?: string; createdAt?: Date };
  function pay(mode: "cash" | "cheque" | "upi", list: { doc: InstanceType<typeof Bill>; amount: number }[], staff: { _id: Types.ObjectId; name: string }, ctx: { runId?: Types.ObjectId; visitId?: Types.ObjectId; tripId?: Types.ObjectId; source?: string }, extra: PaymentExtra = {}) {
    const status = extra.status ?? "claimed";
    const amountPaise = list.reduce((s, row) => s + row.amount, 0);
    for (const row of list) {
      if (["claimed", "qr_shown"].includes(status)) row.doc.claimedPaise += row.amount;
      if (status === "confirmed") row.doc.confirmedPaise += row.amount;
    }
    const doc = new Payment({
      mode, status, source: ctx.source ?? "collection", amountPaise,
      allocations: list.map((row) => ({ billId: row.doc._id, amountPaise: row.amount })),
      shopId: list[0]!.doc.shopId, staffId: staff._id, runId: ctx.runId ?? null, visitId: ctx.visitId ?? null, tripId: ctx.tripId ?? null,
      date: extra.date ?? today, clientRef: ref(), ...extra,
    });
    doc.status = status;
    payments.push(doc);
    event(staff, `payment.${mode}`, `${formatRupees(amountPaise)} by ${mode} recorded`, extra.createdAt ?? ago(60), list.map((l) => l.doc._id), { shopId: doc.shopId });
    return doc;
  }

  function flag(type: ExceptionType, severity: string, message: string, refs: object = {}, date = today) {
    exceptions.push(new Exception({ type, severity, message, date, ...refs }));
  }
  function marg(kind: string, description: string, amountPaise: number, billIds: unknown[], done = false, paymentId: unknown = null) {
    tasks.push(new MargTask({ kind, description, amountPaise, billIds, paymentId, status: done ? "done" : "pending", doneBy: done ? admin._id : null, doneAt: done ? ago(1500) : null }));
  }
  function order(staff: { _id: Types.ObjectId }, visitDoc: InstanceType<typeof Visit>, beat: { _id: Types.ObjectId }, seedValue: number) {
    const lines = [0, 1, 2].map((i) => {
      const product = products[(seedValue + i * 2) % products.length]!;
      return { productId: product._id, name: product.name, unit: product.unit, quantity: ((seedValue + i) % 5) + 1, ratePaise: product.ratePaise };
    });
    const doc = new Order({ orderNo: ++orderCounter, shopId: visitDoc.shopId, beatId: beat._id, staffId: staff._id, visitId: visitDoc._id, lines, clientRef: ref() });
    orders.push(doc);
    visitDoc.orderId = doc._id;
    return doc;
  }

  const runs: InstanceType<typeof BeatRun>[] = [];
  const mkRun = (data: object) => {
    const doc = new BeatRun(data);
    runs.push(doc);
    return doc;
  };
  const setOutcome = (run: InstanceType<typeof BeatRun>, doc: InstanceType<typeof Bill>, outcome: string) => {
    const entry = run.bills.find((b) => String(b.billId) === String(doc._id));
    if (entry) entry.outcome = outcome;
  };

  // ---------- Ravi: bills issued, waiting to be accepted ----------
  const raviBills = [0, 0, 1, 2, 3, 5].map((s, i) => bill({ daysOld: 18 - i, beat: sadar, shopIndex: s, stage: "issued", holder: ravi, holderLabel: `Issued to ${ravi.name}` }));
  mkRun({ date: today, staffId: ravi._id, beatId: sadar._id, status: "issued", bills: issueEntries(ravi, raviBills, false), issuedBy: admin._id, issuedAt: ago(25) });

  // ---------- Sunil: in the middle of a beat ----------
  const sunilRun = mkRun({ date: today, staffId: sunil._id, beatId: station._id, status: "started", startedAt: ago(170), startGps: CENTER, issuedBy: admin._id, issuedAt: ago(200) });
  const s0a = bill({ daysOld: 14, beat: station, shopIndex: 0, stage: "with_collector", holder: sunil });
  const s1a = bill({ daysOld: 20, beat: station, shopIndex: 1, stage: "with_collector", holder: sunil });
  const s1b = bill({ daysOld: 9, beat: station, shopIndex: 1, stage: "with_collector", holder: sunil });
  const s2a = bill({ daysOld: 12, beat: station, shopIndex: 2, stage: "with_collector", holder: sunil });
  const s3a = bill({ daysOld: 26, beat: station, shopIndex: 3, stage: "with_collector", holder: sunil });
  const s3b = bill({ daysOld: 15, beat: station, shopIndex: 3, stage: "with_collector", holder: sunil });
  const s3c = bill({ daysOld: 6, beat: station, shopIndex: 3, stage: "with_collector", holder: sunil });
  const s4a = bill({ daysOld: 11, beat: station, shopIndex: 4, stage: "with_collector", holder: sunil });
  const s5a = bill({ daysOld: 8, beat: station, shopIndex: 5, stage: "with_collector", holder: sunil });
  sunilRun.bills = issueEntries(sunil, [s0a, s1a, s1b, s2a, s3a, s3b, s3c, s4a, s5a], true) as never;
  const sv0 = visit(sunilRun, sunil, shop(station, 0), 160, 14);
  order(sunil, sv0, station, 3);
  pay("cash", [{ doc: s0a, amount: s0a.amountPaise }], sunil, { runId: sunilRun._id, visitId: sv0._id }, { receiptNo: 2001, createdAt: ago(150) });
  setOutcome(sunilRun, s0a, "paid");
  const sv1 = visit(sunilRun, sunil, shop(station, 1), 135, 18, { noOrderReason: "Stock is enough" });
  pay("cheque", [{ doc: s1a, amount: s1a.amountPaise }], sunil, { runId: sunilRun._id, visitId: sv1._id }, { chequeNo: "004512", chequeBank: "State Bank", chequeDate: today, chequeStatus: "received", photoId: photoIds.cheque, createdAt: ago(125) });
  setOutcome(sunilRun, s1a, "paid");
  setOutcome(sunilRun, s1b, "later");
  s1b.promiseDate = addDays(today, 3);
  visits.push(new Visit({ runId: sunilRun._id, shopId: shop(station, 2)._id, staffId: sunil._id, status: "skipped", skipReason: "Shop closed", checkInAt: ago(105), checkInGps: shop(station, 2).location }));
  setOutcome(sunilRun, s2a, "returned_as_is");
  flag("skipped_shop", "info", `${sunil.name} skipped ${shop(station, 2).name}: Shop closed`, { staffId: sunil._id, runId: sunilRun._id, status: "open" });
  flag("outside_shop", "warning", `${sunil.name} tried to check in at ${shop(station, 3).name} from 1,240 m away`, { staffId: sunil._id, runId: sunilRun._id });
  flag("long_gap", "info", `${sunil.name} took 47 minutes to reach ${shop(station, 3).name}`, { staffId: sunil._id, runId: sunilRun._id });
  visit(sunilRun, sunil, shop(station, 3), 9, null);

  // ---------- Amit: beat over, waiting for the evening check ----------
  const amitRun = mkRun({ date: today, staffId: amit._id, beatId: civil._id, status: "ended", startedAt: ago(360), startGps: CENTER, endedAt: ago(20), endGps: CENTER, issuedBy: admin._id, issuedAt: ago(390) });
  const a0a = bill({ daysOld: 21, beat: civil, shopIndex: 0, stage: "with_collector", holder: amit });
  const a0b = bill({ daysOld: 10, beat: civil, shopIndex: 0, stage: "with_collector", holder: amit });
  const a1a = bill({ daysOld: 16, beat: civil, shopIndex: 1, stage: "with_collector", holder: amit });
  const a2a = bill({ daysOld: 13, beat: civil, shopIndex: 2, stage: "with_collector", holder: amit });
  const a3a = bill({ daysOld: 7, beat: civil, shopIndex: 3, stage: "with_collector", holder: amit });
  const a4a = bill({ daysOld: 12, beat: civil, shopIndex: 4, stage: "with_collector", holder: amit });
  const a5a = bill({ daysOld: 5, beat: civil, shopIndex: 5, stage: "with_collector", holder: amit });
  amitRun.bills = issueEntries(amit, [a0a, a0b, a1a, a2a, a3a, a4a, a5a], true) as never;
  const av0 = visit(amitRun, amit, shop(civil, 0), 345, 16);
  order(amit, av0, civil, 5);
  pay("cash", [{ doc: a0a, amount: a0a.amountPaise }], amit, { runId: amitRun._id, visitId: av0._id }, { receiptNo: 3001 });
  setOutcome(amitRun, a0a, "paid");
  const partCash = Math.round(a0b.amountPaise / 2 / 100) * 100;
  pay("cash", [{ doc: a0b, amount: partCash }], amit, { runId: amitRun._id, visitId: av0._id }, { receiptNo: 3002 });
  setOutcome(amitRun, a0b, "part_paid");
  const av1 = visit(amitRun, amit, shop(civil, 1), 310, 12, { noOrderReason: "Payment pending first" });
  pay("cheque", [{ doc: a1a, amount: a1a.amountPaise }], amit, { runId: amitRun._id, visitId: av1._id }, { chequeNo: "118204", chequeBank: "Punjab National Bank", chequeDate: addDays(today, 7), chequeStatus: "received", photoId: photoIds.cheque });
  setOutcome(amitRun, a1a, "paid");
  const av2 = visit(amitRun, amit, shop(civil, 2), 280, 10);
  order(amit, av2, civil, 8);
  setOutcome(amitRun, a2a, "later");
  a2a.promiseDate = addDays(today, 2);
  const av3 = visit(amitRun, amit, shop(civil, 3), 240, 11, { noOrderReason: "Owner absent" });
  pay("upi", [{ doc: a3a, amount: a3a.amountPaise }], amit, { runId: amitRun._id, visitId: av3._id }, { qrRef: "U000301", upiTransactionRef: "631842207715" });
  setOutcome(amitRun, a3a, "paid");
  const av4 = visit(amitRun, amit, shop(civil, 4), 190, 42);
  order(amit, av4, civil, 11);
  const discount = Math.round(a4a.amountPaise * 0.02);
  const goodsBack = 42000;
  a4a.adjustedPaise = discount + goodsBack;
  adjustments.push(new Adjustment({ kind: "cash_discount", status: "pending", billId: a4a._id, shopId: a4a.shopId, staffId: amit._id, runId: amitRun._id, visitId: av4._id, amountPaise: discount, note: "2% for clearing early" }));
  adjustments.push(new Adjustment({ kind: "goods_return", status: "pending", billId: a4a._id, shopId: a4a.shopId, staffId: amit._id, runId: amitRun._id, visitId: av4._id, amountPaise: goodsBack, note: "1 bag salt returned, torn" }));
  flag("discount_review", "warning", `Cash discount of ${formatRupees(discount)} on ${a4a.billNo} needs review`, { staffId: amit._id, runId: amitRun._id, billId: a4a._id, amountPaise: discount });
  flag("long_stop", "info", `${amit.name} spent 42 minutes at ${shop(civil, 4).name}`, { staffId: amit._id, runId: amitRun._id });
  const lastCash = a4a.amountPaise - discount - goodsBack;
  pay("cash", [{ doc: a4a, amount: lastCash }], amit, { runId: amitRun._id, visitId: av4._id }, { receiptNo: 3003 });
  setOutcome(amitRun, a4a, "paid");
  visits.push(new Visit({ runId: amitRun._id, shopId: shop(civil, 5)._id, staffId: amit._id, status: "skipped", skipReason: "Owner absent", checkInAt: ago(120), checkInGps: shop(civil, 5).location }));
  setOutcome(amitRun, a5a, "returned_as_is");
  flag("skipped_shop", "info", `${amit.name} skipped ${shop(civil, 5).name}: Owner absent`, { staffId: amit._id, runId: amitRun._id });
  const amitCash = a0a.amountPaise + partCash + lastCash;

  // ---------- Deepak: blocked by yesterday's problems ----------
  const deepakOld = mkRun({ date: yesterday, staffId: deepak._id, beatId: mandi._id, status: "checked", startedAt: ago(1800), endedAt: ago(1500), issuedBy: admin._id, issuedAt: ago(1860), checkedBy: admin._id, checkedAt: ago(1440), expectedCashPaise: 1845000, countedCashPaise: 1795000 });
  const lostBill = bill({ daysOld: 24, beat: mandi, shopIndex: 4, stage: "with_collector", holder: deepak });
  deepakOld.bills = [{ billId: lostBill._id, shopId: lostBill.shopId, acceptedAt: ago(1850), outcome: "later", paperBack: false, notReceived: false }] as never;
  event(admin, "bill.missing", `Bill ${lostBill.billNo} not returned by ${deepak.name}`, ago(1440), [lostBill._id]);
  flag("missing_bill", "critical", `${deepak.name} did not return bill ${lostBill.billNo}`, { staffId: deepak._id, runId: deepakOld._id, billId: lostBill._id, amountPaise: lostBill.amountPaise }, yesterday);
  flag("cash_short", "critical", `${deepak.name}: cash short by ${formatRupees(50000)}`, { staffId: deepak._id, runId: deepakOld._id, amountPaise: 50000 }, yesterday);
  mkRun({ date: today, staffId: deepak._id, beatId: mandi._id, status: "planned" });
  [0, 1, 2].forEach((s, i) => bill({ daysOld: 15 - i, beat: mandi, shopIndex: s, stage: "in_file" }));

  // ---------- Gopal: waiting for bills ----------
  mkRun({ date: today, staffId: gopal._id, beatId: bapu._id, status: "planned" });
  [0, 0, 1, 2, 4].forEach((s, i) => bill({ daysOld: 19 - i * 2, beat: bapu, shopIndex: s, stage: "in_file" }));

  // ---------- Mohan: collection agent with a live UPI QR ----------
  const mohanRun = mkRun({ date: today, staffId: mohan._id, beatId: malviya._id, status: "started", startedAt: ago(90), startGps: CENTER, issuedBy: admin._id, issuedAt: ago(120) });
  const m0a = bill({ daysOld: 17, beat: malviya, shopIndex: 0, stage: "with_collector", holder: mohan });
  const m1a = bill({ daysOld: 14, beat: malviya, shopIndex: 1, stage: "with_collector", holder: mohan });
  const m1b = bill({ daysOld: 4, beat: malviya, shopIndex: 1, stage: "with_collector", holder: mohan });
  const m2a = bill({ daysOld: 10, beat: malviya, shopIndex: 2, stage: "with_collector", holder: mohan });
  const m3a = bill({ daysOld: 9, beat: malviya, shopIndex: 3, stage: "with_collector", holder: mohan });
  mohanRun.bills = issueEntries(mohan, [m0a, m1a, m1b, m2a, m3a], true) as never;
  const mv0 = visit(mohanRun, mohan, shop(malviya, 0), 80, 9);
  pay("upi", [{ doc: m0a, amount: m0a.amountPaise }], mohan, { runId: mohanRun._id, visitId: mv0._id }, { qrRef: "U000401", upiTransactionRef: "631855512904" });
  setOutcome(mohanRun, m0a, "paid");
  const mv1 = visit(mohanRun, mohan, shop(malviya, 1), 6, null);
  const cancelled = new Payment({ mode: "upi", status: "cancelled", source: "collection", amountPaise: m1a.amountPaise, allocations: [{ billId: m1a._id, amountPaise: m1a.amountPaise }], shopId: m1a.shopId, staffId: mohan._id, runId: mohanRun._id, visitId: mv1._id, date: today, qrRef: "U000402", statusReason: "Shopkeeper wanted to pay less", clientRef: ref() });
  payments.push(cancelled);

  // ---------- Imran: finished and clean ----------
  const imranRun = mkRun({ date: today, staffId: imran._id, beatId: industrial._id, status: "checked", startedAt: ago(420), startGps: CENTER, endedAt: ago(150), endGps: CENTER, issuedBy: admin._id, issuedAt: ago(450), checkedBy: ownerStaff._id, checkedAt: ago(120), expectedCashPaise: 0, countedCashPaise: 0 });
  const i0a = bill({ daysOld: 15, beat: industrial, shopIndex: 0, stage: "settling" });
  const i1a = bill({ daysOld: 12, beat: industrial, shopIndex: 1, stage: "settling" });
  const i2a = bill({ daysOld: 9, beat: industrial, shopIndex: 2, stage: "in_file" });
  imranRun.bills = issueEntries(imran, [i0a, i1a, i2a], true).map((e) => ({ ...e, paperBack: true })) as never;
  const iv0 = visit(imranRun, imran, shop(industrial, 0), 400, 11);
  const ip0 = pay("cash", [{ doc: i0a, amount: i0a.amountPaise }], imran, { runId: imranRun._id, visitId: iv0._id }, { status: "confirmed", receiptNo: 7001, confirmedBy: admin._id, confirmedAt: ago(120) });
  marg("payment", `Enter cash receipt from ${shop(industrial, 0).name} against ${i0a.billNo}`, i0a.amountPaise, [i0a._id], false, ip0._id);
  const iv1 = visit(imranRun, imran, shop(industrial, 1), 340, 9);
  const ip1 = pay("cash", [{ doc: i1a, amount: i1a.amountPaise }], imran, { runId: imranRun._id, visitId: iv1._id }, { status: "confirmed", receiptNo: 7002, confirmedBy: admin._id, confirmedAt: ago(120) });
  marg("payment", `Enter cash receipt from ${shop(industrial, 1).name} against ${i1a.billNo}`, i1a.amountPaise, [i1a._id], false, ip1._id);
  imranRun.expectedCashPaise = i0a.amountPaise + i1a.amountPaise;
  imranRun.countedCashPaise = imranRun.expectedCashPaise;
  visit(imranRun, imran, shop(industrial, 2), 290, 8);
  setOutcome(imranRun, i2a, "later");
  i2a.promiseDate = addDays(today, 5);
  for (let i = 3; i < 6; i++) visits.push(new Visit({ runId: imranRun._id, shopId: shop(industrial, i)._id, staffId: imran._id, status: "checked_out", checkInAt: ago(260 - i * 20), checkOutAt: ago(252 - i * 20), checkInGps: shop(industrial, i).location, checkInDistanceM: 22 }));

  // ---------- Cheque diary and UPI history ----------
  const old = (beat: (typeof beats)[0], shopIndex: number, daysOld: number, stage = "closed") => bill({ daysOld, beat, shopIndex, stage, holderLabel: "Closed file" });
  const c1 = old(sadar, 1, 30);
  pay("cheque", [{ doc: c1, amount: c1.amountPaise }], ravi, {}, { status: "confirmed", chequeNo: "220981", chequeBank: "HDFC Bank", chequeDate: addDays(today, -10), chequeStatus: "cleared", photoId: photoIds.cheque, date: addDays(today, -11), confirmedBy: admin._id, confirmedAt: ago(15000) });
  marg("payment", `Enter cheque receipt from ${shop(sadar, 1).name} against ${c1.billNo}`, c1.amountPaise, [c1._id], true);
  const c2 = old(bapu, 3, 12, "settling");
  pay("cheque", [{ doc: c2, amount: c2.amountPaise }], gopal, {}, { status: "confirmed", chequeNo: "330417", chequeBank: "ICICI Bank", chequeDate: addDays(today, -2), chequeStatus: "deposited", photoId: photoIds.cheque, date: addDays(today, -3), confirmedBy: admin._id, confirmedAt: ago(4300) });
  const c3 = old(mandi, 3, 9, "settling");
  pay("cheque", [{ doc: c3, amount: c3.amountPaise }], deepak, {}, { status: "confirmed", chequeNo: "550133", chequeBank: "Bank of Baroda", chequeDate: today, chequeStatus: "received", photoId: photoIds.cheque, date: yesterday, confirmedBy: admin._id, confirmedAt: ago(1440) });
  const c4 = old(sadar, 4, 22, "in_file");
  c4.holderLabel = "Office";
  const bounced = new Payment({ mode: "cheque", status: "rejected", source: "collection", amountPaise: c4.amountPaise, allocations: [{ billId: c4._id, amountPaise: c4.amountPaise }], shopId: c4.shopId, staffId: ravi._id, date: addDays(today, -6), chequeNo: "770256", chequeBank: "Axis Bank", chequeDate: addDays(today, -5), chequeStatus: "bounced", statusReason: "Insufficient funds", photoId: photoIds.cheque, clientRef: ref() });
  payments.push(bounced);
  event(admin, "cheque.bounced", "Cheque 770256 bounced, bills reopened", ago(2900), [c4._id], { reason: "Insufficient funds" });
  flag("cheque_bounced", "critical", "Cheque 770256 bounced: Insufficient funds", { staffId: ravi._id, paymentId: bounced._id, amountPaise: c4.amountPaise }, addDays(today, -2));
  marg("cheque_reversal", "Reverse bounced cheque 770256", c4.amountPaise, [c4._id], false, bounced._id);

  const u1 = old(bapu, 5, 16);
  pay("upi", [{ doc: u1, amount: u1.amountPaise }], gopal, {}, { status: "confirmed", qrRef: "U000101", upiTransactionRef: "630011284420", date: addDays(today, -4), confirmedBy: admin._id, confirmedAt: ago(5700) });
  marg("payment", `Enter upi receipt from ${shop(bapu, 5).name} against ${u1.billNo}`, u1.amountPaise, [u1._id], true);
  const u2 = old(sadar, 3, 19, "in_file");
  u2.holderLabel = "Office";
  const fakeUpi = new Payment({ mode: "upi", status: "rejected", source: "collection", amountPaise: u2.amountPaise, allocations: [{ billId: u2._id, amountPaise: u2.amountPaise }], shopId: u2.shopId, staffId: ravi._id, date: addDays(today, -5), qrRef: "U000102", upiTransactionRef: "630099887711", statusReason: "No such credit in bank statement", clientRef: ref() });
  payments.push(fakeUpi);

  // ---------- Delivery trips ----------
  const trips: InstanceType<typeof Trip>[] = [];
  const onVehicle = (beat: (typeof beats)[0], shopIndex: number, kind: "cash" | "credit", driver: { name: string }, helper: { name: string }, stage = "on_vehicle") =>
    bill({ daysOld: 0, beat, shopIndex, kind, stage, holderLabel: `${driver.name} and ${helper.name}`, size: 2 });

  // Vikram accepted, Raju has not.
  const t1Bills = [0, 1, 2, 3].map((i) => onVehicle(bapu, i, i === 2 ? "cash" : "credit", vikram, raju));
  trips.push(new Trip({
    date: today, beatId: bapu._id, vehicleId: v1._id, driverId: vikram._id, helperId: raju._id, status: "planned", createdBy: admin._id, driverAcceptedAt: ago(10),
    stops: [0, 1, 2, 3].map((i) => ({ shopId: shop(bapu, i)._id, sequence: i + 1 })),
    bills: t1Bills.map((b) => ({ billId: b._id, shopId: b.shopId })),
  }));

  // Harish and Pappu are mid-trip with one example of every result.
  const trip2 = new Trip({ date: today, beatId: mandi._id, vehicleId: v2._id, driverId: harish._id, helperId: pappu._id, status: "started", createdBy: admin._id, driverAcceptedAt: ago(220), helperAcceptedAt: ago(218), startedAt: ago(200), startGps: CENTER, startOdometer: v2.lastOdometer, startPhotoId: photoIds.odometer });
  trips.push(trip2);
  const hCredit = onVehicle(mandi, 0, "credit", harish, pappu, "awaiting_paper");
  const hCash = onVehicle(mandi, 1, "cash", harish, pappu, "awaiting_paper");
  const hCreditCash = onVehicle(mandi, 2, "credit", harish, pappu, "awaiting_paper");
  const hPartial = onVehicle(mandi, 3, "credit", harish, pappu, "awaiting_paper");
  const hNot = onVehicle(mandi, 3, "credit", harish, pappu);
  const hLive1 = onVehicle(mandi, 4, "credit", harish, pappu);
  const hLive2 = onVehicle(mandi, 4, "cash", harish, pappu);
  const hNext = onVehicle(mandi, 5, "credit", harish, pappu);
  const partialFirst = hPartial.lines[0]!;
  const shortQty = Math.min(1, partialFirst.quantity - 1);
  const partialValue = shortQty * (partialFirst.ratePaise ?? 0);
  hPartial.amountPaise -= partialValue;
  pay("cash", [{ doc: hCash, amount: hCash.amountPaise }], harish, { tripId: trip2._id, source: "delivery" });
  pay("cash", [{ doc: hCreditCash, amount: hCreditCash.amountPaise }], harish, { tripId: trip2._id, source: "delivery" });
  marg("credit_note", `Credit note on ${hPartial.billNo} for goods not delivered`, partialValue, [hPartial._id]);
  const result = (doc: InstanceType<typeof Bill>, r: string, extra: object = {}) => ({ billId: doc._id, shopId: doc.shopId, result: r, at: r === "pending" ? null : ago(90), gps: r === "pending" ? null : shop(mandi, 0).location, ...extra });
  trip2.stops = [0, 1, 2, 3, 4, 5].map((i) => ({ shopId: shop(mandi, i)._id, sequence: i + 1, arrivedAt: i < 5 ? ago(180 - i * 30) : null, arrivedGps: i < 5 ? shop(mandi, i).location : null, departedAt: i < 4 ? ago(170 - i * 30) : null })) as never;
  trip2.bills = [
    result(hCredit, "credit_delivered", { photoId: photoIds.signed }),
    result(hCash, "cash_paid", { cashPaise: hCash.amountPaise, photoId: photoIds.signed }),
    result(hCreditCash, "credit_paid_cash", { cashPaise: hCreditCash.amountPaise, photoId: photoIds.signed }),
    result(hPartial, "partial", {
      reason: "Goods damaged", photoId: photoIds.signed,
      items: hPartial.lines.map((l, i) => ({ productId: l.productId, name: l.name, unit: l.unit, billedQty: l.quantity, deliveredQty: i === 0 ? l.quantity - shortQty : l.quantity })),
    }),
    result(hNot, "not_delivered", { reason: "Shop refused" }),
    result(hLive1, "pending"), result(hLive2, "pending"), result(hNext, "pending"),
  ] as never;

  // Naresh and Kallu are back, waiting for godown and the evening check.
  const trip3 = new Trip({ date: today, beatId: civil._id, vehicleId: v3._id, driverId: naresh._id, helperId: kallu._id, status: "ended", createdBy: admin._id, driverAcceptedAt: ago(420), helperAcceptedAt: ago(419), startedAt: ago(400), startGps: CENTER, startOdometer: 31460, startPhotoId: photoIds.odometer, endedAt: ago(35), endGps: CENTER, endOdometer: 31512, endPhotoId: photoIds.odometer });
  v3.lastOdometer = 31512;
  await Vehicle.updateOne({ _id: v3._id }, { lastOdometer: 31512 });
  trips.push(trip3);
  const n1 = onVehicle(civil, 0, "credit", naresh, kallu, "awaiting_paper");
  const n2 = onVehicle(civil, 1, "cash", naresh, kallu, "awaiting_paper");
  const n3 = onVehicle(civil, 2, "credit", naresh, kallu, "awaiting_paper");
  const n4 = onVehicle(civil, 3, "credit", naresh, kallu);
  const n5 = onVehicle(civil, 4, "credit", naresh, kallu, "awaiting_paper");
  const n3First = n3.lines[0]!;
  const n3Short = Math.min(2, n3First.quantity - 1);
  const n3Value = n3Short * (n3First.ratePaise ?? 0);
  n3.amountPaise -= n3Value;
  pay("cash", [{ doc: n2, amount: n2.amountPaise }], naresh, { tripId: trip3._id, source: "delivery" });
  marg("credit_note", `Credit note on ${n3.billNo} for goods not delivered`, n3Value, [n3._id]);
  const nResult = (doc: InstanceType<typeof Bill>, r: string, extra: object = {}) => ({ billId: doc._id, shopId: doc.shopId, result: r, at: ago(150), gps: shop(civil, 0).location, ...extra });
  trip3.stops = [0, 1, 2, 3, 4].map((i) => ({ shopId: shop(civil, i)._id, sequence: i + 1, arrivedAt: ago(350 - i * 50), arrivedGps: shop(civil, i).location, departedAt: ago(340 - i * 50) })) as never;
  trip3.bills = [
    nResult(n1, "credit_delivered", { photoId: photoIds.signed }),
    nResult(n2, "cash_paid", { cashPaise: n2.amountPaise, photoId: photoIds.signed }),
    nResult(n3, "partial", { reason: "Shop took less", photoId: photoIds.signed, items: n3.lines.map((l, i) => ({ productId: l.productId, name: l.name, unit: l.unit, billedQty: l.quantity, deliveredQty: i === 0 ? l.quantity - n3Short : l.quantity })) }),
    nResult(n4, "not_delivered", { reason: "Shop closed" }),
    nResult(n5, "credit_delivered", { photoId: photoIds.signed }),
  ] as never;
  flag("km_over_plan", "warning", `${v3.number} ran 52 km against 30 km planned`, { staffId: naresh._id, tripId: trip3._id });
  await Trip.insertMany(trips);

  // Bills ready for a new load sheet.
  [0, 1, 2, 3].forEach((i) => bill({ daysOld: 0, beat: industrial, shopIndex: i, kind: i === 1 ? "cash" : "credit", stage: "billed", size: 2 }));

  // ---------- Fuel ----------
  const advanceOpen = new CashAdvance({ staffId: naresh._id, vehicleId: v3._id, amountPaise: 300000, givenBy: admin._id });
  await CashAdvance.insertMany([advanceOpen, { staffId: harish._id, vehicleId: v2._id, amountPaise: 200000, status: "settled", givenBy: admin._id, returnedPaise: 20000, settledAt: ago(2800) }]);
  const fuelBase = { odometerPhotoId: photoIds.odometer, meterPhotoId: photoIds.meter, billPhotoId: photoIds.fuelBill, pumpName: "Highway Fuels" };
  await FuelEntry.insertMany([
    { ...fuelBase, date: addDays(today, -4), vehicleId: v3._id, staffId: naresh._id, odometer: 31180, litres: 28, amountPaise: 266000, pumpBillNo: "F-2199", pumpBillDate: addDays(today, -4), duplicateKey: `f-2199|${addDays(today, -4)}|266000`, kmSinceLast: 330, kmPerLitre: 11.8, status: "accepted", reviewNote: "" },
    { ...fuelBase, date: today, vehicleId: v3._id, staffId: naresh._id, tripId: trip3._id, advanceId: advanceOpen._id, odometer: 31440, litres: 26, amountPaise: 247000, pumpBillNo: "F-2241", pumpBillDate: today, duplicateKey: `f-2241|${today}|247000`, kmSinceLast: 260, kmPerLitre: 9.3, lowMileage: true },
    { ...fuelBase, date: addDays(today, -1), vehicleId: v2._id, staffId: harish._id, odometer: 63150, litres: 30, amountPaise: 285000, pumpBillNo: "F-2230", pumpBillDate: addDays(today, -1), duplicateKey: `f-2230|${addDays(today, -1)}|285000`, kmSinceLast: 320, kmPerLitre: 10.7 },
  ]);
  flag("low_mileage", "warning", `${v3.number} gave 9.3 km/L against a normal of 12`, { staffId: naresh._id, tripId: trip3._id });

  // ---------- Other oversight examples ----------
  flag("late_entry", "warning", `${amit.name}: check-in at ${shop(civil, 2).name} reached the office 48 minutes late`, { staffId: amit._id, runId: amitRun._id });
  flag("speed_jump", "warning", `${mohan.name} moved 14.2 km in 3 minutes before ${shop(malviya, 1).name}`, { staffId: mohan._id, runId: mohanRun._id });
  flag("override_used", "warning", `Bills issued to ${gopal.name} despite 1 open problem`, { staffId: gopal._id, status: "resolved", resolvedBy: admin._id, resolvedAt: ago(2900), resolution: "Festival rush, the bill was found the next morning" }, addDays(today, -2));
  flag("same_person_check", "warning", `${admin.name} both issued bills to and checked ${gopal.name}`, { staffId: admin._id }, yesterday);

  await Bill.insertMany(allBills);
  await BeatRun.insertMany(runs);
  await Visit.insertMany(visits);
  await Payment.insertMany(payments);
  await Adjustment.insertMany(adjustments);
  await Exception.insertMany(exceptions);
  await MargTask.insertMany(tasks);
  await Order.insertMany(orders);
  await Event.insertMany(events);
  await Counter.create({ _id: "order", value: orderCounter });

  // ---------- Who to show ----------
  const money = formatRupees;
  const short = amitCash - 50000;
  const persona = (staff: { _id: Types.ObjectId }, role: Role, title: string, story: string, tryThis: string[]) => ({ staffId: staff._id, role, title, story, tryThis });
  const list = [
    persona(ravi, "salesman", "Morning: bills waiting to accept", "The office has issued today's bills. Until they are accepted on the phone, the beat cannot start.", ["Mark one bill as Not received and see it go back to the file.", "Accept the others, then start the beat.", "Go to Janta Provision, a shop with no saved location, and see the first check-in lock it."]),
    persona(sunil, "salesman", "Mid-beat: currently inside a shop", "Two shops are finished, one is skipped and one is open. Laxmi Stores has three bills, oldest first.", ["Open Laxmi Stores and take a part payment. See it fill the oldest bill first.", "Create an order from the priority list, or record why there is none.", "Set location to Away from shop and try checking in at the next shop.", "Try receipt number 2001 again and see it refused."]),
    persona(amit, "salesman", "Beat finished: waiting for office check", "Everything happened on this beat: cash, part payment, post-dated cheque, UPI, discount, goods return and a skipped shop.", ["Read today's results on this phone.", "Then switch to Office admin and run the evening check for this beat."]),
    persona(deepak, "salesman", "Blocked by yesterday's problems", "A bill was not returned yesterday and cash was short. The office cannot issue new bills until this is resolved or overridden.", ["See the problems shown to the salesman.", "Switch to Office admin, open Issue bills, and try to issue to this salesman."]),
    persona(gopal, "salesman", "Waiting for today's bills", "The weekly plan shows today's beat. Bills are in the file but have not been issued yet.", ["Switch to Office admin and issue bills.", "Come back here and accept them."]),
    persona(mohan, "collection_agent", "Collecting with a UPI QR", "A collection agent uses the same process with no order-taking. An earlier QR at Sector Stores was cancelled and stays on record.", ["Open Sector Stores and enter an amount for UPI.", "Show the QR, enter any 12-digit reference, and confirm.", "Repeat reference 631855512904 and see it refused as a duplicate."]),
    persona(imran, "collection_agent", "Finished and clean", "The evening check is complete with no differences.", ["See the completed day with bills back and cash matched."]),
    persona(raju, "helper", "Helper has not accepted the load", "The driver has accepted the load sheet, but the trip cannot start until the helper does too.", ["Accept the load sheet.", "Switch to Driver: load accepted, ready to start."]),
    persona(vikram, "driver", "Load accepted, ready to start", "Both people must accept the load before the trip starts. Once the helper accepts, the driver records the opening odometer with a photo.", ["If the helper has not accepted, see the trip locked.", "After that, enter the odometer, take the photo and start."]),
    persona(harish, "driver", "Mid-trip: one example of every result", "Finished stops show delivered on credit, cash bill paid, credit bill paid in cash, partly delivered and not delivered. Two bills at Bansal Kirana are still open.", ["Open Bansal Kirana and record a result for each bill.", "Try a partly delivered bill and enter quantities item by item.", "Set location to Away from shop and try to arrive at Saini Mart."]),
    persona(pappu, "helper", "Helper on a running trip", "The helper sees the same trip and can record arrivals and results. Only the driver can start or end the trip.", ["Open Bansal Kirana and record a result."]),
    persona(naresh, "driver", "Trip over: fuel flagged", "The trip is finished and waiting for the office. Today's fuel entry was flagged for low mileage and a cash advance is still open.", [`Open Fuel and enter pump bill F-2241 dated today for ${money(247000)} to see it refused as already claimed.`, "See the open cash advance."]),
    persona(kallu, "helper", "Helper on a finished trip", "The trip is finished. Bills, cash and returned goods now need to reach the office.", ["See the result of every bill."]),
    persona(manoj, "driver", "No load sheet yet", "No trip has been planned today for this driver.", ["Switch to Office admin, open Load sheet and create a trip with this driver and helper Chotu Lal.", "Come back and see the new load sheet."]),
    persona(godownStaff, "godown", "Returned goods to count", "One vehicle came back with undelivered goods. The godown counts without seeing what the app expects. A goods return from a shop is also waiting.", ["Count the goods. Enter one wrong figure to see a mismatch flagged.", "Receive or reject the goods return."]),
    persona(admin, "admin", "Office work queues", "Every office queue has work in it.", [`Evening check for Amit Joshi: count ${money(short)} (₹500 short), leave one bill unticked, and enter next unused receipt 3005.`, "Issue bills to Deepak Yadav and see the block.", "Match UPI, mark a cheque, and tick Marg entries.", "Search a bill and open its full trail."]),
    persona(ownerStaff, "owner", "Today's summary and problems", "One page with today's money, what is still unconfirmed, staff on the road, and every problem or override.", ["Open the live board.", "Open a bill's history from any problem."]),
  ];
  await DemoPersona.insertMany(list.map((row, order) => ({ ...row, order })));
}
