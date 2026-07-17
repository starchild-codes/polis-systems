import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@tanstack/react-router";
import { Bell, ChevronDown, Menu, LogOut, Search, User as UserIcon } from "lucide-react";

type AppHeaderProps = {
  onToggleSidebar: () => void;
  sidebarExpanded: boolean;
  sidebarControls: string;
};

export function AppHeader({ onToggleSidebar, sidebarExpanded, sidebarControls }: AppHeaderProps) {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[4.5rem] items-center gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur-md sm:gap-4 sm:px-5 lg:px-6">
      <button
        id="sidebar-toggle"
        type="button"
        onClick={onToggleSidebar}
        className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Toggle sidebar"
        aria-controls={sidebarControls}
        aria-expanded={sidebarExpanded}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden w-full max-w-[35rem] sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-label="Search operations"
          placeholder="Search tasks, collectors, zones..."
          className="h-10 w-full rounded-lg border border-primary/15 bg-primary/[0.045] pl-9 pr-3 text-sm text-foreground shadow-sm transition-[border-color,box-shadow,background-color] placeholder:text-muted-foreground/80 hover:border-primary/25 focus:border-primary/30 focus:bg-background focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <NotificationsPanel />
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            className="focus-ring flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted sm:px-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-1 ring-inset ring-primary/10">
              <UserIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-xs font-medium text-foreground">
                {profile?.full_name ?? user?.email ?? "User"}
              </div>
              <div className="text-[10px] text-muted-foreground capitalize">
                {profile?.role ?? "—"}
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
        className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
          className="z-[100] max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-popover text-popover-foreground shadow-floating outline-none animate-scale-in"
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
