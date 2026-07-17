import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { HotspotBadge, PriorityLabel, StatusBadge, ZoneBadge } from "@/components/status-badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  computeAssignableCollectors, formatFriendlyDate, isTaskOverdue,
  type TaskStatus, type Zone, type Priority, type Task,
} from "@/lib/mock-data";
import { useTaskStore, taskStoreActions, type NewTaskInput } from "@/lib/task-store";
import { useCollectorStore } from "@/lib/collector-store";
import { useZones } from "@/lib/zone-store";
import { CreateTaskSheet } from "@/components/tasks/create-task-sheet";
import { TaskDetailDrawer } from "@/components/tasks/task-detail-drawer";
import { Plus, Search, X, ListFilter, MoveHorizontal as MoreHorizontal, TriangleAlert as AlertTriangle, CircleAlert as AlertCircle, Eye, Pencil, Ban, Trash2, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Cleanup Tasks — Polis Systems" },
      { name: "description", content: "Create, assign, and monitor field cleanup operations." },
    ],
  }),
  component: TasksPage,
});

type DateFilter = "any" | "overdue" | "today" | "week";

function nowIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10) + " " + d.toTimeString().slice(0, 5);
}

const SUMMARY_CHIPS: { key: string; label: string; match: (t: Task, overdue: boolean) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "open", label: "Draft", match: (t) => t.status === "open" },
  { key: "assigned", label: "Assigned", match: (t) => t.status === "assigned" },
  { key: "in_progress", label: "In Progress", match: (t) => t.status === "in_progress" },
  { key: "submitted", label: "Awaiting Review", match: (t) => t.status === "submitted" },
  { key: "approved", label: "Approved", match: (t) => t.status === "approved" },
  { key: "overdue", label: "Overdue", match: (_t, overdue) => overdue },
];

