import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import {
  COLLECTOR_LANGUAGE_OPTIONS,
  DEFAULT_COLLECTOR_LANGUAGE,
  getCollectorLanguageLabel,
  getCollectorLanguageOptions,
  isCollectorLanguageValueAllowed,
  normalizeCollectorLanguageForStorage,
} from "../../src/lib/collector-languages.js";
import { tasksToCsv, type TaskCsvRow } from "../../src/lib/csv.js";
import type { Collector, Task } from "../../src/lib/mock-data.js";

const root = new URL("../../", import.meta.url);
const exposedUuid = "895f432f-1194-4b63-87b5-9dcf2e69b7c0";

async function frontendSource(): Promise<string> {
  const sourceRoot = new URL("src/", root);
  const files = await readdir(sourceRoot, { recursive: true, withFileTypes: true });
  const sourceFiles = files
    .filter((entry) => entry.isFile() && [".ts", ".tsx", ".css"].includes(extname(entry.name)))
    .map((entry) => pathToFileURL(join(entry.parentPath, entry.name)));
  return (await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")))).join("\n");
}

function task(title: string): Task {
  return {
    id: `task-${title}`,
    title,
    description: "Cleanup",
    location: "Pilot site",
    latitude: 27.7,
    longitude: -81.5,
    zone: "Central",
    status: "assigned",
    priority: "medium",
    hotspotType: "Mixed waste",
    assignee: "Collector",
    createdBy: "Operator",
    createdAt: "2026-07-21 09:00",
    updatedAt: "2026-07-21 09:00",
    dueAt: "2026-07-22 09:00",
    wasteType: "Mixed Municipal",
    estimatedWasteKg: 10,
  };
}

function collector(preferredLanguage: string): Collector {
  return {
    id: `collector-${preferredLanguage}`,
    name: "Collector",
    phone: "+13055550123",
    zone: "Central",
    status: "active",
    preferredLanguage,
    registeredAt: "2026-07-21 09:00",
    lastActiveAt: "—",
  };
}

describe("Florida pilot and collector language compatibility", () => {
  it("removes Bengaluru and Bangalore from production frontend source", async () => {
    const source = await frontendSource();
    assert.doesNotMatch(source, /Bengaluru|Bangalore/iu);
    assert.match(source, /Florida pilot/iu);
  });

  it("provides the Florida language list with English selected by default", () => {
    assert.deepEqual(COLLECTOR_LANGUAGE_OPTIONS, [
      { value: "en", label: "English" },
      { value: "es", label: "Spanish" },
      { value: "ht", label: "Haitian Creole" },
      { value: "pt", label: "Portuguese" },
      { value: "fr", label: "French" },
      { value: "other", label: "Other" },
    ]);
    assert.equal(DEFAULT_COLLECTOR_LANGUAGE, "en");
  });

  it("accepts and preserves every new stable language code", () => {
    for (const option of COLLECTOR_LANGUAGE_OPTIONS) {
      assert.equal(isCollectorLanguageValueAllowed(option.value), true);
      assert.equal(normalizeCollectorLanguageForStorage(option.value), option.value);
      assert.equal(getCollectorLanguageLabel(option.value), option.label);
    }
  });

  it("keeps a legacy language visible and unchanged when editing without a new selection", () => {
    const options = getCollectorLanguageOptions("Kannada");
    assert.deepEqual(options[0], { value: "Kannada", label: "Kannada (current saved value)" });
    assert.equal(isCollectorLanguageValueAllowed("Kannada", "Kannada"), true);
    assert.equal(normalizeCollectorLanguageForStorage("Kannada", "Kannada"), "Kannada");
    assert.equal(getCollectorLanguageLabel("Kannada"), "Kannada");
    assert.equal(getCollectorLanguageLabel(exposedUuid), "—");
    assert.throws(() => normalizeCollectorLanguageForStorage("Kannada"), /available preferred language/u);
  });

  it("wires the Add/Edit Collector form to the shared options and legacy-safe display", async () => {
    const source = await readFile(new URL("src/routes/collectors.tsx", root), "utf8");
    assert.match(source, /preferredLanguage:\s*DEFAULT_COLLECTOR_LANGUAGE/u);
    assert.match(source, /getCollectorLanguageOptions\(values\.preferredLanguage\)/u);
    assert.match(source, /getCollectorLanguageLabel\(collector\.preferredLanguage\)/u);
    assert.match(source, /getCollectorLanguageLabel\(c\.preferredLanguage\)/u);
    assert.match(source, /Used for future communication preferences\./u);
  });

  it("exports both new and legacy stored languages as safe display labels", () => {
    const rows: TaskCsvRow[] = [
      { task: task("Spanish task"), collector: collector("es") },
      { task: task("Legacy task"), collector: collector("Hindi") },
    ];
    const csv = tasksToCsv(rows);
    assert.match(csv, /Collector Preferred Language/u);
    assert.match(csv, /Spanish task[^\r\n]*Spanish/u);
    assert.match(csv, /Legacy task[^\r\n]*Hindi/u);
  });

  it("uses the same language presentation in PDF reports", async () => {
    const source = await readFile(new URL("src/lib/report-pdf.ts", root), "utf8");
    assert.match(source, /getCollectorLanguageLabel\(collector\.preferredLanguage\)/u);
    assert.match(source, /\["Collector", "Zone", "Language"/u);
  });

  it("does not claim that language preferences translate WhatsApp messages", async () => {
    const source = await frontendSource();
    assert.doesNotMatch(source, /WhatsApp[^.\n]{0,120}(?:automatically\s+translated|automatic\s+translation)/iu);
  });
});
