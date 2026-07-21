import { defineMcp } from "@lovable.dev/mcp-js";
import listCollectorsTool from "./tools/list-collectors";
import listTasksTool from "./tools/list-tasks";
import operationsSummaryTool from "./tools/operations-summary";

export default defineMcp({
  name: "polis-systems-mcp",
  title: "Polis Systems MCP",
  version: "0.1.0",
  instructions:
    "Read-only tools that expose the Polis Systems sanitation operations demo dataset (Florida pilot): collectors, cleanup tasks, and top-level operational KPIs. Use `get_operations_summary` first for an overview, then `list_tasks` or `list_collectors` to drill in with optional zone/status/priority filters.",
  tools: [operationsSummaryTool, listTasksTool, listCollectorsTool],
});
