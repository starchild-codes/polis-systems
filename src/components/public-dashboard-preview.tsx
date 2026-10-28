import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  FileText,
  FileCheck2,
  LayoutDashboard,
  LockKeyhole,
  MapPin,
  Menu,
  MessageCircle,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type PreviewView = "overview" | "tasks" | "review" | "collectors" | "reports" | "settings";

const navigation: Array<{ id: PreviewView; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "tasks", label: "Tasks", icon: ClipboardCheck },
  { id: "review", label: "Review", icon: ShieldCheck },
  { id: "collectors", label: "Collectors", icon: Users },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

interface DemoTask {
  id: number;
  title: string;
  location: string;
  status: string;
  priority: string;
  collector: string;
  due: string;
}

const initialTasks: DemoTask[] = [
  { id: 1, title: "Clear illegal dumping near Lakeside Park", location: "North zone · Ward 12", status: "Assigned", priority: "High", collector: "Maya Thompson", due: "Today, 4:30 PM" },
  { id: 2, title: "Market recycling pickup", location: "Central zone · Market Street", status: "In progress", priority: "Medium", collector: "Jordan Lee", due: "Tomorrow" },
  { id: 3, title: "Canal-side plastic cleanup", location: "East zone · Riverwalk", status: "Awaiting review", priority: "Urgent", collector: "Sam Rivera", due: "Oct 30" },
  { id: 4, title: "Community garden waste removal", location: "West zone · Oak Avenue", status: "Approved", priority: "Low", collector: "Taylor Morgan", due: "Oct 27" },
];

const collectors = [
  { name: "Maya Thompson", initials: "MT", zone: "North", status: "Active", assignments: 4, completion: "94%" },
  { name: "Jordan Lee", initials: "JL", zone: "Central", status: "Active", assignments: 3, completion: "91%" },
  { name: "Sam Rivera", initials: "SR", zone: "East", status: "In field", assignments: 2, completion: "96%" },
  { name: "Taylor Morgan", initials: "TM", zone: "West", status: "Available", assignments: 1, completion: "89%" },
];

