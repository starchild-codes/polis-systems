import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleAlert as AlertCircle, Clock3, ClipboardCheck, CircleCheck as CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/overview")({
  head: () => ({
    meta: [
      { title: "Overview — Polis Systems" },
      { name: "description", content: "Operations overview: active tasks, submissions, and recent activity." },
    ],
  }),
  component: OverviewPage,
});

interface OverviewStats {
  pendingSubmissions: number;
  approvedSubmissions: number;
  totalTasks: number;
  activeTasks: number;
}

interface RecentSubmission {
  id: string;
  review_status: "pending" | "approved" | "rejected";
  submitted_at: string | null;
  task_title: string | null;
  collector_name: string | null;
}

function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [recent, setRecent] = useState<RecentSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [subCountRes, appSubCountRes, taskCountRes, activeTaskRes, recentSubsRes] = await Promise.all([
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("review_status", "pending"),
        supabase.from("submissions").select("*", { count: "exact", head: true }).eq("review_status", "approved"),
        supabase.from("tasks").select("*", { count: "exact", head: true }),
        supabase.from("tasks").select("*", { count: "exact", head: true }).in("status", ["assigned", "accepted", "in_progress", "submitted"]),
        supabase
          .from("submissions")
          .select(`
            id, review_status, submitted_at,
            tasks!inner(title),
            collectors!inner(name)
          `)
          .order("submitted_at", { ascending: false, nullsFirst: false })
          .limit(5),
      ]);

      const queryError = [
        subCountRes.error,
        appSubCountRes.error,
        taskCountRes.error,
        activeTaskRes.error,
        recentSubsRes.error,
      ].find(Boolean);
      if (queryError) throw new Error(queryError.message);

      setStats({
        pendingSubmissions: subCountRes.count ?? 0,
        approvedSubmissions: appSubCountRes.count ?? 0,
        totalTasks: taskCountRes.count ?? 0,
        activeTasks: activeTaskRes.count ?? 0,
      });

      setRecent(
        (recentSubsRes.data ?? []).map((row: any) => ({
          id: row.id,
          review_status: row.review_status,
          submitted_at: row.submitted_at,
          task_title: row.tasks?.title ?? "—",
          collector_name: row.collectors?.name ?? "—",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load overview");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <>
        <PageHeader title="Overview" description="Operations snapshot across all zones" />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[88px] rounded-md" />)}
          </div>
          <Skeleton className="h-[300px] rounded-md" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Overview" description="Operations snapshot across all zones" />
        <div className="flex flex-col items-center justify-center rounded-md border border-destructive/30 bg-destructive/5 px-6 py-12 text-center mt-5 mx-5">
          <AlertCircle className="h-6 w-6 text-destructive" />
          <h3 className="mt-2 text-sm font-semibold text-destructive">Failed to load</h3>
          <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Overview" description="Operations snapshot across all zones" />
      <div className="space-y-5 p-5">
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric label="Pending Submissions" value={stats?.pendingSubmissions ?? 0} icon={<Clock3 className="h-4 w-4" />} tone="warning" />
          <Metric label="Approved Submissions" value={stats?.approvedSubmissions ?? 0} icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
          <Metric label="Active Tasks" value={stats?.activeTasks ?? 0} icon={<ClipboardCheck className="h-4 w-4" />} />
          <Metric label="Total Tasks" value={stats?.totalTasks ?? 0} icon={<ClipboardCheck className="h-4 w-4" />} />
        </section>

        <section className="rounded-md border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h2 className="text-sm font-semibold text-foreground">Recent Submissions</h2>
            <Link to="/review" className="text-xs font-medium text-primary hover:underline">
              View all →
            </Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={<ClipboardCheck className="h-5 w-5" />}
              title="No submissions yet"
              description="Submissions from field collectors will appear here."
            />
          ) : (
            <div className="divide-y divide-border">
              {recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between px-4 py-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{s.task_title}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.collector_name} · {s.submitted_at ? new Date(s.submitted_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <Badge variant={s.review_status === "approved" ? "success" : s.review_status === "rejected" ? "destructive" : "warning"}>
                    {s.review_status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function Metric({
  label, value, icon, tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone?: "default" | "warning" | "success";
}) {
  const toneClass = tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-muted-foreground";
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
