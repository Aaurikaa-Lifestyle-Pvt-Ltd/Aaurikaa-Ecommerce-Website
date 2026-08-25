"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { ProductEditForm } from "@/components/product-edit-form";
import { fetchAdminCategories } from "@/lib/api/categories";
import { fetchAdminProduct } from "@/lib/api/products";
import { fetchWeightClasses } from "@/lib/api/shipping";
import { useAdminResource } from "@/lib/use-admin-resource";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productQuery = useAdminResource(() => fetchAdminProduct(params.id), [params.id]);
  const categoriesQuery = useAdminResource(() => fetchAdminCategories(), []);
  const slabsQuery = useAdminResource(() => fetchWeightClasses(), []);
  const product = productQuery.data;

  if (productQuery.loading) {
    return (
      <div>
        <PageHeader title="Product" />
        <LoadingState message="Loading product…" />
      </div>
    );
  }

  if (productQuery.error) {
    return (
      <div>
        <PageHeader title="Product" />
        <ErrorState message={productQuery.error} onRetry={() => void productQuery.reload()} />
      </div>
    );
  }

  if (!product) {
    return (
      <div>
        <PageHeader title="Product not found" />
        <Link href="/admin/products" className="text-sm font-medium text-accent">
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <ProductEditForm
      key={product.id}
      mode="edit"
      product={product}
      categories={categoriesQuery.data ?? []}
      slabs={slabsQuery.data ?? []}
      onReload={() => productQuery.reload()}
    />
  );
}
