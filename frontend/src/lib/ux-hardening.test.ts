import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = join(here, "..");

function read(rel: string) {
  return readFileSync(join(srcRoot, rel), "utf8");
}

test("single toast provider is mounted in root layout", () => {
  const layout = read("app/layout.tsx");
  assert.match(layout, /ToastProvider/);
  assert.match(layout, /WishlistProvider/);
  assert.match(read("components/ui/toast.tsx"), /export function useToast/);
  assert.match(read("components/ui/toast.tsx"), /tone === "success"/);
});

test("header shows wishlist count badge like bag", () => {
  const header = read("components/layout/header.tsx");
  assert.match(header, /useWishlist/);
  assert.match(header, /wishlistCount/);
  assert.match(header, /showWishlistBadge/);
});

test("hamburger drawer is site navigation only", () => {
  const header = read("components/layout/header.tsx");
  const drawerStart = header.indexOf("const mobileDrawer");
  const drawerEnd = header.indexOf("return (", drawerStart);
  assert.ok(drawerStart >= 0 && drawerEnd > drawerStart);
  const drawer = header.slice(drawerStart, drawerEnd);

  assert.doesNotMatch(drawer, /SearchAutocomplete/);
  assert.doesNotMatch(drawer, /href="\/account"/);
  assert.doesNotMatch(drawer, /href="\/wishlist"/);
  assert.doesNotMatch(drawer, /IconBag/);
  assert.doesNotMatch(drawer, />\s*Bag\s*</);
  assert.match(drawer, /aria-label="Site"/);
  assert.match(drawer, /primaryNav\.map/);
});

test("mobile bottom nav mounts Home Shop Wishlist Cart", () => {
  const layout = read("app/layout.tsx");
  const nav = read("components/layout/mobile-bottom-nav.tsx");
  assert.match(layout, /MobileBottomNav/);
  assert.match(nav, /href: "\/"/);
  assert.match(nav, /href: "\/categories"/);
  assert.match(nav, /href: "\/wishlist"/);
  assert.match(nav, /href: "\/cart"/);
  assert.doesNotMatch(nav, /\/shop"/);
  assert.doesNotMatch(nav, /\/account"/);
  assert.doesNotMatch(nav, /\/search"/);
});

test("wishlist provider is auth-only and does not invent guest wishlist", () => {
  const provider = read("lib/wishlist/wishlist-provider.tsx");
  assert.match(provider, /fetchWishlistProductIds/);
  assert.match(provider, /count: user \? ids\.size : 0/);
  assert.doesNotMatch(provider, /localStorage/);
});

test("auth panel always exposes Google CTA and uses Spinner for pending", () => {
  const panel = read("components/account/shopper-auth-panel.tsx");
  assert.match(panel, /Continue with Google/);
  assert.match(panel, /Spinner/);
  assert.match(panel, /useToast/);
});
