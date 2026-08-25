const SiteSettings = require("../models/SiteSettings");
const Admin = require("../models/Admin");
const Order = require("../models/Order");
const Seller = require("../models/Seller");
const Product = require("../models/Product");
const sendMail = require("../utils/sendMail");

const RETURN_STATUS_LABELS = {
  pending_review: "Return pending review",
  approved: "Return approved",
  rejected: "Return rejected",
  refund_pending: "Refund pending review",
  refund_approved: "Refund approved",
  refund_rejected: "Refund rejected",
  refund_completed: "Refund completed",
  closed: "Request closed",
  awaiting_pickup: "Awaiting pickup",
  in_transit: "In transit",
  awaiting_inspection: "Awaiting inspection",
  resolved: "Resolved",
};

const RETURN_RESOLUTION_LABELS = {
  refund: "Refund",
  replacement: "Replacement",
  repair: "Repair",
  rejected: "Rejected",
};

const RETURN_REASON_LABELS = {
  DEFECTIVE_DAMAGED: "Item is defective or damaged",
  WRONG_ITEM: "Wrong item received",
  NOT_AS_DESCRIBED: "Item not as described",
  QUALITY_NOT_SATISFACTORY: "Quality not satisfactory",
  CHANGE_OF_MIND: "Change of mind",
  OTHER: "Other",
};

function getFrontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:3000";
}

function getStatusLabel(status) {
  return RETURN_STATUS_LABELS[status] || status;
}

function getReasonLabel(reasonCode, reasonText) {
  const base = RETURN_REASON_LABELS[reasonCode] || reasonCode || "Not specified";
  if (reasonCode === "OTHER" && reasonText) {
    return `${base}: ${reasonText}`;
  }
  if (reasonText) {
    return `${base} — ${reasonText}`;
  }
  return base;
}

function formatOrderLabel(order) {
  if (!order) return "N/A";
  return order.invoiceNumber || String(order._id);
}

function formatShopperName(buyer) {
  if (!buyer || typeof buyer !== "object") return "Customer";
  const name = [buyer.firstName, buyer.lastName].filter(Boolean).join(" ").trim();
  return name || "Customer";
}

function resolveShopperEmail(order) {
  if (!order) return null;
  if (order.buyer && typeof order.buyer === "object" && order.buyer.email) {
    return order.buyer.email;
  }
  return (
    order.billingDetails?.email ||
    order.shippingDetails?.email ||
    null
  );
}

async function resolveAdminRecipients() {
  const settings = await SiteSettings.findOne({}).lean();
  if (settings?.enquiryNotificationEmail) {
    return [settings.enquiryNotificationEmail];
  }

  const admins = await Admin.find({}).select("email").lean();
  return admins.map((admin) => admin.email).filter(Boolean);
}

async function loadOrderForNotification(orderOrId) {
  if (!orderOrId) return null;
  if (typeof orderOrId === "object" && orderOrId.buyer?.email) {
    return orderOrId;
  }
  return Order.findById(orderOrId)
    .select("invoiceNumber billingDetails shippingDetails buyer")
    .populate("buyer", "firstName lastName email")
    .lean();
}

function toPlainReturnRequest(returnRequest) {
  return returnRequest && typeof returnRequest.toObject === "function"
    ? returnRequest.toObject()
    : returnRequest || {};
}

