import type { Product } from "@/types/commerce";
import { getProductsByCollection } from "@/lib/data";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductCard } from "./product-card";

interface ProductShowcaseProps {
  title: string;
  eyebrow?: string;
  cta?: { label: string; href: string };
  /**
   * Layout:
   * - "grid": responsive 4-up grid on desktop, horizontal carousel on mobile
   *   (New Arrivals, brief §15).
   * - "carousel": compact horizontal carousel at all breakpoints
   *   (Bestsellers, brief §20).
   */
  variant?: "grid" | "carousel";
  /** Collection slug to fetch (e.g. "new-arrivals"), or pass products directly. */
  collection?: string;
  products?: Product[];
  quickAdd?: boolean;
  emptyMessage?: string;
}

/**
 * ProductShowcase (brief §15/§20) — reusable, collection-driven merchandising.
 * Uses the shared ProductCard; supports the two locked layouts. Same mechanism
 * later powers Trending, Featured, Most Loved, etc.
 */
export async function ProductShowcase({
  title,
  eyebrow,
  cta,
  variant = "grid",
  collection,
  products,
  quickAdd = true,
  emptyMessage = "No products to show right now.",
}: ProductShowcaseProps) {
  const items =
    products ??
    (collection ? (await getProductsByCollection(collection)).products : []);

  const trackClass =
    variant === "carousel"
      ? "no-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 md:gap-6"
      : "no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[72%] gap-4 overflow-x-auto pb-1 sm:auto-cols-[46%] md:grid-flow-row md:grid-cols-4 md:gap-6 md:snap-none md:overflow-visible md:pb-0";

  const itemClass =
    variant === "carousel"
      ? "w-[68%] shrink-0 snap-start sm:w-[45%] md:w-[30%] lg:w-[22%]"
      : "snap-start";

  const imageSizes =
    variant === "carousel"
      ? "(min-width: 1024px) 22vw, (min-width: 768px) 30vw, (min-width: 640px) 45vw, 68vw"
      : "(min-width: 768px) 23vw, (min-width: 640px) 46vw, 72vw";

  return (
    <section className="py-14 sm:py-16">
      <Container>
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          cta={cta}
          className="mb-8"
        />

        {items.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <div className={trackClass}>
            {items.map((product) => (
              <div key={product.id} className={cn(itemClass)}>
                <ProductCard
                  product={product}
                  quickAdd={quickAdd}
                  sizes={imageSizes}
                />
              </div>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
