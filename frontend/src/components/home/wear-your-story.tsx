import Image from "next/image";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";

/**
 * WearYourStory — Premium brand closing section.
 *
 * This section reinforces the brand identity before the footer. It features a
 * lifestyle image and direct shopping CTA, avoiding product carousel clutter.
 */
export function WearYourStory() {
  return (
    <section className="bg-background py-16 sm:py-24">
      <Container>
        <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12 lg:gap-16">
          {/* Copy Column: rendered second on mobile (below image), first on desktop */}
          <div className="order-2 flex flex-col items-start text-left md:order-1">
            <span className="eyebrow mb-3 sm:mb-4">WEAR YOUR STORY</span>
            <h2 className="font-serif text-3xl leading-tight tracking-tight sm:text-4xl lg:text-5xl text-foreground">
              Jewellery that becomes part of your everyday moments, celebrations, and everything in between.
            </h2>
            <div className="my-6 w-16 border-t-2 border-accent/50 sm:my-8" />
            <ButtonLink
              href="/collections/the-pearl-edit"
              variant="primary"
              size="lg"
            >
              EXPLORE THE COLLECTION <span aria-hidden="true" className="ml-1">→</span>
            </ButtonLink>
          </div>

          {/* Image Column: rendered first on mobile, second on desktop */}
          <div className="order-1 relative aspect-[4/3] w-full overflow-hidden rounded-card bg-muted md:order-2">
            <Image
              src="/images/brand/wear-your-story.jpg"
              alt="Woman wearing AAURIKAA jewellery in a soft editorial portrait"
              fill
              sizes="(min-width: 768px) 46vw, 92vw"
              className="object-cover transition-transform duration-700 hover:scale-105"
              priority
            />
          </div>
        </div>
      </Container>
    </section>
  );
}
