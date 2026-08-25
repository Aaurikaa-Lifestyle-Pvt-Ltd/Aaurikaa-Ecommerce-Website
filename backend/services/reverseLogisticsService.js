/**
 * Provider-agnostic reverse logistics for After-Sales cases (Phase 3 / Module E).
 * Planned provider: Shiprocket return/reverse pickup.
 * Seller receipt confirmation remains a separate seller-gated step.
 *
 * Idempotency (production reliability):
 * 1. Atomic scheduling claim before carrier create
 * 2. Pre-create recovery via deterministic externalOrderKey
 * 3. Duplicate-create recovery when carrier reports order already exists
 */

const mongoose = require("mongoose");
const ReturnRequest = require("../models/ReturnRequest");
const Order = require("../models/Order");
const Seller = require("../models/Seller");
const shipRocketService = require("./shipRocketService");
const pickupLocationService = require("./pickupLocationService");
const {
  isAllowedAfterSalesTransition,
} = require("../utils/returnStatusGuards");

const DEFAULT_PROVIDER = "shiprocket";
const MAX_RETRY_COUNT = 5;
/** Stale scheduling claims may be reclaimed after this TTL (crash/timeout safety). */
const SCHEDULING_CLAIM_TTL_MS = Number(
  process.env.REVERSE_LOGISTICS_CLAIM_TTL_MS || 2 * 60 * 1000
);

function isReverseLogisticsEnabled() {
  if (process.env.DISABLE_REVERSE_LOGISTICS === "true") return false;
  const provider = (
    process.env.REVERSE_LOGISTICS_PROVIDER || DEFAULT_PROVIDER
  ).toLowerCase();
  return provider === "shiprocket";
}

function resolveAddressLine(details) {
  if (!details) return "";
  if (typeof details.address === "string") return details.address;
  if (details.address && typeof details.address === "object") {
    return details.address.street || details.address.address1 || "";
  }
  return "";
}

function resolveCity(details) {
  if (!details) return "";
  if (details.city) return details.city;
  if (details.address && typeof details.address === "object") {
    return details.address.city || "";
  }
  return "";
}

function resolveState(details) {
  if (!details) return "";
  if (details.state) return details.state;
  if (details.address && typeof details.address === "object") {
    return details.address.state || "";
  }
  return "";
}

function resolvePincode(details) {
  if (!details) return "";
  if (details.pincode) return String(details.pincode);
  if (details.address && typeof details.address === "object") {
    const nested =
      details.address.postalCode || details.address.pincode || "";
    return nested ? String(nested) : "";
  }
  return "";
}

function resolveCustomerName(details) {
  if (!details) return "";
  if (details.name) return details.name;
  const fn = details.firstName || "";
  const ln = details.lastName || "";
  return `${fn} ${ln}`.trim();
}

