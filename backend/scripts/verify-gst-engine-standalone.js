const gstEngineService = require('../services/gstEngineService');
const Category = require('../models/Category');
const State = require('../models/location/State');

// Utility to mock Mongoose models
function mockModel(Model, data) {
    Model.findById = jest.fn().mockImplementation(id => {
        const item = data.find(d => d._id === id.toString() || d.id === id.toString());
        return Promise.resolve(item ? { ...item, select: () => item } : null);
    });
}

// Mock Data
const categories = [
    { _id: 'cat1', name: 'Electronics', taxRate: 18 },
    { _id: 'cat2', name: 'Books', taxRate: 5 }
];

const states = [
    { _id: 'state_mh', name: 'Maharashtra', isUT: false },
    { _id: 'state_ka', name: 'Karnataka', isUT: false },
    { _id: 'state_ch', name: 'Chandigarh', isUT: true }
];

// Helper to run a test case
async function runTestCase(name, params) {
    console.log(`\n--- Test Case: ${name} ---`);
    try {
        const result = await gstEngineService.calculateGST(params);
        console.log('Total Tax:', result.totalTax);
        console.log('Breakdown:', JSON.stringify({
            cgst: result.cgst,
            sgst: result.sgst,
            ugst: result.ugst,
            igst: result.igst,
            taxAdded: result.totalTaxAdded
        }, null, 2));
        console.log('Shipping Tax Breakdown:', JSON.stringify(result.taxBreakdown.shipping, null, 2));
        return result;
    } catch (error) {
        console.error('Error:', error.message);
    }
}

async function main() {
    console.log('🚀 Starting GST Engine Verification...');

    // Scenario 1: Intra-state (Maharashtra) - 18% Exclusive
    await runTestCase('Intra-state (MH)', {
        items: [{
            price: 1000,
            quantity: 1,
            category: 'cat1',
            taxIncluded: false,
            originState: { name: 'Maharashtra', _id: 'state_mh' }
        }],
        shippingCharge: 100,
        shippingAddress: { state: 'Maharashtra', stateId: 'state_mh' }
    });

    // Scenario 2: Inter-state (MH to KA) - 18% Exclusive
    await runTestCase('Inter-state (MH to KA)', {
        items: [{
            price: 1000,
            quantity: 1,
            category: 'cat1',
            taxIncluded: false,
            originState: { name: 'Maharashtra', _id: 'state_mh' }
        }],
        shippingCharge: 100,
        shippingAddress: { state: 'Karnataka', stateId: 'state_ka' }
    });

    // Scenario 3: UT (Chandigarh) - 18% Exclusive
    await runTestCase('Union Territory (CH)', {
        items: [{
            price: 1000,
            quantity: 1,
            category: 'cat1',
            taxIncluded: false,
            originState: { name: 'Chandigarh', _id: 'state_ch' }
        }],
        shippingCharge: 100,
        shippingAddress: { state: 'Chandigarh', stateId: 'state_ch' }
    });

    console.log('\n✅ Verification Script Complete');
}

// Since I don't have jest easily in the script context, I'll just mock manually
Category.findById = (id) => {
    const item = categories.find(c => c._id === id);
    return { select: () => Promise.resolve(item) };
};

State.findById = (id) => {
    const item = states.find(s => s._id === id);
    return Promise.resolve(item);
};

// Override UT check to avoid regex/db issues during script
gstEngineService.checkIfUnionTerritory = async (address) => {
    const stateId = address.stateId;
    const state = states.find(s => s._id === stateId);
    return state ? state.isUT : false;
};

main();
