import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, ClipboardCheck, Eye, MapPin, Radio, Users } from "lucide-react";
import { LandingNavbar } from "@/components/landing-navbar";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Polis Systems" }] }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="min-h-screen overflow-hidden bg-white text-navy-950">
      <LandingNavbar />
      <main>
        <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,hsl(var(--navy-50))_0%,white_48%,hsl(var(--primary)/0.08)_100%)] pb-20 pt-32 sm:pb-28 sm:pt-40">
          <div aria-hidden="true" className="absolute -right-32 -top-36 -z-10 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-56 left-[28%] -z-10 h-[28rem] w-[28rem] rounded-full bg-sky-100/60 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:grid-cols-[0.95fr_1.05fr] md:px-6 lg:gap-16 lg:px-8">
            <div className="motion-safe:animate-fade-up">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary shadow-sm">
                <Radio className="h-3.5 w-3.5" /> Municipal cleanup operations
              </p>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.035em] text-navy-950 sm:text-5xl lg:text-6xl">
                Making the invisible <span className="text-primary">visible</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-navy-600">
                Coordinate cleaner neighborhoods, one verified task at a time. Polis Systems connects field collectors and operators with one clear workflow for assigning, documenting, and verifying cleanup work.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link to="/signup" className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-xl motion-reduce:transform-none">
                  Request access <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#how-it-works" className="focus-ring inline-flex min-h-12 items-center justify-center rounded-xl border border-navy-100 bg-white px-5 py-3 text-sm font-semibold text-navy-700 shadow-sm transition-colors hover:border-primary/20 hover:bg-navy-50">
                  See how it works
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-600">
                <Signal>Structured assignments</Signal>
                <Signal>Verified field proof</Signal>
                <Signal>Clear audit trail</Signal>
              </div>
            </div>

            <div className="relative motion-safe:animate-fade-up [animation-delay:100ms]">
              <div className="absolute -inset-3 -z-10 rounded-[1.75rem] bg-primary/10 blur-xl" />
              <img className="h-[340px] w-full rounded-2xl object-cover shadow-floating ring-1 ring-navy-100 sm:h-[440px]" src="/images/collector-hero.jpg" alt="Field collector documenting cleanup work" />
              <div className="absolute inset-x-4 bottom-4 rounded-xl border border-white/60 bg-white/95 p-4 shadow-lg backdrop-blur sm:inset-x-auto sm:bottom-6 sm:left-6 sm:min-w-72">
                <div className="flex items-start gap-3">
                  <div className="icon-tile"><Eye className="h-4 w-4" /></div>
                  <div>
                    <p className="text-sm font-semibold text-navy-950">One operational view</p>
                    <p className="mt-1 text-xs leading-5 text-navy-600">Assign work, document proof, and verify outcomes.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-4 py-20 md:px-6 lg:px-8 lg:py-24">
          <SectionIntro eyebrow="Built for local operations" title="A practical system for teams in the field." />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            <Feature icon={<ClipboardCheck className="h-5 w-5" />} title="Clear assignments" text="Give every cleanup task a location, priority, deadline, and accountable collector." />
            <Feature icon={<CheckCircle2 className="h-5 w-5" />} title="Verified outcomes" text="Review field proof before work is counted toward operational impact." />
            <Feature icon={<Users className="h-5 w-5" />} title="Connected teams" text="Keep operators, partners, and collectors aligned across every zone." />
          </div>
        </section>

        <section id="how-it-works" className="relative border-y border-navy-100 bg-navy-50/80 py-20 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
            <SectionIntro eyebrow="How it works" title="From cleanup request to confirmed result." />
            <div className="relative mt-10 grid gap-5 md:grid-cols-3">
              <Step number="01" title="Create a task" text="Operators capture the location, instructions, and priority." />
              <Step number="02" title="Assign a collector" text="Active field collectors receive work in their operating zone." />
              <Step number="03" title="Review the proof" text="Operators verify submissions and maintain a complete audit trail." />
            </div>
          </div>
        </section>

        <section id="impact" className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 md:grid-cols-[1.05fr_0.95fr] md:px-6 lg:gap-16 lg:px-8 lg:py-24">
          <div className="relative">
            <div aria-hidden="true" className="absolute -inset-3 -z-10 rounded-[1.75rem] bg-primary/5" />
            <img loading="lazy" className="h-80 w-full rounded-2xl object-cover shadow-surface ring-1 ring-navy-100 sm:h-[26rem]" src="/images/collector-impact.jpg" alt="Community cleanup activity" />
          </div>
          <div>
            <div className="icon-tile h-11 w-11"><MapPin className="h-5 w-5" /></div>
            <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-navy-950 sm:text-4xl">Operational visibility that supports real-world impact.</h2>
            <p className="mt-5 leading-7 text-navy-600">Track work across zones, recognize collector participation, and make better decisions with verified cleanup records.</p>
            <Link to="/login" className="focus-ring mt-7 inline-flex items-center gap-2 rounded-lg text-sm font-semibold text-primary transition-colors hover:text-primary-dark">
              Log in to Polis Systems <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-navy-100 bg-navy-50/60">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-7 text-sm text-navy-600 sm:flex-row sm:items-center sm:justify-between md:px-6 lg:px-8">
          <p className="font-semibold text-navy-900">Polis Systems</p>
          <p>Structured field operations. Accountable community impact.</p>
        </div>
      </footer>
    </div>
  );
}

function Signal({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" />{children}</span>;
}

function SectionIntro({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <div className="max-w-2xl"><p className="text-sm font-semibold text-primary">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-navy-950 sm:text-4xl">{title}</h2></div>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article className="interactive-card group p-6"><div className="icon-tile transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none">{icon}</div><h3 className="mt-5 text-lg font-semibold text-navy-950">{title}</h3><p className="mt-2 text-sm leading-6 text-navy-600">{text}</p></article>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <article className="surface-card relative p-6"><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary/10 px-2 text-xs font-bold text-primary">{number}</span><h3 className="mt-5 text-lg font-semibold text-navy-950">{title}</h3><p className="mt-2 text-sm leading-6 text-navy-600">{text}</p></article>;
}
