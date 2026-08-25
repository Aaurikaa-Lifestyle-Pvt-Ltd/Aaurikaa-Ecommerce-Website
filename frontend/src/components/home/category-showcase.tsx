import Image from "next/image";
import Link from "next/link";
import type { Category, Cta } from "@/types/commerce";
import { getCategories } from "@/lib/data";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

interface CategoryShowcaseProps {
  title?: string;
  eyebrow?: string;
  cta?: Cta;
  /** Pass categories directly, or omit to load the configured set. */
  categories?: Category[];
  /** Cap how many categories are shown. */
  visibleCount?: number;
  emptyMessage?: string;
}

const IMAGE_SIZES =
  "(min-width: 768px) 23vw, (min-width: 640px) 40vw, 46vw";

/**
 * CategoryShowcase (brief §14) — visual entry points into the catalogue.
 *
 * Desktop: a 4-up row of large, rounded lifestyle cards.
 * Mobile: a horizontal, snap-scrolling rail (no layout overflow).
 *
 * Industry-neutral: it only understands the generic `Category` shape, so the
 * same component works for jewellery, fashion, furniture or general retail.
 */
export async function CategoryShowcase({
  title = "Shop by Category",
  eyebrow = "Browse",
  cta = { label: "Shop All", href: "/categories" },
  categories,
  visibleCount,
  emptyMessage = "Categories are on their way.",
}: CategoryShowcaseProps) {
  const all = categories ?? (await getCategories());
  const items =
    typeof visibleCount === "number" ? all.slice(0, visibleCount) : all;

  return (
    <section className="py-14 sm:py-16">
      <Container>
        <SectionHeading title={title} eyebrow={eyebrow} cta={cta} className="mb-8" />

        {items.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[46%] gap-4 overflow-x-auto pb-1 sm:auto-cols-[40%] md:grid-flow-row md:grid-cols-4 md:gap-6 md:snap-none md:overflow-visible md:pb-0">
            {items.map((category) => (
              <li key={category.id} className="snap-start">
                <Link href={category.href} className="group block">
                  <div className="relative aspect-3/4 overflow-hidden rounded-card bg-muted">
                    <Image
                      src={category.image.src}
                      alt={category.image.alt}
                      fill
                      sizes={IMAGE_SIZES}
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                    <div
                      className="absolute inset-0 bg-linear-to-t from-black/45 via-black/5 to-transparent"
                      aria-hidden
                    />
                    <h3 className="absolute inset-x-0 bottom-0 p-4 text-base font-medium text-white sm:p-5 sm:text-lg">
                      {category.name}
                    </h3>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