function splitName(fullName) {
  const parts = String(fullName || "")
    .trim()
    .split(/\s+/);
  if (parts.length === 0 || (parts.length === 1 && !parts[0])) {
    return { first: "Customer", last: "" };
  }
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function buildTrackingUrl(awb) {
  if (!awb) return null;
  return `https://shiprocket.co/tracking/${encodeURIComponent(awb)}`;
}

function buildExternalOrderKey(order, requestId) {
  const invoice = order?.invoiceNumber || String(order?._id || "").slice(-8);
  return `RET-${invoice}-${String(requestId).slice(-6)}`.slice(0, 50);
}

function hasSuccessfulSchedule(rl) {
  if (!rl) return false;
  const successStatuses = ["scheduled", "in_transit", "delivered"];
  return (
    successStatuses.includes(rl.status) &&
    !!(rl.shiprocketOrderId || rl.awbCode || rl.shiprocketShipmentId)
  );
}

function toReverseLogisticsDTO(rl) {
  if (!rl) return null;
  const plain = typeof rl.toObject === "function" ? rl.toObject() : rl;
  if (!plain || (!plain.status && !plain.provider && !plain.lastError)) {
    return null;
  }
  const canRetry =
    plain.status === "failed" ||
    (plain.status === "pending" && !!plain.lastError);
  return {
    provider: plain.provider || null,
    status: plain.status || null,
    shiprocketOrderId: plain.shiprocketOrderId
      ? String(plain.shiprocketOrderId)
      : null,
    shiprocketShipmentId: plain.shiprocketShipmentId
      ? String(plain.shiprocketShipmentId)
      : null,
    awbCode: plain.awbCode || null,
    trackingUrl: plain.trackingUrl || buildTrackingUrl(plain.awbCode),
    courierName: plain.courierName || null,
    pickupScheduledAt: plain.pickupScheduledAt
      ? new Date(plain.pickupScheduledAt).toISOString()
      : null,
    lastTrackedAt: plain.lastTrackedAt
      ? new Date(plain.lastTrackedAt).toISOString()
      : null,
    lastProviderStatus: plain.lastProviderStatus || null,
    lastError: plain.lastError || null,
    retryCount: plain.retryCount || 0,
    externalOrderKey: plain.externalOrderKey || null,
    canRetry,
  };
}

function extractProviderIds(srResponse) {
  const payload = srResponse?.payload || srResponse || {};
  const orderId =
    payload.order_id ?? payload.orderId ?? srResponse?.order_id ?? null;
  const shipmentId =
    payload.shipment_id ??
    payload.shipmentId ??
    srResponse?.shipment_id ??
    null;
  const awb =
    payload.awb_code ?? payload.awb ?? srResponse?.awb_code ?? null;
  const courier =
    payload.courier_name ??
    payload.courier_company_name ??
    srResponse?.courier_name ??
    null;
  return {
    orderId: orderId != null ? String(orderId) : null,
    shipmentId: shipmentId != null ? String(shipmentId) : null,
    awb: awb != null ? String(awb) : null,
    courier: courier != null ? String(courier) : null,
  };
}

function extractIdsFromExistingOrder(orderRow) {
  if (!orderRow) return null;
  const shipment =
    (Array.isArray(orderRow.shipments) && orderRow.shipments[0]) ||
    orderRow.shipment ||
    null;
  const orderId =
    orderRow.id ?? orderRow.order_id ?? orderRow.sr_order_id ?? null;
  const shipmentId =
    shipment?.id ??
    shipment?.shipment_id ??
    orderRow.shipment_id ??
    null;
  const awb =
    shipment?.awb ??
    shipment?.awb_code ??
    orderRow.awb_data?.awb ??
    orderRow.awb ??
    null;
  const courier =
    shipment?.courier ??
    shipment?.courier_name ??
    orderRow.courier_name ??
    null;

  if (orderId == null && shipmentId == null && !awb) return null;

  return {
    orderId: orderId != null ? String(orderId) : null,
    shipmentId: shipmentId != null ? String(shipmentId) : null,
    awb: awb != null ? String(awb) : null,
    courier: courier != null ? String(courier) : null,
  };
}

async function resolveSellerDestination(sellerId) {
  const pickup = await pickupLocationService.resolvePickupForSeller(
    sellerId || null
  );
  const seller = sellerId
    ? await Seller.findById(sellerId)
        .select("firstName lastName shopName email phone")
        .lean()
    : null;

  if (pickup) {
    const addr = pickup.address || {};
    return {
      name:
        seller?.shopName ||
        [seller?.firstName, seller?.lastName].filter(Boolean).join(" ") ||
        pickup.name ||
        "Seller",
      email: pickup.email || seller?.email || "seller@example.com",
      phone: pickup.phone || seller?.phone || "9999999999",
      address: addr.address || pickup.name || "Seller warehouse",
      address2: addr.address2 || "",
      city: addr.city || "City not provided",
      state: addr.state || "State not provided",
      country: addr.country || "India",
      pincode: addr.pincode ? String(addr.pincode) : "110001",
      pickupLocationId: pickup.shiprocketId || null,
      pickupLocationName: pickup.name || null,
    };
  }

  if (seller) {
    return {
      name:
        seller.shopName ||
        [seller.firstName, seller.lastName].filter(Boolean).join(" ") ||
        "Seller",
      email: seller.email || "seller@example.com",
      phone: seller.phone || "9999999999",
      address: "Seller warehouse",
      address2: "",
      city: "City not provided",
      state: "State not provided",
      country: "India",
      pincode: "110001",
      pickupLocationId: null,
      pickupLocationName: null,
    };
  }

  return null;
}

function buildReturnOrderItems(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const mapped = items
    .map((item, index) => {
      const product =
        item.product && typeof item.product === "object" ? item.product : {};
      const name =
        product.name || product.title || item.name || `Item ${index + 1}`;
      const sku = product.sku || item.sku || `SKU-${index + 1}`;
      const units = item.quantity || 1;
      const sellingPrice = Number(item.price) || 0;
      return {
        name: String(name).slice(0, 200),
        sku: String(sku).slice(0, 50),
        units,
        selling_price: sellingPrice,
      };
    })
    .filter((row) => row.units > 0);

  if (mapped.length === 0) {
    return [
      {
        name: "Return item",
        sku: "RETURN-1",
        units: 1,
        selling_price: Number(order?.totalAmount) || 1,
      },
    ];
  }
  return mapped;
}

function estimateWeightKg(order) {
  const items = Array.isArray(order?.items) ? order.items : [];
  const total = items.reduce((acc, item) => {
    const product =
      item.product && typeof item.product === "object" ? item.product : {};
    const unitWeight = Number(product.weight) || 0.5;
    return acc + unitWeight * (item.quantity || 1);
  }, 0);
  return Math.max(0.5, Number(total.toFixed(2)));
}

async function persistLogisticsPatch(requestId, patch, { appendHistory } = {}) {
  const update = {
    $set: {},
  };

  Object.entries(patch).forEach(([key, value]) => {
    update.$set[`reverseLogistics.${key}`] = value;
  });

  if (appendHistory) {
    update.$push = { statusHistory: appendHistory };
    update.$set.status = appendHistory.toStatus;
  }

  const updated = await ReturnRequest.findByIdAndUpdate(requestId, update, {
    new: true,
  });
  return updated;
}

function buildSuccessPatch({
  ids,
  externalOrderKey,
  retryCount,
  recovered = false,
}) {
  const now = new Date();
  return {
    provider: DEFAULT_PROVIDER,
    status: "scheduled",
    shiprocketOrderId: ids.orderId,
    shiprocketShipmentId: ids.shipmentId,
    awbCode: ids.awb,
    trackingUrl: buildTrackingUrl(ids.awb),
    courierName: ids.courier,
    pickupScheduledAt: now,
    lastTrackedAt: now,
    lastProviderStatus: recovered
      ? "RECOVERED EXISTING RETURN"
      : "PICKUP SCHEDULED",
    lastError: null,
    externalOrderKey,
    schedulingClaimedAt: null,
    retryCount: retryCount || 0,
  };
}

async function maybeAssignAwb(ids) {
  if (!ids.shipmentId || ids.awb) return ids;
  try {
    const awbResponse = await shipRocketService.generateAWB(ids.shipmentId);
    const awbPayload =
      awbResponse?.response?.data || awbResponse?.payload || awbResponse;
    const awbCode =
      awbPayload?.awb_code ||
      awbPayload?.awb ||
      awbResponse?.awb_code ||
      null;
    const courier =
      awbPayload?.courier_name ||
      awbPayload?.courier_company_name ||
      ids.courier;
    if (awbCode) {
      return { ...ids, awb: String(awbCode), courier: courier || ids.courier };
    }
  } catch (awbError) {
    console.warn(
      "⚠️ Reverse logistics AWB assign deferred:",
      awbError.message
    );
  }
  return ids;
}

/**
 * Recover an existing carrier return by deterministic channel order id.
 */
async function recoverExistingReturnOrder(externalOrderKey) {
  if (!externalOrderKey) return null;
  const existing = await shipRocketService.findOrderByChannelOrderId(
    externalOrderKey
  );
  const ids = extractIdsFromExistingOrder(existing);
  if (!ids) return null;
  return maybeAssignAwb(ids);
}

/**
 * Atomically claim the right to schedule reverse pickup for this case.
 * Only one concurrent scheduler wins; stale `scheduling` claims can be reclaimed.
 */
async function acquireSchedulingClaim(requestId, { isRetry, externalOrderKey }) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - SCHEDULING_CLAIM_TTL_MS);

  const update = {
    $set: {
      "reverseLogistics.provider": DEFAULT_PROVIDER,
      "reverseLogistics.status": "scheduling",
      "reverseLogistics.schedulingClaimedAt": now,
      "reverseLogistics.externalOrderKey": externalOrderKey,
      "reverseLogistics.lastError": null,
    },
  };
  if (isRetry) {
    update.$inc = { "reverseLogistics.retryCount": 1 };
  }

  return ReturnRequest.findOneAndUpdate(
    {
      _id: requestId,
      caseFlow: "after_sales",
      returnRequired: true,
      status: { $in: ["awaiting_pickup", "in_transit"] },
      $and: [
        {
          $or: [
            { reverseLogistics: null },
            { "reverseLogistics.status": null },
            { "reverseLogistics.status": { $exists: false } },
            { "reverseLogistics.status": "failed" },
            { "reverseLogistics.status": "pending" },
            {
              "reverseLogistics.status": "scheduling",
              $or: [
                { "reverseLogistics.schedulingClaimedAt": null },
                { "reverseLogistics.schedulingClaimedAt": { $lt: staleBefore } },
              ],
            },
          ],
        },
        {
          $or: [
            { "reverseLogistics.shiprocketOrderId": null },
            { "reverseLogistics.shiprocketOrderId": { $exists: false } },
            { "reverseLogistics.status": "failed" },
            { "reverseLogistics.status": "pending" },
            { "reverseLogistics.status": "scheduling" },
            { reverseLogistics: null },
          ],
        },
      ],
    },
    update,
    { new: true }
  );
}

