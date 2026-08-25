const mongoose = require("mongoose");

const taxSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    percentage: { type: Number, required: true },
    description: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Tax", taxSchema);
