import type { Occasion } from "@/types/commerce";

const PLACEHOLDER = "/images/placeholder.svg";

/** Demo occasions (brief §18). Kept intentionally short. */
export const occasions: Occasion[] = [
  {
    id: "wedding",
    slug: "wedding",
    name: "Wedding",
    image: {
      src: "/images/occasions/wedding.png",
      alt: "Regal wedding jewellery styling",
    },
    href: "/occasions/wedding",
  },
  {
    id: "festive",
    slug: "festive",
    name: "Festive",
    image: {
      src: "/images/occasions/festive.png",
      alt: "Festive celebration jewellery styling",
    },
    href: "/occasions/festive",
  },
  {
    id: "party",
    slug: "party",
    name: "Party",
    image: {
      src: "/images/occasions/party.png",
      alt: "Party glam statement jewellery styling",
    },
    href: "/occasions/party",
  },
  {
    id: "everyday",
    slug: "everyday",
    name: "Everyday",
    image: {
      src: "/images/occasions/everyday.png",
      alt: "Everyday elegant jewellery styling",
    },
    href: "/occasions/everyday",
  },
];
