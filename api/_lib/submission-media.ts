export const PROOF_SIGNED_URL_EXPIRY_SECONDS = 300;

export interface SubmissionMediaRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface SubmissionMediaResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface SubmissionMediaUser {
  id: string;
}

export interface SubmissionMediaProfile {
  activeOrganizationId: string | null;
}

export interface SubmissionMediaMembership {
  role: "admin" | "operator";
  isActive: boolean;
}

export interface SubmissionMediaRecord {
  id: string;
  organizationId: string;
  taskId: string;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
}

export interface SubmissionMediaStore {
  authenticate(accessToken: string): Promise<SubmissionMediaUser | null>;
  getProfile(userId: string): Promise<SubmissionMediaProfile | null>;
  getMembership(
    userId: string,
    organizationId: string,
  ): Promise<SubmissionMediaMembership | null>;
  getSubmission(submissionId: string): Promise<SubmissionMediaRecord | null>;
  createSignedUrl(path: string, expiresInSeconds: number): Promise<string>;
}

function jsonResponse(status: number, body: unknown): SubmissionMediaResponse {
  return {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
    },
    body: JSON.stringify(body),
  };
}

function firstHeader(value: string | string[] | undefined): string | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate?.trim() || null;
}

function bearerToken(headers: SubmissionMediaRequest["headers"]): string | null {
  const key = Object.keys(headers).find((name) => name.toLowerCase() === "authorization");
  const value = key ? firstHeader(headers[key]) : null;
  const match = value?.match(/^Bearer\s+([^\s]+)$/iu);
  return match?.[1] || null;
}

function submissionIdFromUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value || "/api/review/submission-media", "https://polis.invalid");
    const id = url.searchParams.get("submissionId")?.trim() || "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)
      ? id
      : null;
  } catch {
    return null;
  }
}

export function isScopedProofPath(
  path: string,
  organizationId: string,
  taskId: string,
  kind: "before" | "after",
): boolean {
  if (path.length > 512 || path.includes("..") || path.startsWith("/")) return false;
  const prefix = `organizations/${organizationId}/tasks/${taskId}/submissions/`;
  const suffix = path.slice(prefix.length);
  return path.startsWith(prefix)
    && /^[0-9a-f-]{36}\/(before|after)-[a-z0-9-]+\.(jpg|png|webp|heic|heif)$/iu.test(suffix)
    && suffix.split("/", 2)[1]?.toLowerCase().startsWith(`${kind}-`);
}

export async function handleSubmissionMediaRequest(
  request: SubmissionMediaRequest,
  store: SubmissionMediaStore,
): Promise<SubmissionMediaResponse> {
  if ((request.method || "GET").toUpperCase() !== "GET") {
    return {
      ...jsonResponse(405, { error: "method_not_allowed" }),
      headers: {
        ...jsonResponse(405, null).headers,
        Allow: "GET",
      },
    };
  }

  const token = bearerToken(request.headers);
  if (!token) return jsonResponse(401, { error: "Authentication required." });

  const submissionId = submissionIdFromUrl(request.url);
  if (!submissionId) return jsonResponse(400, { error: "A valid submissionId is required." });

  try {
    const user = await store.authenticate(token);
    if (!user) return jsonResponse(401, { error: "Authentication required." });

    const profile = await store.getProfile(user.id);
    if (!profile?.activeOrganizationId) {
      return jsonResponse(403, { error: "An active organization is required." });
    }

    const membership = await store.getMembership(user.id, profile.activeOrganizationId);
    if (!membership?.isActive || !["admin", "operator"].includes(membership.role)) {
      return jsonResponse(403, { error: "Review access is required." });
    }

    const submission = await store.getSubmission(submissionId);
    if (!submission || submission.organizationId !== profile.activeOrganizationId) {
      return jsonResponse(404, { error: "Submission not found." });
    }

    const unavailable: Array<"before" | "after"> = [];
    const sign = async (kind: "before" | "after", path: string | null) => {
      if (!path) return null;
      if (!isScopedProofPath(path, submission.organizationId, submission.taskId, kind)) {
        unavailable.push(kind);
        return null;
      }
      return store.createSignedUrl(path, PROOF_SIGNED_URL_EXPIRY_SECONDS);
    };

    const [beforeUrl, afterUrl] = await Promise.all([
      sign("before", submission.beforePhotoPath),
      sign("after", submission.afterPhotoPath),
    ]);

    return jsonResponse(200, {
      beforeUrl,
      afterUrl,
      expiresIn: PROOF_SIGNED_URL_EXPIRY_SECONDS,
      unavailable,
    });
  } catch {
    return jsonResponse(500, { error: "Proof images are temporarily unavailable." });
  }
}
