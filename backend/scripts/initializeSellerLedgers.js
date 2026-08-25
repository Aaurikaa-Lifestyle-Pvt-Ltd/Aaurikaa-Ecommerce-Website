/**
 * Migration Script: Initialize Seller Ledgers
 * Iterates through all sellers, finds their commissions, and builds an 
 * initial append-only ledger history.
 */

const mongoose = require('mongoose');
const Commission = require('../models/Commission');
const Seller = require('../models/Seller');
const SellerLedger = require('../models/SellerLedger');
require('dotenv').config();

const DB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/fashionhaven";

async function migrate() {
    try {
        console.log('🚀 Connecting to database...');
        await mongoose.connect(DB_URI);
        console.log('✅ Connected.');

        const sellers = await Seller.find();
        console.log(`📊 Processing ${sellers.length} sellers...`);

        for (const seller of sellers) {
            console.log(`\n👨‍💼 Seller: ${seller.shopName} (${seller._id})`);

            // Check if ledger already exists
            const existingLedger = await SellerLedger.findOne({ seller: seller._id });
            if (existingLedger) {
                console.log(`⏩ Ledger already initialized. Skipping.`);
                continue;
            }

            // Find all commissions for this seller
            const commissions = await Commission.find({
                seller: seller._id,
                status: { $in: ['pending', 'approved', 'paid', 'locked'] }
            }).sort({ createdAt: 1 });

            console.log(`📈 Found ${commissions.length} commissions.`);

            let currentBalance = 0;
            const ledgerEntries = [];

            for (const comm of commissions) {
                // Ledger must store SELLER NET (orderAmount - commissionAmount), not admin commission
                const sellerNetAmount = Math.round((comm.orderAmount - comm.commissionAmount) * 100) / 100;
                currentBalance += sellerNetAmount;

                ledgerEntries.push({
                    seller: seller._id,
                    type: 'commission_earned',
                    amount: sellerNetAmount,
                    balanceAfter: Math.round(currentBalance * 100) / 100,
                    reference: { model: 'Commission', id: comm._id },
                    description: `Initial migration: Commission from Order #${comm.order}`,
                    createdAt: comm.createdAt // Preserve timeline
                });
            }

            if (ledgerEntries.length > 0) {
                await SellerLedger.insertMany(ledgerEntries);
                console.log(`✅ Created ${ledgerEntries.length} ledger entries.`);
            } else {
                console.log(`ℹ️ No commissions found. Created empty zero-balance ledger entry if needed.`);
                // Optional: create a zero entry or just leave it.
            }
        }

        console.log('\n✨ Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}

migrate();
