import Image from "next/image";
import Link from "next/link";
import type { Collection } from "@/types/commerce";
import { getStoryCollections } from "@/lib/data";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

interface CollectionStoriesProps {
  title?: string;
  eyebrow?: string;
  /** Pass collections directly, or omit to load the configured story set. */
  collections?: Collection[];
  emptyMessage?: string;
}

const IMAGE_SIZES =
  "(min-width: 768px) 46vw, (min-width: 640px) 70vw, 85vw";

/**
 * CollectionStories (brief §17) — discover the brand through aesthetics and
 * curated worlds (distinct from products or styling).
 *
 * Desktop: two large cards per row. Mobile: large swipeable cards (brief §17 /
 * §33) so the section stays commercially paced rather than a tall stack.
 * Each card carries a campaign image, collection name, optional description
 * and a CTA — never a product grid.
 *
 * Industry-neutral: it only understands the generic `Collection` shape.
 */
export async function CollectionStories({
  title = "Collection Stories",
  eyebrow = "Explore",
  collections,
  emptyMessage = "Collections are coming soon.",
}: CollectionStoriesProps) {
  const items = collections ?? (await getStoryCollections());

  return (
    <section className="py-14 sm:py-16">
      <Container>
        <SectionHeading title={title} eyebrow={eyebrow} className="mb-8" />

        {items.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[85%] gap-4 overflow-x-auto pb-1 sm:auto-cols-[70%] md:grid-flow-row md:grid-cols-2 md:gap-6 md:snap-none md:overflow-visible md:pb-0">
            {items.map((collection) => (
              <li key={collection.id} className="snap-start">
                <Link href={collection.href} className="group block">
                  <div className="relative aspect-4/3 overflow-hidden rounded-card bg-muted sm:aspect-3/2">
                    <Image
                      src={collection.image.src}
                      alt={collection.image.alt}
                      fill
                      sizes={IMAGE_SIZES}
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
                    />
                    <div
                      className="absolute inset-0 bg-linear-to-t from-black/65 via-black/20 to-transparent"
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6 text-white sm:p-8">
                      <h3 className="font-serif text-2xl leading-tight tracking-tight sm:text-3xl">
                        {collection.name}
                      </h3>
                      {collection.description ? (
                        <p className="max-w-sm text-sm text-white/85 sm:text-base">
                          {collection.description}
                        </p>
                      ) : null}
                      <span className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-white underline-offset-4 group-hover:underline">
                        Explore <span aria-hidden>→</span>
                      </span>
                    </div>
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
