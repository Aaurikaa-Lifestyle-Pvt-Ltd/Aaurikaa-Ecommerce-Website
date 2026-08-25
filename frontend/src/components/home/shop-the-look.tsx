import Image from "next/image";
import Link from "next/link";
import type { Look } from "@/types/commerce";
import { getLooks } from "@/lib/data";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

interface ShopTheLookProps {
  title?: string;
  eyebrow?: string;
  /** Pass looks directly, or omit to load the configured set. */
  looks?: Look[];
  emptyMessage?: string;
}

const IMAGE_SIZES =
  "(min-width: 768px) 31vw, (min-width: 640px) 56vw, 82vw";

/**
 * ShopTheLook (brief §16) — converts styling inspiration into discovery.
 *
 * This is NOT another product carousel; it answers "how can I wear these
 * pieces?". Editorial lifestyle imagery, a short title/description and a single
 * CTA per look. Desktop shows ~3 prominent looks; mobile is a swipeable rail.
 *
 * Industry-neutral: it only understands the generic `Look` shape.
 */
export async function ShopTheLook({
  title = "Shop the Look",
  eyebrow = "Styled Edits",
  looks,
  emptyMessage = "Styling looks are coming soon.",
}: ShopTheLookProps) {
  const items = looks ?? (await getLooks());

  return (
    <section className="py-14 sm:py-16">
      <Container>
        <SectionHeading title={title} eyebrow={eyebrow} className="mb-8" />

        {items.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="no-scrollbar grid snap-x snap-mandatory grid-flow-col auto-cols-[82%] gap-4 overflow-x-auto pb-1 sm:auto-cols-[56%] md:grid-flow-row md:grid-cols-3 md:gap-6 md:snap-none md:overflow-visible md:pb-0">
            {items.map((look) => (
              <li key={look.id} className="snap-start">
                <Link href={look.href} className="group block">
                  <div className="relative aspect-4/5 overflow-hidden rounded-card bg-muted">
                    {look.mobileImage?.src ? (
                      <Image
                        src={look.mobileImage.src}
                        alt={look.mobileImage.alt || look.image.alt}
                        fill
                        sizes={IMAGE_SIZES}
                        className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] sm:hidden"
                      />
                    ) : null}
                    <Image
                      src={look.image.src}
                      alt={look.image.alt}
                      fill
                      sizes={IMAGE_SIZES}
                      className={`object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04] ${look.mobileImage?.src ? "hidden sm:block" : ""}`}
                    />
                    <div
                      className="absolute inset-0 bg-linear-to-t from-black/70 via-black/20 to-transparent"
                      aria-hidden
                    />
                    <div className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-5 text-white sm:p-6">
                      <h3 className="font-serif text-xl leading-tight tracking-tight sm:text-2xl">
                        {look.title}
                      </h3>
                      {look.description ? (
                        <p className="max-w-xs text-sm text-white/85">
                          {look.description}
                        </p>
                      ) : null}
                      <span className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-white underline-offset-4 group-hover:underline">
                        {look.ctaLabel ?? "Shop the Look"}{" "}
                        <span aria-hidden>→</span>
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
