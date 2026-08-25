const Payout = require("../../models/Payout");
const Commission = require("../../models/Commission");
const SellerLedger = require("../../models/SellerLedger");
const mongoose = require("mongoose");
const { sendErrorResponse, sendSuccessResponse, ERROR_MESSAGES, ERROR_CODES, HTTP_STATUS, asyncHandler } = require("../../utils/errorHandler");

// =========================
// 📋 List Payout Requests
// =========================
exports.listPayoutRequests = asyncHandler(async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = status ? { status } : {};

        const payouts = await Payout.find(query)
            .populate('seller', 'firstName lastName email shopName phone')
            .sort({ requestedAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Payout.countDocuments(query);

        sendSuccessResponse(res, HTTP_STATUS.OK, "Payout requests retrieved", {
            payouts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total
            }
        });
    } catch (error) {
        sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Failed to list payouts");
    }
});

// =========================
// ✅ Approve Payout
// =========================
exports.approvePayout = asyncHandler(async (req, res) => {
    try {
        const { payoutId } = req.params;
        const adminId = req.user._id;

        const payout = await Payout.findById(payoutId);
        if (!payout) {
            return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Payout not found");
        }

        if (payout.status !== 'pending') {
            return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, `Cannot approve payout in ${payout.status} status`);
        }

        // 1. Update payout status
        payout.status = 'approved';
        payout.approvedBy = adminId;
        payout.approvedAt = new Date();
        await payout.save();

        // 2. Note: We don't update ledger here yet, as funds are already deducted (locked) during request.
        // If we wanted to track separate states in ledger, we could add 'payout_approved'.

        sendSuccessResponse(res, HTTP_STATUS.OK, "Payout approved", { payout });

    } catch (error) {
        sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Approval failed");
    }
});

// =========================
// ❌ Reject Payout
// =========================
exports.rejectPayout = asyncHandler(async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { reason } = req.body;

        const payout = await Payout.findById(payoutId);
        if (!payout) {
            return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Payout not found");
        }

        if (payout.status !== 'pending') {
            return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Only pending payouts can be rejected");
        }

        // 1. Update payout status
        payout.status = 'rejected';
        payout.rejectionReason = reason;
        await payout.save();

        // 2. Unlock commissions
        await Commission.updateMany(
            { lockedBy: payout._id },
            { status: 'approved', lockedBy: null }
        );

        // 3. Refund to Ledger
        const lastEntry = await SellerLedger.findOne({ seller: payout.seller })
            .sort({ createdAt: -1 });

        const currentBalance = lastEntry ? lastEntry.balanceAfter : 0;

        await SellerLedger.create({
            seller: payout.seller,
            type: 'payout_rejected',
            amount: payout.amount,
            balanceAfter: currentBalance + payout.amount,
            reference: { model: 'Payout', id: payout._id },
            description: `Payout #${payout._id} rejected. Funds returned. Reason: ${reason}`
        });

        sendSuccessResponse(res, HTTP_STATUS.OK, "Payout rejected and funds returned");

    } catch (error) {
        sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Rejection failed");
    }
});

// =========================
// 💸 Process Payment (Paid)
// =========================
exports.markAsPaid = asyncHandler(async (req, res) => {
    try {
        const { payoutId } = req.params;
        const { transactionReference } = req.body;

        const payout = await Payout.findById(payoutId);
        if (!payout) {
            return sendErrorResponse(res, HTTP_STATUS.NOT_FOUND, "Payout not found");
        }

        if (payout.status !== 'approved') {
            return sendErrorResponse(res, HTTP_STATUS.BAD_REQUEST, "Payout must be approved before marking as paid");
        }

        // 1. Update payout status
        payout.status = 'paid';
        payout.transactionReference = transactionReference;
        payout.processedAt = new Date();
        await payout.save();

        // 2. Update commissions to 'paid'
        await Commission.updateMany(
            { lockedBy: payout._id },
            {
                status: 'paid',
                paymentDate: new Date(),
                paymentReference: transactionReference
            }
        );

        // 3. Ledger entry for completion
        const lastEntry = await SellerLedger.findOne({ seller: payout.seller })
            .sort({ createdAt: -1 });

        await SellerLedger.create({
            seller: payout.seller,
            type: 'payout_completed',
            amount: 0, // Balance already deducted during request
            balanceAfter: lastEntry ? lastEntry.balanceAfter : 0,
            reference: { model: 'Payout', id: payout._id },
            description: `Payout #${payout._id} finalized. Ref: ${transactionReference}`
        });

        sendSuccessResponse(res, HTTP_STATUS.OK, "Payout marked as paid");

    } catch (error) {
        sendErrorResponse(res, HTTP_STATUS.INTERNAL_SERVER_ERROR, "Processing failed");
    }
});
