/**
 * Buy Again result messaging — mirrors ANBAZAR copy without seller marketplace wording.
 */

const REASON_MESSAGES: Record<string, string> = {
  PRODUCT_NOT_FOUND: "Product no longer available",
  PRODUCT_INACTIVE: "Product is no longer active",
  OUT_OF_STOCK: "Item is out of stock",
  VARIANT_UNAVAILABLE: "Variant no longer available",
  SELLER_UNAVAILABLE: "Item unavailable",
};

export type BuyAgainResultLike = {
  success?: boolean;
  addedItems?: unknown[];
  failedItems?: Array<{ reason?: string; productName?: string }>;
  warnings?: unknown[];
};

export function getBuyAgainFailureMessage(reason: string | undefined): string {
  if (!reason) return "Item could not be added";
  return REASON_MESSAGES[reason] || "Item could not be added";
}

export function formatBuyAgainResult(result: BuyAgainResultLike | null | undefined): string {
  if (!result) return "Could not add items to cart.";

  const addedCount = Array.isArray(result.addedItems) ? result.addedItems.length : 0;
  const failedCount = Array.isArray(result.failedItems) ? result.failedItems.length : 0;

  if (addedCount === 0 && failedCount === 0) {
    return "No items could be added to your cart.";
  }

  const parts: string[] = [];

  if (addedCount > 0) {
    parts.push(`${addedCount} item${addedCount > 1 ? "s" : ""} added to cart`);
  }

  if (failedCount > 0 && result.failedItems) {
    const failureSummary = result.failedItems
      .slice(0, 3)
      .map((item) => getBuyAgainFailureMessage(item.reason))
      .join("; ");
    parts.push(
      failedCount === 1
        ? `1 item could not be added (${failureSummary})`
        : `${failedCount} items could not be added (${failureSummary})`,
    );
  }

  return parts.join(". ");
}

export function getBuyAgainToastTone(
  result: BuyAgainResultLike | null | undefined,
): "success" | "error" | "info" {
  const addedCount = Array.isArray(result?.addedItems) ? result!.addedItems!.length : 0;
  const failedCount = Array.isArray(result?.failedItems) ? result!.failedItems!.length : 0;

  if (addedCount > 0 && failedCount === 0) return "success";
  if (addedCount > 0 && failedCount > 0) return "info";
  return "error";
}
