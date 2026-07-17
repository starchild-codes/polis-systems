import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@tanstack/react-router";
import { Bell, ChevronDown, Menu, LogOut, Search, User as UserIcon } from "lucide-react";

export function AppHeader() {
  const { user, profile, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 flex h-[4.5rem] items-center gap-3 border-b border-border/80 bg-background/95 px-4 backdrop-blur-md sm:gap-4 sm:px-5 lg:px-6">
      <button
        id="sidebar-toggle"
        className="focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Toggle sidebar"
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
        <button aria-label="Notifications" className="focus-ring relative hidden h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-destructive ring-2 ring-background" />
        </button>
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
                    router.navigate({ to: "/login" });
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
