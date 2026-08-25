import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { OrderConfirmationView } from "@/components/checkout";

export const metadata: Metadata = {
  title: "Order Confirmed",
  description: "Your shopper order confirmation.",
};

function ConfirmationFallback() {
  return (
    <div className="py-16 sm:py-20">
      <Container>
        <p className="text-sm text-muted-foreground">Loading confirmation…</p>
      </Container>
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <Suspense fallback={<ConfirmationFallback />}>
      <OrderConfirmationView />
    </Suspense>
  );
}
