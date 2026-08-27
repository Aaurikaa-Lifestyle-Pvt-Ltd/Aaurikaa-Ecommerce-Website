import assert from "node:assert/strict";
import test from "node:test";
import {
  formatPermissionKey,
  hasAssignedAdminPermissions,
  hasPermission,
} from "./admin-permissions.ts";

test("formatPermissionKey builds domain:action", () => {
  assert.equal(formatPermissionKey("catalog", "view"), "catalog:view");
  assert.equal(formatPermissionKey("orders", "manage"), "orders:manage");
});

test("Super Admin bypasses permission checks even with empty permissions", () => {
  const superAdmin = { isSuperAdmin: true, permissions: [] as string[] };
  assert.equal(hasPermission(superAdmin, "catalog", "view"), true);
  assert.equal(hasPermission(superAdmin, "orders", "manage"), true);
  assert.equal(hasPermission(superAdmin, "finance", "pay"), true);
  assert.equal(hasAssignedAdminPermissions(superAdmin), true);
});

test("staff permission check requires exact key", () => {
  const staff = {
    isSuperAdmin: false,
    permissions: ["catalog:view", "orders:manage"],
  };
  assert.equal(hasPermission(staff, "catalog", "view"), true);
  assert.equal(hasPermission(staff, "orders", "manage"), true);
  assert.equal(hasPermission(staff, "orders", "view"), false);
  assert.equal(hasPermission(staff, "catalog", "manage"), false);
});

test("manage does not imply view", () => {
  const staff = { isSuperAdmin: false, permissions: ["promotions:manage"] };
  assert.equal(hasPermission(staff, "promotions", "manage"), true);
  assert.equal(hasPermission(staff, "promotions", "view"), false);
});

test("null user and empty staff permissions deny access", () => {
  assert.equal(hasPermission(null, "catalog", "view"), false);
  assert.equal(hasPermission({ permissions: [] }, "catalog", "view"), false);
  assert.equal(hasAssignedAdminPermissions({ permissions: [] }), false);
  assert.equal(hasAssignedAdminPermissions({ isSuperAdmin: false, permissions: ["cms:view"] }), true);
});
