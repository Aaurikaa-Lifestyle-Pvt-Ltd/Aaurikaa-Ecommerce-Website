import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_ROUTE_PERMISSIONS,
  adminNav,
  canAccessAdminPath,
  filterAdminNav,
  getRouteGuardRule,
  isAlwaysAccessibleAdminPath,
  isPublicAdminPath,
} from "./nav.ts";

const allAccess = {
  hasPermission: () => true,
  isSuperAdmin: true,
};

test("Super Admin sees all nav items including Staff", () => {
  const items = filterAdminNav(adminNav, allAccess);
  assert.equal(items.length, adminNav.length);
  assert.ok(items.some((item) => item.href === "/admin/staff"));
});

test("restricted staff filters nav by permissions and hides Staff", () => {
  const items = filterAdminNav(adminNav, {
    isSuperAdmin: false,
    hasPermission: (domain, action) =>
      domain === "catalog" && action === "view",
  });
  const hrefs = items.map((item) => item.href);
  assert.ok(hrefs.includes("/admin"));
  assert.ok(hrefs.includes("/admin/products"));
  assert.ok(hrefs.includes("/admin/inventory"));
  assert.ok(hrefs.includes("/admin/settings"));
  assert.equal(hrefs.includes("/admin/staff"), false);
  assert.equal(hrefs.includes("/admin/orders"), false);
  assert.equal(hrefs.includes("/admin/customers"), false);
});

test("alwaysAccessible items remain for staff with zero permissions", () => {
  const items = filterAdminNav(adminNav, {
    isSuperAdmin: false,
    hasPermission: () => false,
  });
  const hrefs = items.map((item) => item.href);
  assert.deepEqual(hrefs, ["/admin", "/admin/settings"]);
});

test("route guard rules cover nested product and order paths", () => {
  assert.deepEqual(getRouteGuardRule("/admin/products/abc")?.permission, {
    domain: "catalog",
    action: "view",
  });
  assert.deepEqual(getRouteGuardRule("/admin/orders/xyz")?.permission, {
    domain: "orders",
    action: "view",
  });
  assert.deepEqual(getRouteGuardRule("/admin/spin-campaigns/1")?.permission, {
    domain: "promotions",
    action: "view",
  });
  assert.equal(getRouteGuardRule("/admin/staff")?.requiresSuperAdmin, true);
  assert.equal(getRouteGuardRule("/admin")?.alwaysAccessible, true);
  assert.equal(getRouteGuardRule("/admin/products")?.alwaysAccessible, undefined);
});

test("unauthorized prefixes deny staff without matching permission", () => {
  const staff = {
    isSuperAdmin: false,
    hasPermission: (domain: string, action: string) =>
      domain === "cms" && action === "view",
  };
  assert.equal(canAccessAdminPath("/admin", staff), true);
  assert.equal(canAccessAdminPath("/admin/settings", staff), true);
  assert.equal(canAccessAdminPath("/admin/cms", staff), true);
  assert.equal(canAccessAdminPath("/admin/orders", staff), false);
  assert.equal(canAccessAdminPath("/admin/orders/1", staff), false);
  assert.equal(canAccessAdminPath("/admin/brands", staff), false);
  assert.equal(canAccessAdminPath("/admin/staff", staff), false);
  assert.equal(canAccessAdminPath("/admin/staff", { ...staff, isSuperAdmin: true }), true);
});

test("orphan brands route is gated by taxonomy:view even when hidden from nav", () => {
  assert.deepEqual(getRouteGuardRule("/admin/brands")?.permission, {
    domain: "taxonomy",
    action: "view",
  });
  assert.equal(
    adminNav.some((item) => item.href === "/admin/brands"),
    false,
  );
  assert.equal(
    canAccessAdminPath("/admin/brands", {
      isSuperAdmin: false,
      hasPermission: (domain, action) => domain === "taxonomy" && action === "view",
    }),
    true,
  );
});

test("public and always-accessible path helpers", () => {
  assert.equal(isPublicAdminPath("/admin/login"), true);
  assert.equal(isPublicAdminPath("/admin"), false);
  assert.equal(isAlwaysAccessibleAdminPath("/admin"), true);
  assert.equal(isAlwaysAccessibleAdminPath("/admin/settings/profile"), true);
  assert.equal(isAlwaysAccessibleAdminPath("/admin/unauthorized"), true);
  assert.equal(isAlwaysAccessibleAdminPath("/admin/products"), false);
});

test("ADMIN_ROUTE_PERMISSIONS lists staff before generic admin exact rule", () => {
  const staffIdx = ADMIN_ROUTE_PERMISSIONS.findIndex((r) => r.prefix === "/admin/staff");
  const adminExactIdx = ADMIN_ROUTE_PERMISSIONS.findIndex(
    (r) => r.prefix === "/admin" && r.exact,
  );
  assert.ok(staffIdx >= 0);
  assert.ok(adminExactIdx >= 0);
  assert.ok(staffIdx < adminExactIdx);
});
