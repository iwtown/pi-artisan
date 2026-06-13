import { describe, it, expect } from "vitest";
import { checkAging } from "../../src/catalog/aging";

describe("checkAging", () => {
  it("should return an array for all types", () => {
    const results = checkAging();
    expect(Array.isArray(results)).toBe(true);
  });

  it("should return an array for skills", () => {
    const results = checkAging("skill");
    expect(Array.isArray(results)).toBe(true);
  });

  it("should include required fields", () => {
    const results = checkAging("skill");
    for (const r of results) {
      expect(r.name).toBeTruthy();
      expect(r.type).toBe("skill");
      expect(typeof r.daysSinceUpdate).toBe("number");
      expect(["active", "stale", "archived"]).toContain(r.status);
    }
  });
});
