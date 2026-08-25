// models/FlatShippingRule.js
const mongoose = require('mongoose');


const FlatShippingRuleSchema = new mongoose.Schema(
{
zone: { type: mongoose.Schema.Types.ObjectId, ref: 'ShippingZone', required: true },
weightClass: { type: mongoose.Schema.Types.ObjectId, ref: 'WeightClass', required: true },
rateINR: { type: Number, required: true },
label: { type: String },
active: { type: Boolean, default: true },
},
{ timestamps: true }
);


FlatShippingRuleSchema.index({ zone: 1, weightClass: 1 }, { unique: true });


module.exports = mongoose.models.FlatShippingRule || mongoose.model('FlatShippingRule', FlatShippingRuleSchema);