import { createRootRouteWithContext, Link, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { useAuth, type AuthContextType } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";
import { useIsMobile } from "@/hooks/use-mobile";

type RouterContext = { auth: AuthContextType };

function AccessPendingScreen({
  email, profileError, onSignOut,
}: { email: string | null; profileError: string | null; onSignOut: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Your account is awaiting approval
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {profileError
            ? "We could not verify your organization profile. Dashboard access remains safely blocked; please contact an administrator."
            : "An administrator must approve your account as an operator or admin before you can open the operations dashboard."}
        </p>
        {email && <p className="mt-4 text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{email}</span></p>}
        <button onClick={onSignOut} className="mt-6 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors">
          Sign out
        </button>
        <Link to="/" className="mt-3 inline-flex text-sm font-medium text-primary hover:underline">
          Return to the public site
        </Link>
      </div>
    </div>
  );
}

function ProtectedShell({ children }: { children: ReactNode }) {
  const { loading, session, profileLoading, profileError, isAuthorized, signOut, user } = useAuth();
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const mobileSidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !session) {
      router.navigate({ to: "/login" });
    }
  }, [loading, session, router]);

  const focusSidebarToggle = () => {
    requestAnimationFrame(() => document.getElementById("sidebar-toggle")?.focus());
  };

  const closeMobileSidebar = (restoreFocus = false) => {
    setMobileSidebarOpen(false);
    if (restoreFocus) focusSidebarToggle();
  };

  const toggleSidebar = () => {
    if (isMobile) setMobileSidebarOpen((open) => !open);
    else setSidebarCollapsed((collapsed) => !collapsed);
  };

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile) setMobileSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!mobileSidebarOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => mobileSidebarRef.current?.querySelector<HTMLElement>("a[href]")?.focus());
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileSidebarOpen]);

  // Escape key closes sidebar
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        if (mobileSidebarOpen) {
          closeMobileSidebar(true);
          return;
        }
        setSidebarCollapsed(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mobileSidebarOpen]);

  const handleMobileSidebarKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(mobileSidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])") ?? []);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  if (loading || (session && profileLoading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-sm font-medium text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!session) return null;

  if (!isAuthorized) {
    return (
      <AccessPendingScreen
        email={user?.email ?? null}
        profileError={profileError}
        onSignOut={() => { void signOut().then(() => router.navigate({ to: "/" })); }}
      />
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <div id="desktop-dashboard-sidebar" className="sticky top-0 hidden h-screen md:block">
        <AppSidebar collapsed={sidebarCollapsed} />
      </div>
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" tabIndex={-1} aria-label="Close navigation" className="absolute inset-0 z-0 bg-slate-950/50 backdrop-blur-[1px] animate-fade-in" onClick={() => closeMobileSidebar(true)} />
          <div id="mobile-dashboard-sidebar" ref={mobileSidebarRef} onKeyDown={handleMobileSidebarKeyDown} className="relative z-10 h-full w-[min(18rem,86vw)] animate-slide-in-left">
            <AppSidebar collapsed={false} onNavigate={() => closeMobileSidebar(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader
          onToggleSidebar={toggleSidebar}
          sidebarExpanded={isMobile ? mobileSidebarOpen : !sidebarCollapsed}
          sidebarControls={isMobile ? "mobile-dashboard-sidebar" : "desktop-dashboard-sidebar"}
        />
        <main className="flex-1 bg-[linear-gradient(180deg,hsl(var(--muted)/0.55),hsl(var(--background))_28rem)]">{children}</main>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: ({ context }) => ({ auth: context.auth }),
  component: () => <RootComponent />,
});

function RootComponent() {
  const location = useRouterState({ select: (s) => s.location });
  const isPublicRoute = location.pathname === "/" || location.pathname === "/login" || location.pathname === "/signup";

  return (
    <div className="min-h-screen bg-background">
      {isPublicRoute ? <Outlet /> : <ProtectedShell><Outlet /></ProtectedShell>}
      <Toaster position="top-right" />
    </div>
  );
}
