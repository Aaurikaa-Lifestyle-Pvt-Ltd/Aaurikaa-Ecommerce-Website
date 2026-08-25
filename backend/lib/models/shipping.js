// lib/models/shipping.js
import mongoose from "mongoose";

const ZoneSchema = new mongoose.Schema({
  name: String,
  region: String,
});

const WeightSchema = new mongoose.Schema({
  from: Number,
  to: Number,
  label: String,
});

const FlatRuleSchema = new mongoose.Schema({
  zone: { type: mongoose.Schema.Types.ObjectId, ref: "Zone" },
  weight: { type: mongoose.Schema.Types.ObjectId, ref: "Weight" },
  charge: Number,
});

const FreeRuleSchema = new mongoose.Schema({
  minAmount: Number,
  zone: { type: mongoose.Schema.Types.ObjectId, ref: "Zone", required: false },
});

const CouponSchema = new mongoose.Schema({
  code: String,
  freeShipping: Boolean,
});

export const Zone = mongoose.models.Zone || mongoose.model("Zone", ZoneSchema);
export const Weight =
  mongoose.models.Weight || mongoose.model("Weight", WeightSchema);
export const FlatRule =
  mongoose.models.FlatRule || mongoose.model("FlatRule", FlatRuleSchema);
export const FreeRule =
  mongoose.models.FreeRule || mongoose.model("FreeRule", FreeRuleSchema);
export const Coupon =
  mongoose.models.Coupon || mongoose.model("Coupon", CouponSchema);