async function resolveClaimConflict(requestId) {
  const current = await ReturnRequest.findById(requestId).lean();
  if (!current) return { notFound: true };

  const rl = current.reverseLogistics || {};
  if (hasSuccessfulSchedule(rl)) {
    return {
      alreadyScheduled: true,
      request: current,
      reverseLogistics: toReverseLogisticsDTO(rl),
    };
  }

  if (rl.status === "scheduling") {
    return {
      conflict: true,
      message: "Return pickup scheduling is already in progress. Try again shortly.",
      request: current,
      reverseLogistics: toReverseLogisticsDTO(rl),
    };
  }

  return {
    notAllowed: true,
    message: "Unable to claim reverse logistics scheduling for this case.",
    request: current,
    reverseLogistics: toReverseLogisticsDTO(rl),
  };
}

/**
 * Schedule reverse pickup after seller accept with returnRequired=true.
 * Idempotent under concurrent retries and carrier-success/local-persist failures.
 */
async function scheduleReturnPickup({
  requestId,
  sellerId,
  order: orderInput,
  isRetry = false,
} = {}) {
  if (!mongoose.isValidObjectId(requestId)) {
    return { invalid: true, message: "Invalid request id" };
  }

  const request = await ReturnRequest.findById(requestId).lean();
  if (!request) {
    return { notFound: true };
  }

  if (request.caseFlow !== "after_sales") {
    return {
      invalid: true,
      message: "Reverse logistics applies only to after-sales cases.",
    };
  }

  if (request.returnRequired !== true) {
    return {
      invalid: true,
      message: "Reverse logistics is only scheduled when returnRequired is true.",
    };
  }

  if (!["awaiting_pickup", "in_transit"].includes(request.status)) {
    return {
      notAllowed: true,
      message: "Pickup can only be scheduled while awaiting pickup or in transit.",
    };
  }

  const existing = request.reverseLogistics || {};
  if (hasSuccessfulSchedule(existing)) {
    return {
      alreadyScheduled: true,
      request,
      reverseLogistics: toReverseLogisticsDTO(existing),
    };
  }

  if (!isReverseLogisticsEnabled()) {
    const failedPatch = {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      lastError:
        "Reverse logistics is disabled. Enable REVERSE_LOGISTICS_PROVIDER=shiprocket.",
      retryCount: (existing.retryCount || 0) + (isRetry ? 1 : 0),
      schedulingClaimedAt: null,
    };
    const updated = await persistLogisticsPatch(requestId, failedPatch);
    return {
      failed: true,
      message: failedPatch.lastError,
      request: updated,
      reverseLogistics: toReverseLogisticsDTO(failedPatch),
    };
  }

  if (isRetry && (existing.retryCount || 0) >= MAX_RETRY_COUNT) {
    return {
      invalid: true,
      message: `Maximum pickup retry attempts (${MAX_RETRY_COUNT}) reached.`,
    };
  }

  const order =
    orderInput ||
    (await Order.findById(request.order).populate({
      path: "items.product",
      select: "name title sku weight seller",
    }));

  if (!order) {
    const failedPatch = {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      lastError: "Linked order not found for reverse pickup.",
      retryCount: (existing.retryCount || 0) + (isRetry ? 1 : 0),
      schedulingClaimedAt: null,
    };
    const updated = await persistLogisticsPatch(requestId, failedPatch);
    return {
      failed: true,
      message: failedPatch.lastError,
      request: updated,
      reverseLogistics: toReverseLogisticsDTO(failedPatch),
    };
  }

  if (
    Array.isArray(order.items) &&
    order.items.some(
      (i) =>
        i.product && !i.product.name && mongoose.isValidObjectId(i.product)
    )
  ) {
    await Order.populate(order, {
      path: "items.product",
      select: "name title sku weight seller",
    });
  }

  const externalOrderKey =
    existing.externalOrderKey || buildExternalOrderKey(order, requestId);

  const claimed = await acquireSchedulingClaim(requestId, {
    isRetry,
    externalOrderKey,
  });

  if (!claimed) {
    return resolveClaimConflict(requestId);
  }

  const claimedRetryCount = claimed.reverseLogistics?.retryCount || 0;

  // Recovery path: carrier already has this return (timeout after success, or prior create).
  try {
    const recoveredIds = await recoverExistingReturnOrder(externalOrderKey);
    if (recoveredIds) {
      const successPatch = buildSuccessPatch({
        ids: recoveredIds,
        externalOrderKey,
        retryCount: claimedRetryCount,
        recovered: true,
      });
      const updated = await persistLogisticsPatch(requestId, successPatch);
      return {
        scheduled: true,
        recovered: true,
        request: updated,
        reverseLogistics: toReverseLogisticsDTO(successPatch),
      };
    }
  } catch (recoverError) {
    console.warn(
      "⚠️ Reverse logistics pre-create recovery failed:",
      recoverError.message
    );
  }

  const destination = await resolveSellerDestination(sellerId);
  if (!destination) {
    const failedPatch = {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      lastError:
        "No seller pickup/warehouse destination configured for reverse logistics.",
      retryCount: claimedRetryCount,
      externalOrderKey,
      schedulingClaimedAt: null,
    };
    const updated = await persistLogisticsPatch(requestId, failedPatch);
    return {
      failed: true,
      message: failedPatch.lastError,
      request: updated,
      reverseLogistics: toReverseLogisticsDTO(failedPatch),
    };
  }

  const sd = order.shippingDetails || {};
  const pickupName = splitName(resolveCustomerName(sd) || "Customer");
  const pickupPhone =
    String(sd.phone || "9999999999").replace(/\D/g, "").slice(-10) ||
    "9999999999";
  const shippingPhone =
    String(destination.phone || "9999999999").replace(/\D/g, "").slice(-10) ||
    "9999999999";
  const orderItems = buildReturnOrderItems(order);
  const subTotal = orderItems.reduce(
    (sum, row) => sum + Number(row.selling_price) * Number(row.units),
    0
  );

  const returnPayload = {
    order_id: externalOrderKey,
    order_date: new Date().toISOString().slice(0, 10),
    channel_id: process.env.SHIPROCKET_CHANNEL_ID
      ? Number(process.env.SHIPROCKET_CHANNEL_ID)
      : undefined,
    pickup_customer_name: pickupName.first,
    pickup_last_name: pickupName.last,
    pickup_address: resolveAddressLine(sd) || "Address not provided",
    pickup_address_2: "",
    pickup_city: resolveCity(sd) || "City not provided",
    pickup_state: resolveState(sd) || "State not provided",
    pickup_country: sd.country || "India",
    pickup_pincode: Number(resolvePincode(sd) || "110001"),
    pickup_email: sd.email || "customer@example.com",
    pickup_phone: pickupPhone,
    shipping_customer_name: splitName(destination.name).first,
    shipping_last_name: splitName(destination.name).last,
    shipping_address: destination.address,
    shipping_address_2: destination.address2 || "",
    shipping_city: destination.city,
    shipping_state: destination.state,
    shipping_country: destination.country,
    shipping_pincode: Number(destination.pincode || "110001"),
    shipping_email: destination.email,
    shipping_phone: Number(shippingPhone),
    order_items: orderItems,
    payment_method: "Prepaid",
    sub_total: Math.max(1, Math.round(subTotal) || 1),
    length: 10,
    breadth: 10,
    height: 10,
    weight: estimateWeightKg(order),
  };

  if (
    returnPayload.channel_id == null ||
    Number.isNaN(returnPayload.channel_id)
  ) {
    delete returnPayload.channel_id;
  }

  try {
    const srResponse = await shipRocketService.createReturnOrder(returnPayload);
    let ids = extractProviderIds(srResponse);
    ids = await maybeAssignAwb(ids);

    const successPatch = buildSuccessPatch({
      ids,
      externalOrderKey,
      retryCount: claimedRetryCount,
      recovered: false,
    });
    const updated = await persistLogisticsPatch(requestId, successPatch);
    return {
      scheduled: true,
      request: updated,
      reverseLogistics: toReverseLogisticsDTO(successPatch),
    };
  } catch (error) {
    // Duplicate create → recover existing carrier order instead of failing hard.
    if (
      error.isDuplicate ||
      shipRocketService.constructor.isDuplicateOrderError?.(
        error.statusCode,
        error.message,
        error.providerResponse
      )
    ) {
      try {
        const recoveredIds = await recoverExistingReturnOrder(externalOrderKey);
        if (recoveredIds) {
          const successPatch = buildSuccessPatch({
            ids: recoveredIds,
            externalOrderKey,
            retryCount: claimedRetryCount,
            recovered: true,
          });
          const updated = await persistLogisticsPatch(requestId, successPatch);
          return {
            scheduled: true,
            recovered: true,
            duplicateRecovered: true,
            request: updated,
            reverseLogistics: toReverseLogisticsDTO(successPatch),
          };
        }
      } catch (recoverError) {
        console.error(
          "❌ Duplicate create recovery failed:",
          recoverError.message
        );
      }
    }

    const message = error.message || "Failed to create Shiprocket return order";
    console.error("❌ Reverse logistics schedule error:", message);
    const failedPatch = {
      provider: DEFAULT_PROVIDER,
      status: "failed",
      lastError: String(message).slice(0, 2000),
      retryCount: claimedRetryCount,
      externalOrderKey,
      schedulingClaimedAt: null,
    };
    const updated = await persistLogisticsPatch(requestId, failedPatch);
    return {
      failed: true,
      message,
      request: updated,
      reverseLogistics: toReverseLogisticsDTO(failedPatch),
    };
  }
}

