import Image from "next/image";
import Link from "next/link";
import type { Cta, Occasion } from "@/types/commerce";
import { getOccasions } from "@/lib/data";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

interface OccasionShowcaseProps {
  title?: string;
  eyebrow?: string;
  cta?: Cta;
  /** Pass occasions directly, or omit to load the configured set. */
  occasions?: Occasion[];
  emptyMessage?: string;
}

const IMAGE_SIZES =
  "(min-width: 768px) 23vw, (min-width: 640px) 30vw, 44vw";

/**
 * OccasionShowcase (brief §18) — discovery by the moment/context in which a
 * customer intends to wear pieces (when/why), distinct from category (what) and
 * collection (aesthetic).
 *
 * A compact, four-up contextual showcase: desktop row, mobile horizontal
 * scroll. Deliberately lighter than Collection Stories. A centred editorial
 * label distinguishes it from the category cards. Each occasion leads to its
 * curated listing.
 *
 * Industry-neutral: it only understands the generic `Occasion` shape.
 */
export async function OccasionShowcase({
  title = "Shop by Occasion",
  eyebrow = "Find Your Moment",
  cta,
  occasions,
  emptyMessage = "Occasions are coming soon.",
}: OccasionShowcaseProps) {
  const items = occasions ?? (await getOccasions());

  return (
    <section className="py-14 sm:py-16">
      <Container>
        <SectionHeading
          title={title}
          eyebrow={eyebrow}
          cta={cta}
          className="mb-8"
        />

        {items.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[44%] gap-4 overflow-x-auto pb-1 sm:auto-cols-[30%] md:grid-flow-row md:grid-cols-4 md:gap-6 md:snap-none md:overflow-visible md:pb-0">
            {items.map((occasion) => (
              <li key={occasion.id} className="snap-start">
                <Link href={occasion.href} className="group block">
                  <div className="relative aspect-square overflow-hidden rounded-card bg-muted">
                    <Image
                      src={occasion.image.src}
                      alt={occasion.image.alt}
                      fill
                      sizes={IMAGE_SIZES}
                      className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
                    />
                    <div
                      className="absolute inset-0 bg-black/25 transition-colors group-hover:bg-black/35"
                      aria-hidden
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-4 text-center text-white">
                      <h3 className="font-serif text-lg leading-tight tracking-tight sm:text-xl">
                        {occasion.name}
                      </h3>
                      <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/80 underline-offset-4 group-hover:underline">
                        Shop <span aria-hidden>→</span>
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
