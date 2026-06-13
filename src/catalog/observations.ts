/**
 * Observation journal — stores "born-ready" / publish metadata per skill.
 *
 * Records what was published when, against which competitors, and when
 * the next review is due. The "回炉" (recycle) step of the luban workflow.
 *
 * Storage: ~/.pi/agent/pi-artisan-observations.json
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SkillObservation } from "../types.js";

const HOME = process.env.HOME || "/home/wtown";
const OBS_PATH = join(HOME, ".pi", "agent", "pi-artisan-observations.json");

interface ObservationsFile {
  version: "1";
  entries: ObservationEntry[];
}

export interface ObservationEntry {
  slug: string;
  publishedAt: string;
  publishedVersion: string;
  competitors: string[];
  nextCheckDate: string | null;
}

function loadAll(): ObservationsFile {
  try {
    if (!existsSync(OBS_PATH)) return { version: "1", entries: [] };
    const raw = readFileSync(OBS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { version: "1", entries: [] };
  }
}

function saveAll(data: ObservationsFile): void {
  try {
    const dir = OBS_PATH.replace(/\/[^/]+$/, "");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(OBS_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // silent fail — non-critical metadata
  }
}

/**
 * Record (or update) an observation for a skill after publish.
 */
export function recordObservation(slug: string, version: string): void {
  const data = loadAll();
  const existing = data.entries.find((e) => e.slug === slug);
  if (existing) {
    existing.publishedAt = new Date().toISOString();
    existing.publishedVersion = version;
  } else {
    data.entries.push({
      slug,
      publishedAt: new Date().toISOString(),
      publishedVersion: version,
      competitors: [],
      nextCheckDate: null,
    });
  }
  saveAll(data);
}

/**
 * Get observation for a specific skill slug.
 */
export function getObservation(slug: string): SkillObservation | null {
  const data = loadAll();
  const entry = data.entries.find((e) => e.slug === slug);
  if (!entry) return null;
  return {
    publishedAt: entry.publishedAt,
    publishedVersion: entry.publishedVersion,
    competitors: entry.competitors,
    nextCheckDate: entry.nextCheckDate,
  };
}

/**
 * Get all observations (for maintain report).
 */
export function getAllObservations(): SkillObservation[] {
  const data = loadAll();
  return data.entries.map((e) => ({
    publishedAt: e.publishedAt,
    publishedVersion: e.publishedVersion,
    competitors: e.competitors,
    nextCheckDate: e.nextCheckDate,
    _slug: e.slug, // internal only
  })) as SkillObservation[] & { _slug?: string }[];
}
