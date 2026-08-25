/**
 * Migration Script: Update Pending Commissions to Approved
 * 
 * Purpose: This script updates all 'pending' commissions for delivered orders
 * to 'approved' status to fix the mismatch between ledger balance and 
 * withdrawable commissions.
 * 
 * Background: Previously, commissions were created with 'pending' status
 * when orders were delivered, but the ledger balance was updated immediately.
 * This caused a discrepancy where sellers saw balance in their dashboard
 * but couldn't withdraw it because only 'approved' commissions are withdrawable.
 * 
 * This migration fixes historical data by auto-approving all pending commissions
 * for delivered orders.
 */

const mongoose = require('mongoose');
const Commission = require('../models/Commission');
const Order = require('../models/Order');

async function migratePendingCommissions() {
    try {
        console.log('🔄 Starting migration: Update pending commissions to approved...');

        // Find all pending commissions
        const pendingCommissions = await Commission.find({ status: 'pending' })
            .populate('order', 'status');

        console.log(`📊 Found ${pendingCommissions.length} pending commissions`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const commission of pendingCommissions) {
            // Only auto-approve if the order is delivered
            if (commission.order &&
                ['delivered', 'DELIVERED', 'Delivered'].includes(commission.order.status)) {

                // Update commission status to approved
                commission.status = 'approved';
                commission.approvedAt = new Date();

                // Save without triggering state machine validation by using updateOne
                await Commission.updateOne(
                    { _id: commission._id },
                    {
                        $set: {
                            status: 'approved',
                            approvedAt: new Date()
                        }
                    }
                );

                updatedCount++;
                console.log(`✅ Updated commission ${commission._id} for order ${commission.order._id}`);
            } else {
                skippedCount++;
                console.log(`⏭️  Skipped commission ${commission._id} - Order not delivered (status: ${commission.order?.status || 'unknown'})`);
            }
        }

        console.log('\n📈 Migration Summary:');
        console.log(`   Total pending commissions: ${pendingCommissions.length}`);
        console.log(`   ✅ Updated to approved: ${updatedCount}`);
        console.log(`   ⏭️  Skipped (not delivered): ${skippedCount}`);
        console.log('\n✨ Migration completed successfully!');

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    }
}

// Run migration if executed directly
if (require.main === module) {
    const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/anbazar';

    mongoose.connect(dbUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    })
        .then(async () => {
            console.log('✅ Connected to MongoDB');
            await migratePendingCommissions();
            await mongoose.connection.close();
            console.log('👋 Database connection closed');
            process.exit(0);
        })
        .catch(error => {
            console.error('❌ Database connection error:', error);
            process.exit(1);
        });
}

module.exports = { migratePendingCommissions };
