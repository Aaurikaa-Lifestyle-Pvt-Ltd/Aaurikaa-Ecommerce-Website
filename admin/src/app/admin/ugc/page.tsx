"use client";

import { MerchandisingEditor } from "@/components/merchandising-editor";

export default function UgcAdminPage() {
  return (
    <MerchandisingEditor
      kind="ugc"
      title="Styled by You"
      description="Curated customer/creator content only — no automated social import. Media URLs and product IDs are client-supplied (CONFIGURE)."
      fields={[
        "creatorName",
        "caption",
        "mediaType",
        "imageUrl",
        "imageAlt",
        "videoUrl",
        "externalUrl",
        "productIds",
        "displayOrder",
        "isActive",
      ]}
    />
  );
}
