import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  KeyRound,
  MapPin,
  MessageCircle,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { LandingNavbar } from "@/components/landing-navbar";
import { LandingBrandReveal } from "@/components/landing-brand-reveal";
import { BrandLogo } from "@/components/brand-logo";

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
        <section className="landing-hero-frame">
          <div className="landing-hero relative isolate flex overflow-hidden">
            <div aria-hidden="true" className="landing-hero__glow landing-hero__glow--top" />
            <div aria-hidden="true" className="landing-hero__glow landing-hero__glow--bottom" />
            <div className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-3 py-4 sm:px-5 md:px-6 lg:px-8">
              <div className="w-full min-w-0">
                <LandingBrandReveal />
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="mx-auto max-w-7xl px-4 py-20 md:px-6 lg:px-8 lg:py-24">
          <SectionIntro
            eyebrow="What Polis Systems does"
            title="A practical operating layer for cleaner neighborhoods."
            description="Coordinate cleaner neighborhoods, one verified task at a time. Polis Systems connects field collectors and operators through one clear workflow for assigning, documenting, verifying, and reporting cleanup work."
          />
          <div className="landing-section-reveal mt-10 grid items-stretch gap-5 lg:grid-cols-[18rem_1fr]">
            <figure className="surface-card overflow-hidden">
              <img loading="lazy" className="aspect-video w-full object-cover" src="/collector-fieldwork.svg" alt="Collector working alongside gathered recyclable materials" />
              <figcaption className="px-5 py-4 text-sm font-medium leading-6 text-navy-700">Collectors connect each assignment to visible work on the ground.</figcaption>
            </figure>
            <div className="grid gap-5 sm:grid-cols-3">
              <Feature icon={<ClipboardCheck className="h-5 w-5" />} title="Clear assignments" text="Give every cleanup task a location, priority, deadline, and accountable collector." />
              <Feature icon={<ShieldCheck className="h-5 w-5" />} title="Verified outcomes" text="Review field proof before work is counted toward operational impact." />
              <Feature icon={<Users className="h-5 w-5" />} title="Connected teams" text="Keep operators, partners, and collectors aligned across every zone." />
            </div>
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
              <WorkflowStep number="03" icon={<MessageCircle className="h-4 w-4" />} title="Submit proof" text="Collectors post before and after images that document the completed collection work." />
              <WorkflowStep number="04" icon={<FileCheck2 className="h-4 w-4" />} title="Review the work" text="Managers approve valid proof or return it with a clear reason." />
              <WorkflowStep number="05" icon={<BarChart3 className="h-4 w-4" />} title="Make it visible" text="Reports turn operational records into a shared view of progress." />
            </ol>
            <div className="landing-section-reveal mt-8 grid overflow-hidden rounded-2xl border border-navy-100 bg-white shadow-surface md:grid-cols-[1fr_0.9fr]">
              <figure className="bg-navy-50 p-3 sm:p-5">
                <img loading="lazy" className="aspect-square w-full rounded-xl object-cover ring-1 ring-navy-100" src="/cleanup-before-after.svg" alt="The same cleanup site before collection, with dumped waste, and after collection, with the area cleared" />
                <figcaption className="sr-only">Before and after photographic proof of completed collection work.</figcaption>
              </figure>
              <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
                <div className="icon-tile h-11 w-11"><Camera className="h-5 w-5" /></div>
                <p className="mt-5 text-sm font-semibold text-primary">Before-and-after proof</p>
                <h3 className="mt-2 text-2xl font-semibold leading-tight tracking-tight text-navy-950 sm:text-3xl">Collectors show the change, not just mark a task complete.</h3>
                <p className="mt-4 leading-7 text-navy-600">After collection work, collectors post clear before and after images. The paired proof gives operators a reliable visual record to review before approving the task.</p>
                <ul className="mt-5 space-y-3 text-sm text-navy-700">
                  <Benefit>The before image records the starting condition</Benefit>
                  <Benefit>The after image confirms the completed cleanup</Benefit>
                  <Benefit>Review decisions stay connected to the task record</Benefit>
                </ul>
              </div>
            </div>
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
              <img loading="lazy" className="h-80 w-full rounded-2xl object-cover shadow-surface ring-1 ring-navy-100 sm:h-[26rem]" src="/collector-impact.svg" alt="Collector transporting gathered waste for responsible disposal" />
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
            <div className="flex items-center gap-2.5">
              <BrandLogo decorative className="h-9 w-9 shadow-sm ring-1 ring-navy-100" />
              <p className="text-base font-semibold text-navy-950">Polis <span className="text-primary">Systems</span></p>
            </div>
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
