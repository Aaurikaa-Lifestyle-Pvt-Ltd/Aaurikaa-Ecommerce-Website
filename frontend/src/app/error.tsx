"use client";

import { useEffect } from "react";
import { Container } from "@/components/ui/container";

export default function StorefrontError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-16 sm:py-20">
      <Container>
        <div className="mx-auto max-w-lg text-center">
          <p className="eyebrow mb-4">Something went wrong</p>
          <h1 className="font-serif text-3xl tracking-tight">Unable to load this page</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            {error.message || "The store could not complete this request."}
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-8 inline-flex h-11 items-center rounded-control bg-primary px-6 text-sm text-primary-foreground"
          >
            Try again
          </button>
        </div>
      </Container>
    </div>
  );
}
