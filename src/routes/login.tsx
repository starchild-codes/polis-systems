import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";
import { Loader as Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign In — Polis Systems" }],
  }),
  component: () => <AuthPage mode="signin" />,
});

export function AuthPage({ mode }: { mode: "signin" | "signup" }) {
  const navigate = useNavigate();
  const { loading, session, profileLoading, isAuthorized, signIn, signUp } = useAuth();
  const isSignUp = mode === "signup";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  const authChecking = loading || Boolean(session && profileLoading);

  useEffect(() => {
    if (loading || profileLoading || !session) return;
    navigate({ to: isAuthorized ? "/overview" : "/awaiting-approval", replace: true });
  }, [loading, profileLoading, session, isAuthorized, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { error, requiresEmailConfirmation } = await signUp(email, password, fullName);
        if (error) {
          setError(error);
        } else if (requiresEmailConfirmation) {
          setCheckEmail(true);
        } else {
          navigate({ to: "/awaiting-approval", replace: true });
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

  if (checkEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <BrandLogo eager className="mx-auto mb-4 h-14 w-14 shadow-sm ring-1 ring-border" />
          <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>. Confirm your email, then sign in. Your account will remain awaiting approval until an administrator grants access.
          </p>
          <Button asChild className="mt-6 w-full"><Link to="/login">Return to sign in</Link></Button>
          <Link to="/" className="mt-4 inline-flex text-sm font-medium text-primary hover:underline">Return to the public site</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo eager className="mb-4 h-14 w-14 shadow-sm ring-1 ring-border" />
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
          <Link className="font-medium text-primary hover:underline" to={isSignUp ? "/login" : "/signup"}>
            {isSignUp ? "Sign in" : "Request access"}
          </Link>
        </p>
        <p className="mt-3 text-center text-xs"><Link to="/" className="text-muted-foreground hover:text-foreground">Back to the public site</Link></p>
      </div>
    </div>
  );
}
