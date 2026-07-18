// A small in-app signal for views that display database-derived operational
// summaries. It avoids stale dashboard metrics after mutations in another
// mounted route without introducing a polling loop or a new backend service.
const listeners = new Set<() => void>();

export function notifyOperationalDataChanged() {
  for (const listener of listeners) listener();
}

export function subscribeToOperationalDataChanges(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
