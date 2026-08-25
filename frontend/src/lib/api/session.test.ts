import assert from "node:assert/strict";
import test from "node:test";
import {
  clearShopperSession,
  getShopperToken,
  getShopperUser,
  setShopperSession,
  SHOPPER_STORAGE_KEYS,
} from "./token-store.ts";
import { isInvalidSessionStatus } from "./errors.ts";

function installMemoryStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
    removeItem(key: string) {
      store.delete(key);
    },
  };
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: localStorage, configurable: true });
  return store;
}

test("shopper login session persists token and user, logout clears both", () => {
  installMemoryStorage();
  setShopperSession("jwt-token", {
    id: "shopper-1",
    firstName: "Asha",
    lastName: "Rao",
    username: "asha",
    email: "asha@example.com",
    phone: "9876543210",
  });
  assert.equal(getShopperToken(), "jwt-token");
  assert.equal(getShopperUser()?.email, "asha@example.com");
  assert.equal(SHOPPER_STORAGE_KEYS.token, "aaurikaa.shopper.token");
  clearShopperSession();
  assert.equal(getShopperToken(), null);
  assert.equal(getShopperUser(), null);
});

test("guest OTP completion is represented as a normal shopper JWT session", () => {
  installMemoryStorage();
  setShopperSession("otp-session-jwt", {
    id: "shopper-2",
    firstName: "Guest",
    lastName: "Shopper",
    username: "guestshopper",
    email: "guest@example.com",
    phone: "9123456789",
  });
  assert.equal(getShopperToken(), "otp-session-jwt");
  assert.equal(getShopperUser()?.phone, "9123456789");
});

test("expired or invalid authentication is treated as session expiry", () => {
  assert.equal(isInvalidSessionStatus(401, "jwt expired"), true);
  assert.equal(isInvalidSessionStatus(403, "Invalid token"), true);
  assert.equal(isInvalidSessionStatus(403, "Access denied"), false);
});
