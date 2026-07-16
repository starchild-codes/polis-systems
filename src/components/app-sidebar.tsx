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

const nav = [
  { title: "Overview", url: "/overview", icon: LayoutDashboard },
  { title: "Tasks", url: "/tasks", icon: ClipboardList },
  { title: "Review", url: "/review", icon: ShieldCheck },
  { title: "Collectors", url: "/collectors", icon: Users },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

export function AppSidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-all duration-200",
        collapsed ? "w-[var(--sidebar-width-icon)]" : "w-[var(--sidebar-width)]",
      )}
    >
      <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm">
          <ShieldCheck className="h-5 w-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-white">Polis Systems</div>
            <div className="truncate text-xs text-sidebar-foreground/75">Operations Platform</div>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 p-2">
        {!collapsed && <p className="px-3 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/75">Workspace</p>}
        {nav.map((item) => {
          const active = pathname === item.url || pathname.startsWith(item.url + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.url}
              to={item.url}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-l-[3px] border-primary bg-white/10 pl-[9px] text-white"
                  : "text-sidebar-foreground/80 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", collapsed && "mx-auto")} />
              {!collapsed && <span>{item.title}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-sidebar-border px-3 py-2 text-[11px] text-sidebar-foreground/50">
          Bengaluru pilot · v0.1
        </div>
      )}
    </aside>
  );
}
