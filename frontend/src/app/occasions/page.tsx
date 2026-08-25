import type { Metadata } from "next";
import { getOccasionIndex } from "@/lib/data";
import { CatalogueIndex } from "@/components/discovery";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Occasions",
  description: `Shop by occasion at ${siteConfig.name}.`,
};

export default async function OccasionsIndexPage() {
  const occasions = await getOccasionIndex();

  return (
    <CatalogueIndex
      eyebrow="Shop"
      title="Occasions"
      description="Browse curated occasion destinations when they have been published."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Occasions" },
      ]}
      items={occasions.map((item) => ({
        id: item.id,
        name: item.name,
        href: item.href,
        image: item.image,
        description: item.description,
      }))}
    />
  );
}
