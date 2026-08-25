import type { ReactNode } from "react";
import type { Product, ProductImage } from "@/types/commerce";
import type { DiscoveryQuery, PriceBounds } from "@/types/discovery";
import type { MegaMenuTree } from "@/lib/mappers/mega-menu";
import { Container } from "@/components/ui/container";
import {
  DiscoveryHeader,
  type DiscoveryCrumb,
} from "./discovery-header";
import {
  DiscoveryToolbar,
  type DiscoveryFilterMode,
} from "./discovery-toolbar";
import { DiscoveryPagination } from "./discovery-pagination";
import { DiscoveryEmpty } from "./discovery-empty";
import { ProductGrid } from "./product-grid";

interface ProductDiscoveryProps {
  title: string;
  eyebrow?: string;
  description?: string;
  image?: ProductImage;
  crumbs?: DiscoveryCrumb[];
  /** Slot above the toolbar (e.g. taxonomy nav chips). */
  beforeToolbar?: ReactNode;
  /** Products for the current page (already filtered + sorted). */
  products: Product[];
  /** Authoritative catalogue total (not just this page). */
  totalCount: number;
  totalPages: number;
  currentPage: number;
  /** Current discovery query (drives the toolbar). */
  query: DiscoveryQuery;
  priceBounds?: PriceBounds;
  taxonomyOptions?: MegaMenuTree;
  filterMode?: DiscoveryFilterMode;
  resetHref?: string;
  /** Empty-state copy when the scoped set is empty after filters. */
  empty: {
    title: string;
    description?: string;
    action?: { label: string; href: string };
  };
  quickAdd?: boolean;
}

/**
 * Shared product-discovery composition used by:
 * - Category / collection listing
 * - Search results
 *
 * Pages supply a scoped product set + header copy; this component owns the
 * shared toolbar, grid and empty state — never duplicate catalogue UIs.
 */
export function ProductDiscovery({
  title,
  eyebrow,
  description,
  image,
  crumbs,
  beforeToolbar,
  products,
  totalCount,
  totalPages,
  currentPage,
  query,
  priceBounds,
  taxonomyOptions,
  filterMode = "simple",
  resetHref,
  empty,
  quickAdd = true,
}: ProductDiscoveryProps) {
  return (
    <div className="py-6 sm:py-8">
      <Container>
        <DiscoveryHeader
          eyebrow={eyebrow}
          title={title}
          description={description}
          image={image}
          crumbs={crumbs}
          resultCount={totalCount}
        />

        {beforeToolbar}

        <DiscoveryToolbar
          query={query}
          resultCount={totalCount}
          priceBounds={priceBounds}
          taxonomyOptions={taxonomyOptions}
          filterMode={filterMode}
          resetHref={resetHref}
          className="mb-8"
        />

        {totalCount === 0 ? (
          <DiscoveryEmpty
            title={empty.title}
            description={empty.description}
            action={empty.action}
          />
        ) : (
          <>
            <ProductGrid products={products} quickAdd={quickAdd} />
            <DiscoveryPagination
              query={query}
              currentPage={currentPage}
              totalPages={totalPages}
              className="mt-10"
            />
          </>
        )}
      </Container>
    </div>
  );
}
