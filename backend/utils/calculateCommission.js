const Seller = require("../models/Seller");
const Category = require("../models/Category");

/**
 * Calculates commission for a specific sale based on priority hierarchy:
 * 1. Seller-specific category override
 * 2. Seller default rate
 * 3. Category default rate
 * 4. System default (5%)
 * 
 * @param {string} sellerId - The ID of the seller
 * @param {string} categoryId - The ID of the category
 * @param {number} price - The item price to calculate commission against
 * @returns {Promise<Object>} - The commission data (amount, rate, type, rule)
 */
exports.calculateCommission = async (sellerId, categoryId, price) => {
  try {
    const seller = await Seller.findById(sellerId);
    if (!seller) {
      throw new Error(`Commission calculation failed: Seller ${sellerId} not found`);
    }

    const category = await Category.findById(categoryId);

    let commissionType, rate, amount, appliedRule;

    // Priority 1: Seller-specific category override (only if categoryId exists)
    const override = (seller.categoryCommission && categoryId) ? seller.categoryCommission.find(
      cc => cc.categoryId && cc.categoryId.toString() === categoryId.toString()
    ) : null;

    if (override) {
      commissionType = override.commissionType;
      rate = override.commissionRate || 0;
      amount = override.commissionAmount || 0;
      appliedRule = 'seller_category_override';
    }
    // Priority 2: Seller default
    else if (seller.commission > 0 || seller.commissionAmount > 0) {
      commissionType = seller.commissionType;
      rate = seller.commission || 0;
      amount = seller.commissionAmount || 0;
      appliedRule = 'seller_default';
    }
    // Priority 3: Category default
    else if (category && (category.commissionRate > 0 || category.commissionAmount > 0)) {
      commissionType = category.commissionType;
      rate = category.commissionRate || 0;
      amount = category.commissionAmount || 0;
      appliedRule = 'category_default';
    }
    // Priority 4: System default
    else {
      commissionType = 'percentage';
      rate = 5;
      amount = 0;
      appliedRule = 'system_default';
    }

    // Calculate final amount based on type
    let finalAmount = 0;
    if (commissionType === 'flat') {
      finalAmount = amount;
    } else {
      // Percentage calculation
      finalAmount = (price * rate) / 100;
    }

    return {
      commissionAmount: Math.round(finalAmount * 100) / 100, // Round to 2 decimal places
      commissionRate: rate,
      commissionType,
      appliedRule
    };
  } catch (error) {
    console.error(`❌ calculateCommission utility error: ${error.message}`);
    throw error;
  }
};

/**
 * Proactively syncs missing commissions for delivered orders.
 * This is used to fix data for orders marked delivered but never processed for commission.
 */
exports.syncDeliveries = async (sellerId, productIds) => {
  const Order = require("../models/Order");
  const Commission = require("../models/Commission");
  const SellerLedger = require("../models/SellerLedger");
  const Product = require("../models/Product");
  const mongoose = require("mongoose");

  try {
    // Find delivered orders containing seller's products
    const deliveredOrders = await Order.find({
      status: { $in: ['delivered', 'DELIVERED', 'Delivered'] },
      'items.product': { $in: productIds }
    });

    for (const order of deliveredOrders) {
      const sellerItems = order.items.filter(item =>
        productIds.map(id => id.toString()).includes(item.product.toString())
      );

      for (const item of sellerItems) {
        // Check if commission already exists
        const exists = await Commission.findOne({
          order: order._id,
          product: item.product,
          seller: sellerId
        });

        if (!exists) {
          console.log(`🔄 Syncing missing commission for Order ${order._id}, Item ${item.product}`);
          const product = await Product.findById(item.product).select('category');
          const categoryId = product ? product.category : null;
          const orderAmount = (item.price || 0) * (item.quantity || 1);

          const commissionData = await exports.calculateCommission(sellerId, categoryId, orderAmount);

          const runCreate = async (opts = {}) => {
            const now = new Date();
            const commission = new Commission({
              order: order._id,
              seller: sellerId,
              product: item.product,
              category: categoryId,
              orderAmount: orderAmount,
              commissionRate: commissionData.commissionRate,
              commissionAmount: commissionData.commissionAmount,
              commissionType: commissionData.commissionType,
              appliedRule: commissionData.appliedRule,
              status: 'approved',
              period: { year: now.getFullYear(), month: now.getMonth() + 1 }
            });
            await commission.save(opts);

            const sellerNetAmount = Math.round((orderAmount - commissionData.commissionAmount) * 100) / 100;
            let ledgerQuery = SellerLedger.findOne({ seller: sellerId }).sort({ createdAt: -1 });
            if (opts.session) ledgerQuery = ledgerQuery.session(opts.session);
            const lastLedgerEntry = await ledgerQuery;
            const currentBalance = lastLedgerEntry ? lastLedgerEntry.balanceAfter : 0;
            const newBalance = currentBalance + sellerNetAmount;

            await SellerLedger.create([{
              seller: sellerId,
              type: 'commission_earned',
              amount: sellerNetAmount,
              balanceAfter: newBalance,
              reference: { model: 'Commission', id: commission._id },
              description: `[SYNC] Commission earned from Order #${order.invoiceNumber || order._id} (Rule: ${commissionData.appliedRule})`
            }], opts.session ? { session: opts.session } : {});
          };

          try {
            const session = await mongoose.startSession();
            await session.withTransaction(() => runCreate({ session }));
            await session.endSession();
            console.log(`✅ Synced commission for Order ${order._id}, Item ${item.product}`);
          } catch (txErr) {
            const isStandalone = /replica set|transaction numbers|only allowed on a replica set member or mongos/i.test(txErr.message || '');
            if (isStandalone) {
              try {
                await runCreate({});
                console.log(`✅ Synced commission for Order ${order._id}, Item ${item.product} (standalone MongoDB)`);
              } catch (fallbackErr) {
                console.error(`❌ Sync failed for Order ${order._id}:`, fallbackErr.message);
              }
            } else {
              console.error(`❌ Sync failed for Order ${order._id}:`, txErr.message);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error("❌ syncDeliveries error:", error);
  }
};
