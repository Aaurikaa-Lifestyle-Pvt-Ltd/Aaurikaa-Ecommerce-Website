"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buyAgainFromOrder } from "@/lib/api/orders";
import { ApiError } from "@/lib/api/errors";
import {
  formatBuyAgainResult,
  getBuyAgainToastTone,
} from "@/lib/buy-again-messages";
import { formatCommerceApiError } from "@/lib/commerce-errors";
import { useCart } from "@/components/cart";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";

type BuyAgainButtonProps = {
  orderId: string;
  className?: string;
  label?: string;
  /** When true and at least one item was added, navigate to /cart. */
  redirectToCart?: boolean;
  variant?: "primary" | "secondary" | "outline";
};

/**
 * POST /api/shopper/orders/:id/buy-again — live stock validation; no historical prices.
 */
export function BuyAgainButton({
  orderId,
  className,
  label = "Buy again",
  redirectToCart = false,
  variant = "outline",
}: BuyAgainButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const { refreshCart } = useCart();
  const [loading, setLoading] = useState(false);

  async function handleBuyAgain() {
    if (!orderId || loading) return;
    setLoading(true);
    try {
      const result = await buyAgainFromOrder(orderId);
      const message = formatBuyAgainResult(result);
      const tone = getBuyAgainToastTone(result);
      if (tone === "success") {
        toast.success("Added to bag", message);
      } else if (tone === "info") {
        toast.info("Partially added", message);
      } else {
        toast.error("Could not add items", message);
      }

      const addedCount = result.addedItems.length;
      if (addedCount > 0) {
        await refreshCart();
        if (redirectToCart) {
          router.push("/cart");
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? formatCommerceApiError(err, "Failed to add items to cart.")
          : "Failed to add items to cart.";
      toast.error("Buy again failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={cn(className)}
      disabled={loading}
      onClick={() => void handleBuyAgain()}
    >
      {loading ? (
        <>
          <Spinner /> Adding…
        </>
      ) : (
        label
      )}
    </Button>
  );
}