export function PublicDashboardPreview({ compact = false }: { compact?: boolean }) {
  const [activeView, setActiveView] = useState<PreviewView>("overview");
  const [demoTasks, setDemoTasks] = useState<DemoTask[]>(initialTasks);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("Try the controls — this sandbox resets when the page refreshes.");
  const [createOpen, setCreateOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"pending" | "approved" | "rejected">("pending");
  const [whatsappEnabled, setWhatsappEnabled] = useState(true);

  const visibleTasks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return demoTasks;
    return demoTasks.filter((task) => `${task.title} ${task.location} ${task.collector} ${task.status}`.toLowerCase().includes(normalized));
  }, [demoTasks, query]);

  function resetDemo() {
    setDemoTasks(initialTasks);
    setReviewDecision("pending");
    setWhatsappEnabled(true);
    setQuery("");
    setNotice("Demo workspace reset to its original state.");
  }

  function assignCollector(taskId: number, collector: string) {
    setDemoTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, collector, status: "Assigned" }
      : task));
    setNotice(`Collector assignment updated to ${collector}. No live record was changed.`);
  }

  function simulateWhatsApp(task: DemoTask) {
    setNotice(`Demo WhatsApp assignment prepared for ${task.collector}. No real message was sent.`);
  }

  async function downloadReport() {
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF();
    doc.setFillColor(20, 93, 174);
    doc.rect(0, 0, 210, 34, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(21);
    doc.text("Polis Systems", 16, 16);
    doc.setFontSize(10);
    doc.text("Illustrative Operations Report · Public Demo", 16, 25);
    doc.setTextColor(24, 39, 58);
    doc.setFontSize(15);
    doc.text("Operations summary", 16, 48);
    doc.setFontSize(10);
    doc.text("Verified cleanups: 186", 16, 59);
    doc.text("Active collectors: 32", 16, 67);
    doc.text("Completion rate: 92%", 16, 75);
    doc.text("Recorded waste: 4.8 tonnes", 16, 83);
    doc.setFontSize(13);
    doc.text("Illustrative task register", 16, 101);
    let y = 112;
    demoTasks.forEach((task, index) => {
      doc.setFillColor(index % 2 === 0 ? 246 : 255, index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 251 : 255);
      doc.rect(14, y - 6, 182, 18, "F");
      doc.setFontSize(9);
      doc.setTextColor(24, 39, 58);
      doc.text(task.title, 18, y);
      doc.setTextColor(90, 105, 125);
      doc.text(`${task.status} · ${task.collector} · ${task.location}`, 18, y + 7);
      y += 20;
    });
    doc.setFontSize(8);
    doc.setTextColor(105, 117, 134);
    doc.text("Demo data only. This report contains no customer, collector, or production records.", 16, 286);
    doc.save("polis-systems-demo-report.pdf");
    setNotice("Sample PDF report downloaded using fictional demo data.");
  }

  function createTask(input: Omit<DemoTask, "id">) {
    setDemoTasks((current) => [{ ...input, id: Math.max(...current.map((task) => task.id), 0) + 1 }, ...current]);
    setCreateOpen(false);
    setActiveView("tasks");
    setNotice(`Demo task “${input.title}” created. It will disappear when the page refreshes.`);
  }

  return (
    <div data-dashboard-preview="read-only" className={cn(
      "overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-[0_30px_70px_-32px_rgba(15,43,82,0.35)]",
      compact ? "min-h-[34rem]" : "min-h-[calc(100vh-1rem)] sm:min-h-[calc(100vh-2rem)]",
    )}>
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-950 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 font-semibold">
          <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Interactive sandbox · Fictional data · No production changes</span>
        </div>
        <button type="button" onClick={resetDemo} className="hidden shrink-0 items-center gap-1.5 rounded-full border border-amber-300/70 bg-white/70 px-2.5 py-1 font-semibold hover:bg-white sm:inline-flex"><RotateCcw className="h-3 w-3" /> Reset demo</button>
      </div>

      <div className="flex min-h-[inherit] flex-col md:flex-row">
        <aside className="bg-[#0d2b4e] text-white md:w-52 md:shrink-0 lg:w-60">
          <div className="hidden border-b border-white/10 px-5 py-5 md:block">
            <p className="text-sm font-semibold tracking-tight">Polis Systems</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-200/75">Operations Platform</p>
          </div>
          <div className="flex gap-1 overflow-x-auto p-2 md:block md:space-y-1 md:p-3">
            {navigation.map((item) => {
              const Icon = item.icon;
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveView(item.id)}
                  aria-pressed={active}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors md:w-full md:text-sm",
                    active ? "bg-white/14 text-white ring-1 ring-inset ring-white/10" : "text-sky-100/75 hover:bg-white/8 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </div>
          <div className="mt-auto hidden border-t border-white/10 p-4 text-[10px] leading-4 text-sky-100/55 md:block">
            Florida pilot · Illustrative workspace
          </div>
        </aside>

        <div className="min-w-0 flex-1 bg-[#f7f9fc]">
          <header className="flex h-16 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-5">
            <Menu className="h-4 w-4 text-slate-500 md:hidden" />
            <label className="flex h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-400 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
              <Search className="h-3.5 w-3.5" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-slate-700 outline-none placeholder:text-slate-400" placeholder="Search demo tasks, collectors, zones…" />
            </label>
            <div className="relative ml-auto">
              <button type="button" onClick={() => setNotificationsOpen((open) => !open)} aria-label="Demo notifications" aria-expanded={notificationsOpen} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Bell className="h-4 w-4" /></button>
              {notificationsOpen && <div className="absolute right-0 top-10 z-30 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl"><p className="text-xs font-semibold text-slate-800">Demo notifications</p><p className="mt-2 text-[10px] leading-4 text-slate-500">Task updates, review alerts, and collector activity appear here in a live workspace.</p></div>}
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">PS</div>
              <div className="leading-tight">
                <p className="text-[11px] font-semibold text-slate-800">Preview Workspace</p>
                <p className="text-[9px] text-slate-400">Read-only tour</p>
              </div>
              <ChevronDown className="h-3 w-3 text-slate-400" />
            </div>
          </header>

          <main className={cn("p-4 sm:p-5", compact ? "lg:p-5" : "lg:p-7")}>
            <PreviewHeading view={activeView} onCreate={() => setCreateOpen(true)} onDownload={() => void downloadReport()} />
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] font-medium text-blue-900"><Sparkles className="h-3.5 w-3.5 shrink-0" /><span>{notice}</span></div>
            {activeView === "overview" && <OverviewPreview compact={compact} tasks={visibleTasks} />}
            {activeView === "tasks" && <TasksPreview tasks={visibleTasks} onAssign={assignCollector} onWhatsApp={simulateWhatsApp} />}
            {activeView === "review" && <ReviewPreview decision={reviewDecision} onDecision={(decision) => { setReviewDecision(decision); setDemoTasks((current) => current.map((task) => task.id === 3 ? { ...task, status: decision === "approved" ? "Approved" : "Rejected" } : task)); setNotice(`Submission ${decision}. This demo decision is not saved to Supabase.`); }} />}
            {activeView === "collectors" && <CollectorsPreview query={query} />}
            {activeView === "reports" && <ReportsPreview onDownload={() => void downloadReport()} />}
            {activeView === "settings" && <SettingsPreview enabled={whatsappEnabled} onToggle={() => { setWhatsappEnabled((enabled) => !enabled); setNotice("Demo workflow preference updated locally."); }} />}
          </main>
        </div>
      </div>
      {createOpen && <CreateDemoTaskDialog onClose={() => setCreateOpen(false)} onCreate={createTask} />}
    </div>
  );
}

function PreviewHeading({ view, onCreate, onDownload }: { view: PreviewView; onCreate: () => void; onDownload: () => void }) {
  const copy: Record<PreviewView, [string, string]> = {
    overview: ["Operations Overview", "A live view of cleanup activity across every zone"],
    tasks: ["Cleanup Tasks", "Create, assign, and monitor field operations"],
    review: ["Proof Review", "Verify before-and-after evidence from collectors"],
    collectors: ["Field Collectors", "Coordinate people, zones, and active assignments"],
    reports: ["Impact Reports", "Turn verified work into clear operational reporting"],
    settings: ["Workspace Settings", "Manage organization and workflow preferences"],
  };
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <p className="text-lg font-semibold tracking-[-0.025em] text-slate-950 sm:text-xl">{copy[view][0]}</p>
        <p className="mt-1 text-xs text-slate-500">{copy[view][1]}</p>
      </div>
      {view === "tasks" && <DemoAction onClick={onCreate}><Plus className="h-3.5 w-3.5" /> Create task</DemoAction>}
      {view === "reports" && <DemoAction onClick={onDownload}><Download className="h-3.5 w-3.5" /> Download PDF</DemoAction>}
    </div>
  );
}

