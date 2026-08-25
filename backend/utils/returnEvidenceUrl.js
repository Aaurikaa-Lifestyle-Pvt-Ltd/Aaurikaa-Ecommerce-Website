/**
 * Platform-managed after-sales evidence URL validation (Cloudflare R2).
 * Evidence must be under returns/evidence/{buyerId}/{orderId}/ on the configured public base.
 */

function normalizePublicBase(publicUrl) {
  if (!publicUrl || typeof publicUrl !== "string") return null;
  return publicUrl.replace(/\/+$/, "");
}

function getEvidencePublicBase() {
  return normalizePublicBase(process.env.CLOUDFLARE_R2_PUBLIC_URL);
}

/**
 * @param {string} url
 * @param {{ buyerId?: string, orderId?: string }} [scope]
 * @returns {{ valid: boolean, message?: string, key?: string }}
 */
function validatePlatformEvidenceUrl(url, scope = {}) {
  const trimmed = String(url || "").trim();
  if (!trimmed || !/^https:\/\//i.test(trimmed)) {
    return {
      valid: false,
      message: "Each evidence item requires a valid HTTPS URL from platform upload.",
    };
  }

  const base = getEvidencePublicBase();
  if (!base) {
    return {
      valid: false,
      message: "Evidence upload storage is not configured.",
    };
  }

  let pathname;
  try {
    const parsed = new URL(trimmed);
    const baseParsed = new URL(base);
    if (parsed.origin !== baseParsed.origin) {
      return {
        valid: false,
        message: "Evidence must be uploaded through the platform.",
      };
    }
    const basePath = baseParsed.pathname.replace(/\/+$/, "");
    pathname = parsed.pathname;
    if (basePath && basePath !== "/" && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || "/";
    }
  } catch {
    return {
      valid: false,
      message: "Each evidence item requires a valid HTTPS URL from platform upload.",
    };
  }

  const key = pathname.replace(/^\/+/, "");
  if (!key.startsWith("returns/evidence/")) {
    return {
      valid: false,
      message: "Evidence must be uploaded through the platform.",
    };
  }

  const buyerId = scope.buyerId != null ? String(scope.buyerId) : null;
  const orderId = scope.orderId != null ? String(scope.orderId) : null;
  if (buyerId && orderId) {
    const requiredPrefix = `returns/evidence/${buyerId}/${orderId}/`;
    if (!key.startsWith(requiredPrefix)) {
      return {
        valid: false,
        message: "Evidence does not belong to this order.",
      };
    }
  }

  return { valid: true, key };
}

module.exports = {
  getEvidencePublicBase,
  validatePlatformEvidenceUrl,
};
