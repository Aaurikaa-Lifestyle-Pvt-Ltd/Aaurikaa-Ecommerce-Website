import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getCategories,
  getProductsByTaxonomyPath,
  getTaxonomyPath,
  getTaxonomyPriceBounds,
} from "@/lib/data";
import {
  hasActiveFilters,
  parseDiscoveryQuery,
} from "@/lib/discovery";
import { parseTaxonomyPath } from "@/lib/taxonomy";
import { ProductDiscovery, TaxonomyNavCards } from "@/components/discovery";
import { siteConfig } from "@/config/site";
import { isApiCatalogue } from "@/lib/api/config";

interface PageProps {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateStaticParams() {
  if (isApiCatalogue()) return [];
  const categories = await getCategories();
  return categories.map((c) => ({ path: [c.slug] }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { path: segments } = await params;
  const parsed = parseTaxonomyPath(segments);
  if (!parsed) return { title: "Category" };

  const resolved = await getTaxonomyPath(segments);
  if (!resolved) return { title: "Category" };

  const title = resolved.seo.title || resolved.active.title || resolved.active.name;
  const description =
    resolved.seo.metaDescription ||
    `Shop ${resolved.active.name} at ${siteConfig.name}.`;

  return {
    title,
    description,
    alternates: {
      canonical: resolved.seo.canonicalPath,
    },
  };
}

export default async function TaxonomyListingPage({
  params,
  searchParams,
}: PageProps) {
  const { path: segments } = await params;
  const parsed = parseTaxonomyPath(segments);
  if (!parsed) notFound();

  const resolved = await getTaxonomyPath(segments);
  if (!resolved) notFound();

  const query = parseDiscoveryQuery(await searchParams);
  const [page, priceBounds] = await Promise.all([
    getProductsByTaxonomyPath(parsed, query),
    getTaxonomyPriceBounds(parsed),
  ]);
  const filtered = hasActiveFilters(query);
  const active = resolved.active;
  const displayTitle = active.title || active.name;
  const navItems =
    resolved.navigation.subcategories ??
    resolved.navigation.childCategories ??
    [];

  return (
    <ProductDiscovery
      eyebrow="Category"
      title={displayTitle}
      description={active.description}
      image={active.image?.src ? active.image : undefined}
      crumbs={resolved.breadcrumbs}
      products={page.products}
      totalCount={page.totalCount}
      totalPages={page.totalPages}
      currentPage={page.currentPage}
      query={query}
      priceBounds={priceBounds}
      filterMode="taxonomy"
      resetHref={resolved.seo.canonicalPath}
      beforeToolbar={
        navItems.length > 0 ? (
          <TaxonomyNavCards
            label={
              resolved.depth === 1 ? "Shop by subcategory" : "Shop by type"
            }
            items={navItems}
            parentName={resolved.active.name}
            parentHref={resolved.seo.canonicalPath}
          />
        ) : null
      }
      empty={{
        title: filtered
          ? "No products match these filters"
          : `No products in ${displayTitle} yet`,
        description: filtered
          ? "Try clearing filters or adjusting sort to see more of the catalogue."
          : "Check back soon — new pieces are added regularly.",
        action: filtered
          ? { label: "Clear filters", href: resolved.seo.canonicalPath }
          : { label: "Browse all categories", href: "/categories" },
      }}
    />
  );
}
