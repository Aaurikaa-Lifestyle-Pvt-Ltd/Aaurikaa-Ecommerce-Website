import type { Product } from "@/types/commerce";

const INR = "INR";

const shippingReturnsCopy =
  "Complimentary shipping on orders over ₹1,499. Eligible orders can be returned through a simple process — see our Shipping and Returns pages for timelines and conditions.";

/**
 * Demo products (brief §35). Representative sample covering PDP states:
 * normal, discounted, sold-out, with/without variants, multi-image gallery.
 * Not the final catalogue.
 */
export const products: Product[] = [
  {
    id: "p-lumen-drops",
    slug: "lumen-pearl-drops",
    name: "Lumen Pearl Drop Earrings",
    image: {
      src: "/images/products/lumen-drops.png",
      alt: "Lumen Pearl Drop Earrings with gold filigree and crystals",
    },
    hoverImage: {
      src: "/images/products/lumen-drops-worn.png",
      alt: "Lumen Pearl Drop Earrings worn by model",
    },
    gallery: [
      {
        src: "/images/products/lumen-drops.png",
        alt: "Lumen Pearl Drop Earrings with gold filigree and crystals",
      },
      {
        src: "/images/products/lumen-drops-worn.png",
        alt: "Lumen Pearl Drop Earrings worn by model",
      },
      {
        src: "/images/products/solene-studs.png",
        alt: "Detail view of Lumen Pearl Drop Earrings crystal setting",
      },
    ],
    price: { amount: 1499, currency: INR },
    compareAtPrice: { amount: 1999, currency: INR },
    badge: "new",
    inStock: true,
    categoryIds: ["earrings"],
    collectionIds: ["new-arrivals", "the-pearl-edit"],
    shortDescription:
      "Sculpted drops with soft pearl finish — made for day-to-evening wear.",
    description:
      "The Lumen Pearl Drop Earrings balance a luminous pearl centre with refined metalwork. Lightweight enough for all-day wear, with enough presence for evening looks.",
    variants: [
      {
        id: "lumen-gold",
        title: "Gold",
        options: { Finish: "Gold" },
        price: { amount: 1499, currency: INR },
        compareAtPrice: { amount: 1999, currency: INR },
        inStock: true,
        sku: "LUM-GLD",
      },
      {
        id: "lumen-silver",
        title: "Silver",
        options: { Finish: "Silver" },
        price: { amount: 1499, currency: INR },
        compareAtPrice: { amount: 1999, currency: INR },
        inStock: true,
        sku: "LUM-SLV",
      },
      {
        id: "lumen-rose",
        title: "Rose Gold",
        options: { Finish: "Rose Gold" },
        price: { amount: 1599, currency: INR },
        compareAtPrice: { amount: 2099, currency: INR },
        inStock: false,
        sku: "LUM-RSG",
      },
    ],
    details: [
      {
        id: "materials",
        title: "Materials",
        content:
          "Pearl-finish centre with crystal accents on a plated metal base. Nickel-conscious construction for everyday comfort.",
      },
      {
        id: "care",
        title: "Care",
        content:
          "Store flat in a soft pouch. Avoid water, perfume and harsh cleaners. Wipe gently with a dry cloth after wear.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-aurora-choker",
    slug: "aurora-layered-choker",
    name: "Aurora Layered Choker",
    image: {
      src: "/images/products/aurora-choker.png",
      alt: "Aurora Layered Choker necklace in gold finish",
    },
    gallery: [
      {
        src: "/images/products/aurora-choker.png",
        alt: "Aurora Layered Choker necklace in gold finish",
      },
      {
        src: "/images/products/nova-pendant.png",
        alt: "Aurora Layered Choker styling detail",
      },
    ],
    price: { amount: 2299, currency: INR },
    badge: "new",
    inStock: true,
    categoryIds: ["necklaces"],
    collectionIds: ["new-arrivals"],
    shortDescription:
      "Layered choker with a clean, architectural line — no fuss, just presence.",
    description:
      "Aurora stacks fine links into a single confident silhouette. Designed to sit close to the collarbone and pair easily with both open necklines and high collars.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal chain with secure clasp. Adjustable extension.",
      },
      {
        id: "care",
        title: "Care",
        content:
          "Keep dry. Remove before swimming or bathing. Store separately to avoid tangles.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-celeste-band",
    slug: "celeste-stacking-band",
    name: "Celeste Stacking Band",
    image: {
      src: "/images/products/celeste-band.png",
      alt: "Celeste Stacking Band ring with pave zircon stones",
    },
    gallery: [
      {
        src: "/images/products/celeste-band.png",
        alt: "Celeste Stacking Band ring with pave zircon stones",
      },
    ],
    price: { amount: 899, currency: INR },
    inStock: true,
    categoryIds: ["rings"],
    collectionIds: ["new-arrivals", "best-sellers"],
    shortDescription: "A slim pave band made to stack or wear alone.",
    description:
      "Celeste is a fine stacking ring with continuous sparkle. Mix with signets or wear solo for a quiet highlight on the hand.",
    variants: [
      {
        id: "celeste-5",
        title: "Size 5",
        options: { Size: "5" },
        price: { amount: 899, currency: INR },
        inStock: true,
        sku: "CEL-05",
      },
      {
        id: "celeste-6",
        title: "Size 6",
        options: { Size: "6" },
        price: { amount: 899, currency: INR },
        inStock: true,
        sku: "CEL-06",
      },
      {
        id: "celeste-7",
        title: "Size 7",
        options: { Size: "7" },
        price: { amount: 899, currency: INR },
        inStock: false,
        sku: "CEL-07",
      },
      {
        id: "celeste-8",
        title: "Size 8",
        options: { Size: "8" },
        price: { amount: 899, currency: INR },
        inStock: true,
        sku: "CEL-08",
      },
    ],
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal band set with zircon stones.",
      },
      {
        id: "care",
        title: "Care",
        content:
          "Avoid lotions and chemicals on the stone setting. Store in a soft pouch.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-vesper-cuff",
    slug: "vesper-cuff-bracelet",
    name: "Vesper Cuff Bracelet",
    image: {
      src: "/images/products/vesper-cuff.png",
      alt: "Vesper Cuff Bracelet with twisted textured gold finish",
    },
    gallery: [
      {
        src: "/images/products/vesper-cuff.png",
        alt: "Vesper Cuff Bracelet with twisted textured gold finish",
      },
    ],
    price: { amount: 1799, currency: INR },
    badge: "bestseller",
    inStock: true,
    categoryIds: ["bracelets"],
    collectionIds: ["best-sellers"],
    shortDescription: "Twisted texture cuff with an open silhouette.",
    description:
      "Vesper wraps the wrist in a sculpted open cuff. The textured finish catches light without relying on stones.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal open cuff. Flexible fit for most wrists.",
      },
      {
        id: "care",
        title: "Care",
        content:
          "Wipe with a soft dry cloth. Avoid bending beyond the natural opening.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-solene-studs",
    slug: "solene-crystal-studs",
    name: "Solene Crystal Studs",
    image: {
      src: "/images/products/solene-studs.png",
      alt: "Solene Crystal Studs with sparkling cluster stones",
    },
    gallery: [
      {
        src: "/images/products/solene-studs.png",
        alt: "Solene Crystal Studs with sparkling cluster stones",
      },
      {
        src: "/images/products/lumen-drops.png",
        alt: "Solene Crystal Studs alternate angle",
      },
    ],
    price: { amount: 1199, currency: INR },
    compareAtPrice: { amount: 1499, currency: INR },
    badge: "sale",
    inStock: true,
    categoryIds: ["earrings"],
    collectionIds: ["best-sellers", "the-festive-edit"],
    shortDescription: "Cluster studs with bright crystal clarity.",
    description:
      "Solene brings concentrated sparkle in a compact stud. Easy to dress up or keep for everyday polish.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Crystal cluster on a plated metal post with secure back.",
      },
      {
        id: "care",
        title: "Care",
        content: "Keep dry. Clean gently with a soft dry cloth.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-nova-pendant",
    slug: "nova-pendant-necklace",
    name: "Nova Pendant Necklace",
    image: {
      src: "/images/products/nova-pendant.png",
      alt: "Nova Pendant Necklace with layered pendant design",
    },
    gallery: [
      {
        src: "/images/products/nova-pendant.png",
        alt: "Nova Pendant Necklace with layered pendant design",
      },
    ],
    price: { amount: 1650, currency: INR },
    badge: "trending",
    inStock: false,
    categoryIds: ["necklaces"],
    collectionIds: ["best-sellers", "the-festive-edit"],
    shortDescription: "Layered pendant currently unavailable.",
    description:
      "Nova pairs a refined chain with a layered pendant drop. This piece is currently sold out — join the waitlist via wishlist, or explore related necklaces.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal chain and pendant.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-lyra-tennis",
    slug: "lyra-tennis-bracelet",
    name: "Lyra Tennis Bracelet",
    image: {
      src: "/images/products/vesper-cuff.png",
      alt: "Lyra Tennis Bracelet with a continuous line of stones",
    },
    gallery: [
      {
        src: "/images/products/vesper-cuff.png",
        alt: "Lyra Tennis Bracelet with a continuous line of stones",
      },
    ],
    price: { amount: 2199, currency: INR },
    compareAtPrice: { amount: 2799, currency: INR },
    badge: "sale",
    inStock: true,
    categoryIds: ["bracelets"],
    collectionIds: ["new-arrivals", "best-sellers"],
    shortDescription: "A continuous line of stones for evening polish.",
    description:
      "Lyra is a classic tennis silhouette with steady sparkle from clasp to clasp. Built for occasions and elevated everyday looks alike.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal bracelet set with a continuous stone line.",
      },
      {
        id: "care",
        title: "Care",
        content:
          "Avoid impact and chemicals. Store flat to protect the setting.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-thea-studs",
    slug: "thea-baguette-studs",
    name: "Thea Baguette Studs",
    image: {
      src: "/images/products/solene-studs.png",
      alt: "Thea Baguette Studs with clustered crystal stones",
    },
    price: { amount: 999, currency: INR },
    badge: "new",
    inStock: true,
    categoryIds: ["earrings"],
    collectionIds: ["new-arrivals", "the-pearl-edit"],
    shortDescription: "Geometric baguette studs with a modern edge.",
    description:
      "Thea cuts a clean geometric profile. Minimal enough for daily wear, sharp enough for night.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Baguette-cut crystal accents on plated metal posts.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-marlowe-chain",
    slug: "marlowe-rope-chain",
    name: "Marlowe Rope Chain",
    image: {
      src: "/images/products/nova-pendant.png",
      alt: "Marlowe Rope Chain necklace in a warm gold finish",
    },
    gallery: [
      {
        src: "/images/products/nova-pendant.png",
        alt: "Marlowe Rope Chain necklace in a warm gold finish",
      },
      {
        src: "/images/products/aurora-choker.png",
        alt: "Marlowe Rope Chain lifestyle angle",
      },
    ],
    price: { amount: 1950, currency: INR },
    badge: "bestseller",
    inStock: true,
    categoryIds: ["necklaces"],
    collectionIds: ["new-arrivals", "everyday-gold", "best-sellers"],
    shortDescription: "Warm-toned rope chain for everyday layering.",
    description:
      "Marlowe is an everyday chain with quiet texture. Wear alone or layer with pendants from the edit.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal rope chain with secure clasp.",
      },
      {
        id: "care",
        title: "Care",
        content: "Keep dry and store untangled. Wipe after wear.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-orla-signet",
    slug: "orla-signet-ring",
    name: "Orla Signet Ring",
    image: {
      src: "/images/products/celeste-band.png",
      alt: "Orla Signet Ring with a smooth polished face",
    },
    gallery: [
      {
        src: "/images/products/celeste-band.png",
        alt: "Orla Signet Ring with a smooth polished face",
      },
    ],
    price: { amount: 1099, currency: INR },
    badge: "bestseller",
    inStock: true,
    categoryIds: ["rings"],
    collectionIds: ["new-arrivals", "statement-jewellery", "best-sellers"],
    shortDescription: "Polished signet with a smooth face.",
    description:
      "Orla is a refined signet for stacking or standing alone. The polished face keeps the look architectural and calm.",
    variants: [
      {
        id: "orla-6",
        title: "Size 6",
        options: { Size: "6" },
        price: { amount: 1099, currency: INR },
        inStock: true,
        sku: "ORL-06",
      },
      {
        id: "orla-7",
        title: "Size 7",
        options: { Size: "7" },
        price: { amount: 1099, currency: INR },
        inStock: true,
        sku: "ORL-07",
      },
      {
        id: "orla-8",
        title: "Size 8",
        options: { Size: "8" },
        price: { amount: 1099, currency: INR },
        inStock: true,
        sku: "ORL-08",
      },
    ],
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal signet with polished face.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-elara-hoops",
    slug: "elara-twisted-hoops",
    name: "Elara Twisted Hoops",
    image: {
      src: "/images/products/lumen-drops.png",
      alt: "Elara Twisted Hoops with a fine twisted profile",
    },
    hoverImage: {
      src: "/images/products/lumen-drops-worn.png",
      alt: "Elara Twisted Hoops worn by model",
    },
    gallery: [
      {
        src: "/images/products/lumen-drops.png",
        alt: "Elara Twisted Hoops with a fine twisted profile",
      },
      {
        src: "/images/products/lumen-drops-worn.png",
        alt: "Elara Twisted Hoops worn by model",
      },
    ],
    price: { amount: 1299, currency: INR },
    badge: "new",
    inStock: true,
    categoryIds: ["earrings"],
    collectionIds: ["new-arrivals"],
    shortDescription: "Fine twisted hoops with a light, modern profile.",
    description:
      "Elara brings texture through a twisted metal line. Comfortable for daily rotation and sharp enough for evening.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal hoop with hinged closure.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-mira-locket",
    slug: "mira-locket-pendant",
    name: "Mira Locket Pendant",
    image: {
      src: "/images/products/aurora-choker.png",
      alt: "Mira Locket Pendant on a delicate chain",
    },
    gallery: [
      {
        src: "/images/products/aurora-choker.png",
        alt: "Mira Locket Pendant on a delicate chain",
      },
    ],
    price: { amount: 1499, currency: INR },
    inStock: true,
    categoryIds: ["necklaces"],
    collectionIds: ["new-arrivals", "best-sellers"],
    shortDescription: "A delicate locket on a fine chain.",
    description:
      "Mira is a small locket pendant designed for close wear. Quietly personal, easy to layer.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal locket and chain.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
  {
    id: "p-iris-ear-cuff",
    slug: "iris-ear-cuff",
    name: "Iris Ear Cuff",
    image: {
      src: "/images/products/solene-studs.png",
      alt: "Iris Ear Cuff with a sculpted crystal edge",
    },
    price: { amount: 799, currency: INR },
    badge: "new",
    inStock: true,
    categoryIds: ["earrings"],
    collectionIds: ["new-arrivals", "best-sellers"],
    shortDescription: "No-pierce cuff with a sculpted crystal edge.",
    description:
      "Iris clips on without a piercing. A sculpted crystal edge adds light while the silhouette stays minimal.",
    details: [
      {
        id: "materials",
        title: "Materials",
        content: "Plated metal cuff with crystal accent. Adjustable tension.",
      },
      {
        id: "care",
        title: "Care",
        content: "Open gently. Avoid forcing the cuff beyond its flex.",
      },
      {
        id: "shipping",
        title: "Shipping & Returns",
        content: shippingReturnsCopy,
      },
    ],
  },
];
