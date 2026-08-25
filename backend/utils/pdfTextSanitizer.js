/**
 * Strip characters that PDFKit standard fonts (WinAnsi) cannot render reliably.
 * Prevents emoji/icon mojibake (e.g. Ø<ßí) in invoice PDFs.
 */
function sanitizePdfText(input, options = {}) {
  const { allowNewlines = true, fallback = "" } = options;
  if (input == null || input === "") return fallback;

  let s = String(input)
    .normalize("NFKC")
    .replace(/\uFEFF/g, "")
    .replace(/[\u200B-\u200D\u2060]/g, "");

  s = s.replace(/[\u{1F000}-\u{1FFFF}]/gu, "");
  s = s.replace(/[\u{2600}-\u{27BF}]/gu, "");
  s = s.replace(/[\uD800-\uDFFF]/g, "");

  s = s
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, "-")
    .replace(/\u00A0/g, " ");

  const allowed = allowNewlines ? /[^\x09\x0A\x0D\x20-\x7E]/g : /[^\x20-\x7E]/g;
  s = s.replace(allowed, "");

  s = s.replace(/[ \t]+/g, " ");
  if (allowNewlines) {
    s = s.replace(/\n{3,}/g, "\n\n");
  } else {
    s = s.replace(/[\r\n]+/g, " ");
  }

  return s.trim() || fallback;
}

function sanitizePdfPhone(input) {
  const s = sanitizePdfText(input, { allowNewlines: false });
  return s.replace(/[^0-9+().\-\s]/g, "").trim();
}

function sanitizePdfEmail(input) {
  return sanitizePdfText(input, { allowNewlines: false })
    .replace(/[^a-zA-Z0-9@._\-+/\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Placeholder for empty GST table cells (ASCII only). */
function pdfEmptyCell() {
  return "NA";
}

function sanitizeSeller(seller) {
  if (!seller || typeof seller !== "object") return {};
  return {
    companyName: sanitizePdfText(seller.companyName, { fallback: "Seller" }),
    address: sanitizePdfText(seller.address, { allowNewlines: true }),
    phone: sanitizePdfPhone(seller.phone),
    email: sanitizePdfEmail(seller.email),
    gstin: sanitizePdfText(seller.gstin, { allowNewlines: false }).toUpperCase(),
  };
}

module.exports = {
  sanitizePdfText,
  sanitizePdfPhone,
  sanitizePdfEmail,
  pdfEmptyCell,
  sanitizeSeller,
};
