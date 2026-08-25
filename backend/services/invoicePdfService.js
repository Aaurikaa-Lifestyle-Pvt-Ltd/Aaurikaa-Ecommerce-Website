const {
  resolveAddressDetails,
  formatAddressLines,
} = require("../utils/invoiceAddressFormatter");
const {
  sanitizePdfText,
  sanitizeSeller,
  pdfEmptyCell,
} = require("../utils/pdfTextSanitizer");
const {
  buildShopperOrderTaxVisibility,
  isInclusiveTaxOrder: isInclusiveTaxOrderSnapshot,
} = require("../utils/orderFinancialSnapshot");
const {
  ORDER_SHIPPING_APPLICABILITY_NONE,
  LEGACY_ORDER_SHIPPING_APPLICABILITY,
} = require("../constants/shippingConstants");

function resolveOrderShippingApplicability(order) {
  return order?.shippingApplicability || LEGACY_ORDER_SHIPPING_APPLICABILITY;
}

function orderRequiresShipping(order) {
  return resolveOrderShippingApplicability(order) !== ORDER_SHIPPING_APPLICABILITY_NONE;
}

/** Letter size with 50pt margins (matches PDFDocument({ margin: 50 })). */
const PAGE = {
  width: 612,
  height: 792,
  margin: 50,
  get bottom() {
    return this.height - this.margin;
  },
  get right() {
    return this.width - this.margin;
  },
  get left() {
    return this.margin;
  },
};

const COLS = {
  product: { left: 50, width: 210 },
  qty: { left: 268, width: 32 },
  unitPrice: { left: 305, width: 78 },
  discount: { left: 388, width: 72 },
  lineTotal: { left: 465, width: 97 },
};

const GST_COLS = {
  desc: { left: 50, width: 155 },
  hsn: { left: 208, width: 45 },
  qty: { left: 256, width: 28 },
  taxable: { left: 287, width: 58 },
  rate: { left: 348, width: 32 },
  cgst: { left: 383, width: 48 },
  sgst: { left: 434, width: 48 },
  igst: { left: 485, width: 77 },
};

const SUMMARY = {
  labelLeft: 370,
  valueLeft: 465,
  valueWidth: 97,
};

const ROW_PAD = 6;
const MIN_ROW_HEIGHT = 16;
const META_RIGHT = 380;

const DEFAULT_SELLER = {
  companyName: "AAURIKAA Lifestyles Private Limited",
  address: "",
  phone: "",
  email: "",
  gstin: "",
};

