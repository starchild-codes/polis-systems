import { useSyncExternalStore, useCallback } from "react";
import { fetchZones, insertZone, type ZoneRow } from "@/lib/supabase-data";

// ─── Store state ────────────────────────────────────────────────────────────

interface ZoneStoreState {
  zones: ZoneRow[];
  loading: boolean;
  error: string | null;
}

let state: ZoneStoreState = {
  zones: [],
  loading: true,
  error: null,
};

const listeners = new Set<() => void>();

export function resetZoneStore() {
  fetchPromise = null;
  state = { zones: [], loading: true, error: null };
  emit();
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let fetchPromise: Promise<void> | null = null;

async function loadZones(): Promise<void> {
  state = { ...state, loading: true, error: null };
  emit();
  try {
    const zones = await fetchZones();
    state = { zones, loading: false, error: null };
  } catch (err) {
    state = {
      ...state,
      loading: false,
      error: err instanceof Error ? err.message : "Failed to load zones",
    };
  }
  emit();
}

export const zoneStoreActions = {
  async init() {
    if (fetchPromise) return fetchPromise;
    fetchPromise = loadZones();
    return fetchPromise;
  },

  async refresh() {
    fetchPromise = null;
    return this.init();
  },

  async createZone(name: string): Promise<ZoneRow> {
    const zone = await insertZone(name);
    state = {
      ...state,
      zones: [...state.zones, zone].sort((a, b) => a.name.localeCompare(b.name)),
    };
    emit();
    return zone;
  },
};

export function useZones(): ZoneRow[] {
  zoneStoreActions.init();
  const get = useCallback(() => state.zones, []);
  return useSyncExternalStore(subscribe, get, get);
}

export function useZoneStoreState(): ZoneStoreState {
  zoneStoreActions.init();
  const get = useCallback(() => state, []);
  return useSyncExternalStore(subscribe, get, get);
}

/** Fallback zone names for UI rendering before zones load. */
export const FALLBACK_ZONES = ["North", "South", "East", "West", "Central"] as const;
