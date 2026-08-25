const PDFDocument = require("pdfkit");
const {
  writeOrderInvoicePdf,
  formatMoney,
  formatMoneyNegative,
  textHeight,
  resolveShippingDisplay,
  isInclusiveTaxOrder,
  estimateTailBlockHeight,
  renderFinancialSummary,
  PAGE,
  COLS,
} = require("../../services/invoicePdfService");
const { buildOrderTaxVisibility } = require("../../utils/orderFinancialSnapshot");

jest.mock("../../utils/invoiceAddressFormatter", () => ({
  resolveAddressDetails: jest.fn(async (d) => ({
    ...d,
    city: d?.city === "68c04a05b99dcee980913bad" ? "Howrah" : d?.city || "Mumbai",
    state: d?.state === "68c04a05b99dcee980913bad" ? "West Bengal" : d?.state || "MH",
    country: d?.country === "68c04a00b99dcee980913ba9" ? "India" : d?.country || "India",
    address: d?.address || "123 Street",
    pincode: d?.pincode || "400001",
  })),
  formatAddressLines: jest.fn((r) => ({
    street: r.address || "",
    cityLine: [r.city, r.state, r.pincode].filter(Boolean).join(", "),
    country: r.country || "India",
  })),
  isObjectIdString: jest.fn((v) => /^[a-f\d]{24}$/i.test(String(v || ""))),
  resolveLocationName: jest.fn(async () => ""),
}));

