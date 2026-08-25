import type { Metadata } from "next";
import { CartView } from "@/components/cart";

export const metadata: Metadata = {
  title: "Your Bag",
  description: "Review the items in your bag before checkout.",
};

export default function CartPage() {
  return <CartView />;
}
