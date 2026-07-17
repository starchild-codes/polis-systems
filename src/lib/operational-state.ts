import { resetCollectorStore } from "@/lib/collector-store";
import { resetSubmissionStore } from "@/lib/submission-store";
import { resetTaskStore } from "@/lib/task-store";
import { resetZoneStore } from "@/lib/zone-store";
import { clearSupabaseDataCaches } from "@/lib/supabase-data";

export function resetOperationalState() {
  clearSupabaseDataCaches();
  resetTaskStore();
  resetCollectorStore();
  resetZoneStore();
  resetSubmissionStore();
}
