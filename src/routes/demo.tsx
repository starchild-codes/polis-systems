import { createFileRoute } from "@tanstack/react-router";
import { PublicDashboardPreview } from "@/components/public-dashboard-preview";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Dashboard Preview — Polis Systems" },
      { name: "description", content: "Try the Polis Systems operations workflow in a safe, fictional dashboard sandbox." },
    ],
  }),
  component: DashboardPreviewPage,
});

function DashboardPreviewPage() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-[#eef3f9] p-2 text-navy-950 sm:p-4">
      <h1 className="sr-only">Interactive Polis Systems dashboard demo</h1>
      <PublicDashboardPreview />
    </main>
  );
}
