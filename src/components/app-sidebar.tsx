import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand-logo";

const nav = [
  { title: "Overview", url: "/overview", icon: LayoutDashboard },
  { title: "Tasks", url: "/tasks", icon: ClipboardList },
  { title: "Review", url: "/review", icon: ShieldCheck },
  { title: "Collectors", url: "/collectors", icon: Users },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-[4px_0_24px_rgba(15,23,42,0.08)] transition-[width] duration-200 motion-reduce:transition-none",
        collapsed ? "w-[var(--sidebar-width-icon)]" : "w-[var(--sidebar-width)]",
      )}
    >
      <div className={cn("flex h-[4.5rem] items-center gap-2.5 border-b border-sidebar-border px-4", collapsed && "justify-center px-2")}>
        <BrandLogo decorative eager className="h-9 w-9 shadow-sm ring-1 ring-white/25" />
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-white">Polis Systems</div>
            <div className="truncate text-xs text-sidebar-foreground/75">Operations Platform</div>
          </div>
        )}
      </div>

      <nav aria-label="Workspace navigation" className="flex-1 space-y-1 overflow-y-auto p-2.5">
        {!collapsed && <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/75">Workspace</p>}
        {nav.map((item) => {
          const active = pathname === item.url || pathname.startsWith(item.url + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.url}
              to={item.url}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              title={collapsed ? item.title : undefined}
              className={cn(
                "relative flex min-h-10 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 active:translate-y-px motion-reduce:transform-none",
                active
                  ? "bg-white/[0.16] text-white shadow-[0_6px_16px_rgba(15,23,42,0.12)] before:absolute before:left-0 before:h-6 before:w-1 before:rounded-r-full before:bg-white/90"
                  : "text-sidebar-foreground/75 hover:translate-x-0.5 hover:bg-white/[0.08] hover:text-white",
                collapsed && "justify-center px-2",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px] shrink-0", active && "text-white", collapsed && "mx-auto")} />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-sidebar-foreground/55">
          Bengaluru pilot · v0.1
        </div>
      )}
    </aside>
  );
}
