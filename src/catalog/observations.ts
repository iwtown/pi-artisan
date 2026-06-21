/**
 * Observation journal — stores "born-ready" / publish metadata per skill.
 *
 * Records what was published when, against which competitors, and when
 * the next review is due. The "回炉" (recycle) step of the luban workflow.
 *
 * Storage: ~/.pi/agent/pi-artisan-observations.json
 */

import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { SkillObservation } from "../types.js";

const HOME = process.env.HOME || "/home/wtown";
const OBS_PATH = join(HOME, ".pi", "agent", "pi-artisan-observations.json");

/** Days until the next check is due after publishing */
const DAYS_BETWEEN_CHECKS = 90;

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
    // Atomic write: write to temp then rename to prevent partial writes on crash
    const tmpPath = OBS_PATH + ".tmp." + process.pid;
    writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
    renameSync(tmpPath, OBS_PATH);
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
  const now = new Date();
  const nextCheck = new Date(now.getTime() + DAYS_BETWEEN_CHECKS * 86400000).toISOString();
  if (existing) {
    existing.publishedAt = now.toISOString();
    existing.publishedVersion = version;
    existing.nextCheckDate = nextCheck;
  } else {
    data.entries.push({
      slug,
      publishedAt: now.toISOString(),
      publishedVersion: version,
      competitors: [],
      nextCheckDate: nextCheck,
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

/**
 * Get entries where the next check date is overdue.
 */
export function getOverdueChecks(): { slug: string; publishedAt: string; publishedVersion: string; nextCheckDate: string }[] {
  const data = loadAll();
  const now = new Date();
  return data.entries
    .filter((e): e is ObservationEntry & { nextCheckDate: string } =>
      e.nextCheckDate !== null && new Date(e.nextCheckDate) < now
    )
    .map((e) => ({
      slug: e.slug,
      publishedAt: e.publishedAt,
      publishedVersion: e.publishedVersion,
      nextCheckDate: e.nextCheckDate!,
    }));
}
