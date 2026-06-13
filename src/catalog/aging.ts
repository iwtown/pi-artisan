/**
 * Aging detection — checks resource staleness via file mtime.
 *
 * 90 days without update → stale
 * 180 days without update → archived
 */

import { statSync } from "node:fs";
import { scanByType, scanResources } from "./scanner.js";
import type { ResourceType, AgingInfo } from "../types.js";

const STALE_DAYS = 90;
const ARCHIVE_DAYS = 180;

/**
 * Check aging for all resources or a specific type.
 */
export function checkAging(type?: ResourceType): AgingInfo[] {
  const resources = type ? scanByType(type) : scanResources();
  const results: AgingInfo[] = [];

  for (const r of resources) {
    // Packages don't have a local file to check mtime on
    if (r.type === "package") continue;

    try {
      const st = statSync(r.path);
      const mtime = st.mtime;
      const days = (Date.now() - mtime.getTime()) / 86400000;

      let status: "active" | "stale" | "archived";
      if (days > ARCHIVE_DAYS) status = "archived";
      else if (days > STALE_DAYS) status = "stale";
      else status = "active";

      results.push({
        path: r.path,
        type: r.type,
        name: r.name,
        lastModified: mtime,
        daysSinceUpdate: Math.round(days),
        status,
      });
    } catch {
      // Skip files that can't be stat'd
    }
  }

  return results.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);
}