/**
 * Seller/admin retry when previous schedule failed.
 */
async function retryReturnPickup({ requestId, sellerId }) {
  const request = await ReturnRequest.findById(requestId).lean();
  if (!request) {
    return { notFound: true };
  }

  const rl = request.reverseLogistics || {};
  if (hasSuccessfulSchedule(rl)) {
    return {
      alreadyScheduled: true,
      reverseLogistics: toReverseLogisticsDTO(rl),
    };
  }

  if (rl.status === "scheduling") {
    const claimedAt = rl.schedulingClaimedAt
      ? new Date(rl.schedulingClaimedAt).getTime()
      : 0;
    const stale = !claimedAt || Date.now() - claimedAt >= SCHEDULING_CLAIM_TTL_MS;
    if (!stale) {
      return {
        conflict: true,
        message:
          "Return pickup scheduling is already in progress. Try again shortly.",
        reverseLogistics: toReverseLogisticsDTO(rl),
      };
    }
  }

  if (
    rl.status &&
    rl.status !== "failed" &&
    rl.status !== "pending" &&
    rl.status !== "scheduling"
  ) {
    return {
      notAllowed: true,
      message: "Pickup retry is only available after a failed schedule attempt.",
    };
  }

  const order = await Order.findById(request.order).populate({
    path: "items.product",
    select: "name title sku weight seller",
  });

  return scheduleReturnPickup({
    requestId,
    sellerId,
    order,
    isRetry: true,
  });
}

