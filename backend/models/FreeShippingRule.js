// models/FreeShippingRule.js
const mongoose = require('mongoose');


const FreeShippingRuleSchema = new mongoose.Schema(
{
name: { type: String, required: true },
minOrderAmountINR: { type: Number, required: true }, // e.g. 999


// Apply to all zones or selected zones
allZones: { type: Boolean, default: true },
zones: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ShippingZone' }],


active: { type: Boolean, default: true },
sortOrder: { type: Number, default: 0 },
},
{ timestamps: true }
);


module.exports = mongoose.models.FreeShippingRule || mongoose.model('FreeShippingRule', FreeShippingRuleSchema);