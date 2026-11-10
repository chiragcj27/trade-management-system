import mongoose, { type InferSchemaType, type Model, Schema } from "mongoose";

const { ObjectId, Mixed } = Schema.Types;

const gps = new Schema({ lat: Number, lng: Number, accuracy: Number }, { _id: false });
const allocation = new Schema(
  { billId: { type: ObjectId, ref: "Bill", required: true }, amountPaise: { type: Number, required: true } },
  { _id: false },
);

// ---------- Masters ----------

const staffSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    role: { type: String, required: true, index: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type StaffAttrs = InferSchemaType<typeof staffSchema>;
export const Staff: Model<StaffAttrs> = mongoose.model<StaffAttrs>("Staff", staffSchema);

const beatSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    plannedMinutes: { type: Number, default: 300 },
    plannedKm: { type: Number, default: 40 },
  },
  { timestamps: true },
);
export type BeatAttrs = InferSchemaType<typeof beatSchema>;
export const Beat: Model<BeatAttrs> = mongoose.model<BeatAttrs>("Beat", beatSchema);

const beatPlanSchema = new Schema({
  staffId: { type: ObjectId, ref: "Staff", required: true },
  weekday: { type: Number, required: true, min: 0, max: 6 },
  beatId: { type: ObjectId, ref: "Beat", required: true },
});
beatPlanSchema.index({ staffId: 1, weekday: 1 }, { unique: true });
export type BeatPlanAttrs = InferSchemaType<typeof beatPlanSchema>;
export const BeatPlan: Model<BeatPlanAttrs> = mongoose.model<BeatPlanAttrs>("BeatPlan", beatPlanSchema);

const shopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "" },
    address: { type: String, default: "" },
    beatId: { type: ObjectId, ref: "Beat", required: true, index: true },
    sequence: { type: Number, required: true },
    location: { type: gps, default: null },
    locationRequest: {
      type: new Schema(
        { lat: Number, lng: Number, staffId: ObjectId, at: Date, reason: String },
        { _id: false },
      ),
      default: null,
    },
  },
  { timestamps: true },
);
export type ShopAttrs = InferSchemaType<typeof shopSchema>;
export const Shop: Model<ShopAttrs> = mongoose.model<ShopAttrs>("Shop", shopSchema);

const productSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    unit: { type: String, default: "box" },
    priority: { type: Number, required: true, index: true },
    ratePaise: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type ProductAttrs = InferSchemaType<typeof productSchema>;
export const Product: Model<ProductAttrs> = mongoose.model<ProductAttrs>("Product", productSchema);

