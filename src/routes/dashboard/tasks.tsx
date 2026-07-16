import { createFileRoute } from "@tanstack/react-router";
import { mockTasks, type TaskStatus } from "@/lib/data";

export const Route = createFileRoute("/dashboard/tasks")({
  component: TasksPage,
});

const statusColors: Record<TaskStatus, string> = {
  pending: "bg-navy-50 text-navy-600",
  assigned: "bg-institutional-50 text-institutional-700",
  in_progress: "bg-amber-50 text-amber-700",
  completed: "bg-emerald-50 text-emerald-700",
  verified: "bg-emerald-100 text-emerald-800",
};

function TasksPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-950">Tasks</h1>
        <p className="text-navy-500 mt-1">All cleanup tasks across zones.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
        <table className="w-full">
          <thead className="border-b border-navy-100 bg-navy-50/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider">Task</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider hidden md:table-cell">Location</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider">Assignee</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {mockTasks.map((task) => (
              <tr key={task.id} className="hover:bg-navy-50/30 transition-colors">
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-navy-900">{task.title}</p>
                  <p className="text-xs text-navy-400 md:hidden">{task.location}</p>
                </td>
                <td className="px-4 py-3 text-sm text-navy-600 hidden md:table-cell">{task.location}</td>
                <td className="px-4 py-3 text-sm text-navy-600">{task.assignee ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[task.status]}`}>
                    {task.status.replace("_", " ")}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
