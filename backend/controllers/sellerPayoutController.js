const Commission = require("../models/Commission");
const Seller = require("../models/Seller");
const Payout = require("../models/Payout");
const SellerLedger = require("../models/SellerLedger");
const mongoose = require("mongoose");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../utils/errorHandler");
const { notifySellerPaymentUpdate } = require("../utils/notificationService");
const { validateSellerLedgerIntegrity } = require("../utils/financialIntegrityValidator");

// =========================
// 💰 Get Seller Payout Summary
// =========================
exports.getSellerPayoutSummary = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;

    if (!sellerId) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Invalid seller ID", ERROR_CODES.INVALID_INPUT);
    }

    const seller = await Seller.findById(sellerId).select('bankAccount shopName paymentMethods');
    if (!seller) {
      return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found", ERROR_CODES.RESOURCE_NOT_FOUND);
    }

    // Get commission summary: seller net (orderAmount - commissionAmount) per status
    const commissionStats = await Commission.aggregate([
      { $match: { seller: sellerId } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalAmount: { $sum: { $subtract: ['$orderAmount', '$commissionAmount'] } }
        }
      }
    ]);

    const stats = {
      pending: { count: 0, amount: 0 },
      approved: { count: 0, amount: 0 },
      locked: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 }
    };

    commissionStats.forEach(item => {
      if (stats.hasOwnProperty(item._id)) {
        stats[item._id] = { count: item.count, amount: item.totalAmount };
      }
    });

    // Authoritative balance from Ledger
    const lastLedgerEntry = await SellerLedger.findOne({ seller: sellerId })
      .sort({ createdAt: -1 });

    const withdrawableBalance = lastLedgerEntry ? lastLedgerEntry.balanceAfter : 0;

    sendSuccessResponse(res, HTTP_STATUS.OK, "Payout summary retrieved", {
      withdrawableBalance,
      totalEarnings: stats.paid.amount + stats.approved.amount + stats.locked.amount,
      commissionStats: stats,
      bankAccountConfigured: !!(seller.bankAccount && seller.bankAccount.accountNumber),
      paymentMethods: seller.paymentMethods || [],
      lastUpdated: new Date()
    });

  } catch (error) {
    console.error("Get payout summary error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve summary", ERROR_CODES.INTERNAL_ERROR);
  }
});

// =========================
// 💰 Request Payout
// =========================
exports.requestPayout = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { amount, notes } = req.body;

    if (!amount || amount <= 0) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Valid amount required");
    }

    const seller = await Seller.findById(sellerId);
    if (!seller || !seller.bankAccount || !seller.bankAccount.accountNumber) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Bank account not configured");
    }

    // 1. Check authoritative balance from Ledger
    const lastEntry = await SellerLedger.findOne({ seller: sellerId })
      .sort({ createdAt: -1 });

    const currentBalance = lastEntry ? lastEntry.balanceAfter : 0;

    if (amount > currentBalance) {
      return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, `Insufficient balance. Available: ₹${currentBalance}`);
    }



    // 2. Identify commissions to lock (FIFO) by SELLER NET (orderAmount - commissionAmount)
    const commissionsToLock = await Commission.find({
      seller: sellerId,
      status: 'approved'
    }).sort({ createdAt: 1 });

    let remainingToLock = amount;
    const selectedCommissionIds = [];

    for (const comm of commissionsToLock) {
      if (remainingToLock <= 0) break;

      const sellerNet = Math.round((comm.orderAmount - comm.commissionAmount) * 100) / 100;
      if (sellerNet <= 0) continue; // Nothing to lock for this commission

      if (sellerNet <= remainingToLock) {
        // Use full commission (lock entire seller net)
        selectedCommissionIds.push(comm._id);
        remainingToLock -= sellerNet;
      } else {
        // Partial: lock only remainingToLock of seller net; split commission record
        const neededNet = remainingToLock;
        const rate = comm.orderAmount > 0 ? comm.commissionAmount / comm.orderAmount : 0;
        const oneMinusRate = Math.max(1 - rate, 0.0001);
        const orderAmountPart = Math.round((neededNet / oneMinusRate) * 100) / 100;
        const commissionAmountPart = Math.round(orderAmountPart * rate * 100) / 100;
        const remainderOrderAmount = Math.round((comm.orderAmount - orderAmountPart) * 100) / 100;
        const remainderCommissionAmount = Math.round((comm.commissionAmount - commissionAmountPart) * 100) / 100;

        const lockedPart = new Commission({
          order: comm.order,
          seller: comm.seller,
          product: comm.product,
          category: comm.category,
          orderAmount: orderAmountPart,
          commissionRate: comm.commissionRate,
          commissionAmount: commissionAmountPart,
          commissionType: comm.commissionType,
          appliedRule: comm.appliedRule,
          status: 'approved',
          period: comm.period
        });
        await lockedPart.save();
        selectedCommissionIds.push(lockedPart._id);

        await Commission.updateOne(
          { _id: comm._id },
          { $set: { orderAmount: remainderOrderAmount, commissionAmount: remainderCommissionAmount } }
        );

        remainingToLock = 0;
      }
    }

    // 3. Determine Payment Method Details
    let payoutMethodDetails = {
      type: 'bank_transfer',
      details: {
        accountNumber: seller.bankAccount.accountNumber,
        ifscCode: seller.bankAccount.ifscCode
      }
    };

    const { paymentMethodId } = req.body;
    if (paymentMethodId) {
      const selectedMethod = seller.paymentMethods.id(paymentMethodId);
      if (selectedMethod) {
        payoutMethodDetails = {
          type: selectedMethod.type,
          details: {
            accountNumber: selectedMethod.details.accountNumber,
            ifscCode: selectedMethod.details.ifscCode,
            upiId: selectedMethod.details.upiId
          }
        };
      }
    } else {
      // Fallback to UPI if bank account is empty but upiId exists in bankAccount object
      if (!seller.bankAccount.accountNumber && seller.bankAccount.upiId) {
        payoutMethodDetails = {
          type: 'upi',
          details: { upiId: seller.bankAccount.upiId }
        };
      }
    }

    // 4. Create Payout record
    const payout = new Payout({
      seller: sellerId,
      amount,
      status: 'pending',
      paymentMethod: payoutMethodDetails,
      commissions: selectedCommissionIds,
      notes
    });

    await payout.save();

    // 4. Update commissions to 'locked'
    if (selectedCommissionIds.length > 0) {
      await Commission.updateMany(
        { _id: { $in: selectedCommissionIds } },
        { status: 'locked', lockedBy: payout._id }
      );
    }

    // 5. Create Ledger entry (Debit)
    await SellerLedger.create({
      seller: sellerId,
      type: 'payout_requested',
      amount: -amount,
      balanceAfter: currentBalance - amount,
      reference: { model: 'Payout', id: payout._id },
      description: `Payout request #${payout._id} submitted`
    });

    // Non-blocking integrity check (TASK 5)
    validateSellerLedgerIntegrity(sellerId).catch(() => {});

    sendSuccessResponse(res, HTTP_STATUS.CREATED, "Payout request submitted", { payout });

  } catch (error) {
    process.stderr.write(`🚨 Request payout error: ${error.name} - ${error.message}\n`);
    console.error("Request payout error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Payout request failed");
  }
});