function OverviewPreview({ compact, tasks }: { compact: boolean; tasks: DemoTask[] }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Active tasks" value="24" icon={<ClipboardCheck className="h-4 w-4" />} primary />
        <Metric label="Verified submissions" value="186" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Metric label="Field collectors" value="32" icon={<Users className="h-4 w-4" />} />
        <Metric label="Completion rate" value="92%" icon={<BarChart3 className="h-4 w-4" />} />
      </div>
      <div className={cn("grid gap-4", compact ? "xl:grid-cols-[1.15fr_.85fr]" : "lg:grid-cols-[1.15fr_.85fr]")}>
        <Panel title="Recent tasks">
          <div className="divide-y divide-slate-100">
            {tasks.slice(0, 3).map((task) => (
              <div key={task.title} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">{task.title}</p>
                  <p className="mt-1 truncate text-[10px] text-slate-400">{task.location}</p>
                </div>
                <StatusPill status={task.status} />
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Weekly completion">
          <div className="flex h-36 items-end gap-2 pt-3" aria-label="Illustrative weekly completion chart">
            {[42, 58, 47, 72, 64, 86, 76].map((height, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-md bg-blue-100" style={{ height: `${height}%` }}>
                  <div className="h-full w-full rounded-t-md bg-blue-600/80" />
                </div>
                <span className="text-[9px] text-slate-400">{"MTWTFSS"[index]}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TasksPreview({ tasks, onAssign, onWhatsApp }: { tasks: DemoTask[]; onAssign: (taskId: number, collector: string) => void; onWhatsApp: (task: DemoTask) => void }) {
  return (
    <Panel title="All tasks" badge={`${tasks.length} shown`}>
      <div className="-mx-4 overflow-x-auto sm:-mx-5">
        <table className="w-full min-w-[700px] text-left">
          <thead><tr className="border-y border-slate-100 bg-slate-50/75 text-[9px] uppercase tracking-[0.12em] text-slate-400">
            <th className="px-5 py-2.5">Task</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5">Priority</th><th className="px-3 py-2.5">Collector assignment</th><th className="px-3 py-2.5">Due</th><th className="px-5 py-2.5">Workflow</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {tasks.map((task) => <tr key={task.title} className="text-xs text-slate-600">
              <td className="px-5 py-3"><p className="font-semibold text-slate-800">{task.title}</p><p className="mt-0.5 text-[10px] text-slate-400">{task.location}</p></td>
              <td className="px-3 py-3"><StatusPill status={task.status} /></td>
              <td className="px-3 py-3"><PriorityPill priority={task.priority} /></td>
              <td className="px-3 py-3"><select aria-label={`Assign collector for ${task.title}`} value={task.collector} onChange={(event) => onAssign(task.id, event.target.value)} className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[10px] text-slate-700 outline-none focus:border-blue-400">{collectors.map((collector) => <option key={collector.name}>{collector.name}</option>)}</select></td><td className="px-3 py-3">{task.due}</td><td className="px-5 py-3"><button type="button" onClick={() => onWhatsApp(task)} className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[9px] font-semibold text-emerald-700 hover:bg-emerald-100"><MessageCircle className="h-3 w-3" /> Send assignment</button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {tasks.length === 0 && <p className="py-8 text-center text-xs text-slate-500">No demo tasks match your search.</p>}
    </Panel>
  );
}

function ReviewPreview({ decision, onDecision }: { decision: "pending" | "approved" | "rejected"; onDecision: (decision: "approved" | "rejected") => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[.88fr_1.12fr]">
      <Panel title="Waiting for review" badge="3 submissions">
        <div className="space-y-2">
          {["Canal-side plastic cleanup", "Transit stop litter removal", "School grounds cleanup"].map((title, index) => (
            <div key={title} className={cn("rounded-xl border p-3", index === 0 ? "border-blue-200 bg-blue-50/65" : "border-slate-100 bg-white")}>
              <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-slate-800">{title}</p><span className="text-[9px] text-slate-400">{index + 1}h ago</span></div>
              <p className="mt-1 text-[10px] text-slate-500">Submitted by {collectors[index]?.name}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel title="Proof comparison">
        <div className="grid grid-cols-2 gap-3">
          <ProofFrame label="Before" dirty />
          <ProofFrame label="After" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-[10px] text-slate-500">
          <div><span className="block font-semibold text-slate-700">Waste category</span>Plastic litter</div>
          <div><span className="block font-semibold text-slate-700">Reported quantity</span>18 bags</div>
        </div>
        <div className="mt-4 flex items-center justify-between gap-2"><StatusPill status={decision === "pending" ? "Awaiting review" : decision === "approved" ? "Approved" : "Rejected"} /><div className="flex gap-2"><DemoAction subtle onClick={() => onDecision("rejected")}>Reject</DemoAction><DemoAction onClick={() => onDecision("approved")}>Approve proof</DemoAction></div></div>
      </Panel>
    </div>
  );
}

function CollectorsPreview({ query }: { query: string }) {
  const normalized = query.trim().toLowerCase();
  const visibleCollectors = normalized ? collectors.filter((collector) => `${collector.name} ${collector.zone} ${collector.status}`.toLowerCase().includes(normalized)) : collectors;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {visibleCollectors.map((collector) => (
        <div key={collector.name} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-xs font-bold text-blue-700">{collector.initials}</div>
            <div><p className="text-xs font-semibold text-slate-800">{collector.name}</p><p className="mt-0.5 text-[10px] text-slate-400">{collector.zone} zone</p></div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px]"><span className="text-emerald-700">● {collector.status}</span><span className="text-slate-500">{collector.assignments} active</span></div>
          <div className="mt-3"><div className="flex justify-between text-[9px] text-slate-400"><span>Completion</span><span>{collector.completion}</span></div><div className="mt-1 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: collector.completion }} /></div></div>
        </div>
      ))}
    </div>
  );
}

function ReportsPreview({ onDownload }: { onDownload: () => void }) {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
      <Panel title="Verified work by zone" badge="Last 30 days">
        <div className="space-y-4 py-2">
          {[['North', 88], ['Central', 72], ['East', 64], ['West', 51], ['South', 43]].map(([zone, value]) => (
            <div key={zone as string} className="grid grid-cols-[3.5rem_1fr_2rem] items-center gap-3 text-[10px]"><span className="font-medium text-slate-600">{zone}</span><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${value}%` }} /></div><span className="text-right text-slate-400">{value}</span></div>
          ))}
        </div>
      </Panel>
      <Panel title="Impact summary">
        <div className="grid grid-cols-2 gap-3">
          <ReportMetric value="4.8t" label="Waste recorded" />
          <ReportMetric value="186" label="Verified cleanups" />
          <ReportMetric value="92%" label="Completion rate" />
          <ReportMetric value="5" label="Active zones" />
        </div>
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-3 text-[10px] leading-4 text-blue-900">Reports connect every metric to verified task and submission records.</div>
        <button type="button" onClick={onDownload} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-800"><FileText className="h-3.5 w-3.5" /> Download sample PDF report</button>
      </Panel>
    </div>
  );
}

function SettingsPreview({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <Panel title="Organization profile" badge="Locked in preview">
      <div className="grid gap-4 sm:grid-cols-2">
        <PreviewField label="Organization name" value="Polis Demo Partnership" />
        <PreviewField label="Operating region" value="Florida pilot" />
        <PreviewField label="Default task window" value="48 hours" />
        <PreviewField label="Proof requirement" value="Before and after photos" />
      </div>
      <div className="mt-5 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4"><div><p className="text-xs font-semibold text-slate-800">WhatsApp field workflow</p><p className="mt-1 text-[10px] text-slate-500">Assignments, proof collection, and review outcomes</p></div><button type="button" role="switch" aria-checked={enabled} onClick={onToggle} className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", enabled ? "bg-blue-600" : "bg-slate-300")}><span className={cn("block h-4 w-4 rounded-full bg-white shadow transition-transform", enabled && "translate-x-4")} /></button></div>
    </Panel>
  );
}

function Panel({ title, badge, children }: { title: string; badge?: string; children: ReactNode }) {
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h3 className="text-xs font-semibold text-slate-800">{title}</h3>{badge && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-medium text-slate-500">{badge}</span>}</div>{children}</section>;
}

function Metric({ label, value, icon, primary = false }: { label: string; value: string; icon: ReactNode; primary?: boolean }) {
  return <div className={cn("rounded-xl border p-3.5 shadow-sm sm:p-4", primary ? "border-blue-700 bg-blue-700 text-white" : "border-slate-200 bg-white text-slate-900")}><div className="flex items-center justify-between"><span className={cn("text-[10px] font-medium", primary ? "text-blue-100" : "text-slate-500")}>{label}</span><span className={cn("grid h-7 w-7 place-items-center rounded-lg", primary ? "bg-white/15" : "bg-blue-50 text-blue-700")}>{icon}</span></div><p className="mt-3 text-xl font-semibold tracking-tight sm:text-2xl">{value}</p></div>;
}

function DemoAction({ children, subtle = false, onClick }: { children: ReactNode; subtle?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[10px] font-semibold transition-colors", subtle ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "bg-blue-700 text-white hover:bg-blue-800")}>{children}</button>;
}

function StatusPill({ status }: { status: string }) {
  const styles = status === "Approved" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : status === "Awaiting review" ? "border-violet-200 bg-violet-50 text-violet-700" : status === "In progress" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-blue-200 bg-blue-50 text-blue-700";
  return <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-1 text-[9px] font-semibold", styles)}>{status}</span>;
}

function PriorityPill({ priority }: { priority: string }) {
  const style = priority === "Urgent" ? "text-rose-700" : priority === "High" ? "text-orange-700" : priority === "Medium" ? "text-amber-700" : "text-slate-500";
  return <span className={cn("text-[10px] font-semibold", style)}>● {priority}</span>;
}

function ProofFrame({ label, dirty = false }: { label: string; dirty?: boolean }) {
  return <div><div className={cn("relative grid aspect-[4/3] place-items-center overflow-hidden rounded-lg border", dirty ? "border-amber-200 bg-[linear-gradient(145deg,#d9c8a6,#8f795b)]" : "border-emerald-200 bg-[linear-gradient(145deg,#d8ead7,#82a979)]")}><MapPin className="h-5 w-5 text-white/80" /><div className={cn("absolute inset-x-3 bottom-3 h-3 rounded-full blur-sm", dirty ? "bg-slate-800/45" : "bg-emerald-900/20")} /></div><p className="mt-1.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">{label}</p></div>;
}

function ReportMetric({ value, label }: { value: string; label: string }) {
  return <div className="rounded-lg border border-slate-100 bg-slate-50 p-3"><p className="text-lg font-semibold tracking-tight text-slate-900">{value}</p><p className="mt-1 text-[9px] text-slate-400">{label}</p></div>;
}

function PreviewField({ label, value }: { label: string; value: string }) {
  return <label className="block"><span className="text-[10px] font-semibold text-slate-600">{label}</span><span className="mt-1.5 block rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">{value}</span></label>;
}

function CreateDemoTaskDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (task: Omit<DemoTask, "id">) => void }) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("North zone · New site");
  const [priority, setPriority] = useState("Medium");
  const [collector, setCollector] = useState(collectors[0].name);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanTitle = title.trim();
    if (!cleanTitle) return;
    onCreate({ title: cleanTitle, location, priority, collector, status: "Assigned", due: "Nov 2" });
  }

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="create-demo-task-title">
        <div className="flex items-start justify-between gap-4"><div><h2 id="create-demo-task-title" className="text-lg font-semibold text-slate-950">Create a demo task</h2><p className="mt-1 text-xs text-slate-500">This record exists only in your browser until refresh.</p></div><button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 space-y-4">
          <label className="block text-xs font-semibold text-slate-700">Task title<input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Beach litter cleanup" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
          <label className="block text-xs font-semibold text-slate-700">Location<input value={location} onChange={(event) => setLocation(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold text-slate-700">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none">{["Low", "Medium", "High", "Urgent"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-700">Collector<select value={collector} onChange={(event) => setCollector(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal outline-none">{collectors.map((person) => <option key={person.name}>{person.name}</option>)}</select></label>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="submit" disabled={!title.trim()} className="rounded-lg bg-blue-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-45">Create demo task</button></div>
      </form>
    </div>
  );
}
