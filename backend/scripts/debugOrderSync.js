/**
 * ShipRocket Order Sync Debug Script v3
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const shipRocketService = require('../services/shipRocketService');
const pickupLocationService = require('../services/pickupLocationService');

async function debugSync(orderId) {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // 1. Check Wallet Balance
        console.log('📡 Checking Wallet Balance...');
        const balance = await shipRocketService.getWalletBalance();
        console.log('💰 Balance Response:', JSON.stringify(balance, null, 2));

        const order = await Order.findById(orderId).populate('items.product');
        if (!order) {
            console.error('❌ Order not found');
            process.exit(1);
        }

        // 2. Resolve Pickup
        const sellerId = order.items[0]?.product?.seller;
        const pickup = await pickupLocationService.resolvePickupForSeller(sellerId);
        console.log('📍 Resolved Pickup:', pickup?.name || 'NONE');

        // 3. Map Payload (Improved with real data from order items)
        const orderData = {
            order_id: order.invoiceNumber,
            order_date: order.createdAt,
            pickup_location: pickup.name,
            billing_customer_name: order.buyer?.firstName || "Test",
            billing_last_name: order.buyer?.lastName || "Buyer",
            billing_address: order.billingDetails?.address?.street || "SHAMBHUPUR, CHAKSHANJADI", // Better fallback
            billing_city: order.billingDetails?.address?.city || "Bardhaman",
            billing_pincode: (order.billingDetails?.address?.postalCode || "713124").toString(),
            billing_state: order.billingDetails?.address?.state || "West Bengal",
            billing_country: "India",
            billing_email: order.buyer?.email || "test@example.com",
            billing_phone: order.buyer?.phone || "9153561076",
            shipping_is_billing: true,
            order_items: order.items.map(item => ({
                name: item.product.name,
                sku: item.product.sku,
                units: item.quantity,
                selling_price: item.price,
            })),
            payment_method: "COD",
            sub_total: order.totalAmount,
            length: 10,
            width: 10,
            height: 10,
            weight: 0.5
        };

        console.log('📡 Sending Test Shipment...');
        try {
            const srResponse = await shipRocketService.createShipment(orderData);
            console.log('✅ SR Success:', JSON.stringify(srResponse, null, 2));
        } catch (srError) {
            console.error('❌ SR API Error:', JSON.stringify(srError.response?.data || {}, null, 2));
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ System Error:', error);
        process.exit(1);
    }
}

debugSync(process.argv[2] || '6977c408f45b9638e78969f1');
