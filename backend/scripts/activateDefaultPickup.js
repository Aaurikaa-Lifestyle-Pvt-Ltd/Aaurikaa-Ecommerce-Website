require('dotenv').config();
const mongoose = require('mongoose');
const SellerPickupLocation = require('../models/SellerPickupLocation');

async function activateDefault() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const result = await SellerPickupLocation.updateMany({ isDefault: true }, { isActive: true });
        console.log('Update Result:', result);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
activateDefault();
