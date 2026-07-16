import { supabase } from "@/integrations/supabase/client";
import type {
  Collector,
  CollectorStatus,
  CollectorType,
  Task,
  TaskStatus,
  TaskEvent,
  Priority,
  HotspotType,
  WasteType,
  Zone,
} from "@/lib/mock-data";

// ─── Zone helpers ───────────────────────────────────────────────────────────

export interface ZoneRow {
  id: string;
  name: string;
}

const zoneCache = new Map<string, string>(); // id → name
const nameCache = new Map<string, string>(); // name → id (lowercased for lookup)

export async function fetchZones(): Promise<ZoneRow[]> {
  const { data, error } = await supabase
    .from("zones")
    .select("id, name")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  for (const z of data ?? []) {
    zoneCache.set(z.id, z.name);
    nameCache.set(z.name.toLowerCase(), z.id);
  }
  return data ?? [];
}

export function zoneNameFromId(id: string | null | undefined): string {
  if (!id) return "—";
  return zoneCache.get(id) ?? "—";
}

export function zoneIdFromName(name: string): string | null {
  return nameCache.get(name.toLowerCase()) ?? null;
}

// ─── Collector mapping ──────────────────────────────────────────────────────

const COLLECTOR_STATUS_MAP: Record<string, CollectorStatus> = {
  active: "active",
  inactive: "inactive",
  suspended: "suspended",
  pending_registration: "pending",
};

const COLLECTOR_STATUS_DB_MAP: Record<CollectorStatus, string> = {
  active: "active",
  inactive: "inactive",
  suspended: "suspended",
  pending: "pending_registration",
};

interface CollectorRow {
  id: string;
  name: string;
  phone_e164: string;
  zone_id: string | null;
  status: string;
  collector_type: string | null;
  organization_affiliation: string | null;
  preferred_language: string | null;
  notes: string | null;
  registered_at: string;
  last_active_at: string | null;
}

function mapCollector(row: CollectorRow): Collector {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone_e164,
    zone: (zoneNameFromId(row.zone_id) as Zone) ?? "—",
    status: COLLECTOR_STATUS_MAP[row.status] ?? "pending",
    collectorType: (row.collector_type as CollectorType) ?? undefined,
    organization: row.organization_affiliation ?? undefined,
    preferredLanguage: row.preferred_language ?? undefined,
    internalNotes: row.notes ?? undefined,
    registeredAt: formatDbTimestamp(row.registered_at),
    lastActiveAt: row.last_active_at ? formatDbTimestamp(row.last_active_at) : "—",
  };
}

