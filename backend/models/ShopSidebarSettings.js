const mongoose = require('mongoose');

const shopSidebarSettingsSchema = new mongoose.Schema({
    headings: {
        brandHeading: { type: String, default: 'Brand' },
        categoryHeading: { type: String, default: 'Category' },
        priceHeading: { type: String, default: 'Price Range' },
        ratingHeading: { type: String, default: 'Rating' },
        availabilityHeading: { type: String, default: 'Availability' }
    },
    banners: [{
        image: { type: String, required: true },
        link: { type: String, default: '' },
        order: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true }
    }]
}, { timestamps: true });

module.exports = mongoose.model('ShopSidebarSettings', shopSidebarSettingsSchema);
