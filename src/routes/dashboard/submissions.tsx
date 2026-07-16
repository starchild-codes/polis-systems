import { createFileRoute } from "@tanstack/react-router";
import { mockSubmissions } from "@/lib/data";

export const Route = createFileRoute("/dashboard/submissions")({
  component: SubmissionsPage,
});

function SubmissionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-navy-950">Submissions</h1>
        <p className="text-navy-500 mt-1">Field proof submissions from collectors.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-navy-100 bg-white">
        <table className="w-full">
          <thead className="border-b border-navy-100 bg-navy-50/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider">Collector</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider hidden sm:table-cell">Task ID</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider">Photos</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider hidden md:table-cell">Submitted</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-navy-500 uppercase tracking-wider">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy-50">
            {mockSubmissions.map((sub) => (
              <tr key={sub.id} className="hover:bg-navy-50/30 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-navy-900">{sub.collectorName}</td>
                <td className="px-4 py-3 text-sm text-navy-600 hidden sm:table-cell">{sub.taskId}</td>
                <td className="px-4 py-3 text-sm text-navy-600">{sub.photoCount}</td>
                <td className="px-4 py-3 text-sm text-navy-600 hidden md:table-cell">
                  {new Date(sub.submittedAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded-full ${
                      sub.verified
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {sub.verified ? "Verified" : "Pending"}
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