export async function fetchCollectors(): Promise<Collector[]> {
  const { data, error } = await supabase
    .from("collectors")
    .select("*")
    .order("registered_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapCollector);
}

export interface CollectorInsert {
  name: string;
  phone_e164: string;
  zone_id: string | null;
  status: string;
  collector_type?: string;
  organization_affiliation?: string;
  preferred_language?: string;
  notes?: string;
}

export async function insertCollector(input: CollectorInsert): Promise<Collector> {
  const { data, error } = await supabase
    .from("collectors")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return mapCollector(data as CollectorRow);
}

export async function updateCollector(
  id: string,
  patch: Partial<CollectorInsert>,
): Promise<void> {
  const { error } = await supabase.from("collectors").update(patch).eq("id", id);
  if (error) throw error;
}

// ─── Task mapping ───────────────────────────────────────────────────────────
//
// Schema mismatches between the DB and the UI's mock-data types:
//   DB column           → UI field
//   address             → location
//   collector_id        → assignee (resolved to collector name via cache)
//   estimated_quantity  → estimatedWasteKg (text in DB, number in UI)
//   reference_photo_path → hasReferencePhoto (text in DB, boolean in UI)

const TASK_STATUS_DB_TO_UI: Record<string, string> = {
  draft: "open",
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  submitted: "submitted",
  approved: "approved",
  declined: "declined",
  rejected: "rejected",
  canceled: "canceled",
};

const TASK_STATUS_UI_TO_DB: Record<string, string> = {
  open: "draft",
  assigned: "assigned",
  accepted: "accepted",
  in_progress: "in_progress",
  submitted: "submitted",
  approved: "approved",
  declined: "declined",
  rejected: "rejected",
  canceled: "canceled",
};

export function taskStatusToDb(uiStatus: string): string {
  return TASK_STATUS_UI_TO_DB[uiStatus] ?? uiStatus;
}

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  hotspot_type: string;
  priority: string;
  status: string;
  collector_id: string | null;
  zone_id: string | null;
  due_at: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  estimated_quantity: string | null;
  instructions: string | null;
  reference_photo_path: string | null;
  internal_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const collectorNameCache = new Map<string, string>();

export function cacheCollectorName(id: string, name: string) {
  collectorNameCache.set(id, name);
}

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    location: row.address ?? "",
    latitude: row.latitude ?? 0,
    longitude: row.longitude ?? 0,
    zone: (zoneNameFromId(row.zone_id) as Zone) ?? "—",
    status: (TASK_STATUS_DB_TO_UI[row.status] ?? row.status) as TaskStatus,
    priority: row.priority as Priority,
    hotspotType: row.hotspot_type as HotspotType,
    assignee: row.collector_id
      ? collectorNameCache.get(row.collector_id) ?? "—"
      : undefined,
    createdBy: row.created_by ?? "—",
    createdAt: formatDbTimestamp(row.created_at),
    updatedAt: formatDbTimestamp(row.updated_at),
    dueAt: formatDbTimestamp(row.due_at),
    wasteType: "Mixed Municipal" as WasteType,
    estimatedWasteKg: row.estimated_quantity ? Number(row.estimated_quantity) || 0 : 0,
    instructions: row.instructions ?? undefined,
    internalNotes: row.internal_notes ?? undefined,
    hasReferencePhoto: !!row.reference_photo_path,
  };
}

export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapTask);
}

export interface TaskInsert {
  title: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  zone_id: string | null;
  status: string;
  priority: string;
  hotspot_type: string;
  collector_id?: string | null;
  created_by?: string | null;
  due_at: string;
  estimated_quantity?: string;
  instructions?: string;
  internal_notes?: string;
  reference_photo_path?: string | null;
}

export async function insertTask(input: TaskInsert): Promise<Task> {
  const { data, error } = await supabase
    .from("tasks")
    .insert(input)
    .select("*")
    .single();
  if (error) throw error;
  return mapTask(data as TaskRow);
}

export async function updateTask(
  id: string,
  patch: Partial<TaskInsert>,
): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ─── Task events ────────────────────────────────────────────────────────────

interface TaskEventRow {
  id: string;
  task_id: string;
  event_type: string;
  previous_status: string | null;
  new_status: string | null;
  actor_type: string;
  actor_id: string | null;
  metadata: { message?: string } | Record<string, unknown>;
  created_at: string;
}

function mapTaskEvent(row: TaskEventRow): TaskEvent {
  const message =
    (row.metadata as { message?: string })?.message ?? row.event_type;
  return {
    id: row.id,
    taskId: row.task_id,
    timestamp: formatDbTimestamp(row.created_at),
    message,
  };
}

export async function fetchTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const { data, error } = await supabase
    .from("task_events")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapTaskEvent);
}

export async function fetchAllTaskEvents(): Promise<TaskEvent[]> {
  const { data, error } = await supabase
    .from("task_events")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapTaskEvent);
}

export async function insertTaskEvent(
  taskId: string,
  eventType: string,
  message: string,
  createdBy?: string | null,
): Promise<void> {
  const { error } = await supabase.from("task_events").insert({
    task_id: taskId,
    event_type: eventType,
    actor_type: "operator",
    actor_id: createdBy ?? null,
    metadata: { message },
  });
  if (error) throw error;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function formatDbTimestamp(ts: string | null | undefined): string {
  if (!ts) return "—";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

export function uiDateToIso(uiDate: string): string {
  const [datePart, timePart] = uiDate.split(" ");
  const time = timePart ?? "00:00";
  return new Date(`${datePart}T${time}:00`).toISOString();
}

export function collectorIdFromName(
  name: string,
  collectors: Collector[],
): string | null {
  const found = collectors.find((c) => c.name === name);
  return found?.id ?? null;
}

export { COLLECTOR_STATUS_DB_MAP };
