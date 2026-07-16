import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import {
  collectors,
  computeCollectorCounts,
  ZONES,
  COLLECTOR_STATUSES,
} from "../../mock-data";

export default defineTool({
  name: "list_collectors",
  title: "List collectors",
  description:
    "List collectors in the Polis Systems demo dataset (name, phone, zone, status, type, organisation). Optionally filter by zone or status.",
  inputSchema: {
    zone: z
      .enum(ZONES as [string, ...string[]])
      .optional()
      .describe("Filter to one operational zone."),
    status: z
      .enum(COLLECTOR_STATUSES as [string, ...string[]])
      .optional()
      .describe("Filter by account status."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Maximum number of collectors to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ zone, status, limit }) => {
    const filtered = collectors.filter(
      (c) => (!zone || c.zone === zone) && (!status || c.status === status),
    );
    const items = filtered.slice(0, limit ?? 50).map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      zone: c.zone,
      status: c.status,
      collectorType: c.collectorType,
      organization: c.organization,
      preferredLanguage: c.preferredLanguage,
      registeredAt: c.registeredAt,
      lastActiveAt: c.lastActiveAt,
    }));
    const counts = computeCollectorCounts();
    return {
      content: [
        {
          type: "text",
          text: `Returning ${items.length} of ${filtered.length} matching collectors (dataset total: ${counts.total}).`,
        },
      ],
      structuredContent: { counts, items },
    };
  },
});
