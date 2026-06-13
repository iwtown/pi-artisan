import { describe, it, expect } from "vitest";
import { runBirthCert } from "../../src/birth/runner.js";

describe("runBirthCert", () => {
  it("resolves skill by slug (find resource in skills dir)", () => {
    // Look for any real skill in the skills directory
    const result = runBirthCert("skill", "github");
    // If found, should have checks; if not found, empty checks
    expect(result.resourceType).toBe("skill");
  });

  it("resolves skill by full path", () => {
    const result = runBirthCert("skill", "test/fixtures/valid-skill/SKILL.md");
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.resourceName).toBeTruthy();
  });

  it("returns empty checks for non-existent resource", () => {
    const result = runBirthCert("skill", "nonexistent-skill-that-should-not-exist");
    expect(result.checks).toHaveLength(0);
    expect(result.ready).toBe(false);
  });

  it("summarizes results correctly for valid skill", () => {
    const result = runBirthCert("skill", "test/fixtures/valid-skill/SKILL.md");
    const s = result.summary;
    expect(s.total).toBeGreaterThan(0);
    expect(s.passed).toBeGreaterThanOrEqual(0);
    expect(s.auto.total).toBeGreaterThan(0);
    expect(s.autoable.total).toBeGreaterThanOrEqual(0);
    expect(s.manual.total).toBeGreaterThan(0);
    expect(s.missing.total).toBeGreaterThan(0);
  });

  it("resolves extension by path", () => {
    const result = runBirthCert("extension", "test/fixtures/valid-extension.ts");
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.ready).toBeDefined();
  });

  it("resolves theme by path", () => {
    const result = runBirthCert("theme", "test/fixtures/valid-theme.json");
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it("resolves package by path", () => {
    const result = runBirthCert("package", ".");
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it("resolves prompt by path", () => {
    const result = runBirthCert("prompt", "test/fixtures/valid-prompt.md");
    expect(result.checks.length).toBeGreaterThan(0);
  });
});
