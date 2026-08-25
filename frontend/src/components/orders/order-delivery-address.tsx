"use client";

import type { ShopperCustomerAddress, ShopperOrderDetail } from "@/lib/api/orders";
import { cn } from "@/lib/cn";

function linesFromAddress(address: ShopperCustomerAddress): string[] {
  return [
    address.name,
    address.addressLine1,
    address.addressLine2,
    [address.city, address.district].filter(Boolean).join(", ") || null,
    [address.state, address.pincode].filter(Boolean).join(" — ") || null,
    address.country,
    address.phone ? `Phone ${address.phone}` : null,
  ].filter((line): line is string => Boolean(line && String(line).trim()));
}

function fromLegacyShippingDetails(
  details: NonNullable<ShopperOrderDetail["shippingDetails"]>,
): ShopperCustomerAddress {
  return {
    name: details.name,
    phone: details.phone,
    addressLine1: details.addressLine1 || details.address,
    addressLine2: details.addressLine2,
    city: details.city,
    state: details.state,
    district: details.district,
    pincode: details.pincode,
    country: details.country,
  };
}

/**
 * Resolve delivery address from shopper order DTO.
 * Prefers `deliveryAddress`; falls back to legacy `shippingDetails`.
 */
export function resolveOrderDeliveryAddress(
  order: Pick<ShopperOrderDetail, "deliveryAddress" | "shippingDetails">,
): ShopperCustomerAddress | null {
  if (order.deliveryAddress) return order.deliveryAddress;
  if (order.shippingDetails) return fromLegacyShippingDetails(order.shippingDetails);
  return null;
}

export function OrderDeliveryAddress({
  order,
  className,
}: {
  order: Pick<ShopperOrderDetail, "deliveryAddress" | "shippingDetails">;
  className?: string;
}) {
  const address = resolveOrderDeliveryAddress(order);
  if (!address) return null;
  const lines = linesFromAddress(address);
  if (lines.length === 0) return null;

  return (
    <div className={cn("space-y-1 text-sm", className)}>
      <h3 className="font-medium">Delivery address</h3>
      {lines.map((line) => (
        <p key={line} className="text-muted-foreground">
          {line}
        </p>
      ))}
    </div>
  );
}
