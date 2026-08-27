import assert from "node:assert/strict";
import test from "node:test";
import { ApiError, kindFromStatus, isInvalidSessionStatus } from "./errors.ts";

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

test("revoked and deactivated 403 messages clear session; Access denied does not", () => {
  assert.equal(
    isInvalidSessionStatus(403, "Session has been revoked. Please login again."),
    true,
  );
  assert.equal(isInvalidSessionStatus(403, "Admin account is deactivated"), true);
  assert.equal(isInvalidSessionStatus(403, "Access denied. Insufficient permissions"), false);
  assert.equal(isInvalidSessionStatus(403, "Access denied"), false);
});

test("ApiError.isUnauthorized checks body details for revoked sessions", () => {
  const revoked = new ApiError("You do not have permission to do that.", 403, "forbidden", {
    details: { message: "Session has been revoked. Please login again." },
  });
  assert.equal(revoked.isUnauthorized, true);

  const rbac = new ApiError("You do not have permission to do that.", 403, "forbidden", {
    details: { message: "Access denied. Insufficient permissions" },
  });
  assert.equal(rbac.isUnauthorized, false);
});
