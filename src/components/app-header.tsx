import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@tanstack/react-router";
import { Bell, ChevronDown, ClipboardList, MapPin, Menu, LogOut, Search, User as UserIcon, Users } from "lucide-react";
import { useTaskStore } from "@/lib/task-store";
import { useCollectorStore } from "@/lib/collector-store";

type AppHeaderProps = {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  sidebarControls: string;
};

export function AppHeader({ onToggleSidebar, sidebarExpanded, sidebarControls }: AppHeaderProps) {
  const { user, profile, organizationName, organizationRole, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[4.75rem] items-center gap-3 border-b border-border/80 bg-background/[0.94] px-4 shadow-[0_1px_0_hsl(222_35%_12%/0.02)] backdrop-blur-md sm:gap-4 sm:px-5 lg:px-8">
      <button
        id="sidebar-toggle"
        type="button"
        onClick={onToggleSidebar}
        className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-[color,background-color,border-color,transform] hover:scale-[1.03] hover:border-primary/15 hover:bg-primary/[0.055] hover:text-primary motion-reduce:transform-none"
        aria-label="Toggle sidebar"
        aria-controls={sidebarControls}
        aria-expanded={sidebarExpanded}
      >
        <Menu className="h-5 w-5" />
      </button>

      <OperationsSearch />

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <NotificationsPanel />
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="focus-ring flex items-center gap-2 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-muted sm:px-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-1 ring-inset ring-primary/10">
              <UserIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-xs font-medium text-foreground">
                {profile?.full_name ?? user?.email ?? "User"}
              </div>
              <div className="text-[10px] text-muted-foreground capitalize">
                {organizationRole ?? "—"}{organizationName ? ` · ${organizationName}` : ""}
              </div>
            </div>
            <ChevronDown className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-56 rounded-xl border border-border bg-popover p-1.5 shadow-floating animate-scale-in">
                <div className="mb-1 border-b border-border px-2.5 py-2 text-xs text-muted-foreground">
                  {user?.email}
                </div>
                <button
                  onClick={async () => {
                    await signOut();
                    router.navigate({ to: "/" });
                  }}
                  role="menuitem"
                  className="focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function OperationsSearch() {
  const router = useRouter();
  const { tasks } = useTaskStore();
  const collectors = useCollectorStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const results = useMemo(() => {
    if (!normalizedQuery) return [];
    const taskMatches = tasks
      .filter((task) => `${task.title} ${task.location} ${task.assignee ?? ""} ${task.zone} ${task.hotspotType}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 4)
      .map((task) => ({ kind: "task" as const, title: task.title, detail: `${task.zone} · ${task.location}`, query: task.title }));
    const collectorMatches = collectors
      .filter((collector) => `${collector.name} ${collector.phone} ${collector.zone}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 3)
      .map((collector) => ({ kind: "collector" as const, title: collector.name, detail: `${collector.zone} · ${collector.phone}`, query: collector.name }));
    const zoneMatches = Array.from(new Set([...tasks.map((task) => task.zone), ...collectors.map((collector) => collector.zone)]))
      .filter((zone) => zone.toLowerCase().includes(normalizedQuery))
      .slice(0, 2)
      .map((zone) => ({ kind: "zone" as const, title: `${zone} zone`, detail: "View tasks in this zone", query: zone }));
    return [...taskMatches, ...collectorMatches, ...zoneMatches];
  }, [collectors, normalizedQuery, tasks]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!searchRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  function navigateToResult(result: (typeof results)[number]) {
    setOpen(false);
    setQuery("");
    router.navigate({
      to: result.kind === "collector" ? "/collectors" : "/tasks",
      search: { query: result.query },
    });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalizedQuery) return;
    if (results[0]) {
      navigateToResult(results[0]);
      return;
    }
    setOpen(false);
    router.navigate({ to: "/tasks", search: { query: query.trim() } });
  }

  return (
    <div ref={searchRef} className="relative hidden w-full max-w-[36rem] sm:block">
      <form onSubmit={submitSearch}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          aria-label="Search tasks, collectors, and zones"
          aria-autocomplete="list"
          aria-expanded={open && Boolean(normalizedQuery)}
          aria-controls="operations-search-results"
          placeholder="Search tasks, collectors, zones..."
          className="h-10 w-full rounded-xl border border-primary/12 bg-primary/[0.035] pl-9 pr-3 text-sm text-foreground shadow-sm transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/80 hover:border-primary/25 focus:border-primary/30 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </form>
      {open && normalizedQuery && (
        <div id="operations-search-results" role="listbox" className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-full overflow-hidden rounded-xl border border-border/90 bg-popover p-1.5 shadow-floating animate-pop-in motion-reduce:animate-none">
          {results.length > 0 ? results.map((result) => {
            const Icon = result.kind === "task" ? ClipboardList : result.kind === "collector" ? Users : MapPin;
            const label = result.kind === "task" ? "Task" : result.kind === "collector" ? "Collector" : "Zone";
            return (
              <button
                key={`${result.kind}-${result.title}`}
                type="button"
                role="option"
                onClick={() => navigateToResult(result)}
                className="focus-ring flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors hover:bg-accent"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary"><Icon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-foreground">{result.title}</span><span className="block truncate text-xs text-muted-foreground">{result.detail}</span></span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
              </button>
            );
          }) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">No matching tasks, collectors, or zones. Press Enter to search tasks.</div>
          )}
        </div>
      )}
    </div>
  );
}

function NotificationsPanel() {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;
      const triggerRect = trigger.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const margin = 8;
      const offset = 8;
      const width = Math.min(352, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, triggerRect.right - width), window.innerWidth - width - margin);
      const spaceBelow = window.innerHeight - triggerRect.bottom - margin;
      const top = panelRect.height > spaceBelow
        ? Math.max(margin, triggerRect.top - panelRect.height - offset)
        : triggerRect.bottom + offset;
      setPosition({ position: "fixed", top, left, width, visibility: "visible" });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const handlePanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open notifications"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="dashboard-notifications"
        onClick={() => setOpen((current) => !current)}
        className="focus-ring flex h-10 w-10 items-center justify-center rounded-xl border border-transparent text-muted-foreground transition-[color,background-color,border-color,transform] hover:scale-[1.03] hover:border-primary/15 hover:bg-primary/[0.055] hover:text-primary motion-reduce:transform-none"
      >
        <Bell className="h-4 w-4" />
      </button>
      {open && createPortal(
        <div
          id="dashboard-notifications"
          ref={panelRef}
          role="dialog"
          aria-modal="false"
          aria-labelledby="dashboard-notifications-title"
          tabIndex={-1}
          style={position}
          onKeyDown={handlePanelKeyDown}
          className="z-[100] max-w-[calc(100vw-1rem)] rounded-xl border border-border/90 bg-popover text-popover-foreground shadow-floating outline-none animate-pop-in motion-reduce:animate-none"
        >
          <div className="p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/10">
              <Bell className="h-5 w-5" />
            </div>
            <h2 id="dashboard-notifications-title" className="mt-4 text-sm font-semibold text-foreground">No new notifications</h2>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">Task updates, review alerts, and collector activity will appear here.</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
