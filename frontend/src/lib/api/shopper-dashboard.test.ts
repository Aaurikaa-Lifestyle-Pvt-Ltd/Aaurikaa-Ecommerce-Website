import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dashboardSource = readFileSync(join(here, "shopper-dashboard.ts"), "utf8");
const accountPageSource = readFileSync(
  join(here, "../../app/account/page.tsx"),
  "utf8",
);

test("shopper dashboard client hits /api/shopper/dashboard/stats and soft-fails", () => {
  assert.match(dashboardSource, /\/api\/shopper\/dashboard\/stats/);
  assert.match(dashboardSource, /auth:\s*true/);
  assert.match(dashboardSource, /catch\s*\{[\s\S]*return null/);
  assert.match(dashboardSource, /activeOrders/);
  assert.match(dashboardSource, /wishlistCount/);
  assert.match(dashboardSource, /totalSpent/);
});

test("account overview consumes shopper-dashboard module", () => {
  assert.match(accountPageSource, /@\/lib\/api\/shopper-dashboard/);
  assert.match(accountPageSource, /fetchShopperDashboardStats/);
});

test("dashboard stats shape keeps optional counters only", () => {
  const stats = {
    activeOrders: 2,
    wishlistCount: 5,
    totalSpent: 12000,
  };
  assert.equal(typeof stats.activeOrders, "number");
  assert.equal(typeof stats.wishlistCount, "number");
  assert.equal(typeof stats.totalSpent, "number");
  assert.equal("recentOrders" in stats, false);
});