function formatMoney(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "Rs. 0.00";
  return `Rs. ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatMoneyNegative(amount) {
  const abs = formatMoney(Math.abs(Number(amount) || 0));
  return abs.replace(/^Rs\.\s*/, "Rs. -");
}

function textHeight(doc, text, width) {
  return doc.heightOfString(String(text), { width });
}

function drawInColumn(doc, text, col, y, align = "left") {
  doc.text(String(text), col.left, y, { width: col.width, align });
}

function drawMoneyInColumn(doc, amount, col, y) {
  drawInColumn(doc, formatMoney(amount), col, y, "right");
}

function drawSummaryLine(doc, label, valueText, y, bold = false) {
  const fontSize = bold ? 12 : 10;
  const valueWidth = PAGE.right - SUMMARY.valueLeft;
  const safeValue = sanitizePdfText(valueText, { allowNewlines: false, fallback: "-" });
  const safeLabel = sanitizePdfText(label, { allowNewlines: false, fallback: "" });

  doc.fontSize(fontSize).font(bold ? "Helvetica-Bold" : "Helvetica");
  doc.text(safeLabel, SUMMARY.labelLeft, y);
  const valueHeight = textHeight(doc, safeValue, valueWidth);
  doc.text(safeValue, SUMMARY.valueLeft, y, { width: valueWidth, align: "right" });

  const minRow = bold ? 20 : 14;
  return y + Math.max(minRow, valueHeight + 4);
}

function resolveShippingDisplay(order) {
  const charge = Number(order.shippingCharge) || 0;
  const freeByCoupon = Boolean(order.coupon?.couponData?.freeShipping) && charge === 0;
  if (freeByCoupon) return { label: "Shipping:", value: "FREE" };
  return { label: "Shipping:", value: formatMoney(charge) };
}

function isInclusiveTaxOrder(order) {
  return isInclusiveTaxOrderSnapshot(order);
}

function drawItemsTableHeader(doc, y) {
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Description", COLS.product.left, y);
  doc.text("Qty", COLS.qty.left, y, { width: COLS.qty.width, align: "center" });
  doc.text("Rate", COLS.unitPrice.left, y, { width: COLS.unitPrice.width, align: "right" });
  doc.text("Disc.", COLS.discount.left, y, { width: COLS.discount.width, align: "right" });
  doc.text("Amount", COLS.lineTotal.left, y, { width: COLS.lineTotal.width, align: "right" });
  doc.moveTo(PAGE.left, y + 13).lineTo(PAGE.right, y + 13).stroke();
  return y + 20;
}

function ensureSpace(doc, y, requiredHeight, onNewPage) {
  if (y + requiredHeight <= PAGE.bottom) return y;
  doc.addPage();
  if (typeof onNewPage === "function") return onNewPage();
  return PAGE.margin;
}

function getItemTaxBreakdown(order, itemIndex) {
  const snapshot = order.tax?.taxBreakdownSnapshot?.items;
  if (Array.isArray(snapshot) && snapshot[itemIndex]) {
    return snapshot[itemIndex];
  }
  return null;
}

function estimateTailBlockHeight(order, hasGstTable) {
  const taxVisibility = buildShopperOrderTaxVisibility(order);
  let h = 90;
  if (taxVisibility.showDiscountLine) h += 14;
  if (taxVisibility.itemsGstAdded > 0) h += 14;
  if (shouldShowShippingLine(order, taxVisibility)) h += 14;
  if (orderRequiresShipping(order) && taxVisibility.shippingGst > 0) h += 14;
  h += 32;
  if (hasGstTable) h += 20 + 14 * Math.min(order.items?.length || 1, 8);
  h += 14;
  h += 55;
  h += 50;
  return h;
}

function renderItemRow(doc, item, y) {
  const bulk = item.bulkDiscount || {};
  const productText = sanitizePdfText(item.product?.name, { fallback: "Product" });

  doc.fontSize(9).font("Helvetica");
  const nameHeight = textHeight(doc, productText, COLS.product.width);
  const contentHeight = Math.max(MIN_ROW_HEIGHT, nameHeight);

  doc.text(productText, COLS.product.left, y, { width: COLS.product.width });
  drawInColumn(doc, item.quantity, COLS.qty, y, "center");
  drawMoneyInColumn(doc, item.originalPrice, COLS.unitPrice, y);
  drawMoneyInColumn(doc, bulk.applied ? bulk.discountAmount : 0, COLS.discount, y);
  drawMoneyInColumn(doc, item.price * item.quantity, COLS.lineTotal, y);

  return y + contentHeight + ROW_PAD;
}

function renderGstTable(doc, order, y) {
  const items = order.items || [];
  if (items.length === 0) return y;

  const hasTax =
    (Number(order.tax?.totalTaxAmount) || 0) > 0 ||
    isInclusiveTaxOrder(order) ||
    (order.tax?.taxBreakdownSnapshot?.items?.length > 0);

  if (!hasTax) return y;

  y += 8;
  doc.fontSize(9).font("Helvetica-Bold").text("GST Breakdown", PAGE.left, y);
  y += 14;

  doc.fontSize(7).font("Helvetica-Bold");
  doc.text("Item", GST_COLS.desc.left, y, { width: GST_COLS.desc.width });
  doc.text("HSN", GST_COLS.hsn.left, y, { width: GST_COLS.hsn.width });
  doc.text("Qty", GST_COLS.qty.left, y, { width: GST_COLS.qty.width, align: "center" });
  doc.text("Taxable", GST_COLS.taxable.left, y, { width: GST_COLS.taxable.width, align: "right" });
  doc.text("Rate", GST_COLS.rate.left, y, { width: GST_COLS.rate.width, align: "right" });
  doc.text("CGST", GST_COLS.cgst.left, y, { width: GST_COLS.cgst.width, align: "right" });
  doc.text("SGST", GST_COLS.sgst.left, y, { width: GST_COLS.sgst.width, align: "right" });
  doc.text("IGST", GST_COLS.igst.left, y, { width: GST_COLS.igst.width, align: "right" });
  y += 12;
  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).stroke();
  y += 6;

  doc.font("Helvetica").fontSize(7);
  items.forEach((item, idx) => {
    const breakdown = getItemTaxBreakdown(order, idx);
    const lineTotal = item.price * item.quantity;
    const taxable = breakdown?.taxableAmount ?? lineTotal;
    const rate = breakdown?.taxRate != null ? `${breakdown.taxRate}%` : pdfEmptyCell();
    const cgst = breakdown?.cgst ?? 0;
    const sgst = breakdown?.sgst ?? 0;
    const igst = breakdown?.igst ?? 0;
    const name = sanitizePdfText(item.product?.name, { fallback: "Product" }).slice(0, 42);

    doc.text(name, GST_COLS.desc.left, y, { width: GST_COLS.desc.width });
    doc.text(
      sanitizePdfText(item.product?.hsnCode, { fallback: pdfEmptyCell() }),
      GST_COLS.hsn.left,
      y,
      { width: GST_COLS.hsn.width }
    );
    doc.text(String(item.quantity), GST_COLS.qty.left, y, { width: GST_COLS.qty.width, align: "center" });
    doc.text(formatMoney(taxable).replace("Rs. ", ""), GST_COLS.taxable.left, y, {
      width: GST_COLS.taxable.width,
      align: "right",
    });
    doc.text(rate, GST_COLS.rate.left, y, { width: GST_COLS.rate.width, align: "right" });
    doc.text(cgst ? formatMoney(cgst).replace("Rs. ", "") : pdfEmptyCell(), GST_COLS.cgst.left, y, {
      width: GST_COLS.cgst.width,
      align: "right",
    });
    doc.text(sgst ? formatMoney(sgst).replace("Rs. ", "") : pdfEmptyCell(), GST_COLS.sgst.left, y, {
      width: GST_COLS.sgst.width,
      align: "right",
    });
    doc.text(igst ? formatMoney(igst).replace("Rs. ", "") : pdfEmptyCell(), GST_COLS.igst.left, y, {
      width: GST_COLS.igst.width,
      align: "right",
    });
    y += 12;
  });

  return y + 4;
}

function shouldShowShippingLine(order, taxVisibility) {
  // P8: show shipping from charge for all physical orders (including ₹0 slab).
  // Legacy `shippingApplicability: none` snapshots still hide shipping.
  if (!orderRequiresShipping(order)) return false;
  return true;
}

function renderFinancialSummary(doc, order, taxVisibility, y) {
  y = drawSummaryLine(
    doc,
    `${taxVisibility.subtotalLabel}:`,
    formatMoney(taxVisibility.itemsNetSubtotal),
    y
  );

  if (taxVisibility.itemsGstAdded > 0) {
    y = drawSummaryLine(doc, "GST on Products:", formatMoney(taxVisibility.itemsGstAdded), y);
  }

  if (shouldShowShippingLine(order, taxVisibility)) {
    const shipping = resolveShippingDisplay(order);
    y = drawSummaryLine(doc, shipping.label, shipping.value, y);
  }

  if (orderRequiresShipping(order) && taxVisibility.shippingGst > 0) {
    y = drawSummaryLine(doc, "GST on Shipping:", formatMoney(taxVisibility.shippingGst), y);
  }

  if (taxVisibility.showDiscountLine) {
    const code =
      taxVisibility.couponCode != null && String(taxVisibility.couponCode).trim()
        ? String(taxVisibility.couponCode).trim()
        : null;
    y = drawSummaryLine(
      doc,
      code ? `Discount (${code}):` : "Discount:",
      formatMoneyNegative(taxVisibility.discountAmount),
      y
    );
  }

  doc.moveTo(SUMMARY.labelLeft, y).lineTo(PAGE.right, y).stroke();
  y += 8;
  y = drawSummaryLine(doc, "Grand Total:", formatMoney(taxVisibility.total), y, true);

  return { y };
}

function renderCompactFooter(doc, order, seller, y) {
  doc.fontSize(9).font("Helvetica");
  doc.text(
    `Payment: ${sanitizePdfText(order.paymentMethod, { fallback: "N/A" }).toUpperCase()}`,
    PAGE.left,
    y
  );
  y += 14;

  doc.fontSize(8).font("Helvetica-Bold").text("Terms", PAGE.left, y);
  y += 12;
  doc.font("Helvetica");
  const terms = [
    "Payment is due within 30 days of invoice date.",
    "Goods once sold will not be taken back.",
    "All disputes are subject to local jurisdiction.",
    "Computer-generated tax invoice.",
  ];
  if (seller.gstin) {
    terms.push(`GSTIN: ${seller.gstin}`);
  }
  for (const line of terms) {
    doc.text(line, PAGE.left, y, { width: PAGE.right - PAGE.left });
    y += 11;
  }

  y += 8;
  doc.fontSize(7).font("Helvetica-Oblique");
  const emailLine = seller.email ? `Email: ${seller.email}` : "";
  const phoneLine = seller.phone ? `Phone: ${seller.phone}` : "";
  if (emailLine) {
    doc.text(emailLine, PAGE.left, y, { width: PAGE.right - PAGE.left, align: "center" });
    y += 10;
  }
  if (phoneLine) {
    doc.text(phoneLine, PAGE.left, y, { width: PAGE.right - PAGE.left, align: "center" });
    y += 10;
  }
  doc.text(`Generated: ${new Date().toLocaleString("en-IN")}`, PAGE.left, y, {
    width: PAGE.right - PAGE.left,
    align: "center",
  });

  return y;
}

function renderTailBlock(doc, order, seller, taxVisibility, placeOfSupply, y) {
  const hasGstTable =
    (Number(order.tax?.totalTaxAmount) || 0) > 0 ||
    isInclusiveTaxOrder(order) ||
    Boolean(order.tax?.taxBreakdownSnapshot?.items?.length);

  const tailHeight = estimateTailBlockHeight(order, hasGstTable);
  if (y + tailHeight > PAGE.bottom) {
    doc.addPage();
    y = PAGE.margin;
  }

  if (placeOfSupply) {
    doc.fontSize(8).font("Helvetica");
    doc.text(`Place of supply: ${placeOfSupply}`, PAGE.left, y);
    y += 14;
  }

  const summaryResult = renderFinancialSummary(doc, order, taxVisibility, y);
  y = renderGstTable(doc, order, summaryResult.y);
  y = renderCompactFooter(doc, order, seller, y);

  return y;
}

function drawCompactHeader(doc, order, seller, invoiceMeta) {
  const topY = PAGE.margin;

  doc.fontSize(16).font("Helvetica-Bold").text("TAX INVOICE", PAGE.left, topY, {
    width: PAGE.right - PAGE.left,
    align: "center",
  });

  let leftY = topY + 28;
  const companyName = seller.companyName || DEFAULT_SELLER.companyName;
  doc.fontSize(10).font("Helvetica-Bold").text(companyName, PAGE.left, leftY);
  leftY += 12;
  doc.fontSize(8).font("Helvetica");
  if (seller.address) {
    doc.text(seller.address, PAGE.left, leftY, { width: 260 });
    leftY += textHeight(doc, seller.address, 260) + 2;
  }
  if (seller.gstin) {
    doc.text(`GSTIN: ${seller.gstin}`, PAGE.left, leftY);
    leftY += 11;
  }
  if (seller.phone) {
    doc.text(`Phone: ${seller.phone}`, PAGE.left, leftY);
    leftY += 11;
  }
  if (seller.email) {
    doc.text(`Email: ${seller.email}`, PAGE.left, leftY, { width: 260 });
    leftY += 11;
  }

  let rightY = topY + 28;
  doc.fontSize(8).font("Helvetica-Bold");
  doc.text("Invoice No:", META_RIGHT, rightY);
  doc.font("Helvetica").text(invoiceMeta.invoiceNumber, META_RIGHT + 70, rightY);
  rightY += 12;
  doc.font("Helvetica-Bold").text("Invoice Date:", META_RIGHT, rightY);
  doc.font("Helvetica").text(invoiceMeta.invoiceDate, META_RIGHT + 70, rightY);
  rightY += 12;
  doc.font("Helvetica-Bold").text("Due Date:", META_RIGHT, rightY);
  doc.font("Helvetica").text(invoiceMeta.dueDate, META_RIGHT + 70, rightY);

  return Math.max(leftY, rightY) + 12;
}

function drawBillTo(doc, order, billingResolved, shipResolved, startY) {
  const billingName =
    billingResolved.name ||
    `${billingResolved.firstName || ""} ${billingResolved.lastName || ""}`.trim() ||
    `${order.buyer?.firstName || ""} ${order.buyer?.lastName || ""}`.trim() ||
    "Customer";

  const billLines = formatAddressLines(billingResolved);
  const shipLines = formatAddressLines(shipResolved);

  let y = startY;
  doc.fontSize(9).font("Helvetica-Bold").text("Bill To", PAGE.left, y);
  y += 12;
  doc.font("Helvetica").fontSize(9);
  doc.text(sanitizePdfText(billingName, { fallback: "Customer" }), PAGE.left, y);
  y += 11;

  const billingEmail = billingResolved.email || order.buyer?.email;
  const billingPhone = billingResolved.phone || order.buyer?.phone;
  if (billingPhone) {
    doc.text(`Ph: ${sanitizePdfText(billingPhone, { allowNewlines: false })}`, PAGE.left, y);
    y += 11;
  }
  if (billingEmail) {
    doc.text(sanitizePdfText(billingEmail, { allowNewlines: false }), PAGE.left, y, { width: 280 });
    y += 11;
  }
  if (billLines.street) {
    doc.text(sanitizePdfText(billLines.street), PAGE.left, y, { width: 280 });
    y += 11;
  }
  if (billLines.cityLine) {
    doc.text(sanitizePdfText(billLines.cityLine), PAGE.left, y);
    y += 11;
  }
  if (billLines.country && billLines.country !== "India") {
    doc.text(billLines.country, PAGE.left, y);
    y += 11;
  }

  const shipDifferent =
    shipResolved &&
    (shipLines.street !== billLines.street ||
      shipLines.cityLine !== billLines.cityLine ||
      (shipResolved.name && shipResolved.name !== billingName));

  if (shipDifferent) {
    y += 6;
    doc.font("Helvetica-Bold").text("Ship To", PAGE.left, y);
    y += 12;
    doc.font("Helvetica");
    const shipName =
      shipResolved.name ||
      `${shipResolved.firstName || ""} ${shipResolved.lastName || ""}`.trim() ||
      billingName;
    doc.text(shipName, PAGE.left, y);
    y += 11;
    if (shipLines.street) {
      doc.text(shipLines.street, PAGE.left, y, { width: 280 });
      y += 11;
    }
    if (shipLines.cityLine) {
      doc.text(shipLines.cityLine, PAGE.left, y);
      y += 11;
    }
  }

  return y + 10;
}

/**
 * @param {object} order - Populated order
 * @param {PDFKit.PDFDocument} doc
 * @param {object} [options]
 * @param {object} [options.seller] - Site settings footer fields
 */
async function writeOrderInvoicePdf(order, doc, options = {}) {
  const seller = sanitizeSeller({ ...DEFAULT_SELLER, ...(options.seller || {}) });

  const invoiceNumber =
    order.invoiceNumber || `INV-${order._id.toString().slice(-8).toUpperCase()}`;
  const invoiceDate = new Date(order.createdAt).toLocaleDateString("en-IN");
  const dueDate = new Date(
    order.createdAt.getTime() + 30 * 24 * 60 * 60 * 1000
  ).toLocaleDateString("en-IN");

  const billingResolved = await resolveAddressDetails(order.billingDetails || {});
  const shipResolved = await resolveAddressDetails(
    order.shippingDetails || order.billingDetails || {}
  );
  const placeOfSupply = billingResolved.state || shipResolved.state || "";

  const taxVisibility = buildShopperOrderTaxVisibility(order);

  let y = drawCompactHeader(doc, order, seller, { invoiceNumber, invoiceDate, dueDate });
  y = drawBillTo(doc, order, billingResolved, shipResolved, y);
  y = drawItemsTableHeader(doc, y);

  const minRowReserve = MIN_ROW_HEIGHT + ROW_PAD + 30;

  for (const item of order.items) {
    const productText = sanitizePdfText(item.product?.name, { fallback: "Product" });
    doc.fontSize(9).font("Helvetica");
    const nameHeight = textHeight(doc, productText, COLS.product.width);
    const rowNeed = Math.max(MIN_ROW_HEIGHT, nameHeight) + ROW_PAD + 20;

    y = ensureSpace(doc, y, Math.max(rowNeed, minRowReserve), () =>
      drawItemsTableHeader(doc, PAGE.margin)
    );

    y = renderItemRow(doc, item, y);
  }

  doc.moveTo(PAGE.left, y).lineTo(PAGE.right, y).stroke();
  y += 10;

  renderTailBlock(doc, order, seller, taxVisibility, placeOfSupply, y);
}

module.exports = {
  writeOrderInvoicePdf,
  PAGE,
  COLS,
  SUMMARY,
  formatMoney,
  formatMoneyNegative,
  textHeight,
  resolveShippingDisplay,
  isInclusiveTaxOrder,
  estimateTailBlockHeight,
  renderFinancialSummary,
  shouldShowShippingLine,
};
