import Image from "next/image";
import Link from "next/link";
import type { UGCContent } from "@/types/commerce";
import { getUGCContent } from "@/lib/data";
import { Container } from "@/components/ui/container";
import { SectionHeading } from "@/components/ui/section-heading";

interface UGCGalleryProps {
  title?: string;
  eyebrow?: string;
  description?: string;
  /** Pass items directly, or omit to load the configured UGC set. */
  items?: UGCContent[];
  emptyMessage?: string;
}

const IMAGE_SIZES =
  "(min-width: 1280px) 15vw, (min-width: 768px) 18vw, (min-width: 640px) 28vw, 42vw";

/**
 * UGCGallery — "Styled by You" (brief §21).
 *
 * Social / editorial proof of how people style products in real life.
 * Distinct from Shop the Look (curated professional styling) and from product
 * merchandising. Industry-neutral: understands `UGCContent`, not jewellery UGC.
 *
 * Desktop + mobile: a simple horizontal snap rail (~5–6 cards). No engagement
 * metrics, ratings, or fake testimonials.
 */
export async function UGCGallery({
  title = "Styled by You",
  eyebrow = "Community",
  description = "Real styling from the community.",
  items,
  emptyMessage = "Community styles are coming soon.",
}: UGCGalleryProps) {
  const gallery = items ?? (await getUGCContent());

  return (
    <section className="py-14 sm:py-16">
      <Container>
        <div className="mb-8">
          <SectionHeading title={title} eyebrow={eyebrow} />
          {description ? (
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
              {description}
            </p>
          ) : null}
        </div>

        {gallery.length === 0 ? (
          <p className="rounded-card border border-border bg-surface px-6 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <ul className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:gap-4">
            {gallery.map((item) => (
              <li
                key={item.id}
                className="w-[42%] shrink-0 snap-start sm:w-[28%] md:w-[18%] lg:w-[15.5%]"
              >
                <UGCCard item={item} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}

function UGCCard({ item }: { item: UGCContent }) {
  const attribution = item.creator;
  const content = (
    <>
      <div className="relative aspect-3/4 overflow-hidden rounded-card bg-muted">
        {item.videoUrl ? (
          <video
            className="h-full w-full object-cover"
            poster={item.image.src}
            src={item.videoUrl}
            muted
            playsInline
            loop
            autoPlay
            aria-label={item.image.alt}
          />
        ) : (
          <Image
            src={item.image.src}
            alt={item.image.alt}
            fill
            sizes={IMAGE_SIZES}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
          />
        )}
      </div>
      {attribution ? (
        <p className="mt-2.5 text-xs tracking-wide text-muted-foreground">
          {attribution}
        </p>
      ) : null}
      {item.caption ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.caption}</p>
      ) : null}
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        className="group block rounded-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        {content}
      </Link>
    );
  }

  return <div className="group">{content}</div>;
}
