import {
  COLLECTOR_LABEL,
  ORGANIZATION_MEMBER_LABEL,
  getDisplayActorName,
  getSafeDisplayText,
} from "@/lib/safe-display";

export interface OrganizationActorRef {
  organizationId: string;
  actorId: string;
}

export interface OrganizationMembershipActorRow {
  organization_id: string;
  user_id: string;
  is_active: boolean;
}

export interface ActorProfileRow {
  id: string;
  full_name: string | null;
}

export function organizationActorKey(organizationId: string, actorId: string): string {
  return `${organizationId}:${actorId}`;
}

/** Build only names backed by an active membership in the requested organization. */
export function buildOrganizationActorNameMap(
  requested: OrganizationActorRef[],
  memberships: OrganizationMembershipActorRow[],
  profiles: ActorProfileRow[],
): Map<string, string> {
  const requestedKeys = new Set(requested.map((ref) => organizationActorKey(ref.organizationId, ref.actorId)));
  const profileNames = new Map(profiles.map((profile) => [
    profile.id,
    getDisplayActorName(profile.full_name, ""),
  ]));
  const names = new Map<string, string>();
  for (const membership of memberships) {
    const key = organizationActorKey(membership.organization_id, membership.user_id);
    const name = profileNames.get(membership.user_id);
    if (membership.is_active && requestedKeys.has(key) && name) names.set(key, name);
  }
  return names;
}

export function formatTaskEventMessage(input: {
  eventType: string;
  actorType: string;
  actorName: string | null;
  metadata: Record<string, unknown>;
}): string {
  const memberName = getDisplayActorName(input.actorName, ORGANIZATION_MEMBER_LABEL);
  const collectorName = getDisplayActorName(input.actorName, COLLECTOR_LABEL);
  const fallback = input.eventType.replace(/_/gu, " ").replace(/^./u, (character) => character.toUpperCase());
  const metadataMessage = getSafeDisplayText(input.metadata.message, fallback);
  switch (input.eventType) {
    case "created":
    case "task_created":
      return `Created by ${memberName}`;
    case "submission_approved":
    case "approved":
      return `Approved by ${memberName}`;
    case "submission_rejected":
    case "rejected": {
      const reason = getSafeDisplayText(input.metadata.rejection_reason, "");
      return `Rejected by ${memberName}${reason ? ` — ${reason}` : ""}`;
    }
    case "accepted":
      return `${collectorName} accepted the task`;
    case "declined":
      return `${collectorName} declined the task`;
    case "proof_submitted":
      return `${collectorName} submitted proof of work`;
    default:
      return metadataMessage;
  }
}
