import Image from "next/image";
import Link from "next/link";
import type { BrandContent } from "@/types/commerce";
import { getBrandStory } from "@/lib/data";
import { cn } from "@/lib/cn";
import { Container } from "@/components/ui/container";

interface BrandStoryProps {
  /** Pass content directly, or omit to load the configured brand story. */
  content?: BrandContent | null;
  /** Reverse image/copy columns on desktop. */
  reverse?: boolean;
}

/**
 * BrandStory (brief §23) — editorial brand-confidence, not a corporate About Us.
 *
 * Split layout: one strong image + concise copy + CTA. Industry-neutral —
 * understands `BrandContent`, not jewellery-specific storytelling.
 *
 * Renders nothing when content is empty (API mode has no brand CMS yet).
 */
export async function BrandStory({
  content,
  reverse = false,
}: BrandStoryProps) {
  const story = content === undefined ? await getBrandStory() : content;
  if (!story) return null;

  return (
    <section className="py-14 sm:py-16">
      <Container>
        <div
          className={cn(
            "grid items-center gap-8 md:grid-cols-2 md:gap-12 lg:gap-16",
            reverse && "md:[&>*:first-child]:order-2",
          )}
        >
          <div className="relative aspect-[4/3] overflow-hidden rounded-card bg-muted sm:aspect-[5/4] md:aspect-[4/3]">
            <Image
              src={story.image.src}
              alt={story.image.alt}
              fill
              sizes="(min-width: 768px) 42vw, 92vw"
              className="object-cover object-top sm:object-center"
            />
          </div>

          <div className="flex max-w-md flex-col gap-5 md:py-4">
            {story.eyebrow ? (
              <p className="eyebrow">{story.eyebrow}</p>
            ) : null}

            <h2 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl">
              {story.heading}
            </h2>

            <p className="text-base leading-relaxed text-muted-foreground">
              {story.description}
            </p>

            {story.ctaLabel && story.href ? (
              <div className="mt-1">
                <Link
                  href={story.href}
                  className="inline-flex items-center text-sm font-medium uppercase tracking-[0.14em] text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {story.ctaLabel} <span aria-hidden>→</span>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
