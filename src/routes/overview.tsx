import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CircleAlert as AlertCircle, CheckCircle2, ClipboardCheck, Clock3, ShieldCheck, Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import { subscribeToOperationalDataChanges } from "@/lib/operational-events";
import type { TaskStatus } from "@/lib/mock-data";
import { getUserFacingError } from "@/lib/safe-display";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — Polis Systems" },
      { name: "description", content: "Operations overview: tasks, submissions, and recent activity." },
    ],
  }),
  component: OverviewPage,
});

interface OverviewStats {
  activeTasks: number;
  approvedSubmissions: number;
  totalCollectors: number;
  completedTasks: number;
}

interface RecentTask {
  id: string;
  title: string;
  address: string | null;
  status: TaskStatus;
}

interface RecentSubmission {
  id: string;
  reviewStatus: "pending" | "approved" | "rejected";
  submittedAt: string | null;
  taskTitle: string;
  collectorName: string;
}

const dbTaskStatus: Record<string, TaskStatus> = {
  draft: "open",
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  submitted: "submitted",
  approved: "approved",
  declined: "declined",
  rejected: "rejected",
  canceled: "canceled",
};

function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activeTasksRes, approvedSubmissionsRes, collectorsRes, completedTasksRes, recentTasksRes, recentSubmissionsRes] = await Promise.all([
        supabase.from("tasks").select("*", { count: "exact", head: true }).in("status", ["assigned", "accepted", "in_progress", "submitted"]),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("review_status", "approved"),
        supabase.from("collectors").select("*", { count: "exact", head: true }),
        supabase.from("tasks").select("*", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("tasks").select("id, title, address, status").order("created_at", { ascending: false }).limit(5),
        supabase
          .from("submissions")
          .select("id, review_status, submitted_at, tasks!inner(title), collectors!inner(name)")
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .limit(5),
      ]);

      const queryError = [
        activeTasksRes.error,
        approvedSubmissionsRes.error,
        collectorsRes.error,
        completedTasksRes.error,
        recentTasksRes.error,
        recentSubmissionsRes.error,
      ].find(Boolean);
      if (queryError) throw new Error(queryError.message);

      setStats({
        activeTasks: activeTasksRes.count ?? 0,
        approvedSubmissions: approvedSubmissionsRes.count ?? 0,
        totalCollectors: collectorsRes.count ?? 0,
        completedTasks: completedTasksRes.count ?? 0,
      });
      setRecentTasks((recentTasksRes.data ?? []).map((task) => ({
        id: task.id,
        title: task.title,
        address: task.address,
        status: dbTaskStatus[task.status] ?? "open",
      })));
      setRecentSubmissions((recentSubmissionsRes.data ?? []).map((submission: any) => ({
        id: submission.id,
        reviewStatus: submission.review_status,
        submittedAt: submission.submitted_at,
        taskTitle: submission.tasks?.title ?? "—",
        collectorName: submission.collectors?.name ?? "—",
      })));
    } catch (err) {
      setError(getUserFacingError(err, "The overview could not be loaded. Please try again."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return subscribeToOperationalDataChanges(() => { void load(); });
  }, [load]);

  if (loading) {
    return <OverviewLoading />;
  }

  if (error) {
    return (
      <>
        <PageHeader title="Overview" description="Operations snapshot across all zones" />
        <div className="mx-4 mt-5 flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center shadow-surface sm:mx-5 lg:mx-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10"><AlertCircle className="h-5 w-5 text-destructive" /></div>
          <h3 className="mt-2 text-sm font-semibold text-destructive">Failed to load overview</h3>
          <p className="mt-1 text-sm text-muted-foreground">{getUserFacingError(error, "The overview could not be loaded. Please try again.")}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description="Operations snapshot across all zones" />
      <div className="page-shell animate-fade-up">
        <section aria-label="Operations metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-[1.55fr_repeat(3,minmax(0,1fr))]">
          <OperationsLead activeTasks={stats?.activeTasks ?? 0} />
          <Metric label="Verified Submissions" value={stats?.approvedSubmissions ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
          <Metric label="Field Collectors" value={stats?.totalCollectors ?? 0} icon={<Users className="h-4 w-4" />} />
          <Metric label="Completed Tasks" value={stats?.completedTasks ?? 0} icon={<Clock3 className="h-4 w-4" />} tone="warning" />
        </section>

        <section className="overview-activity-grid grid grid-cols-1 gap-5 xl:grid-cols-[1.18fr_0.82fr]">
          <ActivityCard title="Recent Tasks" viewAllTo="/tasks">
            {recentTasks.length === 0 ? (
              <EmptyState icon={<ClipboardCheck className="h-5 w-5" />} title="No tasks yet" description="New cleanup tasks will appear here." />
            ) : recentTasks.map((task) => (
              <div key={task.id} className="relative flex min-w-0 items-center justify-between gap-4 px-5 py-3.5 transition-[background-color,transform] hover:bg-primary/[0.035] before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary/0 before:transition-colors hover:before:bg-primary/65">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.address || "No location provided"}</p>
                </div>
                <StatusBadge status={task.status} />
              </div>
            ))}
          </ActivityCard>

          <ActivityCard title="Recent Submissions" viewAllTo="/review">
            {recentSubmissions.length === 0 ? (
              <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title="No submissions yet" description="Submissions from field collectors will appear here." />
            ) : recentSubmissions.map((submission) => (
              <div key={submission.id} className="relative flex min-w-0 items-center justify-between gap-4 px-5 py-3.5 transition-[background-color,transform] hover:bg-primary/[0.035] before:absolute before:inset-y-3 before:left-0 before:w-[3px] before:rounded-r-full before:bg-primary/0 before:transition-colors hover:before:bg-primary/65">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{submission.collectorName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {submission.taskTitle} · {submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString() : "Not submitted"}
                  </p>
                </div>
                <Badge variant={submission.reviewStatus === "approved" ? "success" : submission.reviewStatus === "rejected" ? "destructive" : "warning"}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                  {submission.reviewStatus === "approved" ? "Verified" : submission.reviewStatus}
                </Badge>
              </div>
            ))}
          </ActivityCard>
        </section>
      </div>
    </>
  );
}

function OverviewLoading() {
  return (
    <>
      <PageHeader title="Overview" description="Operations snapshot across all zones" />
      <div className="page-shell">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1.55fr_repeat(3,minmax(0,1fr))]">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[120px] rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Skeleton className="h-[320px] rounded-xl" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    </>
  );
}

function OperationsLead({ activeTasks }: { activeTasks: number }) {
  return (
    <div className="overview-lead relative overflow-hidden rounded-2xl border border-primary/20 bg-primary p-5 text-primary-foreground shadow-[0_12px_26px_hsl(var(--primary)/0.18)]">
      <div aria-hidden="true" className="absolute -right-8 -top-8 h-28 w-28 rounded-full border border-white/15" />
      <div aria-hidden="true" className="absolute -bottom-12 right-10 h-28 w-28 rounded-full bg-white/[0.06]" />
      <div className="relative flex h-full flex-col justify-between gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Operations at a glance</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-0.045em] tabular-nums">{activeTasks}</p>
            <p className="mt-1 text-sm text-white/78">Active tasks across the workspace</p>
          </div>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 ring-1 ring-inset ring-white/15"><ClipboardCheck className="h-5 w-5" /></span>
        </div>
        <Link to="/tasks" className="group focus-ring inline-flex w-fit items-center gap-1.5 rounded-lg bg-white/12 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/18">
          Manage tasks <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

function ActivityCard({ title, viewAllTo, children }: { title: string; viewAllTo: "/tasks" | "/review"; children: React.ReactNode }) {
  return (
    <div className="surface-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/80 px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-[-0.015em] text-foreground">
          <span aria-hidden="true" className="h-2 w-2 rounded-full border border-primary/35 bg-primary/10" />
          {title}
        </h2>
        <Link to={viewAllTo} className="focus-ring rounded-md px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 hover:text-primary-dark">View all</Link>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Metric({ label, value, icon, tone = "default" }: { label: string; value: number; icon: React.ReactNode; tone?: "default" | "warning" | "success" }) {
  const toneClass = tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-primary";
  return (
    <div className="dashboard-metric group">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none ${toneClass}`}>{icon}</span>
      </div>
      <div className="mt-4 text-3xl font-semibold tracking-[-0.03em] text-foreground tabular-nums">{value}</div>
    </div>
  );
}
