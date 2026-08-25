import type { UGCContent } from "@/types/commerce";

/**
 * Demo "Styled by You" social-proof content (brief §21).
 * Mock UGC only — no social API. Attribution stays light; no engagement metrics.
 */
export const ugcContent: UGCContent[] = [
  {
    id: "ugc-1",
    image: {
      src: "/images/ugc/look-01.jpg",
      alt: "Pearl and zircon drop earrings styled with delicate gold chains",
    },
    creator: "@aria.styles",
    href: "/products/lumen-pearl-drops",
  },
  {
    id: "ugc-2",
    image: {
      src: "/images/ugc/look-02.jpg",
      alt: "Tailored linen blazer styled with chunky gold hoops and layered necklaces",
    },
    creator: "@meher.wears",
    href: "/collections/everyday-gold",
  },
  {
    id: "ugc-3",
    image: {
      src: "/images/ugc/look-03.jpg",
      alt: "Chunky knit cardigan styled with everyday charm bracelet and twisted gold cuff",
    },
    creator: "@thelabellife",
    href: "/collections/everyday-gold",
  },
  {
    id: "ugc-4",
    image: {
      src: "/images/ugc/look-04.jpg",
      alt: "Festive mustard silk outfit styled with statement Kundan choker and chandbalis",
    },
    creator: "@studio.noor",
    href: "/collections/the-festive-edit",
  },
  {
    id: "ugc-5",
    image: {
      src: "/images/ugc/look-05.jpg",
      alt: "Evening black silk dress styled with crystal waterfall tassel earrings and sculptural gold cuff",
    },
    creator: "@stylewithme",
    href: "/collections/statement-jewellery",
  },
  {
    id: "ugc-6",
    image: {
      src: "/images/ugc/look-06.jpg",
      alt: "Crisp white shirt and denim styled with minimal herringbone chain and gold huggies",
    },
    creator: "@editbynina",
    href: "/collections/everyday-gold",
  },
];

