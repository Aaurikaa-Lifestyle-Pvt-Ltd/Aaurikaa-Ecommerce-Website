import type { Collection } from "@/types/commerce";

const PLACEHOLDER = "/images/placeholder.svg";

/**
 * Demo collections (brief §17). Includes merchandising collections used by
 * ProductShowcase ("new-arrivals", "best-sellers") and editorial/aesthetic
 * collections used by CollectionStories. Content is placeholder/configurable.
 */
export const collections: Collection[] = [
  {
    id: "new-arrivals",
    slug: "new-arrivals",
    name: "New Arrivals",
    description: "The latest additions to the edit.",
    image: {
      src: "/images/collections/pearl-edit.png",
      alt: "New arrivals collection",
    },
    href: "/collections/new-arrivals",
  },
  {
    id: "best-sellers",
    slug: "best-sellers",
    name: "Bestsellers",
    description: "Proven favourites, loved by many.",
    image: {
      src: "/images/collections/statement-jewellery.png",
      alt: "Bestsellers collection",
    },
    href: "/collections/best-sellers",
  },
  {
    id: "the-pearl-edit",
    slug: "the-pearl-edit",
    name: "The Pearl Edit",
    description: "Timeless pearls, reimagined for the modern wardrobe.",
    image: {
      src: "/images/collections/pearl-edit.png",
      alt: "The Pearl Edit collection story",
    },
    href: "/collections/the-pearl-edit",
    editorial: true,
  },
  {
    id: "the-festive-edit",
    slug: "the-festive-edit",
    name: "The Festive Edit",
    description: "Statement pieces made for the season's celebrations.",
    image: {
      src: "/images/collections/festive-edit.png",
      alt: "The Festive Edit collection story",
    },
    href: "/collections/the-festive-edit",
    editorial: true,
  },
  {
    id: "everyday-gold",
    slug: "everyday-gold",
    name: "Everyday Gold",
    description: "Warm-toned essentials to wear on repeat.",
    image: {
      src: "/images/collections/everyday-gold.png",
      alt: "Everyday Gold collection story",
    },
    href: "/collections/everyday-gold",
    editorial: true,
  },
  {
    id: "statement-jewellery",
    slug: "statement-jewellery",
    name: "Statement Jewellery",
    description: "Bold, sculptural pieces that lead the look.",
    image: {
      src: "/images/collections/statement-jewellery.png",
      alt: "Statement Jewellery collection story",
    },
    href: "/collections/statement-jewellery",
    editorial: true,
  },
];
