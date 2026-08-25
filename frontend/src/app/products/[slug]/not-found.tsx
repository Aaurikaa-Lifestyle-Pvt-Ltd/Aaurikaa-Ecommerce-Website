import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Product not found",
};

/**
 * Friendly PDP not-found — never expose a raw framework error page.
 */
export default function ProductNotFound() {
  return (
    <div className="py-20 sm:py-28">
      <Container>
        <div className="mx-auto max-w-lg text-center">
          <p className="eyebrow mb-4">404</p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
            Product not found
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            This product is unavailable or the link may be incorrect. Continue
            shopping to explore the catalogue.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <ButtonLink href="/categories" variant="primary" size="md">
              Continue Shopping
            </ButtonLink>
            <Link
              href="/"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Return home
            </Link>
          </div>
        </div>
      </Container>
    </div>
  );
}
