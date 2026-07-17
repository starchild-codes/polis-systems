import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  Submission as MockSubmission,
  VerificationChecklist,
  RejectionReason,
  Priority,
  Zone,
  WasteType,
} from "@/lib/mock-data";
import { buildDefaultChecklist } from "@/lib/mock-data";
import { fetchTasks } from "@/lib/supabase-data";
import type { Task } from "@/lib/mock-data";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReviewStatus = "pending" | "approved" | "rejected";

export interface Submission {
  id: string;
  taskId: string;
  collectorId: string;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
  wasteType: string | null;
  quantityEstimate: string | null;
  collectorNotes: string | null;
  submittedLatitude: number | null;
  submittedLongitude: number | null;
  submittedAt: string | null;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskInfo {
  id: string;
  title: string;
  description: string | null;
  hotspotType: string;
  priority: string;
  status: string;
  zoneName: string;
  address: string | null;
  collectorId: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectorInfo {
  id: string;
  name: string;
  phone: string;
  zoneName: string;
}

export interface SubmissionWithRelations extends Submission {
  task: TaskInfo | null;
  collector: CollectorInfo | null;
}

// ─── Fetch ──────────────────────────────────────────────────────────────────

interface SubmissionRow {
  id: string;
  task_id: string;
  collector_id: string;
  before_photo_path: string | null;
  after_photo_path: string | null;
  waste_type: string | null;
  quantity_estimate: string | null;
  collector_notes: string | null;
  submitted_latitude: number | null;
  submitted_longitude: number | null;
  submitted_at: string | null;
  review_status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  hotspot_type: string;
  priority: string;
  status: string;
  zone_id: string | null;
  address: string | null;
  collector_id: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectorRow {
  id: string;
  name: string;
  phone_e164: string;
  zone_id: string | null;
}

interface ZoneRow {
  id: string;
  name: string;
}

const TASK_STATUS_DB_TO_UI: Record<string, string> = {
  draft: "draft",
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  submitted: "submitted",
  approved: "approved",
  declined: "declined",
  rejected: "rejected",
  canceled: "canceled",
};

export async function fetchSubmissions(): Promise<SubmissionWithRelations[]> {
  // Fetch submissions
  const { data: rawSubs, error: subError } = await supabase
    .from("submissions")
    .select("*")
    .order("submitted_at", { ascending: false, nullsFirst: false });

  if (subError) throw new Error(subError.message);
  if (!rawSubs || rawSubs.length === 0) return [];

  // Fetch related tasks
  const taskIds = [...new Set(rawSubs.map((s) => s.task_id))];
  const { data: rawTasks, error: taskError } = await supabase
    .from("tasks")
    .select("id, title, description, hotspot_type, priority, status, zone_id, address, collector_id, due_at, created_at, updated_at")
    .in("id", taskIds);

  if (taskError) throw new Error(taskError.message);

  // Fetch related collectors
  const collectorIds = [...new Set(rawSubs.map((s) => s.collector_id))];
  const { data: rawCollectors, error: colError } = await supabase
    .from("collectors")
    .select("id, name, phone_e164, zone_id")
    .in("id", collectorIds);

  if (colError) throw new Error(colError.message);

  // Fetch zones for name resolution
  const zoneIds = new Set<string>();
  (rawTasks ?? []).forEach((t) => { if (t.zone_id) zoneIds.add(t.zone_id); });
  (rawCollectors ?? []).forEach((c) => { if (c.zone_id) zoneIds.add(c.zone_id); });
  const zoneIdList = [...zoneIds];
  let zoneMap = new Map<string, string>();
  if (zoneIdList.length > 0) {
    const { data: rawZones, error: zoneError } = await supabase
      .from("zones")
      .select("id, name")
      .in("id", zoneIdList);
    if (zoneError) throw new Error(zoneError.message);
    zoneMap = new Map((rawZones ?? []).map((z: ZoneRow) => [z.id, z.name]));
  }

  // Build lookup maps
  const taskMap = new Map<string, TaskInfo>();
  for (const row of rawTasks ?? []) {
    const r = row as TaskRow;
    taskMap.set(r.id, {
      id: r.id,
      title: r.title,
      description: r.description,
      hotspotType: r.hotspot_type,
      priority: r.priority,
      status: TASK_STATUS_DB_TO_UI[r.status] ?? r.status,
      zoneName: r.zone_id ? (zoneMap.get(r.zone_id) ?? "—") : "—",
      address: r.address,
      collectorId: r.collector_id,
      dueAt: r.due_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    });
  }

  const collectorMap = new Map<string, CollectorInfo>();
  for (const row of rawCollectors ?? []) {
    const r = row as CollectorRow;
    collectorMap.set(r.id, {
      id: r.id,
      name: r.name,
      phone: r.phone_e164,
      zoneName: r.zone_id ? (zoneMap.get(r.zone_id) ?? "—") : "—",
    });
  }

  // Map submissions with relations
  return (rawSubs as SubmissionRow[]).map((row) => ({
    id: row.id,
    taskId: row.task_id,
    collectorId: row.collector_id,
    beforePhotoPath: row.before_photo_path,
    afterPhotoPath: row.after_photo_path,
    wasteType: row.waste_type,
    quantityEstimate: row.quantity_estimate,
    collectorNotes: row.collector_notes,
    submittedLatitude: row.submitted_latitude,
    submittedLongitude: row.submitted_longitude,
    submittedAt: row.submitted_at,
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    task: taskMap.get(row.task_id) ?? null,
    collector: collectorMap.get(row.collector_id) ?? null,
  }));
}

// ─── Approve / Reject ───────────────────────────────────────────────────────

const UI_TO_DB_TASK_STATUS: Record<string, string> = {
  draft: "draft",
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  submitted: "submitted",
  approved: "approved",
  declined: "declined",
  rejected: "rejected",
  canceled: "canceled",
};

export async function approveSubmission(
  submissionId: string,
  reviewerId: string,
): Promise<void> {
  const { error } = await supabase.rpc("review_submission_safely", {
    p_submission_id: submissionId,
    p_reviewer_id: reviewerId,
    p_decision: "approved",
    p_rejection_reason: null,
  });
  if (error) throw new Error(`Failed to approve submission: ${error.message}`);
  if (error === null) return;
  // 1. Fetch the submission to get the task_id
  const { data: sub, error: fetchErr } = await supabase
    .from("submissions")
    .select("id, task_id, review_status")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchErr) throw new Error(`Failed to fetch submission: ${fetchErr.message}`);
  if (!sub) throw new Error("Submission not found");
  if (sub.review_status !== "pending")
    throw new Error(`Submission is already ${sub.review_status}`);

  const taskId = sub.task_id;
  const now = new Date().toISOString();

  // 2. Update submission to approved
  const { data: updatedRows, error: subUpdateErr } = await supabase
    .from("submissions")
    .update({
      review_status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: now,
      rejection_reason: null,
      updated_at: now,
    })
    .eq("id", submissionId)
    .select("id");

  if (subUpdateErr) throw new Error(`Failed to approve submission: ${subUpdateErr.message}`);
  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("Failed to approve submission: no rows were updated. This may be a permissions issue — check RLS policies on the submissions table.");
  }

  // 3. Update task status to approved
  const { error: taskErr } = await supabase
    .from("tasks")
    .update({
      status: UI_TO_DB_TASK_STATUS["approved"],
      updated_at: now,
    })
    .eq("id", taskId);

  if (taskErr) {
    // Task update failed — the submission is approved but the task is not.
    // This is a state inconsistency. We throw so the caller can surface an error
    // and refetch to show the actual current state.
    throw new Error(
      `Submission approved, but failed to update task status: ${taskErr.message}. Please refresh — task and submission state may be inconsistent.`,
    );
  }

  // 4. Record task_event
  const { error: eventErr } = await supabase.from("task_events").insert({
    task_id: taskId,
    event_type: "submission_approved",
    previous_status: "submitted",
    new_status: "approved",
    actor_type: "operator",
    actor_id: reviewerId,
    metadata: {
      message: "Submission approved by operator",
      submission_id: submissionId,
    },
  });

  if (eventErr) {
    // Non-fatal: the core state changes succeeded. Log but don't throw.
    console.warn("Approved submission but failed to record task_event:", eventErr.message);
  }
}

export async function rejectSubmission(
  submissionId: string,
  reviewerId: string,
  rejectionReason: string,
): Promise<void> {
  if (!rejectionReason.trim()) {
    throw new Error("A rejection reason is required.");
  }

  const { error } = await supabase.rpc("review_submission_safely", {
    p_submission_id: submissionId,
    p_reviewer_id: reviewerId,
    p_decision: "rejected",
    p_rejection_reason: rejectionReason.trim(),
  });
  if (error) throw new Error(`Failed to reject submission: ${error.message}`);
  if (error === null) return;

  // 1. Fetch the submission to get the task_id
  const { data: sub, error: fetchErr } = await supabase
    .from("submissions")
    .select("id, task_id, review_status")
    .eq("id", submissionId)
    .maybeSingle();

  if (fetchErr) throw new Error(`Failed to fetch submission: ${fetchErr.message}`);
  if (!sub) throw new Error("Submission not found");
  if (sub.review_status !== "pending")
    throw new Error(`Submission is already ${sub.review_status}`);

  const taskId = sub.task_id;
  const now = new Date().toISOString();

  // 2. Update submission to rejected (with rejection_reason)
  const { data: updatedRows, error: subUpdateErr } = await supabase
    .from("submissions")
    .update({
      review_status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: now,
      rejection_reason: rejectionReason.trim(),
      updated_at: now,
    })
    .eq("id", submissionId)
    .select("id");

  if (subUpdateErr) throw new Error(`Failed to reject submission: ${subUpdateErr.message}`);
  if (!updatedRows || updatedRows.length === 0) {
    throw new Error("Failed to reject submission: no rows were updated. This may be a permissions issue — check RLS policies on the submissions table.");
  }

  // 3. Update task status to rejected
  const { error: taskErr } = await supabase
    .from("tasks")
    .update({
      status: UI_TO_DB_TASK_STATUS["rejected"],
      updated_at: now,
    })
    .eq("id", taskId);

  if (taskErr) {
    throw new Error(
      `Submission rejected, but failed to update task status: ${taskErr.message}. Please refresh — task and submission state may be inconsistent.`,
    );
  }

  // 4. Record task_event with rejection reason in metadata
  const { error: eventErr } = await supabase.from("task_events").insert({
    task_id: taskId,
    event_type: "submission_rejected",
    previous_status: "submitted",
    new_status: "rejected",
    actor_type: "operator",
    actor_id: reviewerId,
    metadata: {
      message: `Submission rejected: ${rejectionReason.trim()}`,
      submission_id: submissionId,
      rejection_reason: rejectionReason.trim(),
    },
  });

  if (eventErr) {
    console.warn("Rejected submission but failed to record task_event:", eventErr.message);
  }
}

// ─── useSubmissionStore (mock-data-compatible) ──────────────────────────────

export interface SubmissionWithChecklist extends MockSubmission {
  checklist: VerificationChecklist;
}

let mockSubmissions: SubmissionWithChecklist[] = [];
let mockFetchPromise: Promise<void> | null = null;
const mockListeners = new Set<() => void>();

function mockEmit() {
  for (const l of mockListeners) l();
}
function mockSubscribe(listener: () => void) {
  mockListeners.add(listener);
  return () => mockListeners.delete(listener);
}

async function loadMockSubmissions(): Promise<void> {
  try {
    const [subs, tasks] = await Promise.all([
      fetchSubmissions(),
      fetchTasks(),
    ]);
    const taskMap = new Map<string, Task>();
    for (const t of tasks) taskMap.set(t.id, t);

    mockSubmissions = subs.map((s): SubmissionWithChecklist => {
      const task = taskMap.get(s.taskId);
      const mockSub: MockSubmission = {
        id: s.id,
        taskId: s.taskId,
        taskTitle: s.task?.title ?? "—",
        collector: s.collector?.name ?? "—",
        zone: (s.collector?.zoneName ?? "—") as Zone,
        priority: (s.task?.priority ?? "medium") as Priority,
        wasteType: (s.wasteType ?? "Mixed Municipal") as WasteType,
        quantityKg: s.quantityEstimate ? Number(s.quantityEstimate) || 0 : 0,
        submittedAt: s.submittedAt ?? s.createdAt,
        latitude: s.submittedLatitude ?? 0,
        longitude: s.submittedLongitude ?? 0,
        hasBeforePhoto: !!s.beforePhotoPath,
        hasAfterPhoto: !!s.afterPhotoPath,
        decidedAt: s.reviewedAt ?? undefined,
        status: s.reviewStatus,
        note: s.collectorNotes ?? undefined,
        reviewer: s.reviewedBy ?? undefined,
        rejectionReason: (s.rejectionReason as RejectionReason | null) ?? undefined,
        rejectionNote: undefined,
      };
      return {
        ...mockSub,
        checklist: buildDefaultChecklist(mockSub, task),
      };
    });
  } catch {
    mockSubmissions = [];
  }
  mockEmit();
}

export function useSubmissionStore(): SubmissionWithChecklist[] {
  if (!mockFetchPromise) {
    mockFetchPromise = loadMockSubmissions();
  }
  return useSyncExternalStore(
    mockSubscribe,
    () => mockSubmissions,
    () => mockSubmissions,
  );
}

export function getSubmissions(): SubmissionWithChecklist[] {
  return mockSubmissions;
}

export async function refreshSubmissions(): Promise<void> {
  mockFetchPromise = null;
  mockFetchPromise = loadMockSubmissions();
  return mockFetchPromise;
}
