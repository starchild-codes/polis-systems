import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { LandingNavbar } from "@/components/landing-navbar";
import { PublicDashboardPreview } from "@/components/public-dashboard-preview";

export const Route = createFileRoute("/demo")({
  head: () => ({
    meta: [
      { title: "Dashboard Preview — Polis Systems" },
      { name: "description", content: "Explore a safe, read-only preview of the Polis Systems operations dashboard." },
    ],
  }),
  component: DashboardPreviewPage,
});

function DashboardPreviewPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f7fb] text-navy-950">
      <LandingNavbar />
      <main>
        <section className="border-b border-navy-100 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:px-8 lg:py-14">
            <Link to="/" className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-primary hover:text-primary-dark"><ArrowLeft className="h-3.5 w-3.5" /> Back to the public site</Link>
            <div className="mt-5 grid items-end gap-6 lg:grid-cols-[1fr_auto]">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary"><ShieldCheck className="h-3.5 w-3.5" /> Safe product preview</div>
                <h1 className="mt-4 text-4xl font-semibold tracking-[-0.045em] text-navy-950 sm:text-5xl">See how the work comes together.</h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-navy-600">Explore every core workspace without accessing a real organization. The records below are illustrative, every operational action is disabled, and no customer or collector data is loaded.</p>
              </div>
              <div className="rounded-2xl border border-navy-100 bg-navy-50 p-4 text-sm text-navy-700 lg:max-w-xs">
                <div className="flex gap-3"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><p><span className="font-semibold text-navy-950">Real access stays gated.</span><br />Approved organizations sign in to use live operations and reporting.</p></div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[96rem] px-3 py-6 sm:px-5 md:py-8 lg:px-8">
          <PublicDashboardPreview />
          <div className="mx-auto mt-8 flex max-w-3xl flex-col items-center rounded-2xl border border-navy-100 bg-white p-6 text-center shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Ready for a real workspace?</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-navy-950">Request access to run live operations.</h2>
            <p className="mt-3 text-sm leading-6 text-navy-600">New accounts stay safely pending until Polis Systems verifies and approves the organization.</p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link to="/signup" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-primary-dark">Sign up <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/login" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-xl border border-navy-200 bg-white px-5 py-3 text-sm font-semibold text-navy-800 hover:bg-navy-50">Log in</Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
