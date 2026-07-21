import { supabase } from "@/integrations/supabase/client";
import { getUserFacingError } from "@/lib/safe-display";

interface AssignmentApiResponse {
  sent?: boolean;
  duplicate?: boolean;
  message?: string;
  error?: string;
}

export async function sendWhatsAppTaskAssignment(taskId: string): Promise<{
  sent: boolean;
  duplicate: boolean;
  message: string;
}> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Your session has expired. Log in again and retry.");
  }

  const response = await fetch("/api/twilio/assign-task", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ taskId }),
  });
  const payload = await response.json().catch(() => ({})) as AssignmentApiResponse;
  if (!response.ok) {
    throw new Error(getUserFacingError(payload.error, "The WhatsApp assignment could not be sent."));
  }

  return {
    sent: payload.sent === true,
    duplicate: payload.duplicate === true,
    message: payload.message || "WhatsApp assignment sent.",
  };
}
