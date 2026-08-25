// models/ShippingZone.js
const mongoose = require('mongoose');


const ShippingZoneSchema = new mongoose.Schema(
    {
        name: { type: String, required: true }, // e.g. "West Bengal (IN)"
        code: { type: String, required: true, unique: true }, // e.g. "WestBengal-IN"


        // Basic geo matchers (keep simple to start)
        country: { type: String, default: 'IN' }, // ISO code
        states: [{ type: String }], // Legacy: free-text names
        stateIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'State' }], // New: Reference to State model


        // Optional: for finer control
        pinPrefixes: [{ type: String }], // match by postal-code prefixes if you want


        active: { type: Boolean, default: true },
        sortOrder: { type: Number, default: 0 },
    },
    { timestamps: true }
);


module.exports = mongoose.models.ShippingZone || mongoose.model('ShippingZone', ShippingZoneSchema);