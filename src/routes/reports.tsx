import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge, statusBarColor } from "@/components/status-badge";
import { Clock, ShieldCheck, CircleCheck as CheckCircle2, Users, Download, ListFilter as Filter, ChartBar as BarChart3, MapPin, Trash2, TrendingUp, CalendarDays } from "lucide-react";
import {
  ZONES,
  HOTSPOT_TYPES,
  COLLECTOR_STATUSES,
  type Task,
  type TaskStatus,
  type Zone,
  type WasteType,
  type HotspotType,
  type Collector,
  type Submission,
  computeCollectorStats,
  formatFriendlyDate,
  formatFriendlyDateTime,
} from "@/lib/mock-data";
import { useTaskStore } from "@/lib/task-store";
import { useSubmissionStore } from "@/lib/submission-store";
import { useCollectorStore, useCollectorStoreState } from "@/lib/collector-store";
import { filterTasks, type ReportFilters } from "@/lib/csv";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Polis Systems" },
      { name: "description", content: "Generate and download operational reports." },
    ],
  }),
  component: ReportsPage,
});

const WASTE_TYPES: WasteType[] = [
  "Mixed Municipal",
  "Plastic",
  "Organic",
  "Construction Debris",
  "E-Waste",
  "Sewage/Sludge",
];

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "open", label: "Draft" },
  { value: "assigned", label: "Assigned" },
  { value: "accepted", label: "Accepted" },
  { value: "in_progress", label: "In Progress" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "rejected", label: "Rejected" },
  { value: "canceled", label: "Canceled" },
];

const DEFAULT_FILTERS: ReportFilters = {
  dateRange: { from: null, to: null },
  zone: "all",
  collector: "all",
  status: "all",
  hotspotType: "all",
  wasteType: "all",
};

