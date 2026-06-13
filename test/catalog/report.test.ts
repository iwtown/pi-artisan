import { describe, it, expect } from "vitest";
import { generateReport, formatResourceTable, formatMaintainReport } from "../../src/catalog/report";
import type { ResourceInfo, QualityScore } from "../../src/types";

describe("generateReport", () => {
  const mockResource: ResourceInfo = {
    type: "skill",
    name: "test-skill",
    path: "/home/test/skills/test-skill/SKILL.md",
    version: "1.0.0",
    author: "test-author",
    source: "community",
    lastModified: "2026-06-01T00:00:00.000Z",
    qualityScore: 85,
    status: "active",
  };

  const mockScore: QualityScore = {
    overall: 85,
    dimensions: { structure: 90, content: 80, radiant: 70, version: 100, testing: 85 },
  };

  it("should include resource name and version", () => {
    const report = generateReport(mockResource, mockScore);
    expect(report).toContain("test-skill");
    expect(report).toContain("1.0.0");
    expect(report).toContain("85/100");
  });

  it("should include dimension bars", () => {
    const report = generateReport(mockResource, mockScore);
    expect(report).toContain("structure");
    expect(report).toContain("content");
  });

  it("should include status", () => {
    const report = generateReport(mockResource, mockScore);
    expect(report).toContain("active");
  });
});

describe("formatResourceTable", () => {
  it("should return empty message for empty list", () => {
    const result = formatResourceTable([], "Skills");
    expect(result).toContain("空");
  });

  it("should format resource list", () => {
    const resources: ResourceInfo[] = [
      {
        type: "skill", name: "test", path: "/test", version: "1.0.0",
        author: "author", source: "community", lastModified: "2026-01-01T00:00:00.000Z",
        qualityScore: 85, status: "active",
      },
    ];
    const result = formatResourceTable(resources, "Skills");
    expect(result).toContain("test");
    expect(result).toContain("1.0.0");
    expect(result).toContain("Skills");
  });
});

describe("formatMaintainReport", () => {
  it("should show all healthy when no entries", () => {
    const result = formatMaintainReport([], []);
    expect(result).toContain("所有资源状态良好");
  });

  it("should show stale entries", () => {
    const result = formatMaintainReport(
      [{ name: "old-skill", type: "skill", version: "1.0.0", days: 120, status: "stale" }],
      [],
    );
    expect(result).toContain("old-skill");
    expect(result).toContain("老化的资源");
  });

  it("should show outdated entries", () => {
    const result = formatMaintainReport(
      [],
      [{ name: "old-pkg", type: "skill", local: "1.0.0", remote: "2.0.0" }],
    );
    expect(result).toContain("old-pkg");
    expect(result).toContain("版本落后的资源");
  });
});
