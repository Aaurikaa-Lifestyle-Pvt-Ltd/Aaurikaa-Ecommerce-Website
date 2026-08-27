import type { Metadata } from "next";
import { Geist, Playfair_Display } from "next/font/google";
import { siteConfig } from "@/config/site";
import {
  Announcement,
  Footer,
  Header,
  MobileBottomNav,
} from "@/components/layout";
import { CartProvider, MiniCart } from "@/components/cart";
import { SpinEntryPoint } from "@/components/spin";
import { ShopperAuthProvider } from "@/lib/auth/shopper-provider";
import { WishlistProvider } from "@/lib/wishlist/wishlist-provider";
import { ToastProvider } from "@/components/ui/toast";
import { isApiCatalogue } from "@/lib/api/config";
import { fetchPublicHeaderSettings } from "@/lib/api/site";
import { parseHeaderMenuLinks } from "@/lib/api/site-nav";
import { apiRequest } from "@/lib/api/client";
import "./globals.css";

// Interface / commerce sans-serif (navigation, product info, buttons, forms).
const sans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

// Editorial display serif — used selectively for major/editorial headings.
const serif = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

type PublicSeoSettings = {
  title?: string;
  description?: string;
  keywords?: string;
};

async function fetchPublicSeoSettings(): Promise<PublicSeoSettings | null> {
  if (!isApiCatalogue()) return null;
  try {
    return await apiRequest<PublicSeoSettings>("/api/settings/seo", { auth: false });
  } catch {
    return null;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const seo = await fetchPublicSeoSettings();
  const titleDefault =
    seo?.title?.trim() || `${siteConfig.name} — ${siteConfig.tagline}`;
  const description = seo?.description?.trim() || siteConfig.description;
  const keywords = seo?.keywords?.trim();

  return {
    title: {
      default: titleDefault,
      template: `%s — ${siteConfig.name}`,
    },
    description,
    ...(keywords
      ? { keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) }
      : {}),
    icons: {
      icon: [
        {
          url: "/images/logo/aaurikaa-emblem.png",
          type: "image/png",
        },
        {
          url: "/images/logo/WhatsApp Image 2026-08-21 at 16.28.15.jpeg",
          type: "image/jpeg",
        },
      ],
      shortcut: ["/images/logo/aaurikaa-emblem.png"],
      apple: [
        {
          url: "/images/logo/aaurikaa-emblem.png",
        },
      ],
    },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  let headerTitle: string | undefined;
  let navLinks = siteConfig.primaryNav;
  try {
    const header = await fetchPublicHeaderSettings();
    headerTitle = header?.title?.trim() || undefined;
    const configured = parseHeaderMenuLinks(header?.menuLinks);
    if (configured.length > 0) navLinks = configured;
  } catch {
    headerTitle = undefined;
  }

  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="min-h-full w-full max-w-full overflow-x-hidden flex flex-col bg-background text-foreground pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] lg:pb-0">
        <ShopperAuthProvider>
          <ToastProvider>
            <WishlistProvider>
              <CartProvider>
                <Announcement />
                <Header brandName={headerTitle} navLinks={navLinks} />
                <main className="flex-1 w-full min-w-0">{children}</main>
                <Footer />
                <MobileBottomNav />
                <MiniCart />
                <SpinEntryPoint />
              </CartProvider>
            </WishlistProvider>
          </ToastProvider>
        </ShopperAuthProvider>
      </body>
    </html>
  );
}
