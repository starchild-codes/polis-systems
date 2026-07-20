import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

interface VercelConfig {
  redirects?: unknown[];
  rewrites?: Array<{ source: string; destination: string }>;
}

async function loadVercelConfig(): Promise<VercelConfig> {
  const configUrl = new URL("../../vercel.json", import.meta.url);
  return JSON.parse(await readFile(configUrl, "utf8")) as VercelConfig;
}

function sourceMatchesPath(source: string, path: string): boolean {
  return new RegExp(`^${source}$`).test(path);
}

describe("Vercel routing", () => {
  it("keeps API paths out of the SPA fallback", async () => {
    const config = await loadVercelConfig();
    const fallback = config.rewrites?.find(
      (rewrite) => rewrite.destination === "/index.html",
    );

    assert.ok(fallback, "SPA fallback rewrite is required");
    assert.equal(
      sourceMatchesPath(fallback.source, "/api/twilio/whatsapp"),
      false,
    );
    assert.equal(
      sourceMatchesPath(fallback.source, "/api/twilio/assign-task"),
      false,
    );
    assert.equal(sourceMatchesPath(fallback.source, "/dashboard/tasks"), true);
  });

  it("does not redirect the webhook path", async () => {
    const config = await loadVercelConfig();
    assert.equal(config.redirects?.length || 0, 0);
  });
});
