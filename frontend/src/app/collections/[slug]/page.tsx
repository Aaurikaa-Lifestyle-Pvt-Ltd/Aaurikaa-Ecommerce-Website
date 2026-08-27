import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCollectionBySlug,
  getCollectionPriceBounds,
  getCollections,
  getProductsByCollection,
} from "@/lib/data";
import {
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
    const collections = await getCollections();
    return collections.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) return { title: "Collection" };
  return {
    title: collection.seoTitle || collection.name,
    description:
      collection.seoDescription ||
      collection.description ||
      `Shop ${collection.name} at ${siteConfig.name}.`,
  };
}

export default async function CollectionListingPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const collection = await getCollectionBySlug(slug);
  if (!collection) notFound();

  const query = parseDiscoveryQuery(await searchParams);
  const [page, priceBounds] = await Promise.all([
    getProductsByCollection(slug, query),
    getCollectionPriceBounds(slug, query),
  ]);
  const filtered = hasActiveFilters(query);

  return (
    <ProductDiscovery
      eyebrow="Collection"
      title={collection.name}
      description={collection.description}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Collections", href: "/collections" },
        { label: collection.name },
      ]}
      products={page.products}
      totalCount={page.totalCount}
      totalPages={page.totalPages}
      currentPage={page.currentPage}
      query={query}
      priceBounds={priceBounds}
      filterMode="taxonomy"
      resetHref={collection.href}
      empty={{
        title: filtered
          ? "No products match these filters"
          : `No products in ${collection.name} yet`,
        description: filtered
          ? "Try clearing filters or adjusting sort to see more of this collection."
          : "This collection is being prepared — explore other edits in the meantime.",
        action: filtered
          ? { label: "Clear filters", href: collection.href }
          : { label: "Browse collections", href: "/collections" },
      }}
    />
  );
}
