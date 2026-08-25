import type { Look } from "@/types/commerce";

const PLACEHOLDER = "/images/placeholder.svg";

/** Demo "Shop the Look" styling looks (brief §16). */
export const looks: Look[] = [
  {
    id: "look-golden-hour",
    title: "Golden Hour",
    description: "Warm-toned layering for evening light.",
    image: {
      src: "/images/looks/golden-hour.png",
      alt: "Golden Hour layered pearl and crystal styling",
    },
    mobileImage: {
      src: "/images/looks/golden-hour.png",
      alt: "Golden Hour layered pearl and crystal styling",
    },
    ctaLabel: "Shop the Look",
    href: "/collections/new-arrivals",
    productIds: ["p-aurora-choker", "p-solene-studs"],
  },
  {
    id: "look-quiet-luxe",
    title: "Quiet Luxe",
    description: "Understated pieces for everyday polish.",
    image: {
      src: "/images/looks/quiet-luxe.png",
      alt: "Quiet Luxe modern pearl drop styling",
    },
    mobileImage: {
      src: "/images/looks/quiet-luxe.png",
      alt: "Quiet Luxe modern pearl drop styling",
    },
    ctaLabel: "Shop the Look",
    href: "/collections/best-sellers",
    productIds: ["p-celeste-band", "p-lumen-drops"],
  },
  {
    id: "look-festive-glow",
    title: "Festive Glow",
    description: "Statement styling for celebrations.",
    image: {
      src: "/images/looks/festive-glow.png",
      alt: "Festive Glow regal choker and earrings styling",
    },
    mobileImage: {
      src: "/images/looks/festive-glow.png",
      alt: "Festive Glow regal choker and earrings styling",
    },
    ctaLabel: "Shop the Look",
    href: "/collections/the-festive-edit",
    productIds: ["p-nova-pendant", "p-vesper-cuff"],
  },
];
