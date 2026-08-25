"use client";

import { MerchandisingEditor } from "@/components/merchandising-editor";

export default function CollectionsAdminPage() {
  return (
    <MerchandisingEditor
      kind="collections"
      title="Collections"
      description="Curated collection landing pages (CONFIGURE: names, media, product IDs/SKUs from the live catalogue). Best Sellers hybrid: create/activate a collection with slug best-sellers and add product IDs to pin homepage Bestsellers order; leave product IDs empty (or keep the collection inactive) to use automatic sales ranking."
      fields={[
        "name",
        "slug",
        "description",
        "imageUrl",
        "imageAlt",
        "seoTitle",
        "seoDescription",
        "productIds",
        "displayOrder",
        "showOnHome",
        "isActive",
      ]}
    />
  );
}