async function sendAdminReturnRequestSubmitted(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const recipients = await resolveAdminRecipients();

  if (recipients.length === 0) {
    console.warn("No admin recipients configured for return request notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const adminLink = `${frontendUrl}/admin/return-requests`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const shopperEmail = resolveShopperEmail(order) || "N/A";

  const html = `
    <h2>New Return Request</h2>
    <p>A shopper has submitted a return request that requires admin review.</p>
    <ul>
      <li><strong>Request ID:</strong> ${plain._id}</li>
      <li><strong>Order:</strong> ${orderLabel}</li>
      <li><strong>Customer:</strong> ${shopperName} (${shopperEmail})</li>
      <li><strong>Reason:</strong> ${getReasonLabel(plain.reasonCode, plain.reasonText)}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    <p><a href="${adminLink}">Review return requests in admin panel</a></p>
  `;

  for (const to of recipients) {
    await sendMail(to, `New Return Request — ${orderLabel}`, html);
  }
}

async function resolveSellerRecipientsForOrder(orderOrId) {
  let order = orderOrId;
  if (!order || typeof order !== "object" || !Array.isArray(order.items)) {
    order = await Order.findById(orderOrId)
      .select("items")
      .lean();
  }
  if (!order?.items?.length) return [];

  const productIds = order.items
    .map((item) => {
      const productRef = item.product;
      if (productRef && typeof productRef === "object") {
        return productRef._id || productRef.id || null;
      }
      return productRef || null;
    })
    .filter(Boolean);

  if (productIds.length === 0) return [];

  const products = await Product.find({ _id: { $in: productIds } })
    .select("seller")
    .lean();
  const sellerIds = [
    ...new Set(products.map((p) => String(p.seller)).filter(Boolean)),
  ];
  if (sellerIds.length === 0) return [];

  const sellers = await Seller.find({ _id: { $in: sellerIds } })
    .select("email shopName")
    .lean();
  return sellers.map((s) => s.email).filter(Boolean);
}

/**
 * Notify seller(s) when a shopper submits a Need Help / after-sales case.
 */
async function sendSellerReturnRequestSubmitted(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const recipients = await resolveSellerRecipientsForOrder(orderOrId);

  if (recipients.length === 0) {
    console.warn("No seller recipients found for after-sales case notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const sellerLink = `${frontendUrl}/seller/after-sales`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const issueLabel = getReasonLabel(
    plain.issueCategory || plain.reasonCode,
    plain.reasonText
  );

  const html = `
    <h2>New After-Sales Case</h2>
    <p>A shopper needs help with an order that includes your products.</p>
    <ul>
      <li><strong>Case ID:</strong> ${plain._id}</li>
      <li><strong>Order:</strong> ${orderLabel}</li>
      <li><strong>Customer:</strong> ${shopperName}</li>
      <li><strong>Issue:</strong> ${issueLabel}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    <p><a href="${sellerLink}">Review in After-Sales queue</a></p>
  `;

  for (const to of recipients) {
    await sendMail(to, `New After-Sales Case — ${orderLabel}`, html);
  }
}

/**
 * Notify shopper of seller accept/reject decision.
 */
async function sendShopperSellerDecisionUpdate(returnRequest, orderOrId, { action } = {}) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for seller decision notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const accepted = action === "accept";

  const html = `
    <h2>After-Sales Case ${accepted ? "Accepted" : "Rejected"}</h2>
    <p>Hello ${shopperName},</p>
    <p>The seller has <strong>${accepted ? "accepted" : "rejected"}</strong> your help request for order <strong>${orderLabel}</strong>.</p>
    <ul>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${
        typeof plain.returnRequired === "boolean"
          ? `<li><strong>Return required:</strong> ${plain.returnRequired ? "Yes" : "No"}</li>`
          : ""
      }
      ${plain.sellerNote ? `<li><strong>Note:</strong> ${plain.sellerNote}</li>` : ""}
    </ul>
    ${
      accepted && plain.returnRequired
        ? plain.reverseLogistics?.status === "scheduled" ||
          plain.reverseLogistics?.awbCode
          ? "<p>A return pickup has been scheduled. Please pack the item and hand it to the courier when they arrive. Tracking details are on your order page.</p>"
          : "<p>If a pickup is required, you will receive handover instructions when it is scheduled.</p>"
        : ""
    }
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(
    shopperEmail,
    `After-Sales ${accepted ? "Accepted" : "Rejected"} — ${orderLabel}`,
    html
  );
}

/**
 * Notify shopper when reverse pickup is scheduled (AWB / handover instructions).
 */
async function sendShopperPickupScheduled(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for pickup scheduled notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const rl = plain.reverseLogistics || {};
  const trackingUrl = rl.trackingUrl || null;
  const awb = rl.awbCode || null;

  const html = `
    <h2>Return Pickup Scheduled</h2>
    <p>Hello ${shopperName},</p>
    <p>A courier pickup has been scheduled for your return on order <strong>${orderLabel}</strong>.</p>
    <ul>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${awb ? `<li><strong>AWB / Tracking:</strong> ${awb}</li>` : ""}
      ${rl.courierName ? `<li><strong>Courier:</strong> ${rl.courierName}</li>` : ""}
    </ul>
    <p>Please pack the item securely and keep it ready for handover when the courier arrives.</p>
    ${
      trackingUrl
        ? `<p><a href="${trackingUrl}">Track shipment</a></p>`
        : ""
    }
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(shopperEmail, `Return Pickup Scheduled — ${orderLabel}`, html);
}

/**
 * Notify shopper when seller confirms physical receipt of the return.
 */
async function sendShopperReceiptConfirmed(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for receipt confirmation notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);

  const html = `
    <h2>Return Received by Seller</h2>
    <p>Hello ${shopperName},</p>
    <p>The seller has confirmed receipt of your returned item for order <strong>${orderLabel}</strong>.</p>
    <ul>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    <p>The seller will inspect the item and record a final resolution next.</p>
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(shopperEmail, `Return Received — ${orderLabel}`, html);
}

/**
 * Notify shopper when seller records a final Resolution (incl. record-only Replacement/Repair).
 */
async function sendShopperResolutionRecorded(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for resolution notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const resolution = plain.resolution || plain.effectiveResolution;
  const resolutionLabel =
    RETURN_RESOLUTION_LABELS[resolution] || resolution || "Updated";

  let followUpCopy = "";
  if (resolution === "replacement" || resolution === "repair") {
    followUpCopy =
      "<p>Our team will arrange this manually. You may be contacted with next steps.</p>";
  } else if (resolution === "refund") {
    followUpCopy =
      "<p>Your refund will be credited to your Anbazar wallet when processing completes. Check your wallet balance under My Account.</p>";
  }

  const html = `
    <h2>After-Sales Resolution: ${resolutionLabel}</h2>
    <p>Hello ${shopperName},</p>
    <p>The seller has recorded a resolution for your help request on order <strong>${orderLabel}</strong>.</p>
    <ul>
      <li><strong>Resolution:</strong> ${resolutionLabel}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${plain.sellerNote ? `<li><strong>Note:</strong> ${plain.sellerNote}</li>` : ""}
    </ul>
    ${followUpCopy}
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(
    shopperEmail,
    `After-Sales Resolution — ${resolutionLabel} — ${orderLabel}`,
    html
  );
}

async function sendShopperCaseSubmittedAcknowledgement(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for case submission acknowledgement");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const issueLabel = getReasonLabel(
    plain.issueCategory || plain.reasonCode,
    plain.reasonText
  );

  const html = `
    <h2>Help Request Received</h2>
    <p>Hello ${shopperName},</p>
    <p>We received your help request for order <strong>${orderLabel}</strong>.</p>
    <ul>
      <li><strong>Issue:</strong> ${issueLabel}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    <p>The seller will review your case and evidence. You can track progress on your order page.</p>
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(shopperEmail, `Help Request Received — ${orderLabel}`, html);
}

async function sendShopperAdminOverrideUpdate(returnRequest, orderOrId, { action, resolution } = {}) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for admin override notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const effectiveResolution = plain.resolution || plain.effectiveResolution;
  const resolutionLabel =
    RETURN_RESOLUTION_LABELS[effectiveResolution] || effectiveResolution || "Updated";

  let bodyCopy = "";
  if (action === "reopen") {
    bodyCopy =
      "<p>Our team has reopened your case for further review. The seller will re-evaluate your request.</p>";
  } else {
    bodyCopy = `<p>Our team has updated the resolution for your case to <strong>${resolutionLabel}</strong>.</p>`;
    if (effectiveResolution === "refund") {
      bodyCopy +=
        "<p>When eligible, your refund will be credited to your Anbazar wallet. Check My Account → Wallet for balance and history.</p>";
    } else if (effectiveResolution === "replacement" || effectiveResolution === "repair") {
      bodyCopy += "<p>Our team will arrange this manually. You may be contacted with next steps.</p>";
    }
  }

  const html = `
    <h2>After-Sales Case Update</h2>
    <p>Hello ${shopperName},</p>
    <p>There is an update on your help request for order <strong>${orderLabel}</strong>.</p>
    ${bodyCopy}
    <ul>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${effectiveResolution ? `<li><strong>Resolution:</strong> ${resolutionLabel}</li>` : ""}
      ${plain.adminReturnNote ? `<li><strong>Note:</strong> ${plain.adminReturnNote}</li>` : ""}
    </ul>
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(shopperEmail, `After-Sales Update — ${orderLabel}`, html);
}

