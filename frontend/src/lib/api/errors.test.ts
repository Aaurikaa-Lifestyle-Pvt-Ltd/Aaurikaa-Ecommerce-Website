import assert from "node:assert/strict";
import test from "node:test";
import {
  kindFromStatus,
  isInvalidSessionStatus,
  messageFromBody,
  userMessageForKind,
} from "./errors.ts";

test("maps HTTP statuses to API error kinds", () => {
  assert.equal(kindFromStatus(400), "validation");
  assert.equal(kindFromStatus(401), "unauthorized");
  assert.equal(kindFromStatus(403), "forbidden");
  assert.equal(kindFromStatus(404), "not_found");
  assert.equal(kindFromStatus(409), "conflict");
  assert.equal(kindFromStatus(429), "rate_limited");
  assert.equal(kindFromStatus(500), "server");
});

test("treats missing/invalid tokens as session expiry", () => {
  assert.equal(isInvalidSessionStatus(401, "anything"), true);
  assert.equal(isInvalidSessionStatus(403, "Invalid token"), true);
  assert.equal(isInvalidSessionStatus(403, "No token provided"), true);
  assert.equal(isInvalidSessionStatus(403, "Access denied. Admin role required."), false);
});

test("strips backend emoji prefixes from messages", () => {
  assert.equal(messageFromBody({ message: "❌ Invalid credentials" }, "x"), "Invalid credentials");
});

test("401/403 user copy does not invent bypass guidance", () => {
  assert.match(userMessageForKind("unauthorized", ""), /session/i);
  assert.match(userMessageForKind("forbidden", ""), /permission/i);
});
