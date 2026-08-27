import type { HomepageSection } from "@/types/homepage";
import { homepageSections } from "@/config/homepage";
import { getCollectionBySlug, getNewsletter, getBrandStory, getTrustItems } from "@/lib/data";
import { ProductShowcase } from "@/components/product";
import { HomepageBannerSection } from "./homepage-banner-section";
import { CategoryShowcase } from "./category-showcase";
import { ShopTheLook } from "./shop-the-look";
import { CollectionStories } from "./collection-stories";
import { OccasionShowcase } from "./occasion-showcase";
import { UGCGallery } from "./ugc-gallery";
import { BrandStory } from "./brand-story";
import { TrustStrip } from "./trust-strip";
import { WearYourStory } from "./wear-your-story";
import { brandStory } from "@/data/brand";
import { trustItems } from "@/data/trust";

/**
 * Renders the homepage from the locked, config-driven section order.
 * Announcement, Header and Footer remain in the app shell/layout.
 */
export function HomepageSections() {
  return (
    <div className="homepage-sections">
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
    </div>
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

    case "brand-story": {
      const content = await getBrandStory() ?? brandStory;
      return <BrandStory content={content} />;
    }

    case "trust-strip": {
      const items = await getTrustItems();
      const finalItems = items && items.length > 0 ? items : trustItems;
      return <TrustStrip items={finalItems} />;
    }

    case "wear-your-story": {
      return <WearYourStory />;
    }

    default:
      return null;
  }
}
