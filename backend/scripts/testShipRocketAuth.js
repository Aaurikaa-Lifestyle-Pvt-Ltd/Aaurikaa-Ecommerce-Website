/**
 * ShipRocket Smoke Test Script
 * Verifies connectivity and authentication without modifying any data.
 */
require('dotenv').config();
const shipRocketService = require('../services/shipRocketService');

async function smokeTest() {
    console.log('🚀 Starting Shiprocket Connectivity Smoke Test...');

    try {
        // 1. Authenticate
        console.log('📡 Testing Authentication...');
        const token = await shipRocketService.authenticate();
        if (token) {
            console.log('✅ Authentication Successful (Token generated)');
        }

        // 2. Fetch Pickup Locations (Connectivity check)
        console.log('📡 Testing Pickup Location Retrieval...');
        const locations = await shipRocketService.getPickupLocations();
        console.log(`✅ Connectivity Successful. Found ${locations.length} pickup locations.`);

        console.log('\n✨ Shiprocket Integration Smoke Test: PASSED');
        process.exit(0);
    } catch (error) {
        console.error('\n❌ Shiprocket Integration Smoke Test: FAILED');
        console.error('Error:', error.message);
        process.exit(1);
    }
}

smokeTest();