function TasksPage() {
  const { tasks, loading, error } = useTaskStore();
  const zones = useZones();
  const zoneNames = zones.length > 0 ? zones.map((z) => z.name) : ["North", "South", "East", "West", "Central"];
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<TaskStatus | "all">("all");
  const [collectorFilter, setCollectorFilter] = useState<string>("all");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("any");
  const [activeChip, setActiveChip] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);

  const collectors = useCollectorStore();
  const collectorNames = useMemo(() => Array.from(new Set(collectors.map((c) => c.name))), [collectors]);
  const assignableCollectorNames = useMemo(() => computeAssignableCollectors(collectors).map((c) => c.name), [collectors]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      const overdue = isTaskOverdue(t);
      const chip = SUMMARY_CHIPS.find((c) => c.key === activeChip);
      if (chip && !chip.match(t, overdue)) return false;
      if (status !== "all" && t.status !== status) return false;
      if (collectorFilter !== "all" && t.assignee !== collectorFilter) return false;
      if (zone !== "all" && t.zone !== zone) return false;
      if (priority !== "all" && t.priority !== priority) return false;
      if (dateFilter === "overdue" && !overdue) return false;
      if (dateFilter === "today" && t.dueAt.slice(0, 10) !== nowIso().slice(0, 10)) return false;
      if (dateFilter === "week") {
        const due = new Date(t.dueAt.replace(" ", "T")).getTime();
        const now = Date.now();
        if (due < now || due > now + 7 * 86_400_000) return false;
      }
      if (query) {
        const haystack = `${t.title} ${t.location} ${t.assignee ?? ""} ${t.id}`.toLowerCase();
        if (!haystack.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [tasks, query, status, collectorFilter, zone, priority, dateFilter, activeChip]);

  const filtersActive = status !== "all" || collectorFilter !== "all" || zone !== "all" || priority !== "all" || dateFilter !== "any" || query !== "" || activeChip !== "all";

  function clearFilters() {
    setQuery("");
    setStatus("all");
    setCollectorFilter("all");
    setZone("all");
    setPriority("all");
    setDateFilter("any");
    setActiveChip("all");
  }

  function openDrawer(task: Task) {
    setSelectedTask(task);
    setDrawerOpen(true);
  }

  async function handleCreate(input: NewTaskInput) {
    setSaving(true);
    try {
      const task = await taskStoreActions.createTask(input);
      toast.success("Task created", { description: `${task.title} was added${task.assignee ? ` and assigned to ${task.assignee}` : " as a draft"}.` });
    } catch (err) {
      toast.error("Failed to create task", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(taskId: string, patch: Partial<NewTaskInput>) {
    setSaving(true);
    try {
      await taskStoreActions.editTask(taskId, patch);
      toast.success("Task updated");
    } catch (err) {
      toast.error("Failed to update task", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  }

  async function handleDrawerAction(action: "edit" | "assign" | "reassign" | "cancel" | "delete" | "resubmit" | "export", collector?: string) {
    if (!selectedTask) return;
    if (action === "edit") {
      setEditingTask(selectedTask);
      setDrawerOpen(false);
      setCreateOpen(true);
      return;
    }
    if (action === "delete") {
      setDeleteTarget(selectedTask);
      setDrawerOpen(false);
      return;
    }
    try {
      if (action === "assign" && collector) {
        await taskStoreActions.assignCollector(selectedTask.id, collector);
        toast.success("Collector assigned", { description: `${selectedTask.title} assigned to ${collector}.` });
      }
      if (action === "reassign" && collector) {
        await taskStoreActions.reassignCollector(selectedTask.id, collector);
        toast.success("Collector reassigned", { description: `${selectedTask.title} is now with ${collector}.` });
      }
      if (action === "cancel") {
        await taskStoreActions.cancelTask(selectedTask.id);
        toast("Task canceled", { description: `${selectedTask.title} was canceled.` });
        setDrawerOpen(false);
      }
      if (action === "resubmit") {
        await taskStoreActions.requestResubmission(selectedTask.id);
        toast.success("Resubmission requested", { description: `${selectedTask.assignee ?? "The collector"} will be notified.` });
      }
      if (action === "export") {
        toast.success("Record exported", { description: "A summary export would be generated here in production." });
      }
    } catch (err) {
      toast.error("Action failed", { description: err instanceof Error ? err.message : undefined });
    }
  }

  async function confirmQuickCancel() {
    if (!cancelTargetId) return;
    try {
      await taskStoreActions.cancelTask(cancelTargetId);
      toast("Task canceled");
    } catch (err) {
      toast.error("Failed to cancel task", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setCancelTargetId(null);
    }
  }

  async function confirmDeleteTask() {
    if (!deleteTarget) return;
    try {
      await taskStoreActions.deleteTask(deleteTarget.id);
      toast.success("Task permanently deleted", { description: `${deleteTarget.title} and its task events were removed.` });
      setSelectedTask(null);
    } catch (err) {
      toast.error("Could not delete task", { description: err instanceof Error ? err.message : undefined });
    } finally {
      setDeleteTarget(null);
    }
  }

  const liveSelectedTask = selectedTask ? tasks.find((t) => t.id === selectedTask.id) ?? selectedTask : null;

  return (
    <>
      <PageHeader
        title="Cleanup Tasks"
        description="Create, assign, and monitor field cleanup operations"
        actions={
          <Button size="sm" className="dashboard-primary-action gap-1.5" onClick={() => { setEditingTask(null); setCreateOpen(true); }}>
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/15"><Plus className="h-3.5 w-3.5" /></span> Create Task
          </Button>
        }
      />

      <div className="page-shell animate-fade-up">
        {/* Summary strip */}
        <div className="flex flex-wrap gap-2" aria-label="Task status summary">
          {SUMMARY_CHIPS.map((chip) => {
            const count = tasks.filter((t) => chip.match(t, isTaskOverdue(t))).length;
            const active = activeChip === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setActiveChip(active ? "all" : chip.key)}
                className={`focus-ring flex min-h-9 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-sm transition-[color,background-color,border-color,box-shadow] ${
                  active
                    ? "border-primary/30 bg-primary/10 text-primary-dark shadow-primary/5"
                    : "border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
                }`}
              >
                {chip.key === "overdue" && <AlertTriangle className="h-3 w-3" />}
                {chip.label}
                <span className={`inline-flex min-w-5 justify-center rounded-full px-1.5 py-0.5 tabular-nums ${active ? "bg-primary/10 text-primary-dark" : "bg-muted text-foreground"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <div className="dashboard-filter-bar flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, location, or collector"
              className="pl-8"
            />
          </div>
          <Select className="!w-[9.5rem]" value={status} onValueChange={(v) => setStatus(v as TaskStatus | "all")}>
            <SelectTrigger className="h-9 w-[9.5rem]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Draft</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="accepted">Accepted</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="submitted">Submitted</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="declined">Declined</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="canceled">Canceled</SelectItem>
            </SelectContent>
          </Select>
          <Select className="!w-40" value={collectorFilter} onValueChange={setCollectorFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Collector" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All collectors</SelectItem>
              {collectorNames.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select className="!w-32" value={zone} onValueChange={(v) => setZone(v as Zone | "all")}>
            <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Zone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              {zoneNames.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select className="!w-32" value={priority} onValueChange={(v) => setPriority(v as Priority | "all")}>
            <SelectTrigger className="h-9 w-32"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All priorities</SelectItem>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
          <Select className="!w-36" value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Due date" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any due date</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="today">Due today</SelectItem>
              <SelectItem value="week">Due this week</SelectItem>
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <ListFilter className="h-3.5 w-3.5" /> {filtered.length} of {tasks.length} tasks
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="surface-card space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center shadow-surface">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <h3 className="mt-2 text-sm font-semibold text-destructive">Failed to load tasks</h3>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => taskStoreActions.refresh()}>Retry</Button>
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" />}
            title="No tasks yet"
            description="Create your first cleanup task to start assigning field work."
            action={<Button size="sm" onClick={() => { setEditingTask(null); setCreateOpen(true); }}>Create Task</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ListFilter className="h-5 w-5" />}
            title="No tasks match your filters"
            description="Try adjusting or clearing your filters to see more tasks."
            action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <div className="dashboard-table-shell">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/35">
                  <TableHead className="min-w-[200px]">Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Hotspot type</TableHead>
                  <TableHead>Assigned collector</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Due date</TableHead>
                  <TableHead>Last updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => {
                  const overdue = isTaskOverdue(t);
                  return (
                    <TableRow key={t.id} className="dashboard-row" onClick={() => openDrawer(t)}>
                      <TableCell>
                        <div className="max-w-[16rem] truncate text-sm font-semibold text-foreground">{t.title}</div>
                        <div className="mt-0.5 max-w-[16rem] truncate text-xs text-muted-foreground">{t.location}</div>
                      </TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell><PriorityLabel priority={t.priority} /></TableCell>
                      <TableCell><HotspotBadge type={t.hotspotType} /></TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {t.assignee ?? <span className="italic text-muted-foreground/75">Unassigned</span>}
                      </TableCell>
                      <TableCell><ZoneBadge zone={t.zone} /></TableCell>
                      <TableCell className={overdue ? "text-xs font-medium text-destructive" : "text-xs text-muted-foreground"}>
                        <span className="inline-flex items-center gap-1">
                          {overdue && <AlertTriangle className="h-3 w-3" />}
                          {formatFriendlyDate(t.dueAt)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatFriendlyDate(t.updatedAt)}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Open actions for ${t.title}`}><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => openDrawer(t)}><Eye className="h-4 w-4 text-muted-foreground" /> View details</DropdownMenuItem>
                            {t.status === "open" && (
                              <DropdownMenuItem onClick={() => { setEditingTask(t); setCreateOpen(true); }}><Pencil className="h-4 w-4 text-muted-foreground" /> Edit task</DropdownMenuItem>
                            )}
                            {(t.status === "open" || t.status === "assigned" || t.status === "declined") && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-warning hover:bg-warning/10 focus:bg-warning/10 focus:text-warning"
                                  onClick={() => setCancelTargetId(t.id)}
                                >
                                  <Ban className="h-4 w-4" /> Cancel task
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(t)}
                            >
                              <Trash2 className="h-4 w-4" /> Delete permanently
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateTaskSheet
        open={createOpen}
        onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditingTask(null); }}
        editingTask={editingTask}
        collectorOptions={assignableCollectorNames}
        zoneNames={zoneNames}
        onCreate={handleCreate}
        onEdit={handleEdit}
      />

      <TaskDetailDrawer
        task={liveSelectedTask}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        collectors={computeAssignableCollectors(collectors)}
        onAction={handleDrawerAction}
      />

      <AlertDialog open={!!cancelTargetId} onOpenChange={(open) => !open && setCancelTargetId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this task?</AlertDialogTitle>
            <AlertDialogDescription>This task will be marked canceled. This can't be undone from here.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep task</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmQuickCancel}
            >
              Cancel task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Tasks with proof-of-work submissions are protected and cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep task</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDeleteTask}
            >
              Delete task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
