/**
 * Minimal Shopper Wallet MVP — credit ledger + balance/history reads.
 * Scope: after-sales refund credits only (not a full digital wallet product).
 */

const mongoose = require("mongoose");
const ShopperWalletLedger = require("../models/ShopperWalletLedger");

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function buildRefundIdempotencyKey(returnRequestId) {
  return `after_sales_refund:${String(returnRequestId)}`;
}

async function getLatestBalance(shopperId, session = null) {
  let query = ShopperWalletLedger.findOne({ shopper: shopperId }).sort({ createdAt: -1 });
  if (session) query = query.session(session);
  const lastEntry = await query.lean();
  return lastEntry ? roundMoney(lastEntry.balanceAfter) : 0;
}

/**
 * Credit shopper wallet for an after-sales refund. Idempotent per return request.
 */
async function creditRefundToWallet({
  shopperId,
  amount,
  returnRequestId,
  orderId,
  orderLabel,
  session = null,
}) {
  if (!mongoose.isValidObjectId(shopperId) || !mongoose.isValidObjectId(returnRequestId)) {
    return { invalid: true, message: "Invalid shopper or return request reference" };
  }

  const creditAmount = roundMoney(amount);
  if (creditAmount <= 0) {
    return { invalid: true, message: "Refund credit amount must be positive" };
  }

  const idempotencyKey = buildRefundIdempotencyKey(returnRequestId);

  let existingQuery = ShopperWalletLedger.findOne({ idempotencyKey });
  if (session) existingQuery = existingQuery.session(session);
  const existing = await existingQuery.lean();

  if (existing) {
    return {
      skipped: true,
      ledgerEntryId: existing._id,
      amount: existing.amount,
      balanceAfter: existing.balanceAfter,
    };
  }

  const currentBalance = await getLatestBalance(shopperId, session);
  const balanceAfter = roundMoney(currentBalance + creditAmount);
  const label = orderLabel || String(orderId || "");

  const payload = {
    shopper: shopperId,
    type: "refund_credit",
    amount: creditAmount,
    balanceAfter,
    reference: {
      model: "ReturnRequest",
      id: returnRequestId,
    },
    idempotencyKey,
    description: `Refund credit for Order #${label} (Return #${returnRequestId})`,
    createdAt: new Date(),
  };

  let created;
  try {
    if (session) {
      [created] = await ShopperWalletLedger.create([payload], { session });
    } else {
      created = await ShopperWalletLedger.create(payload);
    }
  } catch (err) {
    // Concurrent duplicate insert — unique idempotencyKey wins; treat as skip.
    if (err && err.code === 11000) {
      let dupQuery = ShopperWalletLedger.findOne({ idempotencyKey });
      if (session) dupQuery = dupQuery.session(session);
      const existingDup = await dupQuery.lean();
      if (existingDup) {
        return {
          skipped: true,
          ledgerEntryId: existingDup._id,
          amount: existingDup.amount,
          balanceAfter: existingDup.balanceAfter,
        };
      }
    }
    throw err;
  }

  return {
    credited: true,
    ledgerEntryId: created._id,
    amount: creditAmount,
    balanceAfter,
  };
}

function toTransactionDTO(entry) {
  return {
    _id: String(entry._id),
    type: entry.type,
    amount: roundMoney(entry.amount),
    balanceAfter: roundMoney(entry.balanceAfter),
    description: entry.description || null,
    reference: entry.reference
      ? {
          model: entry.reference.model || null,
          id: entry.reference.id ? String(entry.reference.id) : null,
        }
      : null,
    createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
  };
}

async function getWalletSummary(shopperId) {
  if (!mongoose.isValidObjectId(shopperId)) {
    return { balance: 0, currency: "INR" };
  }

  const balance = await getLatestBalance(shopperId);
  return {
    balance,
    currency: "INR",
  };
}

async function listWalletTransactions({ shopperId, page = 1, limit = 20 } = {}) {
  if (!mongoose.isValidObjectId(shopperId)) {
    return {
      transactions: [],
      pagination: { page: 1, limit: 20, totalCount: 0, totalPages: 0 },
    };
  }

  const safePage = Math.max(1, parseInt(page, 10) || 1);
  const safeLimit = Math.min(50, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (safePage - 1) * safeLimit;

  const filter = { shopper: shopperId };
  const [totalCount, entries] = await Promise.all([
    ShopperWalletLedger.countDocuments(filter),
    ShopperWalletLedger.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
  ]);

  const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / safeLimit);

  return {
    transactions: entries.map(toTransactionDTO),
    pagination: {
      page: safePage,
      limit: safeLimit,
      totalCount,
      totalPages,
    },
  };
}

module.exports = {
  roundMoney,
  buildRefundIdempotencyKey,
  getLatestBalance,
  creditRefundToWallet,
  getWalletSummary,
  listWalletTransactions,
  toTransactionDTO,
};
