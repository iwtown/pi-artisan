import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { validatePackage } from "../../src/validators/package";

const FIXTURES = resolve(__dirname, "../fixtures");

describe("validatePackage", () => {
  it("should pass valid package", () => {
    const issues = validatePackage(resolve(FIXTURES, "valid-package"));
    const hardErrors = issues.filter((i) => i.message.includes("Missing"));
    expect(hardErrors.length).toBe(0);
  });

  it("should flag missing package.json", () => {
    const issues = validatePackage("/tmp/nonexistent-dir");
    expect(issues.length).toBeGreaterThanOrEqual(1);
    expect(issues[0].message).toContain("Missing package.json");
  });
});
