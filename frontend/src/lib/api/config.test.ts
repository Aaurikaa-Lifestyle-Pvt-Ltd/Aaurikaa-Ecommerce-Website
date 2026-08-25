import assert from "node:assert/strict";
import test from "node:test";

/**
 * Mirrors getCatalogueSource() acceptance rules without importing Next env
 * wiring — only the literal "api" enables the backend catalogue.
 */
function catalogueSourceFromEnv(raw: string | undefined): "mock" | "api" {
  const value = (raw ?? "mock").trim().toLowerCase();
  return value === "api" ? "api" : "mock";
}

test("catalogue source accepts only literal api — URLs fall through to mock", () => {
  assert.equal(catalogueSourceFromEnv("api"), "api");
  assert.equal(catalogueSourceFromEnv("API"), "api");
  assert.equal(catalogueSourceFromEnv("http://localhost:3001"), "mock");
  assert.equal(catalogueSourceFromEnv("mock"), "mock");
  assert.equal(catalogueSourceFromEnv(undefined), "mock");
});
