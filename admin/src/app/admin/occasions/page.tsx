"use client";

import { MerchandisingEditor } from "@/components/merchandising-editor";

export default function OccasionsAdminPage() {
  return (
    <MerchandisingEditor
      kind="occasions"
      title="Occasions"
      description="Occasion destinations are operator-defined. Do not invent a taxonomy unless the client supplies it."
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
