/**
 * ShipRocket Permission & Wallet Debug
 */
require('dotenv').config();
const shipRocketService = require('../services/shipRocketService');

async function debugAccount() {
    console.log('📡 Checking Shiprocket Account Status...');

    try {
        // 1. Auth check
        const token = await shipRocketService.authenticate();
        console.log('✅ Auth Token generated.');

        // 2. Wallet check
        console.log('📡 Checking Wallet Balance...');
        const balance = await shipRocketService.getWalletBalance();
        if (balance) {
            console.log('💰 Wallet Data:', JSON.stringify(balance, null, 2));
        } else {
            console.error('❌ Could not fetch wallet balance.');
        }

        // 3. Try a "Check Serviceability" call as a proxy for permission check
        console.log('📡 Checking Serviceability (Permission Proxy)...');
        const rates = await shipRocketService.fetchRates({
            pickupPincode: "110001",
            deliveryPincode: "400001",
            weight: 0.5,
            length: 10,
            width: 10,
            height: 10
        });
        console.log(`✅ Rates fetched: ${rates?.length || 0} couriers found.`);

        process.exit(0);
    } catch (err) {
        console.error('❌ Diagnostic Failed:', err.message);
        if (err.response) console.error('Data:', err.response.data);
        process.exit(1);
    }
}
debugAccount();
