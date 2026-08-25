import assert from "node:assert/strict";
import test from "node:test";
import {
  isDraftProductStatus,
  isPublishedProductStatus,
  productLifecycleLabel,
  requireWeightClassForPublish,
  resolveLifecycleWriteStatus,
} from "./product-lifecycle.ts";

test("productLifecycleLabel keeps Published label", () => {
  assert.equal(productLifecycleLabel("Published"), "Published");
  assert.equal(productLifecycleLabel("Draft"), "Draft");
  assert.equal(productLifecycleLabel("Trash"), "Trash");
});

test("resolveLifecycleWriteStatus save keeps published", () => {
  assert.equal(resolveLifecycleWriteStatus("Published", "save"), "published");
  assert.equal(resolveLifecycleWriteStatus("Draft", "save"), "draft");
  assert.equal(resolveLifecycleWriteStatus("Inactive", "save"), "draft");
});

test("resolveLifecycleWriteStatus publish and unpublish", () => {
  assert.equal(resolveLifecycleWriteStatus("Draft", "publish"), "published");
  assert.equal(resolveLifecycleWriteStatus("Published", "unpublish"), "draft");
});

test("requireWeightClassForPublish gates empty slab", () => {
  assert.match(requireWeightClassForPublish("") ?? "", /shipping slab/);
  assert.equal(requireWeightClassForPublish("64b000000000000000000011"), null);
});

test("draft / published status helpers", () => {
  assert.equal(isDraftProductStatus("Draft"), true);
  assert.equal(isPublishedProductStatus("Published"), true);
  assert.equal(isPublishedProductStatus("Draft"), false);
});
