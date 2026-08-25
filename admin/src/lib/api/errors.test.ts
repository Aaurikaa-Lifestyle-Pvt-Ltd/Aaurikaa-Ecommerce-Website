import assert from "node:assert/strict";
import test from "node:test";
import { kindFromStatus, isInvalidSessionStatus } from "./errors.ts";

test("maps HTTP statuses used by admin requests", () => {
  assert.equal(kindFromStatus(401), "unauthorized");
  assert.equal(kindFromStatus(403), "forbidden");
  assert.equal(kindFromStatus(409), "conflict");
  assert.equal(kindFromStatus(429), "rate_limited");
});

test("invalid JWT is treated as expired session; RBAC 403 is not", () => {
  assert.equal(isInvalidSessionStatus(403, "Invalid token"), true);
  assert.equal(isInvalidSessionStatus(403, "Access denied. Admin role required."), false);
});
