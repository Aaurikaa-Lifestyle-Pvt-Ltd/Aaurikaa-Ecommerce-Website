const mongoose = require('mongoose');
const { generateSku } = require('../utils/skuGenerator');
const SkuRule = require('../models/SkuRule');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Seller = require('../models/Seller');
require('dotenv').config();

const runTest = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        // Create dummy data
        const dummyProduct = { name: "Test Product" };
        const dummyCategory = { name: "Electronics" };
        const dummySeller = { shopName: "BestShop" };

        const sku = await generateSku({
            product: dummyProduct,
            category: dummyCategory,
            seller: dummySeller
        });

        console.log('Generated SKU:', sku);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        await mongoose.disconnect();
    }
};

runTest();
