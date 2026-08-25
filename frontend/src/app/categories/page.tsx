import type { Metadata } from "next";
import { getCategories } from "@/lib/data";
import { CatalogueIndex } from "@/components/discovery";
import { siteConfig } from "@/config/site";

/** Catalogue reads hit the live API when NEXT_PUBLIC_CATALOGUE_SOURCE=api. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shop by Category",
  description: `Browse ${siteConfig.name} by category.`,
};

export default async function CategoriesIndexPage() {
  const categories = await getCategories();

  return (
    <CatalogueIndex
      eyebrow="Shop"
      title="Shop by Category"
      description="Find pieces by type — clear entry points into the catalogue."
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Categories" },
      ]}
      items={categories.map((c) => ({
        id: c.id,
        name: c.name,
        href: c.href,
        image: c.image,
      }))}
    />
  );
}
