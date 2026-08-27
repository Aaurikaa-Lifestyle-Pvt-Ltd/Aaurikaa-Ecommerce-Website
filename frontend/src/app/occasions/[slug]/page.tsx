import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getOccasionBySlug,
  getOccasionIndex,
  getOccasionPriceBounds,
  getProductsByOccasion,
} from "@/lib/data";
import {
  applyDiscoveryPage,
  hasActiveFilters,
  parseDiscoveryQuery,
} from "@/lib/discovery";
import { ProductDiscovery } from "@/components/discovery";
import { siteConfig } from "@/config/site";
import { isApiCatalogue } from "@/lib/api/config";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamicParams = true;

export async function generateStaticParams() {
  if (isApiCatalogue()) return [];
  try {
    const occasions = await getOccasionIndex();
    return occasions.map((item) => ({ slug: item.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const occasion = await getOccasionBySlug(slug);
  if (!occasion) return { title: "Occasion" };
  return {
    title: occasion.seoTitle || occasion.name,
    description:
      occasion.seoDescription ||
      occasion.description ||
      `Shop ${occasion.name} at ${siteConfig.name}.`,
  };
}

export default async function OccasionListingPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const occasion = await getOccasionBySlug(slug);
  if (!occasion) notFound();

  const query = parseDiscoveryQuery(await searchParams);
  const scoped = await getProductsByOccasion(slug);
  const [page, priceBounds] = await Promise.all([
    Promise.resolve(applyDiscoveryPage(scoped, query)),
    getOccasionPriceBounds(slug),
  ]);
  const filtered = hasActiveFilters(query);

  return (
    <ProductDiscovery
      eyebrow="Occasion"
      title={occasion.name}
      description={occasion.description}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Occasions", href: "/occasions" },
        { label: occasion.name },
      ]}
      products={page.products}
      totalCount={page.totalCount}
      totalPages={page.totalPages}
      currentPage={page.currentPage}
      query={query}
      priceBounds={priceBounds}
      filterMode="taxonomy"
      resetHref={occasion.href}
      empty={{
        title: filtered
          ? "No products match these filters"
          : `No products in ${occasion.name} yet`,
        description: filtered
          ? "Try clearing filters or adjusting sort to see more of this occasion."
          : "This occasion is being prepared — associated products can be added when the catalogue is loaded.",
        action: filtered
          ? { label: "Clear filters", href: occasion.href }
          : { label: "Browse occasions", href: "/occasions" },
      }}
    />
  );
}
