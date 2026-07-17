import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  KeyRound,
  MapPin,
  MessageCircle,
  Radio,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LandingNavbar } from "@/components/landing-navbar";
import { LandingBrandReveal } from "@/components/landing-brand-reveal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Polis Systems — Cleaner Cities. Better Work." },
      { name: "description", content: "Structured cleanup operations for managers, collectors, and field teams." },
    ],
  }),
  component: LandingPage,
});

const capabilities = [
  { icon: <ClipboardCheck className="h-5 w-5" />, title: "Task management", text: "Create, prioritize, assign, and track cleanup work from one operational workspace." },
  { icon: <Users className="h-5 w-5" />, title: "Collector management", text: "Maintain collector records, zones, availability, and assignment history." },
  { icon: <FileCheck2 className="h-5 w-5" />, title: "Proof review", text: "Review submitted evidence and maintain a clear approval or rejection trail." },
  { icon: <BarChart3 className="h-5 w-5" />, title: "Operational reporting", text: "Understand task status, collector activity, waste records, and exportable results." },
  { icon: <KeyRound className="h-5 w-5" />, title: "Role-based access", text: "Keep operational tools available only to approved administrators and operators." },
  { icon: <MessageCircle className="h-5 w-5" />, title: "WhatsApp-first workflow", text: "Designed for future assignment delivery and proof collection through WhatsApp.", upcoming: true },
];

function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-navy-950">
      <LandingNavbar />
      <main>
        <section className="relative isolate overflow-hidden bg-[linear-gradient(135deg,hsl(var(--navy-50))_0%,white_48%,hsl(var(--primary)/0.08)_100%)] pb-20 pt-28 sm:pb-24 sm:pt-36 lg:pb-28 lg:pt-40">
          <div aria-hidden="true" className="absolute -right-32 -top-36 -z-10 h-[32rem] w-[32rem] rounded-full bg-primary/10 blur-3xl" />
          <div aria-hidden="true" className="absolute -bottom-56 left-[28%] -z-10 h-[28rem] w-[28rem] rounded-full bg-sky-100/60 blur-3xl" />
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 md:grid-cols-[0.92fr_1.08fr] md:px-6 lg:gap-16 lg:px-8">
            <div className="motion-safe:animate-fade-up">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-white/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-primary shadow-sm">
                <Radio className="h-3.5 w-3.5" /> Field operations for cleaner cities
              </p>
              <h1 className="max-w-2xl text-4xl font-semibold leading-[1.06] tracking-[-0.04em] text-navy-950 sm:text-5xl lg:text-6xl">
                Cleaner Cities. <span className="text-primary">Better Work.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-navy-600">
                Coordinate cleaner neighborhoods, one verified task at a time. Polis Systems connects field collectors and operators through one clear workflow for assigning, documenting, and verifying cleanup work.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <Link to="/signup" className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-primary-dark hover:shadow-xl motion-reduce:transform-none">
                  Request access <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#how-it-works" className="focus-ring inline-flex min-h-12 items-center justify-center rounded-xl border border-navy-100 bg-white px-5 py-3 text-sm font-semibold text-navy-700 shadow-sm transition-colors hover:border-primary/20 hover:bg-navy-50">
                  Explore the workflow
                </a>
              </div>
              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-navy-600">
                <Signal>Structured assignments</Signal>
                <Signal>Verified field proof</Signal>
                <Signal>Clear audit trail</Signal>
              </div>
            </div>

            <div className="relative motion-safe:animate-fade-up [animation-delay:100ms]">
              <div aria-hidden="true" className="absolute -inset-4 -z-10 rounded-[2rem] bg-primary/10 blur-2xl" />
              <LandingBrandReveal />
            </div>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-4 py-20 md:px-6 lg:px-8 lg:py-24">
          <SectionIntro
            eyebrow="What Polis Systems does"
            title="A practical operating layer for cleaner neighborhoods."
            description="Bring field assignments, collector participation, proof review, and reporting into one accountable workflow."
          />
          <div className="landing-section-reveal mt-10 grid gap-5 md:grid-cols-3">
            <Feature icon={<ClipboardCheck className="h-5 w-5" />} title="Clear assignments" text="Give every cleanup task a location, priority, deadline, and accountable collector." />
            <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Verified outcomes" text="Review field proof before work is counted toward operational impact." />
            <Feature icon={<Users className="h-5 w-5" />} title="Connected teams" text="Keep operators, partners, and collectors aligned across every zone." />
          </div>
        </section>

        <section id="how-it-works" className="relative border-y border-navy-100 bg-navy-50/80 py-20 lg:py-24">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
          <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-8">
            <SectionIntro
              eyebrow="How the workflow works"
              title="From assignment to visible results."
              description="A concise operational path designed for managers in the dashboard and collectors in the field."
            />
            <ol className="landing-section-reveal mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <WorkflowStep number="01" icon={<ClipboardCheck className="h-4 w-4" />} title="Create and assign" text="Managers define the work, location, priority, and responsible collector." />
              <WorkflowStep number="02" icon={<Send className="h-4 w-4" />} title="Deliver clearly" text="The intended WhatsApp-first workflow will bring assignments to collectors." upcoming />
              <WorkflowStep number="03" icon={<MessageCircle className="h-4 w-4" />} title="Submit proof" text="Collectors document the completed work and send supporting evidence." />
              <WorkflowStep number="04" icon={<FileCheck2 className="h-4 w-4" />} title="Review the work" text="Managers approve valid proof or return it with a clear reason." />
              <WorkflowStep number="05" icon={<BarChart3 className="h-4 w-4" />} title="Make it visible" text="Reports turn operational records into a shared view of progress." />
            </ol>
          </div>
        </section>

        <section id="capabilities" className="mx-auto max-w-7xl px-4 py-20 md:px-6 lg:px-8 lg:py-24">
          <SectionIntro
            eyebrow="Core capabilities"
            title="The essentials for accountable field operations."
            description="Focused tools for the work Polis Systems supports today, with upcoming channels labeled clearly."
          />
          <div className="landing-section-reveal mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {capabilities.map((capability) => <Capability key={capability.title} {...capability} />)}
          </div>
        </section>

        <section id="impact" className="border-y border-navy-100 bg-[linear-gradient(145deg,white,hsl(var(--navy-50)))]">
          <div className="landing-section-reveal mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 md:grid-cols-[1.05fr_0.95fr] md:px-6 lg:gap-16 lg:px-8 lg:py-24">
            <div className="relative">
              <div aria-hidden="true" className="absolute -inset-3 -z-10 rounded-[1.75rem] bg-primary/5" />
              <img loading="lazy" className="h-80 w-full rounded-2xl object-cover shadow-surface ring-1 ring-navy-100 sm:h-[26rem]" src="/images/collector-impact.jpg" alt="Community cleanup activity" />
            </div>
            <div>
              <div className="icon-tile h-11 w-11"><MapPin className="h-5 w-5" /></div>
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-tight text-navy-950 sm:text-4xl">Operational visibility that supports real-world impact.</h2>
              <p className="mt-5 leading-7 text-navy-600">Track work across zones, recognize collector participation, and make better decisions with verified cleanup records.</p>
              <ul className="mt-6 space-y-3 text-sm text-navy-700">
                <Benefit>Clear responsibility for every task</Benefit>
                <Benefit>Consistent proof and review records</Benefit>
                <Benefit>Reports grounded in real operational data</Benefit>
              </ul>
            </div>
          </div>
        </section>

        <section className="px-4 py-20 md:px-6 lg:px-8 lg:py-24">
          <div className="landing-section-reveal relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-sidebar px-6 py-12 text-center text-white shadow-floating sm:px-10 sm:py-16">
            <div aria-hidden="true" className="absolute -right-20 -top-32 h-72 w-72 rounded-full bg-primary/35 blur-3xl" />
            <div aria-hidden="true" className="absolute -bottom-36 -left-12 h-64 w-64 rounded-full bg-sky-300/10 blur-3xl" />
            <div className="relative mx-auto max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-200">Polis Systems</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Cleaner Cities. Better Work.</h2>
              <p className="mt-4 leading-7 text-white/70">Build a clearer, more accountable workflow for the people coordinating cleanup work and the collectors delivering it.</p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Link to="/signup" className="focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-primary-dark">
                  Request access <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/login" className="focus-ring inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10">
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-navy-100 bg-navy-50/70">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-[1fr_auto] sm:items-end md:px-6 lg:px-8">
          <div className="max-w-md">
            <p className="text-base font-semibold text-navy-950">Polis <span className="text-primary">Systems</span></p>
            <p className="mt-1 text-sm font-medium text-navy-700">Cleaner Cities. Better Work.</p>
            <p className="mt-3 text-sm leading-6 text-navy-600">A professional operations platform for cleanup organizations, municipalities, NGOs, and field teams.</p>
          </div>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-navy-600 sm:justify-end">
            <a className="hover:text-primary" href="#about">About</a>
            <a className="hover:text-primary" href="#how-it-works">Workflow</a>
            <a className="hover:text-primary" href="#capabilities">Capabilities</a>
            <Link className="hover:text-primary" to="/login">Log in</Link>
            <Link className="hover:text-primary" to="/signup">Sign up</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Signal({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary" />{children}</span>;
}

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="landing-section-reveal max-w-2xl"><p className="text-sm font-semibold text-primary">{eyebrow}</p><h2 className="mt-2 text-3xl font-semibold leading-tight tracking-tight text-navy-950 sm:text-4xl">{title}</h2><p className="mt-4 max-w-xl text-base leading-7 text-navy-600">{description}</p></div>;
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article className="interactive-card group p-6"><div className="icon-tile transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none">{icon}</div><h3 className="mt-5 text-lg font-semibold text-navy-950">{title}</h3><p className="mt-2 text-sm leading-6 text-navy-600">{text}</p></article>;
}

