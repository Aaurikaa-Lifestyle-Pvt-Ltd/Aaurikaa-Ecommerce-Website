const mongoose = require('mongoose');

const sellerPickupLocationSchema = new mongoose.Schema({
    shiprocketId: {
        type: Number,
        unique: true,
        required: true,
        description: "The pickup_location_id from Shiprocket"
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    address: {
        address: String,
        address2: String,
        city: String,
        state: String,
        country: { type: String, default: 'India' },
        pincode: { type: String, index: true }
    },
    phone: String,
    email: String,
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        index: true
    },
    isDefault: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastSyncedAt: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

module.exports = mongoose.model('SellerPickupLocation', sellerPickupLocationSchema);