/**
 * Sync a single case's reverse tracking from the provider.
 * Advances case status awaiting_pickup → in_transit when courier has picked up.
 * Does NOT auto-confirm receipt (seller gate).
 */
async function syncReturnTracking(requestOrId) {
  const request =
    typeof requestOrId === "object" && requestOrId?._id
      ? requestOrId
      : await ReturnRequest.findById(requestOrId);

  if (!request) return { notFound: true };
  if (request.caseFlow !== "after_sales") return { skipped: true };
  if (!["awaiting_pickup", "in_transit"].includes(request.status)) {
    return { skipped: true };
  }

  const rl = request.reverseLogistics || {};
  const awb = rl.awbCode;
  if (!awb) return { skipped: true, reason: "no_awb" };

  const tracking = await shipRocketService.getTracking(awb);
  if (!tracking?.tracking_data?.shipment_track?.[0]) {
    return { skipped: true, reason: "no_tracking_data" };
  }

  const track = tracking.tracking_data.shipment_track[0];
  const providerStatus = track.current_status || null;
  const mapped =
    shipRocketService.constructor.MAP_RETURN_TRACKING(providerStatus);
  const now = new Date();

  const logisticsPatch = {
    lastTrackedAt: now,
    lastProviderStatus: providerStatus,
  };

  if (mapped === "in_transit" || mapped === "delivered") {
    logisticsPatch.status = mapped;
  } else if (mapped === "failed") {
    logisticsPatch.status = "failed";
    logisticsPatch.lastError = `Carrier status: ${providerStatus}`;
  } else if (mapped === "scheduled" && !rl.status) {
    logisticsPatch.status = "scheduled";
  }

  let appendHistory = null;
  if (mapped === "in_transit" || mapped === "delivered") {
    if (
      request.status === "awaiting_pickup" &&
      isAllowedAfterSalesTransition("awaiting_pickup", "in_transit")
    ) {
      appendHistory = {
        fromStatus: "awaiting_pickup",
        toStatus: "in_transit",
        changedAt: now,
        changedBy: null,
        changedByRole: "system",
        changedBySeller: null,
        note: `Carrier update: ${providerStatus || "in transit"}`,
      };
    }
  }

  const statusUnchanged =
    !appendHistory &&
    (rl.lastProviderStatus || null) === (providerStatus || null) &&
    (!mapped ||
      rl.status === mapped ||
      (mapped === "scheduled" && rl.status === "scheduled"));

  if (statusUnchanged && !logisticsPatch.status) {
    await persistLogisticsPatch(request._id, {
      lastTrackedAt: now,
      lastProviderStatus: providerStatus,
    });
    return { synced: true, unchanged: true };
  }

  const updated = await persistLogisticsPatch(request._id, logisticsPatch, {
    appendHistory,
  });

  return {
    synced: true,
    statusAdvanced: !!appendHistory,
    request: updated,
    reverseLogistics: toReverseLogisticsDTO(updated?.reverseLogistics),
  };
}

