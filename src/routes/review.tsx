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
import { Search, X, ClipboardCheck, Clock3, CircleCheck as CheckCircle2, Circle as XCircle, MapPin, User, Phone, CircleAlert as AlertCircle, Image as ImageIcon, Weight, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import {
  fetchSubmissions, approveSubmission, rejectSubmission,
  type SubmissionWithRelations,
} from "@/lib/submission-store";

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
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<SubmissionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<ReviewTab>("pending");
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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

  const emptyState = (() => {
    if (hasActiveFilters && filtered.length === 0) {
      return { title: "No submissions match your filters", description: "Try adjusting search or zone filters.", showClear: true };
    }
    if (tab === "pending") return { title: "All caught up", description: "No submissions are waiting for review. New field proof will appear here when collectors complete tasks." };
    if (tab === "approved") return { title: "No approved submissions yet", description: "Approved submissions will appear here once you review pending proof of work." };
    if (tab === "rejected") return { title: "No rejected submissions", description: "Returned submissions will appear here if proof of work needs revision." };
    return { title: "No submissions found", description: "Submissions will appear here once collectors submit proof of work." };
  })();

  return (
    <>
      <PageHeader title="Submission Review" description="Verify cleanup evidence and approve or return field submissions" />

      <div className="space-y-4 p-5">
        {/* Summary metrics */}
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search task, collector, zone, or waste type"
              className="h-9 pl-8"
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
          <div className="space-y-3 rounded-md border border-border bg-card p-4">
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
          <div className="flex flex-col items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
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
          <div className="overflow-auto rounded-md border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
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
                      <div className="text-sm font-medium text-foreground">
                        {s.task?.title ?? "Unknown task"}
                      </div>
                      <div className="text-xs text-muted-foreground">
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

      <SubmissionDetailDrawer
        submission={selected}
        open={drawerOpen}
        onOpenChange={closeDrawer}
        onApprove={handleApprove}
        onReject={handleReject}
        actionLoading={actionLoading}
      />
    </>
  );
}

// ─── Detail Drawer ──────────────────────────────────────────────────────────

function SubmissionDetailDrawer({
  submission,
  open,
  onOpenChange,
  onApprove,
  onReject,
  actionLoading,
}: {
  submission: SubmissionWithRelations | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
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
            {task && <Badge variant="muted">{task.priority} priority</Badge>}
            {task && <Badge variant="muted">{task.hotspotType}</Badge>}
          </div>
        </SheetHeader>

        <SheetBody className="space-y-6">
          {/* Task info */}
          {task && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Task Details</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border bg-card p-4">
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
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-md border border-border bg-card p-4">
                <DetailRow icon={<User className="h-3.5 w-3.5" />} label="Name" value={collector.name} />
                <DetailRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={collector.phone} />
                <DetailRow label="Zone" value={collector.zoneName} />
              </div>
            </section>
          )}

          {/* Submission evidence */}
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission Evidence</h3>
            <div className="space-y-3 rounded-md border border-border bg-card p-4">
              <DetailRow icon={<Weight className="h-3.5 w-3.5" />} label="Waste type" value={submission.wasteType ?? "—"} />
              <DetailRow label="Quantity estimate" value={submission.quantityEstimate ?? "—"} />
              {submission.submittedLatitude != null && submission.submittedLongitude != null && (
                <DetailRow
                  icon={<MapPin className="h-3.5 w-3.5" />}
                  label="GPS coordinates"
                  value={`${submission.submittedLatitude.toFixed(5)}, ${submission.submittedLongitude.toFixed(5)}`}
                />
              )}
              {submission.beforePhotoPath && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" /> Before photo: <span className="font-mono text-xs">{submission.beforePhotoPath}</span>
                </div>
              )}
              {submission.afterPhotoPath && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" /> After photo: <span className="font-mono text-xs">{submission.afterPhotoPath}</span>
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
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
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
        {isPending && (
          <SheetFooter className="flex-col gap-2 sm:flex-row">
            {showRejectForm ? (
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
            )}
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
    <div className="rounded-md border border-border bg-card p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