function ReportsPage() {
  const { tasks, error: tasksError } = useTaskStore();
  const submissions = useSubmissionStore();
  const collectors = useCollectorStore();
  const { error: collectorsError } = useCollectorStoreState();

  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS);
  const [exportingPdf, setExportingPdf] = useState(false);

  const filteredTasks = useMemo(
    () => filterTasks(tasks, filters, collectors),
    [tasks, filters, collectors],
  );

  const assigneeNames = useMemo(() => {
    const names = new Set<string>();
    tasks.forEach((t) => {
      if (t.assignee) names.add(t.assignee);
    });
    return [...names].sort();
  }, [tasks]);

  // --- Summary metrics (consistent with Overview) ---
  const openTasksCount = filteredTasks.filter(
    (t) => !["approved", "rejected", "declined", "canceled"].includes(t.status),
  ).length;
  const awaitingReviewCount = filteredTasks.filter((t) => t.status === "submitted").length;
  const approvedTasksCount = filteredTasks.filter((t) => t.status === "approved").length;
  const activeCollectorsCount = useMemo(() => {
    const activeNames = new Set(collectors.filter((c) => c.status === "active").map((c) => c.name));
    const filteredAssignees = new Set(
      filteredTasks.map((t) => t.assignee).filter(Boolean) as string[],
    );
    let count = 0;
    for (const name of filteredAssignees) {
      if (activeNames.has(name)) count++;
    }
    return count;
  }, [collectors, filteredTasks]);

  // --- Tasks by Status ---
  const statusBreakdown = useMemo(() => {
    const order: TaskStatus[] = [
      "open",
      "assigned",
      "accepted",
      "in_progress",
      "submitted",
      "approved",
      "declined",
      "rejected",
      "canceled",
    ];
    return order
      .map((status) => ({
        status,
        count: filteredTasks.filter((t) => t.status === status).length,
      }))
      .filter((s) => s.count > 0);
  }, [filteredTasks]);
  const totalStatusCount = Math.max(
    1,
    statusBreakdown.reduce((s, x) => s + x.count, 0),
  );

  // --- Tasks by Zone ---
  const zoneBreakdown = useMemo(() => {
    return ZONES.map((zone) => {
      const zoneTasks = filteredTasks.filter((t) => t.zone === zone);
      return {
        zone,
        total: zoneTasks.length,
        open: zoneTasks.filter(
          (t) => !["approved", "rejected", "declined", "canceled"].includes(t.status),
        ).length,
        approved: zoneTasks.filter((t) => t.status === "approved").length,
      };
    }).filter((z) => z.total > 0);
  }, [filteredTasks]);
  const maxZoneTotal = Math.max(1, ...zoneBreakdown.map((z) => z.total));

  // --- Waste Quantity by Type ---
  const wasteByType = useMemo(() => {
    return WASTE_TYPES.map((wasteType) => {
      const typeTasks = filteredTasks.filter((t) => t.wasteType === wasteType);
      const estimatedKg = typeTasks.reduce((sum, t) => sum + t.estimatedWasteKg, 0);
      const approvedKg = typeTasks
        .filter((t) => t.status === "approved")
        .reduce((sum, t) => sum + t.estimatedWasteKg, 0);
      return {
        wasteType,
        taskCount: typeTasks.length,
        estimatedKg,
        approvedKg,
      };
    }).filter((w) => w.taskCount > 0);
  }, [filteredTasks]);
  const maxWasteKg = Math.max(1, ...wasteByType.map((w) => w.estimatedKg));

  // --- Cleanup Activity Over Time (last 7 days from NOW) ---
  const cleanupActivity = useMemo(() => {
    const now = new Date("2026-07-13T12:00:00");
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getTime() - (6 - i) * 86_400_000);
      return d.toISOString().slice(0, 10);
    });
    return days.map((day) => {
      const label = new Date(`${day}T00:00:00`).toLocaleDateString("en-US", {
        weekday: "short",
      });
      return {
        day,
        label,
        assigned: filteredTasks.filter((t) => t.assignee && t.createdAt.slice(0, 10) === day)
          .length,
        submitted: submissions
          .filter((s) => s.submittedAt.slice(0, 10) === day)
          .filter((s) => filteredTasks.some((t) => t.id === s.taskId)).length,
        approved: submissions
          .filter((s) => s.status === "approved" && s.decidedAt && s.decidedAt.slice(0, 10) === day)
          .filter((s) => filteredTasks.some((t) => t.id === s.taskId)).length,
      };
    });
  }, [filteredTasks, submissions]);
  const maxDailyValue = Math.max(
    1,
    ...cleanupActivity.flatMap((d) => [d.assigned, d.submitted, d.approved]),
  );

  // --- Collector Performance Table ---
  const collectorPerformance = useMemo(() => {
    const namesInFiltered = new Set(
      filteredTasks.map((t) => t.assignee).filter(Boolean) as string[],
    );
    return collectors
      .filter((c) => namesInFiltered.has(c.name))
      .map((c) => {
        const stats = computeCollectorStats(
          c.name,
          filteredTasks,
          submissions.filter((s) => filteredTasks.some((t) => t.id === s.taskId)),
        );
        return { collector: c, ...stats };
      })
      .sort((a, b) => b.tasksApproved - a.tasksApproved);
  }, [collectors, filteredTasks, submissions]);

  // --- Weekly Summary ---
  const weeklySummary = useMemo(() => {
    const now = new Date("2026-07-13T12:00:00");
    const weekStart = new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
    const weekTasks = filteredTasks.filter((t) => t.createdAt.slice(0, 10) >= weekStart);
    const weekSubs = submissions
      .filter((s) => s.submittedAt.slice(0, 10) >= weekStart)
      .filter((s) => filteredTasks.some((t) => t.id === s.taskId));
    return {
      tasksCreated: weekTasks.length,
      tasksApproved: weekSubs.filter((s) => s.status === "approved").length,
      wasteCollectedKg: weekSubs
        .filter((s) => s.status === "approved")
        .reduce((sum, s) => sum + s.quantityKg, 0),
      activeCollectors: new Set(weekTasks.map((t) => t.assignee).filter(Boolean)).size,
    };
  }, [filteredTasks, submissions]);

  // --- PDF Export ---
  async function handleExportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const { downloadOperationsPdf } = await import("@/lib/report-pdf");
      downloadOperationsPdf({
        tasks: filteredTasks,
        collectors,
        submissions,
        filters,
      });
    } finally {
      setExportingPdf(false);
    }
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS);
  }

  const hasActiveFilters =
    filters.zone !== "all" ||
    filters.collector !== "all" ||
    filters.status !== "all" ||
    filters.hotspotType !== "all" ||
    filters.wasteType !== "all" ||
    filters.dateRange.from ||
    filters.dateRange.to;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Operational summaries and exports"
        actions={
          <Button
            size="sm"
            className="dashboard-primary-action gap-1.5"
            onClick={() => { void handleExportPdf(); }}
            disabled={filteredTasks.length === 0 || exportingPdf}
          >
            <Download className={`h-4 w-4 ${exportingPdf ? "animate-pulse" : ""}`} /> {exportingPdf ? "Preparing PDF..." : "Export PDF"}
          </Button>
        }
      />

      <div className="page-shell animate-fade-up">
        {(tasksError || collectorsError) && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            Unable to load report data: {tasksError ?? collectorsError}
          </div>
        )}
        {/* Filters */}
        <section className="surface-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border/80 bg-muted/20 px-5 py-3.5">
            <span className="icon-tile h-8 w-8"><Filter className="h-4 w-4" /></span>
            <h2 className="text-sm font-semibold text-foreground">Filters</h2>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1 text-xs"
                onClick={resetFilters}
              >
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {/* Date range */}
            <div className="space-y-1.5">
              <Label className="text-xs">From date</Label>
              <Input
                type="date"
                value={filters.dateRange.from ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    dateRange: {
                      ...f.dateRange,
                      from: e.target.value || null,
                    },
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">To date</Label>
              <Input
                type="date"
                value={filters.dateRange.to ?? ""}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    dateRange: { ...f.dateRange, to: e.target.value || null },
                  }))
                }
              />
            </div>
            {/* Zone */}
            <div className="space-y-1.5">
              <Label className="text-xs">Zone</Label>
              <Select
                value={filters.zone}
                onValueChange={(v) => setFilters((f) => ({ ...f, zone: v as Zone | "all" }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All zones" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All zones</SelectItem>
                  {ZONES.map((z) => (
                    <SelectItem key={z} value={z}>
                      {z}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Collector */}
            <div className="space-y-1.5">
              <Label className="text-xs">Collector</Label>
              <Select
                value={filters.collector}
                onValueChange={(v) => setFilters((f) => ({ ...f, collector: v }))}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All collectors" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All collectors</SelectItem>
                  {assigneeNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Task status */}
            <div className="space-y-1.5">
              <Label className="text-xs">Task status</Label>
              <Select
                value={filters.status}
                onValueChange={(v) =>
                  setFilters((f) => ({ ...f, status: v as TaskStatus | "all" }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Hotspot type */}
            <div className="space-y-1.5">
              <Label className="text-xs">Hotspot type</Label>
              <Select
                value={filters.hotspotType}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    hotspotType: v as HotspotType | "all",
                  }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All hotspots" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All hotspots</SelectItem>
                  {HOTSPOT_TYPES.map((h) => (
                    <SelectItem key={h} value={h}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Waste type */}
            <div className="space-y-1.5 xl:col-span-1 lg:col-span-1">
              <Label className="text-xs">Waste type</Label>
              <Select
                value={filters.wasteType}
                onValueChange={(v) =>
                  setFilters((f) => ({
                    ...f,
                    wasteType: v as WasteType | "all",
                  }))
                }
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="All waste types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All waste types</SelectItem>
                  {WASTE_TYPES.map((w) => (
                    <SelectItem key={w} value={w}>
                      {w}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* Summary metrics */}
        <section aria-label="Report metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi label="Open Tasks" value={openTasksCount} icon={<Clock className="h-4 w-4" />} />
          <Kpi
            label="Awaiting Review"
            value={awaitingReviewCount}
            icon={<ShieldCheck className="h-4 w-4" />}
            tone="warning"
          />
          <Kpi
            label="Approved Tasks"
            value={approvedTasksCount}
            icon={<CheckCircle2 className="h-4 w-4" />}
            tone="primary"
          />
          <Kpi
            label="Active Collectors"
            value={activeCollectorsCount}
            icon={<Users className="h-4 w-4" />}
          />
        </section>

        {/* Tasks by Status + Tasks by Zone */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Tasks by Status */}
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Tasks by Status</h2>
              <p className="text-xs text-muted-foreground">
                {totalStatusCount} tasks in current filter
              </p>
            </div>
            <div className="px-4 pt-3">
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                {statusBreakdown.map((s) => (
                  <div
                    key={s.status}
                    className={statusBarColor[s.status]}
                    style={{
                      width: `${(s.count / totalStatusCount) * 100}%`,
                    }}
                    title={`${s.status}: ${s.count}`}
                  />
                ))}
              </div>
            </div>
            <ul className="grid grid-cols-1 gap-1 p-4 pt-2.5 sm:grid-cols-2">
              {statusBreakdown.map((s) => (
                <li key={s.status} className="flex items-center gap-1.5 text-xs">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${statusBarColor[s.status]}`} />
                  <span className="text-muted-foreground">
                    <StatusBadge status={s.status} />
                  </span>
                  <span className="ml-auto font-medium tabular-nums text-foreground">
                    {s.count}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Tasks by Zone */}
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Tasks by Zone</h2>
              <p className="text-xs text-muted-foreground">Distribution across pilot zones</p>
            </div>
            <div className="space-y-2.5 p-4">
              {zoneBreakdown.map((z) => (
                <div key={z.zone} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="w-16 shrink-0 font-medium text-foreground">{z.zone}</span>
                    <div className="flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{
                          width: `${(z.total / maxZoneTotal) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{z.total}</span>
                  </div>
                  <div className="flex gap-3 pl-[4.5rem] text-[11px] text-muted-foreground">
                    <span>{z.open} open</span>
                    <span>{z.approved} approved</span>
                  </div>
                </div>
              ))}
              {zoneBreakdown.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No tasks match the current filters.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* Waste Quantity by Type + Cleanup Activity Over Time */}
        <section className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Waste Quantity by Type */}
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Waste Quantity by Type</h2>
              <p className="text-xs text-muted-foreground">Estimated vs approved (kg)</p>
            </div>
            <div className="space-y-2.5 p-4">
              {wasteByType.map((w) => (
                <div key={w.wasteType} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-foreground">{w.wasteType}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {w.estimatedKg.toLocaleString()} kg
                    </span>
                  </div>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary"
                      style={{
                        width: `${(w.approvedKg / maxWasteKg) * 100}%`,
                      }}
                      title={`Approved: ${w.approvedKg} kg`}
                    />
                    <div
                      className="h-full bg-primary/30"
                      style={{
                        width: `${((w.estimatedKg - w.approvedKg) / maxWasteKg) * 100}%`,
                      }}
                      title={`Estimated: ${w.estimatedKg - w.approvedKg} kg`}
                    />
                  </div>
                </div>
              ))}
              {wasteByType.length === 0 && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No tasks match the current filters.
                </p>
              )}
            </div>
          </div>

          {/* Cleanup Activity Over Time */}
          <div className="surface-card overflow-hidden">
            <div className="border-b border-border px-4 py-2.5">
              <h2 className="text-sm font-semibold text-foreground">Cleanup Activity Over Time</h2>
              <p className="text-xs text-muted-foreground">
                Last 7 days · assigned, submitted, approved
              </p>
            </div>
            <div className="px-4 pt-3">
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <Legend swatch="bg-primary-dark" label="Assigned" />
                <Legend swatch="bg-warning" label="Submitted" />
                <Legend swatch="bg-success" label="Approved" />
              </div>
            </div>
            <div className="flex gap-3 px-4 pb-3 pt-3 h-32">
              {cleanupActivity.map((d) => (
                <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                    <div
                      className="w-2 rounded-t bg-primary-dark"
                      style={{
                        height: `${(d.assigned / maxDailyValue) * 100}%`,
                      }}
                      title={`${d.assigned} assigned`}
                    />
                    <div
                      className="w-2 rounded-t bg-warning"
                      style={{
                        height: `${(d.submitted / maxDailyValue) * 100}%`,
                      }}
                      title={`${d.submitted} submitted`}
                    />
                    <div
                      className="w-2 rounded-t bg-success"
                      style={{
                        height: `${(d.approved / maxDailyValue) * 100}%`,
                      }}
                      title={`${d.approved} approved`}
                    />
                  </div>
                  <div className="text-[11px] text-muted-foreground">{d.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Collector Performance Table */}
        <section className="dashboard-table-shell">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Collector Performance</h2>
          </div>
          {collectorPerformance.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No collectors match the current filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Collector</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Declined</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead className="text-right">Approval Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {collectorPerformance.map((row) => (
                  <TableRow key={row.collector.id}>
                    <TableCell className="font-medium text-foreground">
                      {row.collector.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span className="inline-flex items-center gap-0.5">
                        <MapPin className="h-3 w-3" />
                        {row.collector.zone}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.tasksAssigned}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.tasksAccepted}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.tasksDeclined}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.tasksSubmitted}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.tasksApproved}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.approvalRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        {/* Weekly Summary */}
        <section className="surface-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">Weekly Summary</h2>
            <p className="ml-auto text-xs text-muted-foreground">7 Jul – 13 Jul 2026</p>
          </div>
          <div className="grid grid-cols-2 gap-3 p-3.5 sm:grid-cols-4">
            <SecondaryStat
              label="Tasks Created"
              value={weeklySummary.tasksCreated}
              icon={<TrendingUp className="h-3.5 w-3.5" />}
            />
            <SecondaryStat
              label="Tasks Approved"
              value={weeklySummary.tasksApproved}
              icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            />
            <SecondaryStat
              label="Waste Collected"
              value={`${weeklySummary.wasteCollectedKg.toLocaleString()} kg`}
              icon={<Trash2 className="h-3.5 w-3.5" />}
            />
            <SecondaryStat
              label="Active Collectors"
              value={weeklySummary.activeCollectors}
              icon={<Users className="h-3.5 w-3.5" />}
            />
          </div>
        </section>

        {/* Filtered record count */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Showing {filteredTasks.length} of {tasks.length} tasks
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => { void handleExportPdf(); }}
            disabled={filteredTasks.length === 0 || exportingPdf}
          >
            <Download className={`h-4 w-4 ${exportingPdf ? "animate-pulse" : ""}`} /> {exportingPdf ? "Preparing PDF..." : "Export"} {filteredTasks.length}{" "}
            {filteredTasks.length === 1 ? "record" : "records"} as PDF
          </Button>
        </div>
      </div>
    </>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${swatch}`} />
      {label}
    </span>
  );
}

function Kpi({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tone?: "default" | "primary" | "warning";
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "warning"
        ? "text-warning"
        : "text-muted-foreground";
  return (
            <div className="dashboard-metric group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none ${toneClass}`}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function SecondaryStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
