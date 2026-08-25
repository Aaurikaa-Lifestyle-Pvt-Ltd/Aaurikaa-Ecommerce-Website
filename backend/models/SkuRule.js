// backend/models/SkuRule.js
const mongoose = require("mongoose");

const skuSegmentSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: [
            "category_name",      // Product → Category name
            "product_name",       // Product title
            "quantity",           // Stock / quantity
            "pack_size",         // Variant / feature / product text
            "weight_number",     // Product weight
            "brand_name",        // Brand entity
            "seller_shop_name",  // Seller or shop name
            "regular_price",     // Product regular price
            "sale_price"         // Product sale price
        ],
        required: true
    },
    length: {
        type: Number,
        min: 1,
        max: 20,
        default: null // null means no limit or default logic
    },
    prefix: {
        type: String,
        default: null
    },
    suffix: {
        type: String,
        default: null
    },
    enabled: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        required: true
    }
}, { _id: false });

const skuRuleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: false,
            unique: false,
            default: null
        },
        description: {
            type: String,
            default: null
        },
        separator: {
            type: String,
            default: "-"
        },
        segments: [skuSegmentSchema],
        allowedCharacters: {
            type: String,
            default: "A-Z0-9-"
        },
        isActive: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

// Ensure only one active rule exists
skuRuleSchema.pre("save", async function (next) {
    if (this.isActive) {
        await mongoose.model("SkuRule").updateMany(
            { _id: { $ne: this._id } },
            { $set: { isActive: false } }
        );
    }
    next();
});

module.exports = mongoose.model("SkuRule", skuRuleSchema);
