import { createRootRouteWithContext, Outlet, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useAuth, type AuthContextType } from "@/lib/auth";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { Toaster } from "@/components/ui/sonner";
import { useState } from "react";

type RouterContext = { auth: AuthContextType };

function AccessPendingScreen({
  email, role, onSignOut,
}: { email: string | null; role: string | null; onSignOut: () => void }) {
  const suspended = role && role !== "pending";
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm text-center">
        <h1 className="text-xl font-semibold text-foreground">
          {suspended ? "Access not permitted" : "Access pending approval"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {suspended
            ? "Your account does not have permission to open the Polis Systems dashboard."
            : "Your account is signed in but has not been granted access yet. An administrator needs to approve you as an operator or admin."}
        </p>
        {email && <p className="mt-4 text-xs text-muted-foreground">Signed in as <span className="font-medium text-foreground">{email}</span></p>}
        <button onClick={onSignOut} className="mt-6 w-full rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors">
          Sign out
        </button>
      </div>
    </div>
  );
}

function ProtectedShell({ children }: { children: ReactNode }) {
  const { loading, session, profile, profileLoading, isAuthorized, signOut, user } = useAuth();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      router.navigate({ to: "/login", search: { mode: "signin" } });
    }
  }, [loading, session, router]);

  // Wire the sidebar toggle button
  useEffect(() => {
    const btn = document.getElementById("sidebar-toggle");
    if (!btn) return;
    const handler = () => setSidebarCollapsed((c) => !c);
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, []);

  // Escape key closes sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarCollapsed(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (loading || (session && profileLoading && !profile)) {
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
        role={profile?.role ?? null}
        onSignOut={() => { void signOut().then(() => router.navigate({ to: "/login", search: { mode: "signin" } })); }}
      />
    );
  }

  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="hidden md:block">
        <AppSidebar collapsed={sidebarCollapsed} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main className="flex-1 bg-muted/50">{children}</main>
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
