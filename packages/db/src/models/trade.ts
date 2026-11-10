import mongoose, { type InferSchemaType, type Model } from "mongoose";

const tradeSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true, index: true },
    side: { type: String, required: true, enum: ["buy", "sell"] },
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

export type TradeAttrs = InferSchemaType<typeof tradeSchema>;

// Reuses the compiled model when a dev server hot-reloads this module.
export const Trade: Model<TradeAttrs> =
  (mongoose.models.Trade as Model<TradeAttrs> | undefined) ??
  mongoose.model<TradeAttrs>("Trade", tradeSchema);
