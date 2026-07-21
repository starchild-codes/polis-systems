import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { resetOperationalState } from "@/lib/operational-state";
import { getUserFacingError } from "@/lib/safe-display";

export type UserRole = "admin" | "operator" | "pending";
export type OrganizationRole = "admin" | "operator";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  active_organization_id: string | null;
}

export interface OrganizationMembership {
  organization_id: string;
  user_id: string;
  role: OrganizationRole;
  is_active: boolean;
}

export interface AuthContextType {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  organizationMembership: OrganizationMembership | null;
  organizationName: string | null;
  organizationId: string | null;
  organizationRole: OrganizationRole | null;
  isAuthorized: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null; requiresEmailConfirmation: boolean }>;
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [organizationMembership, setOrganizationMembership] = useState<OrganizationMembership | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const sessionUserIdRef = useRef<string | null>(null);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!active) return;
        if (error) {
          await supabase.auth.signOut({ scope: "local" });
          sessionUserIdRef.current = null;
          setSession(null);
        } else {
          const nextUserId = data.session?.user.id ?? null;
          if (sessionUserIdRef.current !== nextUserId) {
            // Mark the profile as loading before publishing a new identity so
            // route guards cannot briefly classify it as pending.
            sessionUserIdRef.current = nextUserId;
            setProfileLoading(Boolean(data.session));
          }
          setSession(data.session);
        }
      } catch {
        if (active) {
          sessionUserIdRef.current = null;
          setSession(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // Revalidation after a tab becomes active can emit SIGNED_IN as well as
      // TOKEN_REFRESHED. Only the user ID—not the event name—determines
      // whether profile and organization data must be reloaded.
      const nextUserId = newSession?.user.id ?? null;
      const identityChanged = sessionUserIdRef.current !== nextUserId;
      sessionUserIdRef.current = nextUserId;
      if (identityChanged) {
        setProfile(null);
        setProfileError(null);
        setOrganizationMembership(null);
        setOrganizationName(null);
        setProfileLoading(Boolean(newSession));
      }
      setSession(newSession);
      setLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    resetOperationalState();
    if (!userId) {
      setProfile(null);
      setProfileError(null);
      setOrganizationMembership(null);
      setOrganizationName(null);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfile(null);
    setProfileError(null);
    setOrganizationMembership(null);
    setOrganizationName(null);
    setProfileLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role, active_organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setProfile(null);
        setProfileError(getUserFacingError(error, "Your profile could not be loaded. Please sign in again."));
      } else if (!data) {
        setProfile(null);
        setProfileError("Profile not found");
      } else {
        const nextProfile = data as Profile;
        setProfile(nextProfile);
        if (nextProfile.active_organization_id) {
          const { data: membership, error: membershipError } = await supabase
            .from("organization_members")
            .select("organization_id, user_id, role, is_active")
            .eq("organization_id", nextProfile.active_organization_id)
            .eq("user_id", userId)
            .eq("is_active", true)
            .maybeSingle();
          if (!active) return;
          if (membershipError) {
            setProfileError(getUserFacingError(membershipError, "Your organization access could not be verified."));
          } else if (membership) {
            setOrganizationMembership(membership as OrganizationMembership);
            const { data: organization, error: organizationError } = await supabase
              .from("organizations")
              .select("name")
              .eq("id", nextProfile.active_organization_id)
              .maybeSingle();
            if (!active) return;
            if (organizationError) setProfileError(getUserFacingError(organizationError, "Your organization could not be loaded."));
            else setOrganizationName(organization?.name ?? null);
          }
        }
      }
      if (active) setProfileLoading(false);
    })();
    return () => { active = false; };
  }, [userId]);

  const organizationId = organizationMembership?.organization_id ?? null;
  const organizationRole = organizationMembership?.role ?? null;
  const isAuthorized = Boolean(
    profile
    && profile.active_organization_id
    && organizationMembership?.is_active
    && organizationMembership.organization_id === profile.active_organization_id
    && (organizationRole === "admin" || organizationRole === "operator"),
  );

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ? getUserFacingError(error, "Unable to sign in. Check your details and try again.") : null };
  }

  async function signUp(email: string, password: string, fullName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName?.trim() },
        emailRedirectTo: new URL("/login", window.location.origin).toString(),
      },
    });
    return {
      error: error ? getUserFacingError(error, "Unable to create the account. Please try again.") : null,
      requiresEmailConfirmation: !error && !data.session,
    };
  }

  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: new URL("/login", window.location.origin).toString(),
      },
    });
    return { error: error ? getUserFacingError(error, "Google sign-in could not be started. Please try again.") : null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(null);
    setOrganizationMembership(null);
    setOrganizationName(null);
    resetOperationalState();
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        user,
        profile,
        profileLoading,
        profileError,
        organizationMembership,
        organizationName,
        organizationId,
        organizationRole,
        isAuthorized,
        signIn,
        signUp,
        signInWithGoogle,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
