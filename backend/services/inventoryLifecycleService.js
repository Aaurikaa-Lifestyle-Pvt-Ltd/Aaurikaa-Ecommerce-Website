/**
 * Inventory lifecycle on existing Product.stock / Product.variantStock fields.
 *
 * States (order.inventoryLifecycle.state):
 *   none      — no reservation yet (legacy orders or not started)
 *   reserved  — quantity atomically decremented; unpaid prepaid holds the claim
 *   committed — purchase confirmed (payment success or COD); no second decrement
 *   released  — failed payment / cancellation restored quantity
 *   returned  — goods received back from a return; quantity restored once
 *
 * Replacement fulfilment is implemented in replacementFulfillmentService:
 * a new Order with fulfilmentKind=replacement decrements stock independently.
 */

const Product = require("../models/Product");

const INVENTORY_STATES = {
  NONE: "none",
  RESERVED: "reserved",
  COMMITTED: "committed",
  RELEASED: "released",
  RETURNED: "returned",
};

function getInventoryState(order) {
  return order?.inventoryLifecycle?.state || INVENTORY_STATES.NONE;
}

function lineQuantity(item) {
  return Math.max(0, parseInt(item?.quantity, 10) || 0);
}

function lineProductId(item) {
  if (!item?.product) return null;
  return item.product._id || item.product;
}

function isVariantLine(item) {
  return Boolean(item?.variantKey);
}

function variantStockPath(variantKey) {
  return `variantStock.${variantKey}`;
}

function markInventory(order, patch) {
  const current =
    order.inventoryLifecycle && typeof order.inventoryLifecycle.toObject === "function"
      ? order.inventoryLifecycle.toObject()
      : { ...(order.inventoryLifecycle || {}) };
  order.inventoryLifecycle = { ...current, ...patch };
  if (typeof order.markModified === "function") {
    order.markModified("inventoryLifecycle");
  }
}

async function decrementLine(item) {
  const productId = lineProductId(item);
  const qty = lineQuantity(item);
  if (!productId || qty <= 0) {
    return { success: true, skipped: true };
  }

  if (isVariantLine(item)) {
    const path = variantStockPath(item.variantKey);
    const updated = await Product.findOneAndUpdate(
      { _id: productId, [path]: { $gte: qty } },
      { $inc: { [path]: -qty } },
      { new: true }
    );
    if (!updated) {
      return { success: false, productId, qty, variantKey: item.variantKey };
    }
    return { success: true, productId, qty, variantKey: item.variantKey };
  }

  const updated = await Product.findOneAndUpdate(
    { _id: productId, stock: { $gte: qty } },
    { $inc: { stock: -qty } },
    { new: true }
  );
  if (!updated) {
    return { success: false, productId, qty };
  }
  return { success: true, productId, qty };
}

async function incrementLine(item) {
  const productId = lineProductId(item);
  const qty = lineQuantity(item);
  if (!productId || qty <= 0) {
    return { success: true, skipped: true };
  }

  if (isVariantLine(item)) {
    const path = variantStockPath(item.variantKey);
    await Product.findOneAndUpdate(
      { _id: productId },
      { $inc: { [path]: qty } },
      { new: true }
    );
    return { success: true, productId, qty, variantKey: item.variantKey };
  }

  await Product.findOneAndUpdate(
    { _id: productId },
    { $inc: { stock: qty } },
    { new: true }
  );
  return { success: true, productId, qty };
}

async function compensate(items) {
  for (const item of items) {
    await incrementLine(item);
  }
}

/**
 * Atomically claim stock for every line. Concurrent claims of the last unit:
 * only one findOneAndUpdate with $gte succeeds.
 */
async function reserveStockForOrder(order) {
  const state = getInventoryState(order);
  if (state === INVENTORY_STATES.RESERVED || state === INVENTORY_STATES.COMMITTED) {
    return { success: true, alreadyApplied: true, state };
  }
  if (state === INVENTORY_STATES.RETURNED) {
    return { success: false, error: "Cannot reserve stock for a returned order" };
  }

  const reservedItems = [];
  for (const item of order.items || []) {
    const result = await decrementLine(item);
    if (!result.success) {
      await compensate(reservedItems);
      return {
        success: false,
        error: "Insufficient stock for one or more items",
      };
    }
    if (!result.skipped) {
      reservedItems.push(item);
    }
  }

  markInventory(order, {
    state: INVENTORY_STATES.RESERVED,
    reservedAt: new Date(),
    releasedAt: null,
  });

  return { success: true, state: INVENTORY_STATES.RESERVED };
}

/**
 * Confirm a reservation after successful payment / COD. Does not decrement again.
 * Legacy orders with state `none` attempt a one-time reserve then commit.
 */
async function commitStockForOrder(order) {
  const state = getInventoryState(order);
  if (state === INVENTORY_STATES.COMMITTED) {
    return { success: true, alreadyApplied: true, state };
  }
  if (state === INVENTORY_STATES.RELEASED || state === INVENTORY_STATES.RETURNED) {
    return { success: false, error: "Cannot commit released or returned stock" };
  }
  if (state === INVENTORY_STATES.NONE) {
    const reserved = await reserveStockForOrder(order);
    if (!reserved.success) return reserved;
  }

  markInventory(order, {
    state: INVENTORY_STATES.COMMITTED,
    committedAt: new Date(),
  });

  return { success: true, state: INVENTORY_STATES.COMMITTED };
}

/**
 * Restore quantity after failed payment or eligible cancellation.
 * Idempotent: a second release is a no-op.
 */
async function releaseStockForOrder(order) {
  const state = getInventoryState(order);
  if (
    state === INVENTORY_STATES.RELEASED ||
    state === INVENTORY_STATES.RETURNED ||
    state === INVENTORY_STATES.NONE
  ) {
    return { success: true, alreadyApplied: true, state };
  }

  for (const item of order.items || []) {
    await incrementLine(item);
  }

  markInventory(order, {
    state: INVENTORY_STATES.RELEASED,
    releasedAt: new Date(),
  });

  return { success: true, state: INVENTORY_STATES.RELEASED };
}

/**
 * Restore quantity when returned goods are received.
 * Distinct from cancellation release so replacement can later decrement independently.
 * Idempotent.
 */
async function restoreStockForReturnedOrder(order) {
  const state = getInventoryState(order);
  if (state === INVENTORY_STATES.RETURNED) {
    return { success: true, alreadyApplied: true, state };
  }
  if (state === INVENTORY_STATES.RELEASED) {
    markInventory(order, {
      state: INVENTORY_STATES.RETURNED,
      returnedAt: new Date(),
    });
    return { success: true, alreadyApplied: true, state: INVENTORY_STATES.RETURNED };
  }
  if (state === INVENTORY_STATES.NONE) {
    return { success: true, alreadyApplied: true, state };
  }

  for (const item of order.items || []) {
    await incrementLine(item);
  }

  markInventory(order, {
    state: INVENTORY_STATES.RETURNED,
    returnedAt: new Date(),
  });

  return { success: true, state: INVENTORY_STATES.RETURNED };
}

module.exports = {
  INVENTORY_STATES,
  getInventoryState,
  reserveStockForOrder,
  commitStockForOrder,
  releaseStockForOrder,
  restoreStockForReturnedOrder,
};
