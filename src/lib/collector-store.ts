import { useSyncExternalStore, useCallback } from "react";
import {
  fetchCollectors,
  insertCollector,
  updateCollector,
  deleteCollectorSafely,
  fetchZones,
  zoneIdFromName,
  COLLECTOR_STATUS_DB_MAP,
  cacheCollectorName,
  type CollectorInsert,
} from "@/lib/supabase-data";
import { notifyOperationalDataChanged } from "@/lib/operational-events";
import type {
  Collector,
  CollectorStatus,
  CollectorType,
  Zone,
} from "@/lib/mock-data";
import { getUserFacingError } from "@/lib/safe-display";
import { normalizeCollectorLanguageForStorage } from "@/lib/collector-languages";

// ─── Store state ────────────────────────────────────────────────────────────

interface CollectorStoreState {
  collectors: Collector[];
  loading: boolean;
  error: string | null;
}

let state: CollectorStoreState = {
  collectors: [],
  loading: true,
  error: null,
};

const listeners = new Set<() => void>();

export function resetCollectorStore() {
  fetchPromise = null;
  state = { collectors: [], loading: true, error: null };
  emit();
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

// ─── Actions ────────────────────────────────────────────────────────────────

export interface NewCollectorInput {
  name: string;
  phone: string;
  zone: Zone;
  status: CollectorStatus;
  collectorType?: CollectorType;
  organization?: string;
  preferredLanguage?: string;
  internalNotes?: string;
}

let fetchPromise: Promise<void> | null = null;

async function loadCollectors(): Promise<void> {
  state = { ...state, loading: true, error: null };
  emit();
  try {
    const collectors = await fetchCollectors();
    for (const c of collectors) cacheCollectorName(c.id, c.name);
    state = { collectors, loading: false, error: null };
  } catch (err) {
    state = {
      ...state,
      loading: false,
      error: getUserFacingError(err, "Collectors could not be loaded. Please try again."),
    };
  }
  emit();
}

export const collectorStoreActions = {
  async init() {
    if (fetchPromise) return fetchPromise;
    fetchPromise = loadCollectors();
    return fetchPromise;
  },

  async refresh() {
    fetchPromise = null;
    return this.init();
  },

  async createCollector(input: NewCollectorInput): Promise<Collector> {
    await fetchZones();
    const zoneId = zoneIdFromName(input.zone);
    if (!zoneId) throw new Error("The selected zone is unavailable. Refresh the page and try again.");
    const row: CollectorInsert = {
      name: input.name,
      phone_e164: input.phone,
      zone_id: zoneId,
      status: COLLECTOR_STATUS_DB_MAP[input.status],
      collector_type: input.collectorType,
      organization_affiliation: input.organization,
      preferred_language: normalizeCollectorLanguageForStorage(input.preferredLanguage),
      notes: input.internalNotes,
    };
    const collector = await insertCollector(row);
    cacheCollectorName(collector.id, collector.name);
    state = {
      ...state,
      collectors: [collector, ...state.collectors],
    };
    emit();
    notifyOperationalDataChanged();
    return collector;
  },

  async editCollector(id: string, patch: Partial<NewCollectorInput>) {
    const dbPatch: Partial<CollectorInsert> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.phone !== undefined) dbPatch.phone_e164 = patch.phone;
    if (patch.zone !== undefined) {
      await fetchZones();
      const zoneId = zoneIdFromName(patch.zone);
      if (!zoneId) throw new Error("The selected zone is unavailable. Refresh the page and try again.");
      dbPatch.zone_id = zoneId;
    }
    if (patch.status !== undefined)
      dbPatch.status = COLLECTOR_STATUS_DB_MAP[patch.status];
    if (patch.collectorType !== undefined)
      dbPatch.collector_type = patch.collectorType;
    if (patch.organization !== undefined)
      dbPatch.organization_affiliation = patch.organization;
    if (patch.preferredLanguage !== undefined) {
      const currentLanguage = state.collectors.find((collector) => collector.id === id)?.preferredLanguage;
      dbPatch.preferred_language = normalizeCollectorLanguageForStorage(
        patch.preferredLanguage,
        currentLanguage,
      );
    }
    if (patch.internalNotes !== undefined) dbPatch.notes = patch.internalNotes;

    await updateCollector(id, dbPatch);
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async setStatus(id: string, status: CollectorStatus) {
    await updateCollector(id, {
      status: COLLECTOR_STATUS_DB_MAP[status],
    });
    await this.refresh();
    notifyOperationalDataChanged();
  },

  async deleteCollector(id: string) {
    await deleteCollectorSafely(id);
    await this.refresh();
    notifyOperationalDataChanged();
  },
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

export function useCollectorStore(): Collector[] {
  useCollectorStoreState();
  // Initialize on first use
  collectorStoreActions.init();

  const getCollectors = useCallback(() => state.collectors, []);
  return useSyncExternalStore(subscribe, getCollectors, getCollectors);
}

export function useCollectorStoreState(): CollectorStoreState {
  collectorStoreActions.init();
  const get = useCallback(() => state, []);
  return useSyncExternalStore(subscribe, get, get);
}

// Non-hook accessor for read-only, non-reactive callers (e.g. helpers outside React).
export function getCollectors(): Collector[] {
  return state.collectors;
}
