import { createFileRoute } from "@tanstack/react-router";
import { mockCollectors } from "@/lib/data";

export const Route = createFileRoute("/dashboard/collectors")({
  component: CollectorsPage,
});

function CollectorsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-950">Collectors</h1>
        <p className="text-navy-500 mt-1">Field workers and their assignments.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {mockCollectors.map((collector) => (
          <div
            key={collector.id}
            className="rounded-xl border border-navy-100 bg-white p-5"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-institutional-100 text-institutional-700 font-semibold text-sm">
                {collector.name.split(" ").map((n) => n[0]).join("")}
              </div>
              <div>
                <p className="font-medium text-navy-900">{collector.name}</p>
                <p className="text-xs text-navy-400">{collector.phone}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div>
                <p className="text-navy-400">Zone</p>
                <p className="text-navy-700 font-medium">{collector.zone}</p>
              </div>
              <div className="text-right">
                <p className="text-navy-400">Completed</p>
                <p className="text-navy-700 font-medium">{collector.tasksCompleted}</p>
              </div>
              <div className="text-right">
                <p className="text-navy-400">Active</p>
                <p className="text-navy-700 font-medium">{collector.activeTasks}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
