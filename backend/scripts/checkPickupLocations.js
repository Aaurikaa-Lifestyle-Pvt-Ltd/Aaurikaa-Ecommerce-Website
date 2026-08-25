require('dotenv').config();
const mongoose = require('mongoose');
const SellerPickupLocation = require('../models/SellerPickupLocation');

async function checkLocations() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const locs = await SellerPickupLocation.find();
        console.log('--- ALL LOCATIONS ---');
        console.log(JSON.stringify(locs, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkLocations();