async function sendSellerSlaReminder(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const recipients = await resolveSellerRecipientsForOrder(orderOrId);

  if (recipients.length === 0) {
    console.warn("No seller recipients found for SLA reminder");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const sellerLink = `${frontendUrl}/seller/after-sales`;
  const orderLabel = formatOrderLabel(order);

  const html = `
    <h2>After-Sales Review Reminder</h2>
    <p>An after-sales case for order <strong>${orderLabel}</strong> is awaiting your review.</p>
    <ul>
      <li><strong>Case ID:</strong> ${plain._id}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      <li><strong>Submitted:</strong> ${plain.createdAt ? new Date(plain.createdAt).toLocaleString() : "N/A"}</li>
    </ul>
    <p>Please review the case promptly to avoid marketplace escalation.</p>
    <p><a href="${sellerLink}">Open After-Sales queue</a></p>
  `;

  for (const to of recipients) {
    await sendMail(to, `Review Reminder — After-Sales Case ${orderLabel}`, html);
  }
}

async function sendAdminCaseEscalation(returnRequest, orderOrId, { reason } = {}) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const recipients = await resolveAdminRecipients();

  if (recipients.length === 0) {
    console.warn("No admin recipients configured for case escalation");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const adminLink = `${frontendUrl}/admin/return-requests`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);

  const html = `
    <h2>After-Sales Escalation</h2>
    <p>An after-sales case requires admin attention.</p>
    <ul>
      <li><strong>Case ID:</strong> ${plain._id}</li>
      <li><strong>Order:</strong> ${orderLabel}</li>
      <li><strong>Customer:</strong> ${shopperName}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${reason ? `<li><strong>Reason:</strong> ${reason}</li>` : ""}
    </ul>
    <p><a href="${adminLink}">Review in admin After-Sales queue</a></p>
  `;

  for (const to of recipients) {
    await sendMail(to, `After-Sales Escalation — ${orderLabel}`, html);
  }
}

