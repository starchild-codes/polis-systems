import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ReviewStatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetBody, SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Search, X, ClipboardCheck, Clock3, CircleCheck as CheckCircle2, Circle as XCircle, MapPin, User, Phone, CircleAlert as AlertCircle, Image as ImageIcon, Weight, MessageSquare, FlaskConical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSubmissions, approveSubmission, rejectSubmission, createTestSubmission,
  deleteTestSubmission, isTestSubmission,
  type SubmissionWithRelations,
} from "@/lib/submission-store";
import { useTaskStore } from "@/lib/task-store";
import { useCollectorStore } from "@/lib/collector-store";
import type { Collector, Task } from "@/lib/mock-data";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Submission Review — Polis Systems" },
      { name: "description", content: "Verify cleanup evidence and approve or return field submissions." },
    ],
  }),
  component: ReviewPage,
});

type ReviewTab = "pending" | "approved" | "rejected" | "all";

function formatDateTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

function ReviewPage() {
  const { user, organizationRole } = useAuth();
  const { tasks } = useTaskStore();
  const collectors = useCollectorStore();
  const [submissions, setSubmissions] = useState<SubmissionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<ReviewTab>("pending");
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [testSheetOpen, setTestSheetOpen] = useState(false);
  const [cleanupTarget, setCleanupTarget] = useState<SubmissionWithRelations | null>(null);

  const loadSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSubmissions();
      setSubmissions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSubmissions();
  }, [loadSubmissions]);

  const counts = useMemo(() => ({
    pending: submissions.filter((s) => s.reviewStatus === "pending").length,
    approved: submissions.filter((s) => s.reviewStatus === "approved").length,
    rejected: submissions.filter((s) => s.reviewStatus === "rejected").length,
    all: submissions.length,
  }), [submissions]);

  const zones = useMemo(() => {
    const set = new Set<string>();
    for (const s of submissions) {
      if (s.task?.zoneName) set.add(s.task.zoneName);
    }
    return [...set].sort();
  }, [submissions]);

  const filtered = useMemo(() => {
    return submissions
      .filter((s) => {
        if (tab !== "all" && s.reviewStatus !== tab) return false;
        if (zoneFilter !== "all" && s.task?.zoneName !== zoneFilter) return false;
        if (query.trim()) {
          const q = query.trim().toLowerCase();
          const haystack = [
            s.task?.title ?? "",
            s.collector?.name ?? "",
            s.task?.zoneName ?? "",
            s.wasteType ?? "",
          ].join(" ").toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aDate = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const bDate = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return bDate - aDate;
      });
  }, [submissions, tab, zoneFilter, query]);

  const hasActiveFilters = query.trim() !== "" || zoneFilter !== "all";
  const eligibleTestTasks = useMemo(() => {
    const usedTaskIds = new Set(submissions.map((submission) => submission.taskId));
    return tasks.filter((task) => !usedTaskIds.has(task.id));
  }, [tasks, submissions]);

  function clearFilters() {
    setQuery("");
    setZoneFilter("all");
  }

  function openSubmission(id: string) {
    setSelectedId(id);
    setDrawerOpen(true);
  }

  function closeDrawer(open: boolean) {
    setDrawerOpen(open);
    if (!open) setSelectedId(null);
  }

  const selected = submissions.find((s) => s.id === selectedId) ?? null;

  async function handleApprove() {
    if (!selected || !user) return;
    setActionLoading(true);
    try {
      await approveSubmission(selected.id, user.id);
      toast.success("Submission approved", {
        description: `${selected.task?.title ?? "Task"} marked as approved.`,
      });
      closeDrawer(false);
      await loadSubmissions();
    } catch (err) {
      toast.error("Failed to approve", {
        description: err instanceof Error ? err.message : undefined,
      });
      await loadSubmissions();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReject(reason: string) {
    if (!selected || !user) return;
    setActionLoading(true);
    try {
      await rejectSubmission(selected.id, user.id, reason);
      toast.error("Submission rejected", {
        description: `${selected.task?.title ?? "Task"} returned to collector.`,
      });
      closeDrawer(false);
      await loadSubmissions();
    } catch (err) {
      toast.error("Failed to reject", {
        description: err instanceof Error ? err.message : undefined,
      });
      await loadSubmissions();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCreateTest(taskId: string, collectorId: string) {
    if (!user || organizationRole !== "admin") return;
    setActionLoading(true);
    try {
      const submissionId = await createTestSubmission({ taskId, collectorId, adminId: user.id });
      await loadSubmissions();
      setTab("pending");
      setTestSheetOpen(false);
      toast.success("Test submission created", { description: "It is stored in Supabase and ready for Review testing." });
      setSelectedId(submissionId);
      setDrawerOpen(true);
    } catch (err) {
      toast.error("Failed to create test submission", { description: err instanceof Error ? err.message : undefined });
      await loadSubmissions();
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDeleteTest() {
    if (!cleanupTarget || !user || organizationRole !== "admin") return;
    setActionLoading(true);
    try {
      await deleteTestSubmission(cleanupTarget, user.id);
      toast.success("Test submission removed", { description: "The related task was restored to its previous status." });
      closeDrawer(false);
      await loadSubmissions();
    } catch (err) {
      toast.error("Failed to remove test submission", { description: err instanceof Error ? err.message : undefined });
      await loadSubmissions();
    } finally {
      setCleanupTarget(null);
      setActionLoading(false);
    }
  }

  const emptyState = (() => {
    if (hasActiveFilters && filtered.length === 0) {
      return { title: "No submissions match your filters", description: "Try adjusting search or zone filters.", showClear: true };
    }
    if (tab === "pending") return { title: "No submissions waiting for review", description: "Collector proof submissions will appear here after the WhatsApp integration is connected." };
    if (tab === "approved") return { title: "No approved submissions yet", description: "Approved submissions will appear here once you review pending proof of work." };
    if (tab === "rejected") return { title: "No rejected submissions", description: "Returned submissions will appear here if proof of work needs revision." };
    return { title: "No submissions found", description: "Submissions will appear here once collectors submit proof of work." };
  })();

  return (
    <>
      <PageHeader
        title="Submission Review"
        description="Verify cleanup evidence and approve or return field submissions"
        actions={organizationRole === "admin" ? (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setTestSheetOpen(true)}>
            <FlaskConical className="h-4 w-4" /> Create test submission
          </Button>
        ) : undefined}
      />

      <div className="page-shell animate-fade-up">
        {/* Summary metrics */}
        <section aria-label="Review metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Awaiting Review" value={counts.pending} icon={<Clock3 className="h-4 w-4" />} tone="warning" />
          <MetricCard label="Approved" value={counts.approved} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
          <MetricCard label="Rejected" value={counts.rejected} icon={<XCircle className="h-4 w-4" />} tone="destructive" />
          <MetricCard label="Total" value={counts.all} icon={<ClipboardCheck className="h-4 w-4" />} />
        </section>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as ReviewTab)}>
          <TabsList>
            <TabsTrigger value="pending">Pending ({counts.pending})</TabsTrigger>
            <TabsTrigger value="approved">Approved ({counts.approved})</TabsTrigger>
            <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Search + filters */}
        <div className="surface-card flex flex-wrap items-center gap-2 p-3.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search task, collector, zone, or waste type"
              className="pl-8"
            />
          </div>
          <Select value={zoneFilter} onValueChange={setZoneFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue placeholder="All zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              {zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Submission queue */}
        {loading ? (
          <div className="surface-card space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-3 w-24" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center shadow-surface">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <h3 className="mt-2 text-sm font-semibold text-destructive">Failed to load submissions</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={loadSubmissions}>Retry</Button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-5 w-5" />}
            title={emptyState.title}
            description={emptyState.description}
            action={emptyState.showClear ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
          />
        ) : (
          <div className="surface-card overflow-auto scrollbar-thin">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/35">
                  <TableHead className="min-w-[200px]">Task</TableHead>
                  <TableHead>Collector</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Waste Type</TableHead>
                  <TableHead>Review Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => openSubmission(s.id)}
                  >
                    <TableCell>
                      <div className="flex min-w-[12rem] items-center gap-2 text-sm font-semibold text-foreground">
                        <span className="truncate">{s.task?.title ?? "Unknown task"}</span> {isTestSubmission(s) && <Badge variant="muted"><FlaskConical className="h-3 w-3" /> Test</Badge>}
                      </div>
                      <div className="mt-0.5 max-w-[16rem] truncate text-xs text-muted-foreground">
                        {s.task?.address ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.collector?.name ?? "Unknown collector"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.task?.zoneName ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(s.submittedAt)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.wasteType ?? "—"}
                    </TableCell>
                    <TableCell><ReviewStatusBadge status={s.reviewStatus} /></TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); openSubmission(s.id); }}
                      >
                        {s.reviewStatus === "pending" ? "Review" : "View"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <TestSubmissionSheet
        open={testSheetOpen}
        onOpenChange={setTestSheetOpen}
        tasks={eligibleTestTasks}
        collectors={collectors}
        loading={actionLoading}
        onCreate={handleCreateTest}
      />

      <SubmissionDetailDrawer
        submission={selected}
        open={drawerOpen}
        onOpenChange={closeDrawer}
        onApprove={handleApprove}
        onReject={handleReject}
        onDeleteTest={(submission) => setCleanupTarget(submission)}
        canManageTestData={organizationRole === "admin"}
        actionLoading={actionLoading}
      />

      <AlertDialog open={!!cleanupTarget} onOpenChange={(open) => !open && setCleanupTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this test submission?</AlertDialogTitle>
            <AlertDialogDescription>
              The marked test row will be permanently deleted and its task will return to the status it had before testing. Audit events remain for traceability.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep test submission</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDeleteTest} disabled={actionLoading}>
              Delete test submission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────────────────

function TestSubmissionSheet({
  open, onOpenChange, tasks, collectors, loading, onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tasks: Task[];
  collectors: Collector[];
  loading: boolean;
  onCreate: (taskId: string, collectorId: string) => void;
}) {
  const [taskId, setTaskId] = useState("");
  const [collectorId, setCollectorId] = useState("");

  useEffect(() => {
    if (open) {
      setTaskId("");
      setCollectorId("");
    }
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md" onOpenChange={onOpenChange}>
        <SheetHeader>
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <SheetTitle>Create test submission</SheetTitle>
          </div>
          <SheetDescription>
            Admin-only utility for verifying Review before WhatsApp is connected. This creates one real, clearly marked Supabase row.
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          <div className="rounded-xl border border-info/30 bg-info/5 p-4 text-sm leading-6 text-muted-foreground">
            The selected task will move to Submitted while this test exists. Cleanup restores its previous status.
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Task</label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger><SelectValue placeholder="Select a task without a submission" /></SelectTrigger>
              <SelectContent>
                {tasks.map((task) => <SelectItem key={task.id} value={task.id}>{task.title} · {task.status.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            {tasks.length === 0 && <p className="text-xs text-muted-foreground">Every available task already has a submission.</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Collector</label>
            <Select value={collectorId} onValueChange={setCollectorId}>
              <SelectTrigger><SelectValue placeholder="Select an existing collector" /></SelectTrigger>
              <SelectContent>
                {collectors.map((collector) => <SelectItem key={collector.id} value={collector.id}>{collector.name} · {collector.zone}</SelectItem>)}
              </SelectContent>
            </Select>
            {collectors.length === 0 && <p className="text-xs text-muted-foreground">No collectors are available.</p>}
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
          <Button onClick={() => onCreate(taskId, collectorId)} disabled={loading || !taskId || !collectorId}>
            {loading ? "Creating..." : "Create test submission"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function SubmissionDetailDrawer({
  submission,
  open,
  onOpenChange,
  onApprove,
  onReject,
  onDeleteTest,
  canManageTestData,
  actionLoading,
}: {
  submission: SubmissionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onDeleteTest: (submission: SubmissionWithRelations) => void;
  canManageTestData: boolean;
  actionLoading: boolean;
}) {
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (open) {
      setShowRejectForm(false);
      setRejectReason("");
    }
  }, [open, submission?.id]);

  if (!submission) return null;

  const isPending = submission.reviewStatus === "pending";
  const isTest = isTestSubmission(submission);
  const task = submission.task;
  const collector = submission.collector;

  function submitReject() {
    if (!rejectReason.trim()) {
      toast.error("Rejection reason required", { description: "Please provide a reason before rejecting." });
      return;
    }
    onReject(rejectReason);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl" onOpenChange={onOpenChange}>
        <SheetHeader>
          <SheetTitle>{task?.title ?? "Submission"}</SheetTitle>
          <SheetDescription>
            Submitted {formatDateTime(submission.submittedAt)}
          </SheetDescription>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ReviewStatusBadge status={submission.reviewStatus} />
            {isTest && <Badge variant="info"><FlaskConical className="h-3 w-3" /> Admin test data</Badge>}
            {task && <Badge variant="muted">{task.priority} priority</Badge>}
            {task && <Badge variant="muted">{task.hotspotType}</Badge>}
          </div>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Task info */}
          {task && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Task Details</h3>
              <div className="surface-card grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2">
                <DetailRow icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={task.address ?? "—"} />
                <DetailRow label="Zone" value={task.zoneName} />
                <DetailRow label="Hotspot type" value={task.hotspotType} />
                <DetailRow label="Priority" value={task.priority} />
                <DetailRow label="Task status" value={task.status.replace(/_/g, " ")} />
                <DetailRow label="Due date" value={formatDateTime(task.dueAt)} />
              </div>
              {task.description && (
                <p className="mt-2 text-sm text-muted-foreground">{task.description}</p>
              )}
            </section>
          )}

          {/* Collector info */}
          {collector && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Collector</h3>
              <div className="surface-card grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2">
                <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Name" value={collector.name} />
                <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={collector.phone} />
                <DetailRow label="Zone" value={collector.zoneName} />
              </div>
            </section>
          )}

          {/* Submission evidence */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission Evidence</h3>
            <div className="surface-card space-y-3 p-4">
              <DetailRow icon={<Weight className="h-3.5 w-3.5" />} label="Waste type" value={submission.wasteType ?? "—"} />
              <DetailRow label="Quantity estimate" value={submission.quantityEstimate ?? "—"} />
              {submission.submittedLatitude != null && submission.submittedLongitude != null && (
                <DetailRow
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="GPS coordinates"
                  value={`${submission.submittedLatitude.toFixed(5)}, ${submission.submittedLongitude.toFixed(5)}`}
                />
              )}
              {(submission.beforePhotoPath || submission.afterPhotoPath) && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {submission.beforePhotoPath && <EvidenceFile label="Before photo" path={submission.beforePhotoPath} />}
                  {submission.afterPhotoPath && <EvidenceFile label="After photo" path={submission.afterPhotoPath} />}
                </div>
              )}
              {submission.collectorNotes && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" /> Collector notes
                  </div>
                  <p className="text-sm text-foreground">{submission.collectorNotes}</p>
                </div>
              )}
            </div>
          </section>

          {/* Rejection info for already-rejected */}
          {submission.reviewStatus === "rejected" && submission.rejectionReason && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rejection Reason</h3>
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-foreground">{submission.rejectionReason}</p>
                {submission.reviewedAt && (
                  <p className="mt-2 text-xs text-muted-foreground">Rejected on {formatDateTime(submission.reviewedAt)}</p>
                )}
              </div>
            </section>
          )}

          {/* Reject form */}
          {isPending && showRejectForm && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-destructive">Rejection Reason</h3>
              <div className="space-y-2">
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Explain why this submission is being returned to the collector..."
                  className="min-h-[100px]"
                />
                <p className="text-xs text-muted-foreground">This reason is stored in submissions.rejection_reason and recorded in task_events.metadata.</p>
              </div>
            </section>
          )}
        </SheetBody>

        {/* Footer actions */}
        {(isPending || isTest) && (
          <SheetFooter className="flex-col gap-2 sm:flex-row">
            {isTest && canManageTestData && !showRejectForm && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive sm:mr-auto"
                onClick={() => onDeleteTest(submission)}
                disabled={actionLoading}
              >
                <Trash2 className="h-4 w-4" /> Delete test submission
              </Button>
            )}
            {isPending && (showRejectForm ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowRejectForm(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={submitReject}
                  disabled={actionLoading || !rejectReason.trim()}
                >
                  {actionLoading ? "Rejecting..." : "Confirm rejection"}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/5"
                  onClick={() => setShowRejectForm(true)}
                  disabled={actionLoading}
                >
                  <XCircle className="h-4 w-4" /> Reject
                </Button>
                <Button
                  onClick={onApprove}
                  disabled={actionLoading}
                >
                  {actionLoading ? "Approving..." : "Approve submission"}
                </Button>
              </>
            ))}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailRow({
  icon, label, value,
}: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-0.5 truncate text-sm text-foreground">{value}</div>
    </div>
  );
}

function EvidenceFile({ label, path }: { label: string; path: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground"><ImageIcon className="h-4 w-4 text-primary" />{label}</div>
      <p className="mt-2 break-all font-mono text-[11px] leading-4 text-muted-foreground">{path}</p>
    </div>
  );
}

function MetricCard({
  label, value, icon, tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "default" | "warning" | "success" | "destructive";
}) {
  const toneClass = {
    default: "text-muted-foreground",
    warning: "text-warning",
    success: "text-success",
    destructive: "text-destructive",
  }[tone];
  return (
    <div className="interactive-card group p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none ${toneClass}`}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
    </div>
  );
}
