The preview server is currently unreachable, so the app cannot render in the preview panel/new tab.

Plan:
1. Check the Vite/dev-server logs for the most recent startup or compile error.
2. If the server is stopped or wedged, restart the dev server.
3. If logs show a TypeScript/runtime compile failure, fix only the blocking error and keep the existing Polis Systems app unchanged.
4. Flush/reload the preview and verify the app renders again.
5. Report the root cause and any files changed.

Likely cause from the live check: the preview endpoint on localhost:8080 is not responding, which means this is a dev-server availability/build issue rather than a page-specific UI issue.