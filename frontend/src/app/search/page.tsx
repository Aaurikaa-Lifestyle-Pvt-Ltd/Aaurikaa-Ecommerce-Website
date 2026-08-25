import type { Metadata } from "next";
import {
  getMegaMenuTree,
  getSearchPriceBounds,
  searchProducts,
} from "@/lib/data";
import {
  hasActiveFilters,
  parseDiscoveryQuery,
} from "@/lib/discovery";
import { ProductDiscovery } from "@/components/discovery";
import { Container } from "@/components/ui/container";
import { siteConfig } from "@/config/site";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const query = parseDiscoveryQuery(await searchParams);
  if (query.q) {
    return {
      title: `Search: ${query.q}`,
      description: `Results for “${query.q}” at ${siteConfig.name}.`,
    };
  }
  return {
    title: "Search",
    description: `Search the ${siteConfig.name} jewellery collection.`,
  };
}

export default async function SearchResultsPage({ searchParams }: PageProps) {
  const query = parseDiscoveryQuery(await searchParams);
  const hasQuery = Boolean(query.q?.trim());
  const filtered = hasActiveFilters(query);
  const megaMenu = await getMegaMenuTree();

  // Without a query, do not treat /search as a full-catalogue PLP.
  if (!hasQuery) {
    return (
      <div className="py-10 sm:py-14">
        <Container>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Search
          </p>
          <h1 className="mt-3 font-serif text-3xl tracking-tight sm:text-4xl">
            Find a piece
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Search by name or browse categories to explore the collection.
          </p>
          {filtered ? (
            <p className="mt-6 text-sm text-muted-foreground">
              Filters need a search term.{" "}
              <a
                href="/search"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Clear filters
              </a>{" "}
              or enter a term above.
            </p>
          ) : (
            <p className="mt-8">
              <a
                href="/categories"
                className="text-sm underline underline-offset-4 hover:text-foreground"
              >
                Browse categories
              </a>
            </p>
          )}
        </Container>
      </div>
    );
  }

  const [page, priceBounds] = await Promise.all([
    searchProducts(query, megaMenu),
    getSearchPriceBounds(query, megaMenu),
  ]);

  const resetHref = `/search?q=${encodeURIComponent(query.q!)}`;

  return (
    <ProductDiscovery
      eyebrow="Search"
      title={`Results for “${query.q}”`}
      crumbs={[
        { label: "Home", href: "/" },
        { label: "Search" },
      ]}
      products={page.products}
      totalCount={page.totalCount}
      totalPages={page.totalPages}
      currentPage={page.currentPage}
      query={query}
      priceBounds={priceBounds}
      taxonomyOptions={megaMenu}
      filterMode="search"
      resetHref={resetHref}
      empty={{
        title: `No pieces matched “${query.q}”`,
        description: filtered
          ? "Try another term, or clear filters to widen the results."
          : "Try another spelling, or browse categories for inspiration.",
        action: filtered
          ? { label: "Clear filters", href: resetHref }
          : { label: "Browse categories", href: "/categories" },
      }}
    />
  );
}
