import assert from "node:assert/strict";
import test from "node:test";
import {
  filterStaffRoleSuggestions,
  isHiddenStaffPermissionKey,
  shapePermissionCatalogForAaurikaa,
} from "../staff-catalog.ts";

test("hides sellers and finance permission keys from Staff UI", () => {
  assert.equal(isHiddenStaffPermissionKey("sellers:view"), true);
  assert.equal(isHiddenStaffPermissionKey("sellers:approve"), true);
  assert.equal(isHiddenStaffPermissionKey("finance:pay"), true);
  assert.equal(isHiddenStaffPermissionKey("catalog:view"), false);
  assert.equal(isHiddenStaffPermissionKey("orders:manage"), false);
  assert.equal(isHiddenStaffPermissionKey("cms:view"), false);
});

test("shapePermissionCatalogForAaurikaa drops marketplace domains and empty groups", () => {
  const shaped = shapePermissionCatalogForAaurikaa({
    catalog: [
      { id: "catalog", label: "Catalog (Products)", actions: [{ id: "view", label: "View" }] },
      { id: "sellers", label: "Sellers", actions: [{ id: "view", label: "View" }] },
      { id: "finance", label: "Finance (Payouts, Commissions)", actions: [{ id: "pay", label: "Pay" }] },
      { id: "shoppers", label: "Shoppers", actions: [{ id: "view", label: "View" }] },
      { id: "cms", label: "CMS Pages", actions: [{ id: "manage", label: "Manage" }] },
    ],
    groups: [
      { id: "commerce", label: "Commerce", domains: ["catalog"] },
      { id: "users", label: "Users & Vendors", domains: ["shoppers", "sellers"] },
      { id: "finance", label: "Finance", domains: ["finance"] },
      { id: "content", label: "Content & Storefront", domains: ["cms"] },
    ],
    suggestedDisplayLabels: [
      "Catalog Manager",
      "Finance Staff",
      "Support Staff",
      "Seller Ops",
    ],
  });

  assert.deepEqual(
    shaped.catalog.map((d) => d.id),
    ["catalog", "shoppers", "cms"],
  );
  assert.deepEqual(
    shaped.groups.map((g) => ({ id: g.id, label: g.label, domains: g.domains })),
    [
      { id: "commerce", label: "Commerce", domains: ["catalog"] },
      { id: "users", label: "Customers", domains: ["shoppers"] },
      { id: "content", label: "Content & Storefront", domains: ["cms"] },
    ],
  );
  assert.deepEqual(shaped.suggestedDisplayLabels, ["Catalog Manager", "Support Staff"]);
});

test("filterStaffRoleSuggestions removes marketplace wording", () => {
  assert.deepEqual(
    filterStaffRoleSuggestions(["Editor", "Finance Staff", "Payout Reviewer", "Content Moderator"]),
    ["Editor", "Content Moderator"],
  );
});
