"use client";

import { LoadingState, PageHeader } from "@/components/ui";
import { ProductEditForm } from "@/components/product-edit-form";
import { fetchAdminCategories } from "@/lib/api/categories";
import { fetchWeightClasses } from "@/lib/api/shipping";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function NewProductPage() {
  const categoriesQuery = useAdminResource(() => fetchAdminCategories(), []);
  const slabsQuery = useAdminResource(() => fetchWeightClasses(), []);

  if (categoriesQuery.loading || slabsQuery.loading) {
    return (
      <div>
        <PageHeader title="New product" />
        <LoadingState message="Loading editor…" />
      </div>
    );
  }

  return (
    <ProductEditForm
      mode="create"
      categories={categoriesQuery.data ?? []}
      slabs={slabsQuery.data ?? []}
    />
  );
}
