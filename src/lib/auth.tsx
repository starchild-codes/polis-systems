import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type UserRole = "admin" | "operator" | "pending";

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
}

export interface AuthContextType {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  profileLoading: boolean;
  profileError: string | null;
  isAuthorized: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null; requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const user = session?.user ?? null;

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data, error }) => {
        setSession(error ? null : data.session);
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }
    let active = true;
    setProfile(null);
    setProfileError(null);
    setProfileLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, role")
        .eq("id", user.id)
        .maybeSingle();
      if (!active) return;
      if (error) {
        setProfile(null);
        setProfileError(error.message);
      } else {
        setProfile(data as Profile | null);
        setProfileError(null);
      }
      setProfileLoading(false);
    })();
    return () => { active = false; };
  }, [user]);

  const isAuthorized = profile?.role === "admin" || profile?.role === "operator";

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUp(email: string, password: string, fullName?: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    return {
      error: error?.message ?? null,
      requiresEmailConfirmation: !error && !data.session,
    };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setProfileError(null);
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
        isAuthorized,
        signIn,
        signUp,
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
