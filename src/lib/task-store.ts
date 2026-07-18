import { useSyncExternalStore } from "react";
import {
  fetchTasks,
  insertTask,
  updateTask,
  fetchAllTaskEvents,
  insertTaskEvent,
  deleteTaskSafely,
  fetchZones,
  zoneIdFromName,
  collectorIdFromName,
  uiDateToIso,
  taskStatusToDb,
  type TaskInsert,
} from "@/lib/supabase-data";
import { getCollectors } from "@/lib/collector-store";
import { notifyOperationalDataChanged } from "@/lib/operational-events";
import type {
  Task,
  TaskEvent,
  HotspotType,
  Priority,
  Zone,
} from "@/lib/mock-data";

// ─── Store state ────────────────────────────────────────────────────────────

interface TaskStoreState {
  tasks: Task[];
  events: TaskEvent[];
  loading: boolean;
  error: string | null;
}

let state: TaskStoreState = {
  tasks: [],
  events: [],
  loading: true,
  error: null,
};

const listeners = new Set<() => void>();

export function resetTaskStore() {
  fetchPromise = null;
  state = { tasks: [], events: [], loading: true, error: null };
  emit();
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface NewTaskInput {
  title: string;
  description: string;
  hotspotType: HotspotType;
  priority: Priority;
  assignee?: string;
  dueAt: string;
  location: string;
  latitude: number;
  longitude: number;
  zone: Zone;
  wasteType: Task["wasteType"];
  estimatedWasteKg?: number;
  instructions?: string;
  internalNotes?: string;
  hasReferencePhoto?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveAssigneeId(assigneeName: string | undefined): string | null {
  if (!assigneeName) return null;
  return collectorIdFromName(assigneeName, getCollectors());
}

let fetchPromise: Promise<void> | null = null;

async function loadTasks(): Promise<void> {
  state = { ...state, loading: true, error: null };
  emit();
  try {
    const [tasks, events] = await Promise.all([
      fetchTasks(),
      fetchAllTaskEvents(),
    ]);
    state = { tasks, events, loading: false, error: null };
  } catch (err) {
    state = {
      ...state,
      loading: false,
      error: err instanceof Error ? err.message : "Failed to load tasks",
    };
  }
  emit();
}

// ─── Actions ────────────────────────────────────────────────────────────────

export const taskStoreActions = {
  async init() {
    if (fetchPromise) return fetchPromise;
    fetchPromise = loadTasks();
    return fetchPromise;
  },

  async refresh() {
    fetchPromise = null;
    return this.init();
  },

  async createTask(input: NewTaskInput): Promise<Task> {
    const assigneeId = resolveAssigneeId(input.assignee);
    const status: string = input.assignee ? "assigned" : "draft";
    await fetchZones();
    const zoneId = zoneIdFromName(input.zone);
    if (!zoneId) throw new Error("The selected zone is unavailable. Refresh the page and try again.");
    const row: TaskInsert = {
      title: input.title,
      description: input.description,
      address: input.location,
      latitude: input.latitude,
      longitude: input.longitude,
      zone_id: zoneId,
      status,
      priority: input.priority,
      hotspot_type: input.hotspotType,
      collector_id: assigneeId,
      due_at: uiDateToIso(input.dueAt),
      estimated_quantity: input.estimatedWasteKg != null ? String(input.estimatedWasteKg) : "0",
      instructions: input.instructions,
      internal_notes: input.internalNotes,
      reference_photo_path: input.hasReferencePhoto ? "placeholder" : null,
    };
    const task = await insertTask(row);
    await insertTaskEvent(task.id, "created", "Task created");
    if (input.assignee) {
      await insertTaskEvent(task.id, "assigned", `Assigned to ${input.assignee}`);
    }
    await this.refresh();
    notifyOperationalDataChanged();
    return task;
  },

  async editTask(taskId: string, patch: Partial<NewTaskInput>) {
    const dbPatch: Partial<TaskInsert> = {};
    if (patch.title !== undefined) dbPatch.title = patch.title;
    if (patch.description !== undefined) dbPatch.description = patch.description;
    if (patch.location !== undefined) dbPatch.address = patch.location;
    if (patch.latitude !== undefined) dbPatch.latitude = patch.latitude;
    if (patch.longitude !== undefined) dbPatch.longitude = patch.longitude;
    if (patch.zone !== undefined) {
      await fetchZones();
      const zoneId = zoneIdFromName(patch.zone);
      if (!zoneId) throw new Error("The selected zone is unavailable. Refresh the page and try again.");
      dbPatch.zone_id = zoneId;
    }
    if (patch.priority !== undefined) dbPatch.priority = patch.priority;
    if (patch.hotspotType !== undefined)
      dbPatch.hotspot_type = patch.hotspotType;
    if (patch.estimatedWasteKg !== undefined)
      dbPatch.estimated_quantity = String(patch.estimatedWasteKg);
    if (patch.instructions !== undefined) dbPatch.instructions = patch.instructions;
    if (patch.internalNotes !== undefined)
      dbPatch.internal_notes = patch.internalNotes;
    if (patch.hasReferencePhoto !== undefined)
      dbPatch.reference_photo_path = patch.hasReferencePhoto ? "placeholder" : null;
    if (patch.dueAt !== undefined) dbPatch.due_at = uiDateToIso(patch.dueAt);
    if (patch.assignee !== undefined) {
      dbPatch.collector_id = resolveAssigneeId(patch.assignee);
      dbPatch.status = patch.assignee ? "assigned" : "draft";
    }

    await updateTask(taskId, dbPatch);
    await insertTaskEvent(taskId, "updated", "Task details updated");
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async assignCollector(taskId: string, collectorName: string) {
    const collectorId = resolveAssigneeId(collectorName);
    if (!collectorId) return;
    const task = state.tasks.find((t) => t.id === taskId);
    const nextStatus: string = task?.status === "open" ? "assigned" : task?.status ?? "assigned";
    await updateTask(taskId, {
      collector_id: collectorId,
      status: taskStatusToDb(nextStatus),
    });
    await insertTaskEvent(taskId, "assigned", `Assigned to ${collectorName}`);
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async reassignCollector(taskId: string, collectorName: string) {
    const collectorId = resolveAssigneeId(collectorName);
    if (!collectorId) return;
    const task = state.tasks.find((t) => t.id === taskId);
    const previous = task?.assignee;
    const nextStatus: string = task?.status === "declined" ? "assigned" : task?.status ?? "assigned";
    await updateTask(taskId, {
      collector_id: collectorId,
      status: taskStatusToDb(nextStatus),
    });
    await insertTaskEvent(
      taskId,
      "reassigned",
      previous
        ? `Reassigned from ${previous} to ${collectorName}`
        : `Assigned to ${collectorName}`,
    );
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async cancelTask(taskId: string) {
    await updateTask(taskId, { status: "canceled" });
    await insertTaskEvent(taskId, "canceled", "Task canceled by operator");
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async deleteTask(taskId: string) {
    await deleteTaskSafely(taskId);
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async requestResubmission(taskId: string) {
    const task = state.tasks.find((t) => t.id === taskId);
    await insertTaskEvent(
      taskId,
      "resubmission_requested",
      `Resubmission requested from ${task?.assignee ?? "collector"}`,
    );
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async approveTask(taskId: string, _now?: string) {
    await updateTask(taskId, { status: "approved" });
    const task = state.tasks.find((t) => t.id === taskId);
    await insertTaskEvent(
      taskId,
      "approved",
      `Submission approved${task?.assignee ? ` — ${task.assignee}` : ""}`,
    );
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async rejectTask(taskId: string, _now?: string, reason?: string) {
    await updateTask(taskId, { status: "rejected" });
    await insertTaskEvent(
      taskId,
      "rejected",
      `Submission rejected${reason ? ` — ${reason}` : ""}`,
    );
    await this.refresh();
    notifyOperationalDataChanged();
  },
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useTaskStore(): {
  tasks: Task[];
  events: TaskEvent[];
  loading: boolean;
  error: string | null;
} {
  taskStoreActions.init();
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function useTaskEvents(taskId: string): TaskEvent[] {
  taskStoreActions.init();
  const all = useSyncExternalStore(subscribe, () => state.events, () => state.events);
  if (taskId === "__none") return [];
  return all.filter((e) => e.taskId === taskId);
}

export function getTasks(): Task[] {
  return state.tasks;
}
