const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: path.join(__dirname, '../backend/.env') });

const WeightClass = require('./models/WeightClass');
const ShippingZone = require('./models/ShippingZone');
const FlatShippingRule = require('./models/FlatShippingRule');


async function run() {
    try {
        const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/Multi-Vendor-Ecom';
        await mongoose.connect(uri);
        console.log('Connected to DB:', uri);


        const weights = await WeightClass.find({});
        console.log('--- WEIGHT CLASSES ---');
        weights.forEach(w => console.log(`${w.name}: ${w.minWeightG}g - ${w.maxWeightG}g (ID: ${w._id})`));

        const zones = await ShippingZone.find({});
        console.log('\n--- ZONES ---');
        zones.forEach(z => console.log(`${z.name} (${z.code}): states=[${z.states}] (ID: ${z._id})`));

        const rules = await FlatShippingRule.find({}).populate('zone weightClass');
        console.log('\n--- FLAT RULES ---');
        rules.forEach(r => console.log(`Zone: ${r.zone?.name}, Slab: ${r.weightClass?.name}, Rate: ₹${r.rateINR}`));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
