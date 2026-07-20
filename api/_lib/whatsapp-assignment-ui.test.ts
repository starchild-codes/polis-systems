import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const drawerPath = new URL("../../src/components/tasks/task-detail-drawer.tsx", import.meta.url);
const tasksRoutePath = new URL("../../src/routes/tasks.tsx", import.meta.url);

describe("WhatsApp assignment dashboard action", () => {
  it("lets assigned tasks reach the authoritative server validation", async () => {
    const drawer = await readFile(drawerPath, "utf8");

    assert.match(drawer, /task\.status === "assigned"/u);
    assert.match(drawer, /disabled=\{whatsappSending\}/u);
    assert.doesNotMatch(drawer, /disabled=\{!canSendWhatsApp/u);
  });

  it("uses all collectors for details and filters only the assignment picker", async () => {
    const [drawer, tasksRoute] = await Promise.all([
      readFile(drawerPath, "utf8"),
      readFile(tasksRoutePath, "utf8"),
    ]);

    assert.match(tasksRoute, /collectors=\{collectors\}/u);
    assert.match(drawer, /const assignableCollectors = computeAssignableCollectors\(collectors\)/u);
  });
});
