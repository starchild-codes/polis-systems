import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@tanstack/react-router";
import { Bell, Menu, LogOut, Search, User as UserIcon } from "lucide-react";

export function AppHeader() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-background px-5">
      <button
        id="sidebar-toggle"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label="Toggle sidebar"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="relative hidden w-full max-w-[35rem] sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          aria-label="Search operations"
          placeholder="Search tasks, collectors, zones..."
          className="h-9 w-full rounded-md border border-primary/15 bg-primary/5 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/25"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button aria-label="Notifications" className="relative hidden h-8 w-8 items-center justify-center border-r border-border pr-3 text-muted-foreground hover:text-foreground sm:flex">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-1 h-1.5 w-1.5 rounded-full bg-destructive" />
        </button>
        <div className="relative">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
              <UserIcon className="h-4 w-4 text-primary" />
            </div>
            <div className="text-left">
              <div className="text-xs font-medium text-foreground">
                {profile?.full_name ?? user?.email ?? "User"}
              </div>
              <div className="text-[10px] text-muted-foreground capitalize">
                {profile?.role ?? "—"}
              </div>
            </div>
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-border bg-popover p-1 shadow-md">
                <div className="px-2 py-1.5 text-xs text-muted-foreground border-b border-border mb-1">
                  {user?.email}
                </div>
                <button
                  onClick={async () => {
                    await signOut();
                    router.navigate({ to: "/login", search: { mode: "signin" } });
                  }}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
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
