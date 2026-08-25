const PDFDocument = require("pdfkit");
const SiteSettings = require("../models/SiteSettings");
const { writeOrderInvoicePdf } = require("./invoicePdfService");

const DEFAULT_LEGAL_ENTITY = {
  companyName: "AAURIKAA Lifestyles Private Limited",
  address: "",
  phone: "",
  email: "",
  gstin: "",
};

function legalEntityFromFooter(footer = {}) {
  return {
    companyName: footer.companyName || DEFAULT_LEGAL_ENTITY.companyName,
    address: footer.address || "",
    phone: footer.phone || "",
    email: footer.email || "",
    gstin: footer.gstin || "",
  };
}

async function resolveInvoiceLegalEntity() {
  const settingsDoc = await SiteSettings.findOne().sort({ createdAt: 1 }).lean();
  return legalEntityFromFooter(settingsDoc?.footer);
}

async function streamOrderInvoicePdf(res, order) {
  const seller = await resolveInvoiceLegalEntity();
  const doc = new PDFDocument({ margin: 50 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=invoice-${order._id}.pdf`);
  doc.pipe(res);
  await writeOrderInvoicePdf(order, doc, { seller });
  doc.end();
}

module.exports = {
  DEFAULT_LEGAL_ENTITY,
  legalEntityFromFooter,
  resolveInvoiceLegalEntity,
  streamOrderInvoicePdf,
};
