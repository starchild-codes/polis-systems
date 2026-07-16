// Compatibility shim — the app now uses the Lovable-generated Supabase client
// at "@/integrations/supabase/client". This file re-exports it so any lingering
// imports keep working without a second, mis-configured client instance.
export { supabase } from "@/integrations/supabase/client";
export const isSupabaseConfigured = true;
