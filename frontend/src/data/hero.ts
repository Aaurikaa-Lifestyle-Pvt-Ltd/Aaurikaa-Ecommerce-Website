import type { HeroContent } from "@/types/commerce";

const PLACEHOLDER = "/images/placeholder.svg";

/**
 * Demo hero content (brief §13). Static, editorial, CTA-driven — no carousel.
 * Content is placeholder/configurable; presentation lives in the Hero component.
 */
export const hero: HeroContent = {
  eyebrow: "The New Edit",
  heading: "Modern heirlooms, made to be worn",
  supportingText:
    "Premium imitation jewellery designed for everyday moments and the occasions you'll remember.",
  image: {
    src: "/images/hero-desktop-v2.png",
    alt: "South Asian model wearing emerald and pearl statement choker jewellery in an ivory silk ensemble",
  },
  // Subject-focused crop for phone + tablet — desktop banner is too wide for
  // object-cover on small viewports and crops to empty texture.
  mobileImage: {
    src: "/images/hero-tablet.png",
    alt: "South Asian model wearing emerald and pearl statement choker jewellery in an ivory silk ensemble",
  },
  primaryCta: { label: "Shop New Arrivals", href: "/collections/new-arrivals" },
  secondaryCta: { label: "Explore Collections", href: "/collections" },
  align: "left",
  overlay: "dark",
};
