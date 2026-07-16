---
name: useSyncExternalStore SSR requirement
description: React's useSyncExternalStore throws during server rendering if you omit the third (getServerSnapshot) argument.
---

When building a module-level store consumed via `useSyncExternalStore(subscribe, getSnapshot)` in an SSR app (e.g. TanStack Start/Vite SSR), the two-argument form throws at render time on the server:

`Error: Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering.`

**Why:** `useSyncExternalStore` only omits `getServerSnapshot` safely in client-only rendering. Any SSR path (initial page load, not just hydration) calls it, and without a third argument React has no snapshot to render server-side.

**How to apply:** Always call it as `useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)`. For a module-level store whose initial state is the same on server and client (e.g. seeded from static mock/seed data), just pass the same snapshot getter twice: `useSyncExternalStore(subscribe, getSnapshot, getSnapshot)`.
