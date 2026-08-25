import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { CheckoutView } from "@/components/checkout";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Complete your order with Cash on Delivery.",
};

function CheckoutFallback() {
  return (
    <div className="py-16 sm:py-20">
      <Container>
        <p className="text-sm text-muted-foreground">Loading checkout…</p>
      </Container>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<CheckoutFallback />}>
      <CheckoutView />
    </Suspense>
  );
}
