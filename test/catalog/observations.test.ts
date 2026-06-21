/**
 * Tests for observations journal — CRUD operations through public API.
 *
 * These tests write to the real ~/.pi/agent/pi-artisan-observations.json
 * and use unique slugs per test to avoid cross-test pollution.
 * Cleanup removes test entries in afterAll.
 */

import { describe, it, expect, afterAll } from "vitest";
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  recordObservation,
  getObservation,
  getAllObservations,
  getOverdueChecks,
} from "../../src/catalog/observations.js";

const OBS_PATH = join(homedir(), ".pi", "agent", "pi-artisan-observations.json");
const TEST_PREFIX = "__test_obs_";
let testCounter = 0;

function testSlug(label: string): string {
  return `${TEST_PREFIX}${label}_${++testCounter}`;
}

afterAll(() => {
  // Remove all test entries
  if (existsSync(OBS_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(OBS_PATH, "utf-8"));
      raw.entries = raw.entries.filter(
        (e: any) => !e.slug.startsWith(TEST_PREFIX)
      );
      const tmpPath = OBS_PATH + ".tmp.cleanup";
      writeFileSync(tmpPath, JSON.stringify(raw, null, 2), "utf-8");
      renameSync(tmpPath, OBS_PATH);
    } catch { /* ignore */ }
  }
});

describe("recordObservation", () => {
  it("should record a new observation", () => {
    const slug = testSlug("record");
    recordObservation(slug, "1.0.0");
    const obs = getObservation(slug);
    expect(obs).not.toBeNull();
    expect(obs!.publishedVersion).toBe("1.0.0");
  });

  it("should update an existing observation", () => {
    const slug = testSlug("update");
    recordObservation(slug, "1.0.0");
    recordObservation(slug, "2.0.0");
    const obs = getObservation(slug);
    expect(obs!.publishedVersion).toBe("2.0.0");
  });

  it("should handle multiple skills", () => {
    const slugA = testSlug("multi-a");
    const slugB = testSlug("multi-b");
    recordObservation(slugA, "1.0.0");
    recordObservation(slugB, "1.0.0");
    const all = getAllObservations();
    // getAllObservations returns SkillObservation[]; _slug is internal but at runtime it's there
    const testEntries = all.filter((o: any) =>
      o._slug === slugA || o._slug === slugB
    );
    expect(testEntries).toHaveLength(2);
  });
});

describe("getObservation", () => {
  it("should return null for unknown skill", () => {
    const obs = getObservation("__test_obs_nonexistent_xyz");
    expect(obs).toBeNull();
  });
});

describe("getAllObservations", () => {
  it("should return an array", () => {
    const all = getAllObservations();
    expect(Array.isArray(all)).toBe(true);
  });
});

describe("nextCheckDate", () => {
  it("should be set after recording an observation", () => {
    const slug = testSlug("ncd-set");
    recordObservation(slug, "1.0.0");
    const obs = getObservation(slug);
    expect(obs!.nextCheckDate).not.toBeNull();
  });

  it("should be approximately 90 days in the future", () => {
    const slug = testSlug("ncd-future");
    recordObservation(slug, "1.0.0");
    const obs = getObservation(slug);
    const diff = new Date(obs!.nextCheckDate!).getTime() - Date.now();
    // Allow 24h slop for test execution timing
    expect(diff).toBeGreaterThan(89 * 86400000);
    expect(diff).toBeLessThan(91 * 86400000);
  });


});

describe("getOverdueChecks", () => {
  it("should not return fresh entries", () => {
    const slug = testSlug("od-fresh");
    recordObservation(slug, "1.0.0");
    const overdue = getOverdueChecks();
    const match = overdue.find((o) => o.slug === slug);
    expect(match).toBeUndefined();
  });

  it("should return entries with past nextCheckDate", () => {
    // Manually inject a stale entry by writing to the file directly
    const staleSlug = testSlug("od-stale");
    const raw = JSON.parse(readFileSync(OBS_PATH, "utf-8"));
    raw.entries.push({
      slug: staleSlug,
      publishedAt: "2024-01-01T00:00:00.000Z",
      publishedVersion: "0.1.0",
      competitors: [],
      nextCheckDate: "2024-06-01T00:00:00.000Z",
    });
    const tmpPath = OBS_PATH + ".tmp.stale";
    writeFileSync(tmpPath, JSON.stringify(raw, null, 2), "utf-8");
    renameSync(tmpPath, OBS_PATH);

    const overdue = getOverdueChecks();
    const match = overdue.find((o) => o.slug === staleSlug);
    expect(match).toBeDefined();
    expect(match!.nextCheckDate).toBe("2024-06-01T00:00:00.000Z");
  });
});

describe("atomic write safety", () => {
  it("should produce valid JSON that can be read back", () => {
    const slugA = testSlug("atom-a");
    const slugB = testSlug("atom-b");
    recordObservation(slugA, "1.0.0");
    recordObservation(slugB, "0.5.0");
    expect(existsSync(OBS_PATH)).toBe(true);
    const raw = readFileSync(OBS_PATH, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });
});
