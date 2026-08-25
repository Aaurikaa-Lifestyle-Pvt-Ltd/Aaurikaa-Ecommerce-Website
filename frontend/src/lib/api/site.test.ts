import assert from "node:assert/strict";
import test from "node:test";
import { parseHeaderMenuLinks } from "./site-nav.ts";

test("parseHeaderMenuLinks accepts paths and Label|href forms", () => {
  const links = parseHeaderMenuLinks([
    "/categories",
    "Shop|/collections",
    "  ",
    "Shop",
    "About|/about",
  ]);
  assert.deepEqual(links, [
    { label: "Categories", href: "/categories" },
    { label: "Shop", href: "/collections" },
    { label: "About", href: "/about" },
  ]);
});

test("parseHeaderMenuLinks rejects javascript and protocol-relative hrefs", () => {
  const links = parseHeaderMenuLinks([
    "Bad|javascript:alert(1)",
    "Proto|//evil.example",
    "Ok|/help-center",
  ]);
  assert.deepEqual(links, [{ label: "Ok", href: "/help-center" }]);
});
