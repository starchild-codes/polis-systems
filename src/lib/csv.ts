import type {
  Task,
  Submission,
  Collector,
  TaskStatus,
  Zone,
  WasteType,
  HotspotType,
} from "@/lib/mock-data";

// RFC-4180-compliant CSV escaping: wrap any field containing a comma, double-quote,
// newline, or carriage return in double quotes, and double any embedded double quotes.
function escapeCsvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

export interface TaskCsvRow {
  task: Task;
  collector?: Collector;
  submission?: Submission;
}

const CSV_HEADERS = [
  "Title",
  "Description",
  "Status",
  "Priority",
  "Zone",
  "Location",
  "Hotspot Type",
  "Waste Type",
  "Estimated Waste (kg)",
  "Assignee",
  "Collector Phone",
  "Collector Type",
  "Collector Organization",
  "Created At",
  "Updated At",
  "Due At",
  "Submitted At",
  "Submission Status",
  "Quantity (kg)",
  "Reviewer",
  "Reviewed At",
  "Rejection Reason",
  "Rejection Note",
];

export function tasksToCsv(rows: TaskCsvRow[]): string {
  const data = rows.map((r) => {
    const t = r.task;
    const c = r.collector;
    const s = r.submission;
    return [
      t.title,
      t.description,
      t.status,
      t.priority,
      t.zone,
      t.location,
      t.hotspotType,
      t.wasteType,
      t.estimatedWasteKg,
      t.assignee ?? "",
      c?.phone ?? "",
      c?.collectorType ?? "",
      c?.organization ?? "",
      t.createdAt,
      t.updatedAt,
      t.dueAt,
      s?.submittedAt ?? "",
      s?.status ?? "",
      s?.quantityKg ?? "",
      s?.reviewer ?? "",
      s?.decidedAt ?? "",
      s?.rejectionReason ?? "",
      s?.rejectionNote ?? "",
    ];
  });
  return toCsv([CSV_HEADERS, ...data]);
}

export type DateRange = { from: string | null; to: string | null };

export interface ReportFilters {
  dateRange: DateRange;
  zone: Zone | "all";
  collector: string | "all";
  status: TaskStatus | "all";
  hotspotType: HotspotType | "all";
  wasteType: WasteType | "all";
}

export function filterTasks(
  tasks: Task[],
  filters: ReportFilters,
  collectors: Collector[],
): Task[] {
  return tasks.filter((t) => {
    if (filters.zone !== "all" && t.zone !== filters.zone) return false;
    if (filters.collector !== "all" && t.assignee !== filters.collector) return false;
    if (filters.status !== "all" && t.status !== filters.status) return false;
    if (filters.hotspotType !== "all" && t.hotspotType !== filters.hotspotType) return false;
    if (filters.wasteType !== "all" && t.wasteType !== filters.wasteType) return false;
    if (filters.dateRange.from || filters.dateRange.to) {
      const taskDate = t.createdAt.slice(0, 10);
      if (filters.dateRange.from && taskDate < filters.dateRange.from) return false;
      if (filters.dateRange.to && taskDate > filters.dateRange.to) return false;
    }
    return true;
  });
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
