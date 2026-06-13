import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { computeQualityScore } from "../../src/catalog/score";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("computeQualityScore", () => {
  it("should return a score for valid skill", () => {
    const score = computeQualityScore("skill", resolve(FIXTURES, "valid-skill/SKILL.md"));
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
    expect(Object.keys(score.dimensions).length).toBeGreaterThanOrEqual(3);
  });

  it("should return a score for extension", () => {
    const score = computeQualityScore("extension", resolve(FIXTURES, "valid-extension.ts"));
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it("should return a score for prompt", () => {
    const score = computeQualityScore("prompt", resolve(FIXTURES, "valid-prompt.md"));
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it("should return a score for theme", () => {
    const score = computeQualityScore("theme", resolve(FIXTURES, "valid-theme.json"));
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });

  it("should return a score for package", () => {
    const score = computeQualityScore("package", resolve(FIXTURES, "valid-package/package.json"));
    expect(score.overall).toBeGreaterThanOrEqual(0);
    expect(score.overall).toBeLessThanOrEqual(100);
  });
});
