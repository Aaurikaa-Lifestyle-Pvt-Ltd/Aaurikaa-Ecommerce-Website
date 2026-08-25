import type { Category } from "@/types/commerce";

const PLACEHOLDER = "/images/placeholder.svg";

/** Demo categories (brief §14). Content is placeholder and configurable. */
export const categories: Category[] = [
  {
    id: "earrings",
    slug: "earrings",
    name: "Earrings",
    image: {
      src: "/images/categories/earrings.png",
      alt: "Model wearing contemporary pearl drop earrings",
    },
    href: "/categories/earrings",
  },
  {
    id: "necklaces",
    slug: "necklaces",
    name: "Necklaces",
    image: {
      src: "/images/categories/necklaces.png",
      alt: "Model wearing layered gold-tone choker necklace",
    },
    href: "/categories/necklaces",
  },
  {
    id: "rings",
    slug: "rings",
    name: "Rings",
    image: {
      src: "/images/categories/rings.png",
      alt: "Editorial close-up of crystal stacking rings",
    },
    href: "/categories/rings",
  },
  {
    id: "bracelets",
    slug: "bracelets",
    name: "Bracelets",
    image: {
      src: "/images/categories/bracelets.png",
      alt: "Model wearing gold-tone textured cuff bracelet",
    },
    href: "/categories/bracelets",
  },
];
