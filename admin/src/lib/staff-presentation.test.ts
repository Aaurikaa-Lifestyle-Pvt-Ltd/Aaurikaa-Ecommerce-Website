import assert from "node:assert/strict";
import test from "node:test";
import type { PermissionDomain, StaffUser } from "./staff-catalog.ts";
import {
  mergePreservedHiddenPermissions,
  staffIsActive,
  staffRoleLabel,
  summarizeStaffAccess,
  visibleStaffPermissionKeys,
} from "./staff-presentation.ts";

const catalog: PermissionDomain[] = [
  {
    id: "catalog",
    label: "Catalog (Products)",
    actions: [
      { id: "view", label: "View" },
      { id: "manage", label: "Manage" },
    ],
  },
  {
    id: "orders",
    label: "Orders",
    actions: [
      { id: "view", label: "View" },
      { id: "manage", label: "Manage" },
    ],
  },
  {
    id: "cms",
    label: "CMS Pages",
    actions: [
      { id: "view", label: "View" },
      { id: "manage", label: "Manage" },
    ],
  },
];

test("staffRoleLabel prefers Super Admin, then displayLabel, then Staff", () => {
  assert.equal(staffRoleLabel({ id: "1", name: "A", email: "a@x", isSuperAdmin: true }), "Super Admin");
  assert.equal(
    staffRoleLabel({ id: "2", name: "B", email: "b@x", displayLabel: "Catalog Manager" }),
    "Catalog Manager",
  );
  assert.equal(staffRoleLabel({ id: "3", name: "C", email: "c@x" }), "Staff");
});

test("staffIsActive treats missing isActive as active", () => {
  assert.equal(staffIsActive({ id: "1", name: "A", email: "a@x" }), true);
  assert.equal(staffIsActive({ id: "2", name: "B", email: "b@x", isActive: true }), true);
  assert.equal(staffIsActive({ id: "3", name: "C", email: "c@x", isActive: false }), false);
});

test("visibleStaffPermissionKeys hides marketplace domains", () => {
  assert.deepEqual(
    visibleStaffPermissionKeys([
      "catalog:view",
      "sellers:view",
      "finance:pay",
      "orders:manage",
    ]),
    ["catalog:view", "orders:manage"],
  );
});

test("summarizeStaffAccess uses human-readable catalog labels", () => {
  const user: StaffUser = {
    id: "1",
    name: "Staff",
    email: "s@x",
    permissions: ["catalog:view", "catalog:manage", "orders:view", "sellers:approve"],
  };
  const summary = summarizeStaffAccess(user, catalog, { maxDomains: 4 });
  assert.equal(summary.kind, "domains");
  assert.deepEqual(summary.lines, [
    "Catalog (Products): View, Manage",
    "Orders: View",
  ]);
  assert.equal(summary.remainingDomains, 0);
});

test("summarizeStaffAccess marks Super Admin as full access", () => {
  const summary = summarizeStaffAccess(
    { id: "1", name: "Root", email: "r@x", isSuperAdmin: true, permissions: [] },
    catalog,
  );
  assert.equal(summary.kind, "full");
});

test("mergePreservedHiddenPermissions keeps marketplace keys on save", () => {
  assert.deepEqual(
    mergePreservedHiddenPermissions(
      ["catalog:view", "orders:manage"],
      ["catalog:view", "sellers:approve", "finance:view", "cms:view"],
    ),
    ["catalog:view", "orders:manage", "sellers:approve", "finance:view"],
  );
});
