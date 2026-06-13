/**
 * Tests for before-start hook — pure function tests only.
 *
 * The hook's side effects (pi.on, ctx.ui) are not testable in unit tests.
 * All business logic is extracted as pure functions, tested here.
 */

import { describe, it, expect } from "vitest";
import {
  generateHealthNotice,
  extractStaleResources,
  extractOutdatedSkills,
} from "../../src/hooks/before-start.js";
import type { AgingInfo, VersionInfo } from "../../src/types.js";

describe("generateHealthNotice", () => {
  it("returns null when everything is healthy", () => {
    const result = generateHealthNotice({
      totalCount: 10,
      skillCount: 5,
      staleResources: [],
      outdatedSkills: [],
    });
    expect(result).toBeNull();
  });

  it("reports stale resources", () => {
    const result = generateHealthNotice({
      totalCount: 10,
      skillCount: 5,
      staleResources: [{ name: "old-skill", daysSinceUpdate: 120 }],
      outdatedSkills: [],
    });
    expect(result).toContain("1 个资源已老化");
    expect(result).toContain("old-skill");
    expect(result).toContain("120 天");
    expect(result).toContain("/resource-maintain");
  });

  it("reports outdated skills", () => {
    const result = generateHealthNotice({
      totalCount: 10,
      skillCount: 5,
      staleResources: [],
      outdatedSkills: [{ name: "github", current: "1.0.0", latest: "1.2.0" }],
    });
    expect(result).toContain("1 个 skill 版本落后");
    expect(result).toContain("github: 1.0.0 → 1.2.0");
  });

  it("reports both stale and outdated together", () => {
    const result = generateHealthNotice({
      totalCount: 15,
      skillCount: 8,
      staleResources: [{ name: "old-a", daysSinceUpdate: 200 }],
      outdatedSkills: [{ name: "pkg-b", current: "0.5.0", latest: "1.0.0" }],
    });
    expect(result).toContain("15 个能力包");
    expect(result).toContain("1 个资源已老化");
    expect(result).toContain("1 个 skill 版本落后");
  });

  it("limits stale display to 3 items with ellipsis", () => {
    const result = generateHealthNotice({
      totalCount: 20,
      skillCount: 10,
      staleResources: [
        { name: "a", daysSinceUpdate: 100 },
        { name: "b", daysSinceUpdate: 110 },
        { name: "c", daysSinceUpdate: 120 },
        { name: "d", daysSinceUpdate: 130 },
      ],
      outdatedSkills: [],
    });
    expect(result).toContain("...及其他 1 个");
  });

  it("limits outdated display to 3 items with ellipsis", () => {
    const result = generateHealthNotice({
      totalCount: 20,
      skillCount: 10,
      staleResources: [],
      outdatedSkills: [
        { name: "a", current: "1", latest: "2" },
        { name: "b", current: "1", latest: "2" },
        { name: "c", current: "1", latest: "2" },
        { name: "d", current: "1", latest: "2" },
      ],
    });
    expect(result).toContain("...及其他 1 个");
  });

  it("shows total count and skill count in header", () => {
    const result = generateHealthNotice({
      totalCount: 42,
      skillCount: 17,
      staleResources: [{ name: "x", daysSinceUpdate: 100 }],
      outdatedSkills: [],
    });
    expect(result).toContain("42 个能力包");
    expect(result).toContain("17 个 skill");
  });
});

describe("extractStaleResources", () => {
  it("filters stale and archived resources", () => {
    const aging: AgingInfo[] = [
      {
        path: "/a", type: "skill", name: "active-one",
        lastModified: new Date(), daysSinceUpdate: 30, status: "active",
      },
      {
        path: "/b", type: "skill", name: "stale-one",
        lastModified: new Date(), daysSinceUpdate: 100, status: "stale",
      },
      {
        path: "/c", type: "extension", name: "archived-one",
        lastModified: new Date(), daysSinceUpdate: 200, status: "archived",
      },
    ];

    const result = extractStaleResources(aging);
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("stale-one");
    expect(result[1].name).toBe("archived-one");
  });

  it("returns empty when all active", () => {
    const aging: AgingInfo[] = [
      {
        path: "/a", type: "skill", name: "good",
        lastModified: new Date(), daysSinceUpdate: 10, status: "active",
      },
    ];
    expect(extractStaleResources(aging)).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(extractStaleResources([])).toHaveLength(0);
  });
});

describe("extractOutdatedSkills", () => {
  it("filters skills with newer versions available", () => {
    const versions: VersionInfo[] = [
      { type: "skill", name: "up-to-date", currentVersion: "1.0.0", latestVersion: "1.0.0", isUpToDate: true },
      { type: "skill", name: "behind", currentVersion: "1.0.0", latestVersion: "1.2.0", isUpToDate: false },
      { type: "package", name: "pkg", currentVersion: "2.0.0", latestVersion: "2.0.0", isUpToDate: true },
    ];

    const result = extractOutdatedSkills(versions);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("behind");
    expect(result[0].current).toBe("1.0.0");
    expect(result[0].latest).toBe("1.2.0");
  });

  it("returns empty when all up to date", () => {
    const versions: VersionInfo[] = [
      { type: "skill", name: "a", currentVersion: "1.0.0", latestVersion: "1.0.0", isUpToDate: true },
      { type: "skill", name: "b", currentVersion: "2.0.0", latestVersion: null, isUpToDate: true },
    ];
    expect(extractOutdatedSkills(versions)).toHaveLength(0);
  });

  it("handles empty input", () => {
    expect(extractOutdatedSkills([])).toHaveLength(0);
  });
});
