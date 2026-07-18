import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, Loader as Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Sign In - Polis Systems" }],
  }),
  component: () => <AuthPage mode="signin" />,
});

type AuthMode = "signin" | "signup";
type SubmissionKind = "email" | "google" | null;
type FieldName = "full_name" | "email" | "password" | "confirm_password";
type FieldErrors = Partial<Record<FieldName, string>>;

const PASSWORD_MIN_LENGTH = 8;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate();
  const { loading, session, profile, profileError, profileLoading, isAuthorized, signIn, signUp, signInWithGoogle } = useAuth();
  const isSignUp = mode === "signup";
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState<SubmissionKind>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const profileResolutionPending = Boolean(session && profile?.id !== session.user.id && !profileError);

  useEffect(() => {
    if (loading || profileLoading || profileResolutionPending || !session) return;
    navigate({ to: isAuthorized ? "/overview" : "/awaiting-approval", replace: true });
  }, [loading, profileLoading, profileResolutionPending, session, isAuthorized, navigate]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    const oauthError = url.searchParams.get("error") || hash.get("error");
    if (!oauthError) return;
    setError("Google sign-in could not be completed. Please try again.");
    ["error", "error_code", "error_description"].forEach((key) => url.searchParams.delete(key));
    if (hash.has("error")) url.hash = "";
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  const clearFieldError = (field: FieldName) => {
    if (!fieldErrors[field]) return;
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const formData = new FormData(form);
    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const confirmPassword = String(formData.get("confirm_password") ?? "");
    const nextErrors = validateForm({ isSignUp, fullName, email, password, confirmPassword });

    setFieldErrors(nextErrors);
    setError(null);
    const firstInvalidField = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalidField) {
      form.querySelector<HTMLInputElement>(`[name="${firstInvalidField}"]`)?.focus();
      return;
    }

    setSubmitting("email");
    try {
      if (isSignUp) {
        const result = await signUp(email, password, fullName);
        if (result.error) {
          setError(toSafeAuthError(result.error, "signup"));
          clearPasswordInputs(form);
          return;
        }
        if (result.requiresEmailConfirmation) {
          setConfirmationEmail(email);
          setCheckEmail(true);
          form.reset();
          return;
        }
        navigate({ to: "/awaiting-approval", replace: true });
      } else {
        const result = await signIn(email, password);
        if (result.error) {
          setError(toSafeAuthError(result.error, "signin"));
          clearPasswordInputs(form);
        }
      }
    } catch {
      setError("We could not reach the authentication service. Check your connection and try again.");
      clearPasswordInputs(form);
    } finally {
      setSubmitting(null);
    }
  }

  async function handleGoogleSignIn() {
    if (submitting) return;
    setError(null);
    setFieldErrors({});
    setSubmitting("google");
    try {
      const result = await signInWithGoogle();
      if (result.error) {
        setError(toSafeAuthError(result.error, "google"));
        setSubmitting(null);
      }
    } catch {
      setError("We could not start Google sign-in. Check your connection and try again.");
      setSubmitting(null);
    }
  }

  if (loading || session) {
    return <AuthLoadingScreen />;
  }

  if (checkEmail) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(145deg,hsl(var(--navy-50)),white)] p-4">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-surface">
          <BrandLogo eager className="mx-auto mb-4 h-14 w-14 shadow-sm ring-1 ring-border" />
          <h1 className="text-xl font-semibold text-foreground">Check your email</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{confirmationEmail}</span>. Confirm your email, then sign in. Your account will remain awaiting approval until an administrator grants access.
          </p>
          <Button asChild className="mt-6 w-full"><Link to="/login">Return to sign in</Link></Button>
          <Link to="/" className="mt-4 inline-flex text-sm font-medium text-primary hover:underline">Return to the public site</Link>
        </div>
      </div>
    );
  }

  const busy = submitting !== null;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(145deg,hsl(var(--navy-50)),white)] p-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-surface sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo eager className="mb-4 h-14 w-14 shadow-sm ring-1 ring-border" />
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {isSignUp
              ? "Register for the Polis Systems operations platform."
              : "Sign in to continue to the operations dashboard."}
          </p>
        </div>

        {error && (
          <div id="auth-error" role="alert" aria-live="polite" className="mb-5 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm leading-5 text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate autoComplete="on" className="space-y-4">
          {isSignUp && (
            <AuthField error={fieldErrors.full_name} id="full-name-error">
              <Label htmlFor="full-name">Full name</Label>
              <Input
                id="full-name"
                name="full_name"
                type="text"
                autoComplete="name"
                placeholder="Jane Operator"
                required
                disabled={busy}
                aria-invalid={Boolean(fieldErrors.full_name)}
                aria-describedby={fieldErrors.full_name ? "full-name-error" : undefined}
                onInput={() => clearFieldError("full_name")}
              />
            </AuthField>
          )}

          <AuthField error={fieldErrors.email} id="email-error">
            <Label htmlFor="auth-email">Email address</Label>
            <Input
              id="auth-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.org"
              required
              disabled={busy}
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onInput={() => clearFieldError("email")}
            />
          </AuthField>

          <AuthField error={fieldErrors.password} id="password-error">
            <Label htmlFor="auth-password">Password</Label>
            <PasswordInput
              id="auth-password"
              name="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              visible={showPassword}
              onToggle={() => setShowPassword((visible) => !visible)}
              disabled={busy}
              minLength={isSignUp ? PASSWORD_MIN_LENGTH : undefined}
              invalid={Boolean(fieldErrors.password)}
              describedBy={fieldErrors.password ? "password-error" : undefined}
              onInput={() => clearFieldError("password")}
            />
          </AuthField>

          {isSignUp && (
            <AuthField error={fieldErrors.confirm_password} id="confirm-password-error">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <PasswordInput
                id="confirm-password"
                name="confirm_password"
                autoComplete="new-password"
                visible={showConfirmation}
                onToggle={() => setShowConfirmation((visible) => !visible)}
                disabled={busy}
                minLength={PASSWORD_MIN_LENGTH}
                invalid={Boolean(fieldErrors.confirm_password)}
                describedBy={fieldErrors.confirm_password ? "confirm-password-error" : undefined}
                onInput={() => clearFieldError("confirm_password")}
              />
            </AuthField>
          )}

          <Button type="submit" disabled={busy} aria-describedby={error ? "auth-error" : undefined} className="w-full">
            {submitting === "email" && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting === "email" ? (isSignUp ? "Creating account..." : "Signing in...") : isSignUp ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <Button type="button" variant="outline" disabled={busy} onClick={handleGoogleSignIn} className="w-full">
          {submitting === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <span aria-hidden="true" className="text-base font-bold text-primary">G</span>}
          {submitting === "google" ? "Connecting to Google..." : "Continue with Google"}
        </Button>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? "Already have an account?" : "New to Polis Systems?"}{" "}
          <Link className="font-semibold text-primary hover:underline" to={isSignUp ? "/login" : "/signup"}>
            {isSignUp ? "Sign in" : "Sign up"}
          </Link>
        </p>
        <p className="mt-3 text-center text-xs"><Link to="/" className="text-muted-foreground transition-colors hover:text-foreground">Back to the public site</Link></p>
      </div>
    </div>
  );
}

