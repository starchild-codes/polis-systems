import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { statusAfterCollectorChange } from "../../src/lib/task-assignment-state.js";

describe("task collector assignment state", () => {
  it("starts a fresh assigned lifecycle whenever the collector changes", () => {
    for (const status of [undefined, "open", "assigned", "accepted", "in_progress", "declined", "rejected"]) {
      assert.equal(statusAfterCollectorChange(status), "assigned");
    }
  });

  it("does not reopen submitted, approved, or canceled tasks", () => {
    for (const status of ["submitted", "approved", "canceled"]) {
      assert.throws(
        () => statusAfterCollectorChange(status),
        /can no longer be assigned/iu,
      );
    }
  });
});
