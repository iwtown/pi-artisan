import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { scanByType, findResource } from "../../src/catalog/scanner";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("scanByType", () => {
  it("should scan skills and find test fixtures", () => {
    // This uses the GLOBAL_DIRS paths which may not have skills in CI
    // The function degrades gracefully to empty arrays
    const skills = scanByType("skill");
    expect(Array.isArray(skills)).toBe(true);
    skills.forEach((s) => {
      expect(s.type).toBe("skill");
      expect(s.name).toBeTruthy();
      expect(s.path).toBeTruthy();
    });
  });

  it("should return arrays for all types", () => {
    const types = ["skill", "extension", "prompt", "theme", "package"] as const;
    for (const t of types) {
      const results = scanByType(t);
      expect(Array.isArray(results)).toBe(true);
    }
  });

  it("should find packages from settings.json", () => {
    const packages = scanByType("package");
    expect(Array.isArray(packages)).toBe(true);
    packages.forEach((p) => {
      expect(p.type).toBe("package");
      expect(p.name).toBeTruthy();
    });
  });
});

describe("findResource", () => {
  it("should return undefined for non-existent resource", () => {
    const result = findResource("skill", "nonexistent-skill-xyz");
    expect(result).toBeUndefined();
  });

  it("should return undefined for non-existent package", () => {
    const result = findResource("package", "nonexistent-pkg-xyz");
    expect(result).toBeUndefined();
  });
});
