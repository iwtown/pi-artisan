/**
 * Tests for adaptation engine — pure function tests via fixtures.
 */

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import {
  adaptResource,
  adaptByType,
  formatAdaptReport,
  formatAdaptSummary,
  isReadyForAssembly,
} from "../../src/adaptation/engine.js";
import { DEFAULT_ADAPTER_CONFIG } from "../../src/adaptation/types.js";
import type { ResourceInfo } from "../../src/types.js";

const FIXTURES = resolve(__dirname, "../fixtures");

function makeResource(overrides: Partial<ResourceInfo> & { type: ResourceInfo["type"]; name: string; path: string }): ResourceInfo {
  return {
    type: overrides.type,
    name: overrides.name,
    path: overrides.path,
    version: overrides.version ?? null,
    author: overrides.author ?? null,
    source: overrides.source ?? "local",
    lastModified: overrides.lastModified ?? new Date().toISOString(),
    qualityScore: overrides.qualityScore ?? null,
    status: overrides.status ?? "active",
    upstream: overrides.upstream ?? null,
  };
}

describe("adaptResource", () => {
  // ── Skill ──
  describe("skill type", () => {
    it("should pass a valid skill with no critical issues", () => {
      const resource = makeResource({
        type: "skill",
        name: "valid-skill",
        path: resolve(FIXTURES, "valid-skill", "SKILL.md"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("skill");
      expect(report.criticalCount).toBe(0);
      // Should at least find SKILL.md and frontmatter fields
      const dirResult = report.results.find((r) => r.ruleId === "skill-dir-exists");
      expect(dirResult?.passed).toBe(true);
      const nameResult = report.results.find((r) => r.ruleId === "skill-frontmatter-name");
      expect(nameResult?.passed).toBe(true);
    });

    it("should flag issues for a skill without required frontmatter fields", () => {
      const resource = makeResource({
        type: "skill",
        name: "invalid-adapt-skill",
        path: resolve(FIXTURES, "invalid-adapt-skill", "SKILL.md"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("skill");
      const nameResult = report.results.find((r) => r.ruleId === "skill-frontmatter-name");
      expect(nameResult?.passed).toBe(false);
      const descResult = report.results.find((r) => r.ruleId === "skill-frontmatter-desc");
      expect(descResult?.passed).toBe(false);
    });
  });

  // ── Extension ──
  describe("extension type", () => {
    it("should pass a valid extension with export default and SDK import", () => {
      const resource = makeResource({
        type: "extension",
        name: "valid-extension",
        path: resolve(FIXTURES, "valid-extension", "index.ts"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("extension");
      expect(report.criticalCount).toBe(0);
      const exportResult = report.results.find((r) => r.ruleId === "ext-export-default");
      expect(exportResult?.passed).toBe(true);
      const importResult = report.results.find((r) => r.ruleId === "ext-import-package");
      expect(importResult?.passed).toBe(true);
    });

    it("should fail an extension missing export default and SDK import", () => {
      const resource = makeResource({
        type: "extension",
        name: "invalid-extension",
        path: resolve(FIXTURES, "invalid-extension", "index.ts"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("extension");
      const exportResult = report.results.find((r) => r.ruleId === "ext-export-default");
      expect(exportResult?.passed).toBe(false);
      const importResult = report.results.find((r) => r.ruleId === "ext-import-package");
      expect(importResult?.passed).toBe(false);
    });

    it("should pass ext-tool-naming when tool names have namespace prefix", () => {
      const resource = makeResource({
        type: "extension",
        name: "valid-extension",
        path: resolve(FIXTURES, "valid-extension", "index.ts"),
      });
      const report = adaptResource(resource);
      const namingResult = report.results.find((r) => r.ruleId === "ext-tool-naming");
      // "test-project/my_tool" contains my_tool (underscore) — should pass
      expect(namingResult?.passed).toBe(true);
    });

    it("should warn when tool name lacks namespace prefix", () => {
      const resource = makeResource({
        type: "extension",
        name: "engine-unprefixed-extension",
        path: resolve(FIXTURES, "engine-unprefixed-extension", "index.ts"),
      });
      const report = adaptResource(resource);
      const namingResult = report.results.find((r) => r.ruleId === "ext-tool-naming");
      // "mytool" has no underscore — should fail with namespace prefix warning
      expect(namingResult?.passed).toBe(false);
      expect(namingResult?.message).toContain("namespace_prefix");
    });
  });

  // ── Prompt ──
  describe("prompt type", () => {
    it("should pass a valid prompt with frontmatter", () => {
      const resource = makeResource({
        type: "prompt",
        name: "valid-prompt",
        path: resolve(FIXTURES, "valid-prompt.md"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("prompt");
      // Prompt rules are all info-level, so allPassed should be true
      expect(report.allPassed).toBe(true);
      // Check filename is valid command name
      const nameResult = report.results.find((r) => r.ruleId === "prompt-filename-command");
      expect(nameResult?.passed).toBe(true);
    });

    it("should accept valid kebab-case filename for prompt", () => {
      const resource = makeResource({
        type: "prompt",
        name: "valid-prompt",
        path: resolve(FIXTURES, "valid-prompt.md"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("prompt");
      const nameResult = report.results.find((r) => r.ruleId === "prompt-filename-command");
      expect(nameResult?.passed).toBe(true);
    });

    it("should reject filename starting with a number", () => {
      const resource = makeResource({
        type: "prompt",
        name: "1invalid-prompt",
        path: resolve(FIXTURES, "1invalid-prompt.md"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("prompt");
      const nameResult = report.results.find((r) => r.ruleId === "prompt-filename-command");
      // name "1invalid-prompt" starts with a digit — should fail
      expect(nameResult?.passed).toBe(false);
    });
  });

  // ── Theme ──
  describe("theme type", () => {
    it("should pass a valid theme with all 51 color tokens", () => {
      const resource = makeResource({
        type: "theme",
        name: "valid-test-theme",
        path: resolve(FIXTURES, "valid-theme.json"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("theme");
      expect(report.criticalCount).toBe(0);
      const jsonResult = report.results.find((r) => r.ruleId === "theme-valid-json");
      expect(jsonResult?.passed).toBe(true);
      const colorsResult = report.results.find((r) => r.ruleId === "theme-51-colors");
      expect(colorsResult?.passed).toBe(true);
    });

    it("should fail a theme missing some color tokens", () => {
      const resource = makeResource({
        type: "theme",
        name: "incomplete-theme",
        path: resolve(FIXTURES, "invalid-theme.json"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("theme");
      // invalid-theme.json is missing bashMode, thinkingOff/thinkingMinimal/etc.
      const colorsResult = report.results.find((r) => r.ruleId === "theme-51-colors");
      expect(colorsResult?.passed).toBe(false);
      expect(colorsResult?.message).toContain("缺少");
    });
  });

  // ── Package ──
  describe("package type", () => {
    it("should pass a valid package with package.json and pi manifest", () => {
      const resource = makeResource({
        type: "package",
        name: "test-package",
        path: resolve(FIXTURES, "valid-package"),
      });
      const report = adaptResource(resource);
      expect(report.resourceType).toBe("package");
      const pkgResult = report.results.find((r) => r.ruleId === "pkg-package-json");
      expect(pkgResult?.passed).toBe(true);
      const manifestResult = report.results.find((r) => r.ruleId === "pkg-pi-manifest");
      expect(manifestResult?.passed).toBe(true);
    });
  });

  // ── Edge cases ──
  describe("edge cases", () => {
    it("should handle non-existent file gracefully", () => {
      const resource = makeResource({
        type: "extension",
        name: "nonexistent",
        path: "/tmp/pi-artisan-test/nonexistent.ts",
      });
      const report = adaptResource(resource);
      // Should not throw; checkers should degrade gracefully
      expect(report).toBeDefined();
      expect(report.results.length).toBeGreaterThan(0);
      // At least the critical checks should fail
      const exportResult = report.results.find((r) => r.ruleId === "ext-export-default");
      expect(exportResult?.passed).toBe(false);
    });

    it("should handle empty type with no rules gracefully", () => {
      const resource = makeResource({
        type: "skill",
        name: "empty-test",
        path: "/nonexistent/empty.md",
      });
      const config = { ...DEFAULT_ADAPTER_CONFIG, rules: { ...DEFAULT_ADAPTER_CONFIG.rules, skill: false } };
      const report = adaptResource(resource, config);
      expect(report).toBeDefined();
      expect(report.results.length).toBe(0);
      expect(report.allPassed).toBe(true);
    });

    it("should handle resource with null path fields", () => {
      // Simulate malformed resource — null version, author should not crash
      const resource = makeResource({
        type: "theme",
        name: "null-fields-test",
        path: resolve(FIXTURES, "valid-theme.json"),
        version: null,
        author: null,
      });
      const report = adaptResource(resource);
      expect(report).toBeDefined();
      expect(report.resourceType).toBe("theme");
      expect(report.criticalCount).toBe(0);
    });
  });
});

describe("adaptByType", () => {
  it("should return an array without throwing (even empty)", () => {
    let reports: any[] = [];
    expect(() => { reports = adaptByType("skill"); }).not.toThrow();
    expect(Array.isArray(reports)).toBe(true);
    // If skills exist, verify structural correctness
    reports.forEach((r) => {
      expect(r.resourceType).toBe("skill");
      expect(Array.isArray(r.results)).toBe(true);
    });
  });
});

describe("formatAdaptReport", () => {
  it("should produce a multi-line string for a failing report", () => {
    const resource = makeResource({
      type: "extension",
      name: "invalid-extension",
      path: resolve(FIXTURES, "invalid-extension", "index.ts"),
    });
    const report = adaptResource(resource);
    const output = formatAdaptReport(report);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
    expect(output).toContain("invalid-extension");
  });

  it("should produce a success message for a passing report", () => {
    const resource = makeResource({
      type: "theme",
      name: "valid-test-theme",
      path: resolve(FIXTURES, "valid-theme.json"),
    });
    const report = adaptResource(resource);
    const output = formatAdaptReport(report);
    expect(output).toContain("全部适配规则通过");
  });
});

describe("formatAdaptSummary", () => {
  it("should summarize multiple reports", () => {
    const resource1 = makeResource({
      type: "extension",
      name: "invalid-extension",
      path: resolve(FIXTURES, "invalid-extension", "index.ts"),
    });
    const resource2 = makeResource({
      type: "theme",
      name: "valid-test-theme",
      path: resolve(FIXTURES, "valid-theme.json"),
    });
    const report1 = adaptResource(resource1);
    const report2 = adaptResource(resource2);
    const output = formatAdaptSummary([report1, report2]);
    expect(output).toContain("适配化改造报告");
    expect(output).toContain("2 个能力包");
  });

  it("should handle empty report list", () => {
    const output = formatAdaptSummary([]);
    expect(output).toContain("0 个能力包");
  });
});

describe("isReadyForAssembly", () => {
  it("should return true for passing report in strict mode", () => {
    const resource = makeResource({
      type: "theme",
      name: "valid-test-theme",
      path: resolve(FIXTURES, "valid-theme.json"),
    });
    const report = adaptResource(resource);
    expect(isReadyForAssembly(report, true)).toBe(true);
  });

  it("should return false for failing report in strict mode", () => {
    const resource = makeResource({
      type: "extension",
      name: "invalid-extension",
      path: resolve(FIXTURES, "invalid-extension", "index.ts"),
    });
    const report = adaptResource(resource);
    expect(isReadyForAssembly(report, true)).toBe(false);
  });

  it("should return false for critical failures in non-strict mode", () => {
    const resource = makeResource({
      type: "extension",
      name: "invalid-extension",
      path: resolve(FIXTURES, "invalid-extension", "index.ts"),
    });
    const report = adaptResource(resource);
    // Non-strict allows warnings/info failures but not critical/error
    expect(isReadyForAssembly(report, false)).toBe(false);
  });
});