function AuthField({ error, id, children }: { error?: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {children}
      {error && <p id={id} role="alert" className="text-xs leading-5 text-destructive">{error}</p>}
    </div>
  );
}

function PasswordInput({
  id, name, autoComplete, visible, onToggle, disabled, minLength, invalid, describedBy, onInput,
}: {
  id: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  visible: boolean;
  onToggle: () => void;
  disabled: boolean;
  minLength?: number;
  invalid: boolean;
  describedBy?: string;
  onInput: () => void;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        name={name}
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder="Enter your password"
        required
        disabled={disabled}
        minLength={minLength}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        onInput={onInput}
        className="pr-11"
      />
      <button
        type="button"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        disabled={disabled}
        onClick={onToggle}
        className="focus-ring absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function AuthLoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Verifying your account...
      </div>
    </div>
  );
}

function validateForm({
  isSignUp, fullName, email, password, confirmPassword,
}: {
  isSignUp: boolean;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): FieldErrors {
  const errors: FieldErrors = {};
  if (isSignUp && fullName.length < 2) errors.full_name = "Enter your full name.";
  if (!email) errors.email = "Enter your email address.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Enter your password.";
  else if (isSignUp && password.length < PASSWORD_MIN_LENGTH) errors.password = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (isSignUp && !confirmPassword) errors.confirm_password = "Confirm your password.";
  else if (isSignUp && password !== confirmPassword) errors.confirm_password = "Passwords do not match.";
  return errors;
}

function clearPasswordInputs(form: HTMLFormElement) {
  const password = form.elements.namedItem("password");
  const confirmation = form.elements.namedItem("confirm_password");
  if (password instanceof HTMLInputElement) {
    password.value = "";
    password.focus();
  }
  if (confirmation instanceof HTMLInputElement) confirmation.value = "";
}

function toSafeAuthError(message: string, action: "signin" | "signup" | "google") {
  const normalized = message.toLowerCase();
  if (action === "signin" && (normalized.includes("invalid login") || normalized.includes("invalid credentials"))) {
    return "Email or password is incorrect.";
  }
  if (normalized.includes("already registered") || normalized.includes("already exists")) {
    return "An account with this email already exists. Try signing in instead.";
  }
  if (normalized.includes("password")) {
    return `The password does not meet the security requirements. Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (normalized.includes("email") && (normalized.includes("invalid") || normalized.includes("format"))) {
    return "Enter a valid email address.";
  }
  if (normalized.includes("rate") || normalized.includes("too many") || normalized.includes("over_email_send_rate_limit")) {
    return "Too many attempts were made. Wait a few minutes and try again.";
  }
  if (normalized.includes("fetch") || normalized.includes("network") || normalized.includes("connection")) {
    return "We could not reach the authentication service. Check your connection and try again.";
  }
  if (action === "google" && (normalized.includes("provider") || normalized.includes("oauth"))) {
    return "Google sign-in is not available right now. Please use email and password or contact an administrator.";
  }
  return action === "signup"
    ? "We could not create your account. Please check your details and try again."
    : action === "google"
      ? "Google sign-in could not be completed. Please try again."
      : "We could not sign you in. Please check your credentials and try again.";
}