const vehicleSchema = new Schema(
  {
    number: { type: String, required: true, unique: true, trim: true },
    normalKmPerLitre: { type: Number, default: 12 },
    lastOdometer: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export type VehicleAttrs = InferSchemaType<typeof vehicleSchema>;
export const Vehicle: Model<VehicleAttrs> = mongoose.model<VehicleAttrs>("Vehicle", vehicleSchema);

const settingsSchema = new Schema({
  singleton: { type: String, default: "settings", unique: true },
  checkInRadiusMeters: { type: Number, default: 150 },
  discountLimitPercent: { type: Number, default: null },
  maxStopMinutes: { type: Number, default: 30 },
  maxGapMinutes: { type: Number, default: 30 },
  mileageTolerancePercent: { type: Number, default: 15 },
  lateEntryMinutes: { type: Number, default: 30 },
  firmName: { type: String, default: "" },
  firmUpiId: { type: String, default: "" },
});
export type SettingsAttrs = InferSchemaType<typeof settingsSchema>;
export const Settings: Model<SettingsAttrs> = mongoose.model<SettingsAttrs>("Settings", settingsSchema);

const receiptBookSchema = new Schema(
  {
    staffId: { type: ObjectId, ref: "Staff", required: true, index: true },
    fromSerial: { type: Number, required: true },
    toSerial: { type: Number, required: true },
    checkedUpto: { type: Number, default: 0 },
    closed: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export type ReceiptBookAttrs = InferSchemaType<typeof receiptBookSchema>;
export const ReceiptBook: Model<ReceiptBookAttrs> = mongoose.model<ReceiptBookAttrs>("ReceiptBook", receiptBookSchema);

// ---------- Orders and bills ----------

const orderSchema = new Schema(
  {
    orderNo: { type: Number, required: true, unique: true },
    shopId: { type: ObjectId, ref: "Shop", required: true, index: true },
    beatId: { type: ObjectId, ref: "Beat", required: true },
    staffId: { type: ObjectId, ref: "Staff", required: true },
    visitId: { type: ObjectId, ref: "Visit", required: true, index: true },
    lines: [
      new Schema(
        {
          productId: { type: ObjectId, ref: "Product", required: true },
          name: { type: String, required: true },
          unit: String,
          quantity: { type: Number, required: true },
          ratePaise: { type: Number, default: 0 },
        },
        { _id: false },
      ),
    ],
    status: { type: String, default: "new", index: true },
    billId: { type: ObjectId, ref: "Bill", default: null },
    clientRef: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);
export type OrderAttrs = InferSchemaType<typeof orderSchema>;
export const Order: Model<OrderAttrs> = mongoose.model<OrderAttrs>("Order", orderSchema);

const billSchema = new Schema(
  {
    billNo: { type: String, required: true, unique: true, trim: true },
    billDate: { type: String, required: true, index: true },
    kind: { type: String, required: true },
    shopId: { type: ObjectId, ref: "Shop", required: true, index: true },
    beatId: { type: ObjectId, ref: "Beat", required: true, index: true },
    orderId: { type: ObjectId, ref: "Order", default: null },
    lines: [
      new Schema(
        {
          productId: { type: ObjectId, ref: "Product", required: true },
          name: { type: String, required: true },
          unit: String,
          quantity: { type: Number, required: true },
          ratePaise: { type: Number, default: 0 },
        },
        { _id: false },
      ),
    ],
    originalAmountPaise: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    confirmedPaise: { type: Number, default: 0 },
    claimedPaise: { type: Number, default: 0 },
    adjustedPaise: { type: Number, default: 0 },
    stage: { type: String, required: true, index: true },
    holderStaffId: { type: ObjectId, ref: "Staff", default: null, index: true },
    holderLabel: { type: String, default: "Office" },
    promiseDate: { type: String, default: null },
    signedPhotoId: { type: ObjectId, ref: "Photo", default: null },
  },
  { timestamps: true },
);
export type BillAttrs = InferSchemaType<typeof billSchema>;
export const Bill: Model<BillAttrs> = mongoose.model<BillAttrs>("Bill", billSchema);

// ---------- Collection beat ----------

const beatRunSchema = new Schema(
  {
    date: { type: String, required: true, index: true },
    staffId: { type: ObjectId, ref: "Staff", required: true, index: true },
    beatId: { type: ObjectId, ref: "Beat", required: true },
    status: { type: String, default: "planned", index: true },
    bills: [
      new Schema(
        {
          billId: { type: ObjectId, ref: "Bill", required: true },
          shopId: { type: ObjectId, ref: "Shop", required: true },
          acceptedAt: { type: Date, default: null },
          notReceived: { type: Boolean, default: false },
          outcome: { type: String, default: null },
          paperBack: { type: Boolean, default: null },
        },
        { _id: false },
      ),
    ],
    issuedBy: { type: ObjectId, ref: "Staff", default: null },
    issuedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    startGps: { type: gps, default: null },
    endedAt: { type: Date, default: null },
    endGps: { type: gps, default: null },
    expectedCashPaise: { type: Number, default: null },
    countedCashPaise: { type: Number, default: null },
    checkedBy: { type: ObjectId, ref: "Staff", default: null },
    checkedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
beatRunSchema.index({ date: 1, staffId: 1 }, { unique: true });
export type BeatRunAttrs = InferSchemaType<typeof beatRunSchema>;
export const BeatRun: Model<BeatRunAttrs> = mongoose.model<BeatRunAttrs>("BeatRun", beatRunSchema);

const visitSchema = new Schema(
  {
    runId: { type: ObjectId, ref: "BeatRun", required: true, index: true },
    shopId: { type: ObjectId, ref: "Shop", required: true, index: true },
    staffId: { type: ObjectId, ref: "Staff", required: true },
    status: { type: String, required: true },
    checkInAt: { type: Date, default: null },
    checkInGps: { type: gps, default: null },
    checkInDistanceM: { type: Number, default: null },
    checkOutAt: { type: Date, default: null },
    checkOutGps: { type: gps, default: null },
    skipReason: { type: String, default: null },
    noOrderReason: { type: String, default: null },
    orderId: { type: ObjectId, ref: "Order", default: null },
  },
  { timestamps: true },
);
visitSchema.index({ runId: 1, shopId: 1 }, { unique: true });
export type VisitAttrs = InferSchemaType<typeof visitSchema>;
export const Visit: Model<VisitAttrs> = mongoose.model<VisitAttrs>("Visit", visitSchema);

const paymentSchema = new Schema(
  {
    mode: { type: String, required: true, index: true },
    status: { type: String, required: true, index: true },
    source: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    allocations: [allocation],
    shopId: { type: ObjectId, ref: "Shop", required: true, index: true },
    staffId: { type: ObjectId, ref: "Staff", required: true, index: true },
    runId: { type: ObjectId, ref: "BeatRun", default: null, index: true },
    visitId: { type: ObjectId, ref: "Visit", default: null, index: true },
    tripId: { type: ObjectId, ref: "Trip", default: null, index: true },
    date: { type: String, required: true, index: true },
    gps: { type: gps, default: null },
    receiptNo: { type: Number, default: undefined },
    chequeNo: { type: String, default: null },
    chequeBank: { type: String, default: null },
    chequeDate: { type: String, default: null },
    chequeStatus: { type: String, default: null, index: true },
    photoId: { type: ObjectId, ref: "Photo", default: null },
    qrRef: { type: String, default: undefined },
    upiUrl: { type: String, default: null },
    upiTransactionRef: { type: String, default: undefined },
    confirmedBy: { type: ObjectId, ref: "Staff", default: null },
    confirmedAt: { type: Date, default: null },
    statusReason: { type: String, default: null },
    clientRef: { type: String, required: true, unique: true },
  },
  { timestamps: true },
);
paymentSchema.index({ receiptNo: 1 }, { unique: true, sparse: true });
paymentSchema.index({ qrRef: 1 }, { unique: true, sparse: true });
paymentSchema.index({ upiTransactionRef: 1 }, { unique: true, sparse: true });
export type PaymentAttrs = InferSchemaType<typeof paymentSchema>;
export const Payment: Model<PaymentAttrs> = mongoose.model<PaymentAttrs>("Payment", paymentSchema);

const adjustmentSchema = new Schema(
  {
    kind: { type: String, required: true },
    status: { type: String, required: true, index: true },
    billId: { type: ObjectId, ref: "Bill", required: true, index: true },
    shopId: { type: ObjectId, ref: "Shop", required: true },
    staffId: { type: ObjectId, ref: "Staff", required: true },
    runId: { type: ObjectId, ref: "BeatRun", default: null },
    visitId: { type: ObjectId, ref: "Visit", default: null },
    amountPaise: { type: Number, required: true },
    note: { type: String, default: "" },
    decidedBy: { type: ObjectId, ref: "Staff", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, default: null },
  },
  { timestamps: true },
);
export type AdjustmentAttrs = InferSchemaType<typeof adjustmentSchema>;
export const Adjustment: Model<AdjustmentAttrs> = mongoose.model<AdjustmentAttrs>("Adjustment", adjustmentSchema);

// ---------- Delivery and vehicle ----------

const tripSchema = new Schema(
  {
    date: { type: String, required: true, index: true },
    beatId: { type: ObjectId, ref: "Beat", required: true },
    vehicleId: { type: ObjectId, ref: "Vehicle", required: true },
    driverId: { type: ObjectId, ref: "Staff", required: true, index: true },
    helperId: { type: ObjectId, ref: "Staff", required: true, index: true },
    status: { type: String, default: "planned", index: true },
    driverAcceptedAt: { type: Date, default: null },
    helperAcceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    startGps: { type: gps, default: null },
    startOdometer: { type: Number, default: null },
    startPhotoId: { type: ObjectId, ref: "Photo", default: null },
    endedAt: { type: Date, default: null },
    endGps: { type: gps, default: null },
    endOdometer: { type: Number, default: null },
    endPhotoId: { type: ObjectId, ref: "Photo", default: null },
    stops: [
      new Schema(
        {
          shopId: { type: ObjectId, ref: "Shop", required: true },
          sequence: Number,
          arrivedAt: { type: Date, default: null },
          arrivedGps: { type: gps, default: null },
          departedAt: { type: Date, default: null },
        },
        { _id: false },
      ),
    ],
    bills: [
      new Schema(
        {
          billId: { type: ObjectId, ref: "Bill", required: true },
          shopId: { type: ObjectId, ref: "Shop", required: true },
          result: { type: String, default: "pending" },
          reason: { type: String, default: null },
          cashPaise: { type: Number, default: 0 },
          photoId: { type: ObjectId, ref: "Photo", default: null },
          at: { type: Date, default: null },
          gps: { type: gps, default: null },
          items: [
            new Schema(
              {
                productId: { type: ObjectId, required: true },
                name: String,
                unit: String,
                billedQty: Number,
                deliveredQty: Number,
              },
              { _id: false },
            ),
          ],
          paperBack: { type: Boolean, default: null },
        },
        { _id: false },
      ),
    ],
    godownCount: [new Schema({ productId: ObjectId, name: String, counted: Number, expected: Number }, { _id: false })],
    godownCountedBy: { type: ObjectId, ref: "Staff", default: null },
    godownCountedAt: { type: Date, default: null },
    expectedCashPaise: { type: Number, default: null },
    countedCashPaise: { type: Number, default: null },
    createdBy: { type: ObjectId, ref: "Staff", default: null },
    checkedBy: { type: ObjectId, ref: "Staff", default: null },
    checkedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export type TripAttrs = InferSchemaType<typeof tripSchema>;
export const Trip: Model<TripAttrs> = mongoose.model<TripAttrs>("Trip", tripSchema);

const fuelEntrySchema = new Schema(
  {
    date: { type: String, required: true, index: true },
    vehicleId: { type: ObjectId, ref: "Vehicle", required: true, index: true },
    staffId: { type: ObjectId, ref: "Staff", required: true },
    tripId: { type: ObjectId, ref: "Trip", default: null },
    advanceId: { type: ObjectId, ref: "CashAdvance", default: null },
    odometer: { type: Number, required: true },
    litres: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    pumpName: { type: String, default: "" },
    pumpBillNo: { type: String, required: true },
    pumpBillDate: { type: String, required: true },
    duplicateKey: { type: String, required: true, unique: true },
    odometerPhotoId: { type: ObjectId, ref: "Photo", required: true },
    meterPhotoId: { type: ObjectId, ref: "Photo", required: true },
    billPhotoId: { type: ObjectId, ref: "Photo", required: true },
    gps: { type: gps, default: null },
    kmSinceLast: { type: Number, default: null },
    kmPerLitre: { type: Number, default: null },
    lowMileage: { type: Boolean, default: false },
    status: { type: String, default: "submitted", index: true },
    reviewNote: { type: String, default: null },
  },
  { timestamps: true },
);
export type FuelEntryAttrs = InferSchemaType<typeof fuelEntrySchema>;
export const FuelEntry: Model<FuelEntryAttrs> = mongoose.model<FuelEntryAttrs>("FuelEntry", fuelEntrySchema);

const cashAdvanceSchema = new Schema(
  {
    staffId: { type: ObjectId, ref: "Staff", required: true, index: true },
    vehicleId: { type: ObjectId, ref: "Vehicle", required: true },
    amountPaise: { type: Number, required: true },
    status: { type: String, default: "open", index: true },
    givenBy: { type: ObjectId, ref: "Staff", required: true },
    returnedPaise: { type: Number, default: 0 },
    settledAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export type CashAdvanceAttrs = InferSchemaType<typeof cashAdvanceSchema>;
export const CashAdvance: Model<CashAdvanceAttrs> = mongoose.model<CashAdvanceAttrs>("CashAdvance", cashAdvanceSchema);

// ---------- Oversight ----------

const margTaskSchema = new Schema(
  {
    kind: { type: String, required: true },
    status: { type: String, default: "pending", index: true },
    description: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    billIds: [{ type: ObjectId, ref: "Bill" }],
    paymentId: { type: ObjectId, ref: "Payment", default: null },
    doneBy: { type: ObjectId, ref: "Staff", default: null },
    doneAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export type MargTaskAttrs = InferSchemaType<typeof margTaskSchema>;
export const MargTask: Model<MargTaskAttrs> = mongoose.model<MargTaskAttrs>("MargTask", margTaskSchema);

const exceptionSchema = new Schema(
  {
    type: { type: String, required: true, index: true },
    severity: { type: String, required: true },
    status: { type: String, default: "open", index: true },
    date: { type: String, required: true, index: true },
    message: { type: String, required: true },
    staffId: { type: ObjectId, ref: "Staff", default: null, index: true },
    runId: { type: ObjectId, ref: "BeatRun", default: null },
    tripId: { type: ObjectId, ref: "Trip", default: null },
    billId: { type: ObjectId, ref: "Bill", default: null },
    paymentId: { type: ObjectId, ref: "Payment", default: null },
    amountPaise: { type: Number, default: null },
    resolvedBy: { type: ObjectId, ref: "Staff", default: null },
    resolvedAt: { type: Date, default: null },
    resolution: { type: String, default: null },
  },
  { timestamps: true },
);
export type ExceptionAttrs = InferSchemaType<typeof exceptionSchema>;
export const Exception: Model<ExceptionAttrs> = mongoose.model<ExceptionAttrs>("Exception", exceptionSchema);

/** Permanent log. Nothing in the app updates or deletes these records. */
const eventSchema = new Schema({
  at: { type: Date, required: true, default: () => new Date(), index: true },
  deviceAt: { type: Date, default: null },
  actorId: { type: ObjectId, ref: "Staff", default: null, index: true },
  actorName: { type: String, default: "" },
  action: { type: String, required: true, index: true },
  summary: { type: String, required: true },
  billIds: { type: [ObjectId], index: true, default: [] },
  shopId: { type: ObjectId, default: null },
  gps: { type: gps, default: null },
  reason: { type: String, default: null },
  data: { type: Mixed, default: null },
});
export type EventAttrs = InferSchemaType<typeof eventSchema>;
export const Event: Model<EventAttrs> = mongoose.model<EventAttrs>("Event", eventSchema);

const photoSchema = new Schema(
  {
    kind: { type: String, required: true },
    mime: { type: String, required: true },
    data: { type: Buffer, required: true },
    takenBy: { type: ObjectId, ref: "Staff", required: true },
    gps: { type: gps, default: null },
  },
  { timestamps: true },
);
export type PhotoAttrs = InferSchemaType<typeof photoSchema>;
export const Photo: Model<PhotoAttrs> = mongoose.model<PhotoAttrs>("Photo", photoSchema);

const counterSchema = new Schema({ _id: String, value: { type: Number, default: 0 } });
export const Counter = mongoose.model("Counter", counterSchema);

const demoPersonaSchema = new Schema({
  staffId: { type: ObjectId, ref: "Staff", required: true },
  role: { type: String, required: true },
  order: { type: Number, required: true },
  title: { type: String, required: true },
  story: { type: String, required: true },
  tryThis: { type: [String], default: [] },
});
export type DemoPersonaAttrs = InferSchemaType<typeof demoPersonaSchema>;
export const DemoPersona: Model<DemoPersonaAttrs> = mongoose.model<DemoPersonaAttrs>("DemoPersona", demoPersonaSchema);
