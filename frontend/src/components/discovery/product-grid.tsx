import type { Product } from "@/types/commerce";
import { cn } from "@/lib/cn";
import { ProductCard } from "@/components/product/product-card";

interface ProductGridProps {
  products: Product[];
  quickAdd?: boolean;
  className?: string;
  /** Sizes hint passed through to ProductCard imagery. */
  sizes?: string;
}

// 2-col → 3-col (lg) → 4-col (xl). Avoid 100vw-class defaults for half-width tiles.
const GRID_SIZES =
  "(min-width: 1280px) 22vw, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 46vw";

/**
 * Shared product grid for category, collection and search surfaces.
 * Always renders the shared ProductCard — never a one-off listing card.
 */
export function ProductGrid({
  products,
  quickAdd = true,
  className,
  sizes = GRID_SIZES,
}: ProductGridProps) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {products.map((product) => (
        <li key={product.id}>
          <ProductCard product={product} quickAdd={quickAdd} sizes={sizes} />
        </li>
      ))}
    </ul>
  );
}
