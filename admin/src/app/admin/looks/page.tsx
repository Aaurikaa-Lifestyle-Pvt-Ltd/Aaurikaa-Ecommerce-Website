"use client";

import { MerchandisingEditor } from "@/components/merchandising-editor";

export default function LooksAdminPage() {
  return (
    <MerchandisingEditor
      kind="looks"
      title="Shop the Look"
      description="Curated looks. Imagery/CTA/product IDs are client-supplied (CONFIGURE). Product IDs may stay empty until the catalogue exists."
      fields={[
        "name",
        "slug",
        "description",
        "imageUrl",
        "imageAlt",
        "mobileImageUrl",
        "ctaLabel",
        "ctaHref",
        "productIds",
        "displayOrder",
        "isActive",
      ]}
    />
  );
}
