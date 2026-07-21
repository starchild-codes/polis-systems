import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  buildOrganizationActorNameMap,
  formatTaskEventMessage,
  organizationActorKey,
} from "../../src/lib/actor-presentation.js";
import {
  ORGANIZATION_MEMBER_LABEL,
  getDisplayActorName,
  getUserFacingError,
  isUuidLike,
} from "../../src/lib/safe-display.js";

const root = new URL("../../", import.meta.url);
const exposedUuid = "895f432f-1194-4b63-87b5-9dcf2e69b7c0";

describe("user-facing identifier safety", () => {
  it("uses a resolved task creator name and never the raw creator UUID", () => {
    const names = buildOrganizationActorNameMap(
      [{ organizationId: "org-a", actorId: exposedUuid }],
      [{ organization_id: "org-a", user_id: exposedUuid, is_active: true }],
      [{ id: exposedUuid, full_name: "Anshima Srivastava" }],
    );
    const actorName = names.get(organizationActorKey("org-a", exposedUuid)) ?? null;
    const message = formatTaskEventMessage({
      eventType: "created",
      actorType: "admin",
      actorName,
      metadata: { message: `Created by ${exposedUuid}` },
    });
    assert.equal(message, "Created by Anshima Srivastava");
    assert.doesNotMatch(message, new RegExp(exposedUuid, "u"));
  });

  it("uses Organization member when a creator cannot be resolved", () => {
    const message = formatTaskEventMessage({
      eventType: "created",
      actorType: "operator",
      actorName: null,
      metadata: {},
    });
    assert.equal(message, `Created by ${ORGANIZATION_MEMBER_LABEL}`);
  });

  it("renders assignment, approval, and rejection with human names", () => {
    assert.equal(formatTaskEventMessage({
      eventType: "assigned",
      actorType: "operator",
      actorName: "Anshima Srivastava",
      metadata: { message: "Assigned to Yashika Shankar" },
    }), "Assigned to Yashika Shankar");
    assert.equal(formatTaskEventMessage({
      eventType: "submission_approved",
      actorType: "admin",
      actorName: "Anshima Srivastava",
      metadata: {},
    }), "Approved by Anshima Srivastava");
    assert.equal(formatTaskEventMessage({
      eventType: "submission_rejected",
      actorType: "admin",
      actorName: "Anshima Srivastava",
      metadata: { rejection_reason: "Before photo is unclear" },
    }), "Rejected by Anshima Srivastava — Before photo is unclear");
  });

  it("rejects UUID-like names and never produces null or undefined labels", () => {
    assert.equal(isUuidLike(exposedUuid), true);
    assert.equal(getDisplayActorName(exposedUuid), ORGANIZATION_MEMBER_LABEL);
    assert.equal(getDisplayActorName({ fullName: exposedUuid }), ORGANIZATION_MEMBER_LABEL);
    assert.equal(getDisplayActorName(null), ORGANIZATION_MEMBER_LABEL);
    assert.equal(getDisplayActorName(undefined), ORGANIZATION_MEMBER_LABEL);
  });

  it("does not resolve a profile through a different or inactive organization", () => {
    const names = buildOrganizationActorNameMap(
      [{ organizationId: "org-a", actorId: exposedUuid }],
      [
        { organization_id: "org-b", user_id: exposedUuid, is_active: true },
        { organization_id: "org-a", user_id: "inactive-user", is_active: false },
      ],
      [
        { id: exposedUuid, full_name: "Other Organization Member" },
        { id: "inactive-user", full_name: "Inactive Member" },
      ],
    );
    assert.equal(names.size, 0);
  });

  it("sanitizes permission, UUID, SQL, and schema error details", () => {
    const permission = getUserFacingError(new Error(`Permission denied for user ${exposedUuid}`));
    assert.equal(permission, "You do not have permission to perform this action.");
    assert.doesNotMatch(permission, new RegExp(exposedUuid, "u"));
    assert.equal(
      getUserFacingError(new Error("relation public.tasks does not exist"), "The action failed."),
      "The action failed.",
    );
    assert.equal(
      getUserFacingError(new Error("Database error saving new user"), "Account creation failed."),
      "Account creation failed.",
    );
  });

  it("keeps record IDs internal across task, collector, Review, and export UI", async () => {
    const taskDrawer = await readFile(new URL("src/components/tasks/task-detail-drawer.tsx", root), "utf8");
    const legacyReviewDrawer = await readFile(new URL("src/components/review/submission-detail-drawer.tsx", root), "utf8");
    const collectors = await readFile(new URL("src/routes/collectors.tsx", root), "utf8");
    const review = await readFile(new URL("src/routes/review.tsx", root), "utf8");
    const csv = await readFile(new URL("src/lib/csv.ts", root), "utf8");

    assert.doesNotMatch(taskDrawer, /<SheetDescription[^>]*>\s*\{task\.id\}/u);
    assert.doesNotMatch(legacyReviewDrawer, /\{submission\.id\}[\s\S]*?\{task\?\.id/u);
    assert.doesNotMatch(collectors, /font-mono[^>]*>\{(?:c|collector)\.id\}/u);
    assert.doesNotMatch(review, /submissions\.rejection_reason|task_events\.metadata/u);
    assert.match(review, /getDisplayActorName\(submission\.reviewerName\)/u);
    assert.doesNotMatch(csv, /"Task ID"|"Submission ID"/u);
  });

  it("preserves task event ordering, timestamps, and responsive detail layout", async () => {
    const data = await readFile(new URL("src/lib/supabase-data.ts", root), "utf8");
    const drawer = await readFile(new URL("src/components/tasks/task-detail-drawer.tsx", root), "utf8");
    assert.match(data, /timestamp:\s*formatDbTimestamp\(row\.created_at\)/u);
    assert.match(data, /order\("created_at",\s*\{ ascending: true \}\)/u);
    assert.match(drawer, /w-full overflow-y-auto sm:max-w-lg/u);
    assert.match(drawer, /break-words text-foreground/u);
    assert.match(drawer, /getDisplayActorName\(task\.createdBy\)/u);
  });

  it("contains no regression UUID in frontend source", async () => {
    const frontendFiles = [
      "src/components/tasks/task-detail-drawer.tsx",
      "src/components/review/submission-detail-drawer.tsx",
      "src/routes/collectors.tsx",
      "src/routes/review.tsx",
      "src/lib/safe-display.ts",
      "src/lib/actor-presentation.ts",
    ];
    for (const file of frontendFiles) {
      const source = await readFile(new URL(file, root), "utf8");
      assert.doesNotMatch(source, new RegExp(exposedUuid, "u"), file);
    }
  });
});
