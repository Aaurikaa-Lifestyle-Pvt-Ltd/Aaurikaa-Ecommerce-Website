import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
  __resetToastStoreForTests,
  clearToasts,
  dismissToast,
  getToasts,
  pushToast,
  toast,
  TOAST_DURATIONS,
  TOAST_MAX_VISIBLE,
} from "./toast-store.ts";

describe("toast-store", () => {
  beforeEach(() => {
    __resetToastStoreForTests();
  });

  it("pushes success/error/warning/info with default durations", () => {
    toast.success("Saved");
    toast.error("Failed");
    toast.warning("Check this");
    toast.info("Started");

    const items = getToasts();
    assert.equal(items.length, 4);
    assert.equal(items[0].type, "success");
    assert.equal(items[0].duration, TOAST_DURATIONS.success);
    assert.equal(items[1].type, "error");
    assert.equal(items[1].duration, TOAST_DURATIONS.error);
    assert.equal(items[2].type, "warning");
    assert.equal(items[2].duration, TOAST_DURATIONS.warning);
    assert.equal(items[3].type, "info");
    assert.equal(items[3].duration, TOAST_DURATIONS.info);
  });

  it("supports toast({ type, message, duration })", () => {
    toast({ type: "success", message: "Custom", duration: 1200 });
    const [item] = getToasts();
    assert.equal(item.message, "Custom");
    assert.equal(item.duration, 1200);
  });

  it("dismisses a toast by id", () => {
    const id = toast.success("One");
    toast.error("Two");
    dismissToast(id);
    const items = getToasts();
    assert.equal(items.length, 1);
    assert.equal(items[0].message, "Two");
  });

  it("clears all toasts", () => {
    toast.success("A");
    toast.error("B");
    clearToasts();
    assert.equal(getToasts().length, 0);
  });

  it("caps visible toasts at TOAST_MAX_VISIBLE", () => {
    for (let i = 0; i < TOAST_MAX_VISIBLE + 3; i += 1) {
      toast.info(`Message ${i}`);
    }
    const items = getToasts();
    assert.equal(items.length, TOAST_MAX_VISIBLE);
    assert.equal(items[0].message, `Message 3`);
    assert.equal(items[items.length - 1].message, `Message ${TOAST_MAX_VISIBLE + 2}`);
  });

  it("deduplicates identical back-to-back toasts", () => {
    const a = toast.success("Same");
    const b = toast.success("Same");
    assert.equal(a, b);
    assert.equal(getToasts().length, 1);
  });

  it("ignores empty messages", () => {
    const id = pushToast({ message: "   " });
    assert.equal(id, "");
    assert.equal(getToasts().length, 0);
  });
});
