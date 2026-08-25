import type { Metadata } from "next";
import { Suspense } from "react";
import { Container } from "@/components/ui/container";
import { PaymentReturnView } from "@/components/checkout/payment-return-view";

export const metadata: Metadata = {
  title: "Payment",
  description: "PhonePe payment return.",
};

function PaymentFallback() {
  return (
    <div className="py-16 sm:py-20">
      <Container>
        <p className="text-sm text-muted-foreground">Checking payment…</p>
      </Container>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<PaymentFallback />}>
      <PaymentReturnView />
    </Suspense>
  );
}
