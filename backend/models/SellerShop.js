const mongoose = require('mongoose');

const sellerShopSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'Seller', required: true },
  // Add other fields relevant to a seller's shop, e.g., description, address, etc.
}, { timestamps: true });

module.exports = mongoose.model('SellerShop', sellerShopSchema);