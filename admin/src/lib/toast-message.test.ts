import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "./api/errors.ts";
import { toastMessageFromUnknown } from "./toast-message.ts";

describe("toastMessageFromUnknown", () => {
  it("uses ApiError message when present", () => {
    const err = new ApiError("You do not have permission to do that.", 403, "forbidden");
    assert.equal(
      toastMessageFromUnknown(err, "fallback"),
      "You do not have permission to do that.",
    );
  });

  it("falls back for raw technical Error messages", () => {
    assert.equal(
      toastMessageFromUnknown(new Error("AxiosError: Request failed with status code 500")),
      "Something went wrong. Please try again.",
    );
    assert.equal(
      toastMessageFromUnknown(new Error("MongoServerError: E11000 duplicate key error")),
      "Something went wrong. Please try again.",
    );
  });

  it("keeps concise non-technical Error messages", () => {
    assert.equal(
      toastMessageFromUnknown(new Error("Unable to save product."), "fallback"),
      "Unable to save product.",
    );
  });

  it("uses custom fallback for unknown values", () => {
    assert.equal(toastMessageFromUnknown(null, "Unable to delete."), "Unable to delete.");
  });
});