async function sendShopperReturnReviewUpdate(returnRequest, orderOrId, { action } = {}) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for return review notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const approved = action === "approve";

  const html = `
    <h2>Return Request ${approved ? "Approved" : "Rejected"}</h2>
    <p>Hello ${shopperName},</p>
    <p>Your return request for order <strong>${orderLabel}</strong> has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>
    <ul>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${plain.adminReturnNote ? `<li><strong>Note:</strong> ${plain.adminReturnNote}</li>` : ""}
    </ul>
    ${
      approved
        ? "<p>Our team will now review your refund request. You will receive another email once that review is complete.</p>"
        : "<p>If you have questions about this decision, please contact our support team.</p>"
    }
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(
    shopperEmail,
    `Return ${approved ? "Approved" : "Rejected"} — ${orderLabel}`,
    html
  );
}

async function sendShopperRefundReviewUpdate(returnRequest, orderOrId, { action } = {}) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for refund review notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const approved = action === "approve";

  const html = `
    <h2>Refund Request ${approved ? "Approved" : "Rejected"}</h2>
    <p>Hello ${shopperName},</p>
    <p>Your refund request for order <strong>${orderLabel}</strong> has been <strong>${approved ? "approved" : "rejected"}</strong>.</p>
    <ul>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${plain.adminRefundNote ? `<li><strong>Note:</strong> ${plain.adminRefundNote}</li>` : ""}
    </ul>
    ${
      approved
        ? "<p>Your refund will be processed manually within 5–7 business days. You will receive a confirmation email once the refund is marked complete.</p>"
        : "<p>If you have questions about this decision, please contact our support team.</p>"
    }
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(
    shopperEmail,
    `Refund ${approved ? "Approved" : "Rejected"} — ${orderLabel}`,
    html
  );
}

