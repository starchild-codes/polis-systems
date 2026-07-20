const CLOSED_ASSIGNMENT_STATUSES = new Set(["submitted", "approved", "canceled"]);

/**
 * A collector change starts a new assignment lifecycle. Keeping an accepted or
 * in-progress status after changing collectors makes the new assignment
 * impossible to send and misrepresents who accepted the work.
 */
export function statusAfterCollectorChange(currentStatus: string | undefined): "assigned" {
  if (currentStatus && CLOSED_ASSIGNMENT_STATUSES.has(currentStatus)) {
    throw new Error("This task can no longer be assigned to another collector.");
  }
  return "assigned";
}