function WorkflowStep({ number, icon, title, text, upcoming }: { number: string; icon: ReactNode; title: string; text: string; upcoming?: boolean }) {
  return <li className="surface-card relative p-5"><div className="flex items-center justify-between gap-2"><span className="inline-flex h-8 min-w-8 items-center justify-center rounded-lg bg-primary/10 px-2 text-xs font-bold text-primary">{number}</span><span className="text-primary">{icon}</span></div><h3 className="mt-5 text-base font-semibold text-navy-950">{title}</h3>{upcoming && <span className="mt-2 inline-flex rounded-full border border-primary/15 bg-primary/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">Upcoming integration</span>}<p className="mt-2 text-sm leading-6 text-navy-600">{text}</p></li>;
}

function Capability({ icon, title, text, upcoming }: { icon: ReactNode; title: string; text: string; upcoming?: boolean }) {
  return <article className="interactive-card group p-6"><div className="flex items-start justify-between gap-3"><div className="icon-tile transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none">{icon}</div>{upcoming && <span className="rounded-full border border-primary/15 bg-primary/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-primary">Upcoming</span>}</div><h3 className="mt-5 text-lg font-semibold text-navy-950">{title}</h3><p className="mt-2 text-sm leading-6 text-navy-600">{text}</p></article>;
}

function Benefit({ children }: { children: ReactNode }) {
  return <li className="flex items-start gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{children}</li>;
}