async function sendShopperWalletCredited(returnRequest, orderOrId, { amount } = {}) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for wallet credit notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);
  const creditAmount =
    typeof amount === "number"
      ? amount
      : typeof plain.walletCreditAmount === "number"
        ? plain.walletCreditAmount
        : null;
  const formattedAmount =
    creditAmount != null
      ? new Intl.NumberFormat("en-IN", {
          style: "currency",
          currency: "INR",
          maximumFractionDigits: 2,
        }).format(creditAmount)
      : "your refund amount";
  const walletLink = `${frontendUrl}/shopper/wallet`;

  const html = `
    <h2>Refund Credited to Your Wallet</h2>
    <p>Hello ${shopperName},</p>
    <p>Your refund for order <strong>${orderLabel}</strong> has been credited to your Anbazar wallet.</p>
    <ul>
      <li><strong>Amount:</strong> ${formattedAmount}</li>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
    </ul>
    <p>You can view your wallet balance and transaction history in your account.</p>
    <p><a href="${walletLink}">View wallet</a></p>
  `;

  await sendMail(shopperEmail, `Wallet Refund Credited — ${orderLabel}`, html);
}

async function sendShopperRefundCompleted(returnRequest, orderOrId) {
  const plain = toPlainReturnRequest(returnRequest);
  const order = await loadOrderForNotification(orderOrId);
  const shopperEmail = resolveShopperEmail(order);

  if (!shopperEmail) {
    console.warn("No shopper email found for refund completion notification");
    return;
  }

  const frontendUrl = getFrontendUrl();
  const orderId = order?._id || plain.order;
  const orderLink = orderId ? `${frontendUrl}/orders/${orderId}` : `${frontendUrl}/orders`;
  const orderLabel = formatOrderLabel(order);
  const shopperName = formatShopperName(order?.buyer);

  const html = `
    <h2>Refund Completed</h2>
    <p>Hello ${shopperName},</p>
    <p>Your refund for order <strong>${orderLabel}</strong> has been marked complete.</p>
    <ul>
      <li><strong>Status:</strong> ${getStatusLabel(plain.status)}</li>
      ${plain.adminRefundNote ? `<li><strong>Note:</strong> ${plain.adminRefundNote}</li>` : ""}
    </ul>
    <p>Depending on your payment method, it may take additional time for funds to appear in your account.</p>
    <p><a href="${orderLink}">View your order</a></p>
  `;

  await sendMail(shopperEmail, `Refund Completed — ${orderLabel}`, html);
}

module.exports = {
  sendAdminReturnRequestSubmitted,
  sendSellerReturnRequestSubmitted,
  sendShopperCaseSubmittedAcknowledgement,
  sendShopperReturnReviewUpdate,
  sendShopperRefundReviewUpdate,
  sendShopperRefundCompleted,
  sendShopperSellerDecisionUpdate,
  sendShopperResolutionRecorded,
  sendShopperPickupScheduled,
  sendShopperReceiptConfirmed,
  sendShopperWalletCredited,
  sendShopperAdminOverrideUpdate,
  sendSellerSlaReminder,
  sendAdminCaseEscalation,
  RETURN_STATUS_LABELS,
  RETURN_REASON_LABELS,
  RETURN_RESOLUTION_LABELS,
};
