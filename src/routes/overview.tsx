import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CircleAlert as AlertCircle, CheckCircle2, ClipboardCheck, Clock3, Users } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/status-badge";
import { supabase } from "@/integrations/supabase/client";
import type { TaskStatus } from "@/lib/mock-data";

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
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <OverviewLoading />;
  }

  if (error) {
    return (
      <>
        <PageHeader title="Overview" description="Operations snapshot across all zones" />
        <div className="mx-5 mt-5 flex flex-col items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 px-6 py-12 text-center">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <h3 className="mt-2 text-sm font-semibold text-destructive">Failed to load overview</h3>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description="Operations snapshot across all zones" />
      <div className="space-y-5 p-5">
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Active Tasks" value={stats?.activeTasks ?? 0} icon={<ClipboardCheck className="h-4 w-4" />} />
          <Metric label="Verified Submissions" value={stats?.approvedSubmissions ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
          <Metric label="Field Collectors" value={stats?.totalCollectors ?? 0} icon={<Users className="h-4 w-4" />} />
          <Metric label="Completed Tasks" value={stats?.completedTasks ?? 0} icon={<Clock3 className="h-4 w-4" />} tone="warning" />
        </section>

        <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <ActivityCard title="Recent Tasks" viewAllTo="/tasks">
            {recentTasks.length === 0 ? (
              <EmptyState title="No tasks yet" description="New cleanup tasks will appear here." />
            ) : recentTasks.map((task) => (
              <div key={task.id} className="flex min-w-0 items-center justify-between gap-4 px-4 py-3">
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
              <EmptyState title="No submissions yet" description="Submissions from field collectors will appear here." />
            ) : recentSubmissions.map((submission) => (
              <div key={submission.id} className="flex min-w-0 items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{submission.collectorName}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {submission.taskTitle} · {submission.submittedAt ? new Date(submission.submittedAt).toLocaleDateString() : "Not submitted"}
                  </p>
                </div>
                <Badge variant={submission.reviewStatus === "approved" ? "success" : submission.reviewStatus === "rejected" ? "destructive" : "warning"}>
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
      <div className="space-y-5 p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[104px] rounded-md" />)}
        </div>
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Skeleton className="h-[300px] rounded-md" />
          <Skeleton className="h-[300px] rounded-md" />
        </div>
      </div>
    </>
  );
}

function ActivityCard({ title, viewAllTo, children }: { title: string; viewAllTo: "/tasks" | "/review"; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <Link to={viewAllTo} className="text-xs font-medium text-primary hover:underline">View all</Link>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Metric({ label, value, icon, tone = "default" }: { label: string; value: number; icon: React.ReactNode; tone?: "default" | "warning" | "success" }) {
  const toneClass = tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-primary";
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        <span className={toneClass}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-foreground">{value}</div>
    </div>
  );
}