describe("invoicePdfService layout", () => {
  test("formatMoney uses Rs. prefix with en-IN grouping", () => {
    expect(formatMoney(1234.5)).toBe("Rs. 1,234.50");
  });

  test("formatMoneyNegative prefixes minus correctly", () => {
    expect(formatMoneyNegative(50)).toBe("Rs. -50.00");
  });

  test("money column fits within page right margin", () => {
    expect(COLS.lineTotal.left + COLS.lineTotal.width).toBe(PAGE.right);
  });

  test("resolveShippingDisplay uses order.shippingCharge", () => {
    expect(resolveShippingDisplay({ shippingCharge: 60 }).value).toBe("Rs. 60.00");
    expect(resolveShippingDisplay({ shippingCharge: 0, coupon: { couponData: { freeShipping: true } } }).value).toBe(
      "FREE"
    );
  });

  test("isInclusiveTaxOrder detects inclusive tax type", () => {
    expect(isInclusiveTaxOrder({ tax: { taxType: "mixed/inclusive", totalTaxAmount: 0 } })).toBe(true);
    expect(isInclusiveTaxOrder({ tax: { taxType: "exclusive", totalTaxAmount: 18 } })).toBe(false);
  });

  test("textHeight grows for long product names", () => {
    const doc = new PDFDocument({ margin: 50 });
    const short = textHeight(doc, "Widget", COLS.product.width);
    const long = textHeight(doc, "A".repeat(200), COLS.product.width);
    expect(long).toBeGreaterThan(short);
  });

  test("estimateTailBlockHeight is reasonable for single item", () => {
    const order = { items: [{}], tax: { totalTaxAmount: 0 } };
    const h = estimateTailBlockHeight(order, false);
    expect(h).toBeLessThan(350);
    expect(h).toBeGreaterThan(100);
  });

  test("inclusive GST summary uses short label to avoid line overlap", async () => {
    const { buffer } = await renderPdfToBuffer({
      _id: "507f1f77bcf86cd799439013",
      invoiceNumber: "INV-TEST-GST",
      createdAt: new Date(),
      totalAmount: 415,
      shippingCharge: 60,
      paymentMethod: "phonepe",
      buyer: { firstName: "T", lastName: "S" },
      billingDetails: { name: "T S", address: "A", city: "Howrah", state: "WB", pincode: "711223", country: "India" },
      items: [
        {
          quantity: 1,
          price: 349,
          originalPrice: 349,
          bulkDiscount: { applied: false },
          product: { name: "Book" },
        },
      ],
      tax: {
        totalTaxAmount: 59,
        totalTaxAdded: 6,
        taxType: "mixed/inclusive",
        totalTaxableAmount: 409,
        shippingTax: { taxAmount: 6 },
      },
    });
    expect(buffer.length).toBeGreaterThan(100);
  });

  test("renderFinancialSummary omits CGST/SGST taxSummary loop", () => {
    const doc = new PDFDocument({ margin: 50 });
    const order = {
      totalAmount: 2199,
      shippingCharge: 75,
      items: [{ quantity: 1, price: 1800, product: { name: "Item" } }],
      tax: {
        totalTaxAmount: 324,
        totalTaxAdded: 324,
        taxType: "exclusive",
        shippingTax: { taxAmount: 0 },
        taxSummary: [
          { taxType: "GST", taxRate: 18, taxAmount: 324, cgst: 162, sgst: 162 },
        ],
      },
    };
    const taxVisibility = buildOrderTaxVisibility(order);
    const { y } = renderFinancialSummary(doc, order, taxVisibility, 100);
    expect(taxVisibility.itemsGstAdded).toBe(324);
    expect(y).toBeGreaterThan(100);
  });

  test("renderFinancialSummary uses incl. GST subtotal label for inclusive orders", () => {
    const doc = new PDFDocument({ margin: 50 });
    const order = {
      totalAmount: 534,
      shippingCharge: 50,
      items: [{ quantity: 1, price: 478, product: { name: "Item" } }],
      tax: {
        totalTaxAmount: 57.22,
        totalTaxAdded: 6,
        taxType: "mixed/inclusive",
        shippingTax: { taxAmount: 6 },
        taxBreakdownSnapshot: { items: [{ inclusive: true }] },
      },
    };
    const taxVisibility = buildOrderTaxVisibility(order);
    expect(taxVisibility.subtotalLabel).toBe("Subtotal (incl. GST)");
    const { y } = renderFinancialSummary(doc, order, taxVisibility, 100);
    expect(y).toBeGreaterThan(100);
  });

  test("renderFinancialSummary labels discount with coupon code", () => {
    const doc = new PDFDocument({ margin: 50 });
    const labels = [];
    const originalText = doc.text.bind(doc);
    doc.text = (text, ...rest) => {
      labels.push(String(text));
      return originalText(text, ...rest);
    };

    const order = {
      totalAmount: 900,
      shippingCharge: 0,
      coupon: { code: "SAVE100", discountAmount: 100 },
      items: [{ quantity: 1, price: 1000, originalPrice: 1000, product: { name: "Item" } }],
      tax: { totalTaxAmount: 0, totalTaxAdded: 0 },
    };
    const taxVisibility = buildOrderTaxVisibility(order);
    expect(taxVisibility.showDiscountLine).toBe(true);
    expect(taxVisibility.couponCode).toBe("SAVE100");
    renderFinancialSummary(doc, order, taxVisibility, 100);
    expect(labels.some((label) => label.includes("Discount (SAVE100)"))).toBe(true);
  });

  test("writeOrderInvoicePdf completes for minimal order", async () => {
    const { buffer, pageCount } = await renderPdfToBuffer({
      _id: "507f1f77bcf86cd799439011",
      invoiceNumber: "INV-20260101-0001",
      createdAt: new Date(),
      totalAmount: 409,
      shippingCharge: 60,
      paymentMethod: "phonepe",
      status: "cancelled",
      buyer: { firstName: "Test", lastName: "Shopper", email: "t@example.com" },
      billingDetails: {
        name: "Test Shopper",
        address: "123 Street",
        city: "Howrah",
        state: "West Bengal",
        pincode: "711223",
        country: "India",
      },
      items: [
        {
          quantity: 1,
          price: 349,
          originalPrice: 349,
          bulkDiscount: { applied: false },
          product: { name: "Exercise Book", hsnCode: "4820" },
        },
      ],
      tax: { totalTaxAmount: 0, taxType: "mixed/inclusive" },
    });

    expect(buffer.length).toBeGreaterThan(100);
    expect(pageCount).toBe(1);
  });

  test("writeOrderInvoicePdf resolves ObjectId-like address fields via formatter", async () => {
    const { buffer } = await renderPdfToBuffer({
      _id: "507f1f77bcf86cd799439012",
      invoiceNumber: "INV-20260101-0002",
      createdAt: new Date(),
      totalAmount: 500,
      shippingCharge: 0,
      paymentMethod: "cod",
      buyer: { firstName: "A", lastName: "B" },
      billingDetails: {
        name: "A B",
        address: "Line 1",
        city: "Howrah",
        state: "68c04a05b99dcee980913bad",
        pincode: "711223",
        country: "68c04a00b99dcee980913ba9",
      },
      items: [
        {
          quantity: 1,
          price: 500,
          originalPrice: 500,
          bulkDiscount: { applied: false },
          product: { name: "Item" },
        },
      ],
      tax: { totalTaxAmount: 0 },
    });
    expect(buffer.length).toBeGreaterThan(100);
  });
});

async function renderPdfToBuffer(order, seller = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    let pageCount = 0;
    doc.on("pageAdded", () => {
      pageCount += 1;
    });
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => {
      resolve({
        buffer: Buffer.concat(chunks),
        pageCount: pageCount + 1,
      });
    });
    doc.on("error", reject);

    writeOrderInvoicePdf(order, doc, { seller })
      .then(() => doc.end())
      .catch(reject);
  });
}
