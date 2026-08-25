const mongoose = require("mongoose");
const State = require("../models/location/State");
const Country = require("../models/location/Country");

const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

function isObjectIdString(value) {
  if (value == null) return false;
  const s = String(value).trim();
  return OBJECT_ID_RE.test(s);
}

async function resolveLocationName(value) {
  if (value == null || value === "") return "";
  const s = String(value).trim();
  if (!isObjectIdString(s)) return s;
  if (!mongoose.Types.ObjectId.isValid(s)) return "";

  const [state, country] = await Promise.all([
    State.findById(s).select("name").lean(),
    Country.findById(s).select("name").lean(),
  ]);
  return state?.name || country?.name || "";
}

/**
 * Resolve state/country (and city if ID-shaped) on billing/shipping detail objects.
 * @param {object} details - billingDetails or shippingDetails
 * @returns {Promise<object>} copy with human-readable location fields
 */
async function resolveAddressDetails(details) {
  if (!details || typeof details !== "object") {
    return { city: "", state: "", country: "India", pincode: "", address: "" };
  }

  const [state, country, city] = await Promise.all([
    resolveLocationName(details.state || details.address?.state),
    resolveLocationName(details.country || details.address?.country),
    resolveLocationName(details.city || details.address?.city),
  ]);

  const addrLine =
    (typeof details.address === "string" && details.address) ||
    details.address?.street ||
    "";

  return {
    ...details,
    address: addrLine,
    city: city || (isObjectIdString(details.city) ? "" : details.city || ""),
    state: state || (isObjectIdString(details.state) ? "" : details.state || ""),
    country:
      country ||
      (isObjectIdString(details.country) ? "India" : details.country || "India"),
    pincode: (details.pincode || details.address?.postalCode || "").toString(),
  };
}

/**
 * Format a single-line postal address for PDF display.
 */
function formatAddressLines(resolved) {
  const street =
    (typeof resolved.address === "string" && resolved.address) ||
    resolved.address?.street ||
    "";
  const city = resolved.city || "";
  const state = resolved.state || "";
  const pincode = resolved.pincode || "";
  const country = resolved.country || "India";

  const cityLine = [city, state, pincode].filter(Boolean).join(", ");
  return { street, cityLine, country };
}

module.exports = {
  isObjectIdString,
  resolveLocationName,
  resolveAddressDetails,
  formatAddressLines,
};
