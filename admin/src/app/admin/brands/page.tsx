"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoadingState, PageHeader } from "@/components/ui";

/** Brands are not part of AAURIKAA Admin UX — redirect to products. */
export default function BrandsPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/products");
  }, [router]);

  return (
    <div>
      <PageHeader title="Brands" description="Not used for AAURIKAA. Redirecting to products…" />
      <LoadingState message="Redirecting…" />
    </div>
  );
}
