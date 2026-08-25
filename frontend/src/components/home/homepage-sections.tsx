import type { HomepageSection } from "@/types/homepage";
import { homepageSections } from "@/config/homepage";
import { getCollectionBySlug, getNewsletter } from "@/lib/data";
import { ProductShowcase } from "@/components/product";
import { HomepageBannerSection } from "./homepage-banner-section";
import { CategoryShowcase } from "./category-showcase";
import { ShopTheLook } from "./shop-the-look";
import { CollectionStories } from "./collection-stories";
import { OccasionShowcase } from "./occasion-showcase";
import { UGCGallery } from "./ugc-gallery";
import { BrandStory } from "./brand-story";
import { TrustStrip } from "./trust-strip";
import { NewsletterSection } from "./newsletter-section";

/**
 * Renders the homepage from the locked, config-driven section order.
 * Announcement, Header and Footer remain in the app shell/layout.
 */
export function HomepageSections() {
  return (
    <>
      {homepageSections.map((section, index) => (
        <HomepageSectionRenderer
          key={
            section.type === "banner-slider" && section.placement
              ? `${section.type}-${section.placement}`
              : section.type === "campaign-banner" && section.variant
                ? `${section.type}-${section.variant}`
                : section.type === "product-showcase" && section.collection
                  ? `${section.type}-${section.collection}`
                  : `${section.type}-${index}`
          }
          section={section}
        />
      ))}
    </>
  );
}

async function HomepageSectionRenderer({
  section,
}: {
  section: HomepageSection;
}) {
  switch (section.type) {
    case "hero":
    case "banner-slider": {
      const placement = section.placement ?? "hero";
      return (
        <HomepageBannerSection
          placement={placement}
          size={placement === "hero" ? "hero" : "promo"}
        />
      );
    }

    case "category-showcase":
      return <CategoryShowcase />;

    case "product-showcase": {
      if (section.collection === "new-arrivals") {
        const collection = await getCollectionBySlug(section.collection);
        return (
          <ProductShowcase
            eyebrow="New In"
            title={collection?.name ?? "New Arrivals"}
            variant="grid"
            collection={section.collection}
            cta={{
              label: "Shop All",
              href: collection?.href ?? `/collections/${section.collection}`,
            }}
          />
        );
      }

      if (section.collection === "best-sellers") {
        const collection = await getCollectionBySlug(section.collection);
        return (
          <ProductShowcase
            eyebrow="Most Loved"
            title={collection?.name ?? "Bestsellers"}
            variant="carousel"
            collection={section.collection}
            cta={{
              label: "Shop All",
              href: collection?.href ?? `/collections/${section.collection}`,
            }}
          />
        );
      }

      return null;
    }

    case "campaign-banner":
      // Slider data no longer feeds mid-page campaign banners.
      return null;

    case "shop-the-look":
      return <ShopTheLook />;

    case "collection-stories":
      return <CollectionStories />;

    case "occasion-showcase":
      return <OccasionShowcase />;

    case "ugc-gallery":
      return <UGCGallery />;

    case "brand-story":
      return <BrandStory />;

    case "trust-strip":
      return <TrustStrip />;

    case "newsletter": {
      const content = await getNewsletter();
      if (!content) return null;
      return <NewsletterSection content={content} />;
    }

    default:
      return null;
  }
}
