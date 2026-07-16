import { createFileRoute } from "@tanstack/react-router";
import { mockTasks, mockCollectors, mockSubmissions } from "@/lib/data";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const { user } = useAuth();
  const stats = [
    {
      label: "Active Tasks",
      value: mockTasks.filter(
        (t) => t.status === "in_progress" || t.status === "assigned",
      ).length,
      accent: "text-institutional-700",
    },
    {
      label: "Verified Submissions",
      value: mockSubmissions.filter((s) => s.verified).length,
      accent: "text-emerald-700",
    },
    {
      label: "Field Collectors",
      value: mockCollectors.length,
      accent: "text-navy-700",
    },
    {
      label: "Completed Tasks",
      value: mockTasks.filter(
        (t) => t.status === "completed" || t.status === "verified",
      ).length,
      accent: "text-amber-700",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-950">Overview</h1>
        <p className="text-navy-500 mt-1">
          Welcome back{user?.email ? `, ${user.email}` : ""}.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-navy-100 bg-white p-5"
          >
            <p className="text-sm text-navy-500">{stat.label}</p>
            <p className={`text-3xl font-bold mt-2 ${stat.accent}`}>
              {stat.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-navy-100 bg-white p-5">
          <h2 className="font-semibold text-navy-900 mb-4">Recent Tasks</h2>
          <div className="space-y-3">
            {mockTasks.slice(0, 4).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between border-b border-navy-50 pb-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-navy-900">
                    {task.title}
                  </p>
                  <p className="text-xs text-navy-400">{task.location}</p>
                </div>
                <span className="text-xs font-medium px-2 py-1 rounded-full bg-navy-50 text-navy-600">
                  {task.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-navy-100 bg-white p-5">
          <h2 className="font-semibold text-navy-900 mb-4">
            Recent Submissions
          </h2>
          <div className="space-y-3">
            {mockSubmissions.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between border-b border-navy-50 pb-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-medium text-navy-900">
                    {sub.collectorName}
                  </p>
                  <p className="text-xs text-navy-400">
                    {sub.photoCount} photos ·{" "}
                    {new Date(sub.submittedAt).toLocaleDateString()}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    sub.verified
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {sub.verified ? "Verified" : "Pending"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
