import type { SupabaseClient } from "@supabase/supabase-js";
import { TASK_PROOF_BUCKET } from "./whatsapp-proof-media.js";
import type {
  SubmissionMediaMembership,
  SubmissionMediaRecord,
  SubmissionMediaStore,
} from "./submission-media.js";

export class SupabaseSubmissionMediaStore implements SubmissionMediaStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async authenticate(accessToken: string) {
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { id: data.user.id };
  }

  async getProfile(userId: string) {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("active_organization_id")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error("profile_lookup_failed");
    return data
      ? { activeOrganizationId: data.active_organization_id as string | null }
      : null;
  }

  async getMembership(userId: string, organizationId: string) {
    const { data, error } = await this.supabase
      .from("organization_members")
      .select("role, is_active")
      .eq("user_id", userId)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (error) throw new Error("membership_lookup_failed");
    return data
      ? {
          role: data.role as SubmissionMediaMembership["role"],
          isActive: Boolean(data.is_active),
        }
      : null;
  }

  async getSubmission(submissionId: string): Promise<SubmissionMediaRecord | null> {
    const { data, error } = await this.supabase
      .from("submissions")
      .select("id, organization_id, task_id, before_photo_path, after_photo_path")
      .eq("id", submissionId)
      .maybeSingle();
    if (error) throw new Error("submission_lookup_failed");
    return data
      ? {
          id: data.id as string,
          organizationId: data.organization_id as string,
          taskId: data.task_id as string,
          beforePhotoPath: data.before_photo_path as string | null,
          afterPhotoPath: data.after_photo_path as string | null,
        }
      : null;
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(TASK_PROOF_BUCKET)
      .createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) throw new Error("signed_url_failed");
    return data.signedUrl;
  }
}