// =========================
// 📋 Get Payout History
// =========================
exports.getPayoutHistory = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const payouts = await Payout.find({ seller: sellerId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Payout.countDocuments({ seller: sellerId });

    sendSuccessResponse(res, HTTP_STATUS.OK, "Payout history retrieved", {
      payouts,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });

  } catch (error) {
    console.error("Get payout history error:", error);
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve history");
  }
});

// =========================
// 📈 Get Financial Ledger
// =========================
exports.getSellerLedger = asyncHandler(async (req, res) => {
  try {
    const sellerId = req.user._id;
    const { page = 1, limit = 20 } = req.query;

    const ledger = await SellerLedger.find({ seller: sellerId })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await SellerLedger.countDocuments({ seller: sellerId });

    sendSuccessResponse(res, HTTP_STATUS.OK, "Financial ledger retrieved", {
      ledger,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total
      }
    });
  } catch (error) {
    sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to retrieve ledger");
  }
});

// =========================
// 💳 Payment Methods
// =========================

exports.addPaymentMethod = asyncHandler(async (req, res) => {
  const sellerId = req.user._id;
  const { type, details, isDefault } = req.body;

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found");
  }

  // If this is the first method or marked as default, unset other defaults
  if (isDefault || seller.paymentMethods.length === 0) {
    seller.paymentMethods.forEach(m => m.isDefault = false);
  }

  seller.paymentMethods.push({
    type,
    details,
    isDefault: isDefault || seller.paymentMethods.length === 0
  });

  await seller.save();
  sendSuccessResponse(res, HTTP_STATUS.CREATED, "Payment method added", { paymentMethods: seller.paymentMethods });
});

exports.updatePaymentMethod = asyncHandler(async (req, res) => {
  const sellerId = req.user._id;
  const { paymentMethodId } = req.params;
  const { details, isDefault } = req.body;

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found");
  }

  const method = seller.paymentMethods.id(paymentMethodId);
  if (!method) {
    return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Payment method not found");
  }

  if (details) method.details = { ...method.details, ...details };
  if (isDefault !== undefined) {
    if (isDefault) {
      seller.paymentMethods.forEach(m => m.isDefault = false);
    }
    method.isDefault = isDefault;
  }

  await seller.save();
  sendSuccessResponse(res, HTTP_STATUS.OK, "Payment method updated", { paymentMethods: seller.paymentMethods });
});

exports.deletePaymentMethod = asyncHandler(async (req, res) => {
  const sellerId = req.user._id;
  const { paymentMethodId } = req.params;

  const seller = await Seller.findById(sellerId);
  if (!seller) {
    return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Seller not found");
  }

  seller.paymentMethods = seller.paymentMethods.filter(m => m._id.toString() !== paymentMethodId);

  // Ensure we still have a default if any methods remain
  if (seller.paymentMethods.length > 0 && !seller.paymentMethods.some(m => m.isDefault)) {
    seller.paymentMethods[0].isDefault = true;
  }

  await seller.save();
  sendSuccessResponse(res, HTTP_STATUS.OK, "Payment method deleted", { paymentMethods: seller.paymentMethods });
});
