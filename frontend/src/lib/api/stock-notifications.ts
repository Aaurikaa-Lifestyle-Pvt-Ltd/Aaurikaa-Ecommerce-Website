import { apiRequest } from "./client";

export type StockNotificationInput = {
  productId: string;
  /** Variant option map as accepted by the backend (not the normalized key). */
  variantCombination?: Record<string, string>;
};

export type StockNotificationResult = {
  success: boolean;
  message: string;
  requestId?: string;
  alreadyExists: boolean;
};

type StockNotificationResponse = {
  success?: boolean;
  message?: string;
  requestId?: string;
  alreadyExists?: boolean;
};

/** Build POST /api/shopper/stock-notifications body. */
export function buildStockNotificationPayload(
  input: StockNotificationInput,
): Record<string, unknown> {
  const productId = String(input.productId ?? "").trim();
  const payload: Record<string, unknown> = { productId };
  if (
    input.variantCombination &&
    typeof input.variantCombination === "object" &&
    Object.keys(input.variantCombination).length > 0
  ) {
    payload.variantCombination = { ...input.variantCombination };
  }
  return payload;
}

/**
 * POST /api/shopper/stock-notifications — requires shopper auth.
 * Unsigned shoppers must sign in first (no anonymous subscribe path).
 */
export async function createStockNotification(
  input: StockNotificationInput,
): Promise<StockNotificationResult> {
  const productId = String(input.productId ?? "").trim();
  if (!productId) {
    throw new Error("productId is required.");
  }

  const response = await apiRequest<StockNotificationResponse>(
    "/api/shopper/stock-notifications",
    {
      method: "POST",
      auth: true,
      body: buildStockNotificationPayload(input),
    },
  );

  return {
    success: response.success !== false,
    message:
      String(response.message ?? "").trim() ||
      (response.alreadyExists
        ? "You are already subscribed for this item."
        : "We will notify you when this item is back in stock."),
    requestId: response.requestId ? String(response.requestId) : undefined,
    alreadyExists: Boolean(response.alreadyExists),
  };
}
