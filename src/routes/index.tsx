import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, MapPin, Users } from "lucide-react";
import { LandingNavbar } from "@/components/landing-navbar";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Polis Systems" }] }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-navy-950">
      <LandingNavbar />
      <main>
        <section className="relative overflow-hidden bg-navy-50 pb-16 pt-32 sm:pb-24 sm:pt-40">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:grid-cols-2 md:px-6 lg:px-8">
            <div>
              <p className="mb-4 text-sm font-semibold uppercase tracking-[0.16em] text-primary">Municipal cleanup operations</p>
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-navy-950 sm:text-5xl">Coordinate cleaner neighborhoods, one verified task at a time.</h1>
              <p className="mt-5 max-w-lg text-lg leading-8 text-navy-600">Polis Systems connects field collectors and operators with one clear workflow for assigning, documenting, and verifying cleanup work.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login" search={{ mode: "signup" }} className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-primary-dark">Request access <ArrowRight className="h-4 w-4" /></Link>
                <a href="#how-it-works" className="inline-flex items-center rounded-lg border border-navy-100 bg-white px-5 py-3 text-sm font-medium text-navy-700 hover:bg-navy-50">See how it works</a>
              </div>
            </div>
            <img className="h-[320px] w-full rounded-2xl object-cover shadow-lg sm:h-[400px]" src="/images/collector-hero.jpg" alt="Field collector documenting cleanup work" />
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-4 py-16 md:px-6 lg:px-8">
          <div className="max-w-2xl"><p className="text-sm font-semibold text-primary">Built for local operations</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">A practical system for teams in the field.</h2></div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Feature icon={<ClipboardCheck className="h-5 w-5" />} title="Clear assignments" text="Give every cleanup task a location, priority, deadline, and accountable collector." />
            <Feature icon={<CheckCircle2 className="h-5 w-5" />} title="Verified outcomes" text="Review field proof before work is counted toward operational impact." />
            <Feature icon={<Users className="h-5 w-5" />} title="Connected teams" text="Keep operators, partners, and collectors aligned across every zone." />
          </div>
        </section>

        <section id="how-it-works" className="bg-navy-50 py-16"><div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8"><p className="text-sm font-semibold text-primary">How it works</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">From cleanup request to confirmed result.</h2><div className="mt-10 grid gap-6 md:grid-cols-3"><Step number="01" title="Create a task" text="Operators capture the location, instructions, and priority." /><Step number="02" title="Assign a collector" text="Active field collectors receive work in their operating zone." /><Step number="03" title="Review the proof" text="Operators verify submissions and maintain a complete audit trail." /></div></div></section>

        <section id="impact" className="mx-auto grid max-w-7xl gap-8 px-4 py-16 md:grid-cols-[1fr_1.1fr] md:px-6 lg:px-8"><img className="h-72 w-full rounded-2xl object-cover" src="/images/collector-impact.jpg" alt="Community cleanup activity" /><div className="self-center"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></div><h2 className="mt-4 text-3xl font-semibold tracking-tight">Operational visibility that supports real-world impact.</h2><p className="mt-4 leading-7 text-navy-600">Track work across zones, recognize collector participation, and make better decisions with verified cleanup records.</p><Link to="/login" search={{ mode: "signin" }} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-dark">Log in to Polis Systems <ArrowRight className="h-4 w-4" /></Link></div></section>
      </main>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) { return <article className="rounded-xl border border-navy-100 bg-white p-6"><div className="text-primary">{icon}</div><h3 className="mt-4 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-navy-600">{text}</p></article>; }
function Step({ number, title, text }: { number: string; title: string; text: string }) { return <article className="rounded-xl border border-navy-100 bg-white p-6"><span className="text-sm font-semibold text-primary">{number}</span><h3 className="mt-5 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-navy-600">{text}</p></article>; }
