import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  Collector,
  Submission,
  Task,
  TaskStatus,
} from "@/lib/mock-data";
import type { ReportFilters } from "@/lib/csv";
import { getCollectorLanguageLabel } from "@/lib/collector-languages";

type OperationsPdfInput = {
  tasks: Task[];
  collectors: Collector[];
  submissions: Submission[];
  filters: ReportFilters;
};

const statusLabels: Record<TaskStatus, string> = {
  open: "Draft",
  assigned: "Assigned",
  accepted: "Accepted",
  in_progress: "In Progress",
  submitted: "Awaiting Review",
  approved: "Approved",
  declined: "Declined",
  rejected: "Rejected",
  canceled: "Canceled",
};

function formatFilter(value: string | null, fallback: string) {
  return value && value !== "all" ? value : fallback;
}

function filterSummary(filters: ReportFilters) {
  const values = [
    `Date: ${filters.dateRange.from ?? "Any"} - ${filters.dateRange.to ?? "Any"}`,
    `Zone: ${formatFilter(filters.zone, "All zones")}`,
    `Collector: ${formatFilter(filters.collector, "All collectors")}`,
    `Status: ${formatFilter(filters.status, "All statuses")}`,
    `Hotspot: ${formatFilter(filters.hotspotType, "All hotspots")}`,
    `Waste: ${formatFilter(filters.wasteType, "All waste types")}`,
  ];
  return values.join("  |  ");
}

function finalTableY(doc: jsPDF) {
  return (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
}

function addPageFooter(doc: jsPDF) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(221, 231, 239);
    doc.line(14, 287, 196, 287);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Polis Systems - Operations Platform", 14, 292);
    doc.text(`Page ${page} of ${pageCount}`, 196, 292, { align: "right" });
  }
}

export function downloadOperationsPdf({ tasks, collectors, submissions, filters }: OperationsPdfInput) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const matchingSubmissions = submissions.filter((submission) => tasks.some((task) => task.id === submission.taskId));
  const activeCollectors = new Set(
    tasks.map((task) => task.assignee).filter(Boolean),
  ).size;
  const awaitingReview = tasks.filter((task) => task.status === "submitted").length;
  const approvedTasks = tasks.filter((task) => task.status === "approved").length;
  const estimatedKg = tasks.reduce((total, task) => total + task.estimatedWasteKg, 0);
  const generatedAt = new Date().toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });

  doc.setFillColor(21, 121, 181);
  doc.rect(0, 0, 210, 31, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("POLIS SYSTEMS", 14, 15);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text("Operational Report", 14, 22);
  doc.setFontSize(8);
  doc.text(`Generated ${generatedAt}`, 196, 22, { align: "right" });

  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Applied filters", 14, 41);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  const filterLines = doc.splitTextToSize(filterSummary(filters), 182);
  doc.text(filterLines, 14, 47);

  const cardsY = 56 + (filterLines.length - 1) * 4;
  const cards = [
    ["Tasks", String(tasks.length)],
    ["Awaiting review", String(awaitingReview)],
    ["Approved", String(approvedTasks)],
    ["Active collectors", String(activeCollectors)],
    ["Estimated waste", `${estimatedKg.toLocaleString()} kg`],
  ];
  cards.forEach(([label, value], index) => {
    const x = 14 + index * 36.4;
    doc.setFillColor(244, 249, 252);
    doc.roundedRect(x, cardsY, 33, 19, 2, 2, "F");
    doc.setTextColor(21, 121, 181);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(value, x + 3, cardsY + 8);
    doc.setTextColor(71, 85, 105);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.text(label.toUpperCase(), x + 3, cardsY + 14);
  });

  let cursorY = cardsY + 29;
  const statusRows = Object.entries(statusLabels)
    .map(([status, label]) => [label, String(tasks.filter((task) => task.status === status).length)])
    .filter(([, count]) => count !== "0");
  const zones = [...new Set(tasks.map((task) => task.zone))].sort();
  const zoneRows = zones.map((zone) => {
    const zoneTasks = tasks.filter((task) => task.zone === zone);
    return [zone, String(zoneTasks.length), String(zoneTasks.filter((task) => task.status === "approved").length)];
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("Operational breakdown", 14, cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    head: [["Status", "Tasks"]],
    body: statusRows.length ? statusRows : [["No tasks", "0"]],
    theme: "grid",
    margin: { left: 14, right: 108 },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85], lineColor: [221, 231, 239] },
    headStyles: { fillColor: [21, 121, 181], textColor: 255, fontStyle: "bold" },
  });
  autoTable(doc, {
    startY: cursorY + 4,
    head: [["Zone", "Tasks", "Approved"]],
    body: zoneRows.length ? zoneRows : [["No tasks", "0", "0"]],
    theme: "grid",
    margin: { left: 108, right: 14 },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85], lineColor: [221, 231, 239] },
    headStyles: { fillColor: [21, 121, 181], textColor: 255, fontStyle: "bold" },
  });
  cursorY = Math.max(finalTableY(doc), cursorY + 4) + 12;

  if (cursorY > 260) {
    doc.addPage();
    cursorY = 20;
  }

  const collectorRows = collectors
    .filter((collector) => tasks.some((task) => task.assignee === collector.name))
    .map((collector) => {
      const collectorTasks = tasks.filter((task) => task.assignee === collector.name);
      const collectorSubmissions = matchingSubmissions.filter((submission) => submission.collector === collector.name);
      const approved = collectorSubmissions.filter((submission) => submission.status === "approved").length;
      const approvalRate = collectorSubmissions.length ? Math.round((approved / collectorSubmissions.length) * 100) : 0;
      return [collector.name, collector.zone, getCollectorLanguageLabel(collector.preferredLanguage), String(collectorTasks.length), String(approved), `${approvalRate}%`];
    });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Collector performance", 14, cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    head: [["Collector", "Zone", "Language", "Assigned", "Approved", "Approval rate"]],
    body: collectorRows.length ? collectorRows : [["No collector assignments", "-", "-", "0", "0", "0%"]],
    theme: "grid",
    margin: { left: 14, right: 14 },
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85], lineColor: [221, 231, 239] },
    headStyles: { fillColor: [21, 121, 181], textColor: 255, fontStyle: "bold" },
  });
  cursorY = finalTableY(doc) + 12;

  if (cursorY > 260) {
    doc.addPage();
    cursorY = 20;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Task register", 14, cursorY);
  autoTable(doc, {
    startY: cursorY + 4,
    head: [["Task", "Status", "Priority", "Collector", "Zone", "Due", "Waste"]],
    body: tasks.map((task) => [
      task.title,
      statusLabels[task.status],
      task.priority,
      task.assignee ?? "Unassigned",
      task.zone,
      task.dueAt.slice(0, 10),
      `${task.estimatedWasteKg.toLocaleString()} kg`,
    ]),
    theme: "grid",
    margin: { left: 14, right: 14, bottom: 18 },
    styles: { fontSize: 7.4, cellPadding: 2.25, textColor: [51, 65, 85], lineColor: [221, 231, 239], valign: "middle" },
    headStyles: { fillColor: [21, 121, 181], textColor: 255, fontStyle: "bold" },
    columnStyles: { 0: { cellWidth: 46 }, 1: { cellWidth: 26 }, 2: { cellWidth: 18 }, 3: { cellWidth: 31 }, 4: { cellWidth: 19 }, 5: { cellWidth: 20 }, 6: { cellWidth: 20 } },
  });

  addPageFooter(doc);
  doc.save("polis-systems-operational-report.pdf");
}
