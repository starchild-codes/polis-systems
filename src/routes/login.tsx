import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ShieldCheck, Loader as Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign In — Polis Systems" }],
  }),
  component: LoginPage,
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) || "signin",
  }),
});

function LoginPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const { loading, session, isAuthorized, signIn, signUp } = useAuth();
  const isSignUp = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const authChecking = loading || !!session;

  useEffect(() => {
    if (loading) return;
    if (session && isAuthorized) {
      navigate({ to: "/overview" });
    }
  }, [loading, session, isAuthorized, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { error } = await signUp(email, password, fullName);
        if (error) {
          setError(error);
        } else {
          setError("Account created! An admin needs to grant you operator access before you can use the dashboard.");
          setEmail(""); setPassword(""); setFullName("");
        }
      } else {
        const { error } = await signIn(email, password);
        if (error) setError(error);
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <ShieldCheck className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">
            {isSignUp ? "Create account" : "Sign in"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSignUp
              ? "Register for the Polis Systems operations platform."
              : "Sign in to the Polis Systems operations platform."}
          </p>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Operator" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.org" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Loading..." : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {isSignUp ? "Already have an account?" : "Need access?"}{" "}
          <button
            className="font-medium text-primary hover:underline"
            onClick={() => navigate({ to: "/login", search: { mode: isSignUp ? "signin" : "signup" } })}
          >
            {isSignUp ? "Sign in" : "Request access"}
          </button>
        </p>
      </div>
    </div>
  );
}
