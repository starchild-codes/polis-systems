import { defineTool } from "@lovable.dev/mcp-js";
import {
  computeOpenTasksCount,
  computeAwaitingReviewCount,
  computeApprovedTasksCount,
  computeOverdueTasksCount,
  computeCompletionRate,
  computeAcceptanceRate,
  computeEstimatedWasteCollectedKg,
  computeCollectorCounts,
  computeTaskStatusBreakdown,
  computeSubmissionCounts,
  computeAverageReviewMinutes,
} from "../../mock-data";

export default defineTool({
  name: "get_operations_summary",
  title: "Operations summary",
  description:
    "Return top-level Polis Systems operational KPIs from the demo dataset: task counts by status, collector counts, waste collected, completion/acceptance rates, and submission review stats.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: () => {
    const summary = {
      tasks: {
        open: computeOpenTasksCount(),
        awaitingReview: computeAwaitingReviewCount(),
        approved: computeApprovedTasksCount(),
        overdue: computeOverdueTasksCount(),
        statusBreakdown: computeTaskStatusBreakdown(),
      },
      collectors: computeCollectorCounts(),
      submissions: {
        counts: computeSubmissionCounts(),
        averageReviewMinutes: computeAverageReviewMinutes(),
      },
      rates: {
        completionRatePct: computeCompletionRate(),
        acceptanceRatePct: computeAcceptanceRate(),
      },
      estimatedWasteCollectedKg: computeEstimatedWasteCollectedKg(),
    };
    return {
      content: [
        {
          type: "text",
          text: `Open ${summary.tasks.open} · Awaiting review ${summary.tasks.awaitingReview} · Approved ${summary.tasks.approved} · Active collectors ${summary.collectors.active}/${summary.collectors.total}.`,
        },
      ],
      structuredContent: summary,
    };
  },
});