/**
 * Poll active reverse shipments (paired with outbound Shiprocket poll interval).
 */
async function pollReturnTrackingUpdates() {
  try {
    const requests = await ReturnRequest.find({
      caseFlow: "after_sales",
      returnRequired: true,
      status: { $in: ["awaiting_pickup", "in_transit"] },
      "reverseLogistics.awbCode": { $ne: null },
      "reverseLogistics.status": {
        $in: ["scheduled", "in_transit", "delivered"],
      },
    }).limit(100);

    console.log(`📡 Polling reverse logistics for ${requests.length} cases...`);
    for (const request of requests) {
      try {
        await syncReturnTracking(request);
      } catch (err) {
        console.error(
          `❌ Reverse tracking sync failed for ${request._id}:`,
          err.message
        );
      }
    }
  } catch (error) {
    console.error("❌ Reverse logistics polling error:", error.message);
  }
}

module.exports = {
  isReverseLogisticsEnabled,
  toReverseLogisticsDTO,
  scheduleReturnPickup,
  retryReturnPickup,
  syncReturnTracking,
  pollReturnTrackingUpdates,
  buildTrackingUrl,
  buildExternalOrderKey,
  acquireSchedulingClaim,
  recoverExistingReturnOrder,
  SCHEDULING_CLAIM_TTL_MS,
  MAP_RETURN_TRACKING: (...args) =>
    shipRocketService.constructor.MAP_RETURN_TRACKING(...args),
};
