import type { CampaignBannerContent } from "@/types/commerce";

/**
 * Demo campaign-banner content (brief §16 / §19).
 *
 * Two locked homepage positions reuse the same CampaignBanner component with
 * different variants and content — commercial/seasonal vs editorial/lifestyle.
 * Imagery is placeholder/configurable; presentation lives in the component.
 */
export const campaignBanners: CampaignBannerContent[] = [
  {
    id: "campaign-festive-edit",
    variant: "collection-seasonal",
    eyebrow: "Seasonal Edit",
    heading: "The Festive Edit",
    supportingText: "Jewellery for moments worth dressing up for.",
    image: {
      src: "/images/campaigns/festive-edit.jpg",
      alt: "The Festive Edit seasonal campaign featuring statement necklace and chandelier earrings",
    },
    mobileImage: {
      src: "/images/campaigns/festive-edit-mobile.jpg",
      alt: "The Festive Edit seasonal campaign featuring statement necklace and chandelier earrings",
    },
    cta: {
      label: "Explore the Edit",
      href: "/collections/the-festive-edit",
    },
    visible: true,
    align: "left",
    overlay: "dark",
  },
  {
    id: "campaign-everyday-gold",
    variant: "editorial-lifestyle",
    eyebrow: "Lifestyle",
    heading: "From day to dinner",
    supportingText: "Warm everyday pieces, styled without effort.",
    image: {
      src: "/images/campaigns/everyday-gold.jpg",
      alt: "Everyday Gold editorial lifestyle campaign featuring minimal gold jewellery",
    },
    mobileImage: {
      src: "/images/campaigns/everyday-gold-mobile.jpg",
      alt: "Everyday Gold editorial lifestyle campaign featuring minimal gold jewellery",
    },
    cta: {
      label: "Shop Everyday",
      href: "/collections/everyday-gold",
    },
    visible: true,
    align: "center",
    overlay: "dark",
  },
];

