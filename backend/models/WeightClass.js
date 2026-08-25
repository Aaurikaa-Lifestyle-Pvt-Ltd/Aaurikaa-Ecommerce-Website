// models/WeightClass.js
const mongoose = require('mongoose');


const WeightClassSchema = new mongoose.Schema(
{
name: { type: String, required: true }, // e.g. "1–500g"
minWeightG: { type: Number, required: true },
maxWeightG: { type: Number, required: true },
active: { type: Boolean, default: true },
sortOrder: { type: Number, default: 0 },
},
{ timestamps: true }
);


WeightClassSchema.index({ minWeightG: 1, maxWeightG: 1 });


module.exports = mongoose.models.WeightClass || mongoose.model('WeightClass', WeightClassSchema);