import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { tasks, ZONES, PRIORITIES } from "../../mock-data";

const TASK_STATUSES = [
  "open",
  "assigned",
  "accepted",
  "in_progress",
  "submitted",
  "approved",
  "declined",
  "rejected",
  "canceled",
] as const;

export default defineTool({
  name: "list_tasks",
  title: "List sanitation tasks",
  description:
    "List cleanup tasks in the Polis Systems demo dataset. Optionally filter by zone, status, or priority.",
  inputSchema: {
    zone: z.enum(ZONES as [string, ...string[]]).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(PRIORITIES as [string, ...string[]]).optional(),
    limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ zone, status, priority, limit }) => {
    const filtered = tasks.filter(
      (t) =>
        (!zone || t.zone === zone) &&
        (!status || t.status === status) &&
        (!priority || t.priority === priority),
    );
    const items = filtered.slice(0, limit ?? 50).map((t) => ({
      id: t.id,
      title: t.title,
      location: t.location,
      zone: t.zone,
      status: t.status,
      priority: t.priority,
      hotspotType: t.hotspotType,
      wasteType: t.wasteType,
      estimatedWasteKg: t.estimatedWasteKg,
      assignee: t.assignee,
      dueAt: t.dueAt,
      createdAt: t.createdAt,
    }));
    return {
      content: [
        {
          type: "text",
          text: `Returning ${items.length} of ${filtered.length} matching tasks (dataset total: ${tasks.length}).`,
        },
      ],
      structuredContent: { total: tasks.length, matched: filtered.length, items },
    };
  },
});
