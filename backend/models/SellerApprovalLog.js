// backend/models/SellerApprovalLog.js
const mongoose = require("mongoose");

const sellerApprovalLogSchema = new mongoose.Schema({
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller' },
  status: { type: String, enum: ['approved', 'rejected'], required: true },
  comment: { type: String },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SellerApprovalLog', sellerApprovalLogSchema);
