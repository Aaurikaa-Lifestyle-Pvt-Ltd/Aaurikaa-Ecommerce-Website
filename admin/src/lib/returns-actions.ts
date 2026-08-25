import type { AdminReturnRequest } from "@/lib/api/returns";

export const RESOLUTION_REASON_LABELS: Record<string, string> = {
  SELLER_GOODWILL: "Store goodwill",
};

export function resolutionReasonLabel(code: string): string {
  return RESOLUTION_REASON_LABELS[code] || code;
}

export type ReturnActionVisibility = {
  showAcceptReject: boolean;
  showConfirmReceipt: boolean;
  showRetryPickup: boolean;
  showResolution: boolean;
};

/**
 * Gate Admin after-sales buttons from `seed.actions` when present.
 * Missing `actions` keeps current always-on behavior.
 */
export function resolveReturnActionVisibility(
  seed: Pick<AdminReturnRequest, "status" | "caseFlow" | "actions" | "reverseLogistics">,
): ReturnActionVisibility {
  const actions = seed.actions;
  if (!actions) {
    return {
      showAcceptReject: true,
      showConfirmReceipt: true,
      showRetryPickup: true,
      showResolution: true,
    };
  }

  if (actions.isTerminal) {
    return {
      showAcceptReject: false,
      showConfirmReceipt: false,
      showRetryPickup: false,
      showResolution: false,
    };
  }

  const status = String(seed.status || "");
  const afterSales =
    actions.isSellerOwned === true || String(seed.caseFlow || "").toLowerCase() === "after_sales";

  let showAcceptReject: boolean;
  if (typeof actions.canAccept === "boolean") {
    showAcceptReject = actions.canAccept;
  } else if (typeof actions.canReject === "boolean") {
    showAcceptReject = actions.canReject;
  } else if (afterSales) {
    // Admin after-sales uses seller engine; legacy canReviewReturn is false for after_sales.
    showAcceptReject = status === "pending_review";
  } else if (typeof actions.canReviewReturn === "boolean") {
    showAcceptReject = actions.canReviewReturn;
  } else {
    showAcceptReject = true;
  }

  let showConfirmReceipt: boolean;
  if (typeof actions.canConfirmReceipt === "boolean") {
    showConfirmReceipt = actions.canConfirmReceipt;
  } else {
    showConfirmReceipt = status === "awaiting_pickup" || status === "in_transit";
  }

  let showRetryPickup: boolean;
  if (typeof actions.canRetryPickup === "boolean") {
    showRetryPickup = actions.canRetryPickup;
  } else if (typeof seed.reverseLogistics?.canRetry === "boolean") {
    showRetryPickup = seed.reverseLogistics.canRetry;
  } else {
    showRetryPickup = true;
  }

  let showResolution: boolean;
  if (typeof actions.canSelectResolution === "boolean") {
    // Prefer explicit select-resolution flag — do not use canAdminOverrideResolution
    // (override covers dispute reopen statuses, not normal resolution).
    showResolution = actions.canSelectResolution;
  } else {
    showResolution = status === "awaiting_inspection" || status === "pending_review";
  }

  return {
    showAcceptReject,
    showConfirmReceipt,
    showRetryPickup,
    showResolution,
  };
}
