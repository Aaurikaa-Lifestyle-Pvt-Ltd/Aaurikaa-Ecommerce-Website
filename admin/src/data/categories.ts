import type { AdminCategory } from "@/types/admin";
import { products } from "./products";

export const categories: AdminCategory[] = [
  {
    id: "earrings",
    name: "Earrings",
    slug: "earrings",
    productCount: products.filter((p) => p.categoryId === "earrings").length,
    status: "Active",
    image: "/images/categories/earrings.png",
  },
  {
    id: "necklaces",
    name: "Necklaces",
    slug: "necklaces",
    productCount: products.filter((p) => p.categoryId === "necklaces").length,
    status: "Active",
    image: "/images/categories/necklaces.png",
  },
  {
    id: "rings",
    name: "Rings",
    slug: "rings",
    productCount: products.filter((p) => p.categoryId === "rings").length,
    status: "Active",
    image: "/images/categories/rings.png",
  },
  {
    id: "bracelets",
    name: "Bracelets",
    slug: "bracelets",
    productCount: products.filter((p) => p.categoryId === "bracelets").length,
    status: "Active",
    image: "/images/categories/bracelets.png",
  },
];

export function getCategory(id: string) {
  return categories.find((c) => c.id === id);
}
