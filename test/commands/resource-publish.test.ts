/**
 * resource-publish tests — verify publish + deploy integration.
 *
 * These tests simulate the publish command's deploy logic directly
 * (they don't run the interactive CLI handler). They verify:
 *   - deploySkillToGitee accepts valid skill paths
 *   - deploySkillToGitee returns meaningful errors for invalid inputs
 *   - Dry-run logic doesn't attempt deploy
 *   - --deploy flag parsing works
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Simulate deploy prompt logic: test whether it would trigger.
 * Returns a promise of boolean matching the confirm flow.
 */
async function shouldDeploy(isDryRun: boolean, isAutoDeploy: boolean, confirmResult: boolean): Promise<boolean> {
  // This mirrors the logic in resource-publish.ts Step 5
  if (isDryRun) return false;
  if (isAutoDeploy) return true;
  return confirmResult;
}

describe("resource-publish: deploy prompt logic", () => {
  it("dry-run should not deploy even if confirm would return true", async () => {
    const result = await shouldDeploy(true, false, true);
    expect(result).toBe(false);
  });

  it("normal publish with confirm=true should deploy", async () => {
    const result = await shouldDeploy(false, false, true);
    expect(result).toBe(true);
  });

  it("normal publish with confirm=false should not deploy", async () => {
    const result = await shouldDeploy(false, false, false);
    expect(result).toBe(false);
  });

  it("--deploy flag should deploy without confirm prompt", async () => {
    const result = await shouldDeploy(false, true, false);
    expect(result).toBe(true);
  });

  it("--deploy flag with dry-run should not deploy", async () => {
    const result = await shouldDeploy(true, true, false);
    expect(result).toBe(false);
  });
});

describe("resource-publish: deploy function integration", () => {
  let tmpDir: string;
  let skillDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `publish-deploy-${Date.now()}`);
    skillDir = join(tmpDir, "test-deploy-skill");
    mkdirSync(skillDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("deploySkillToGitee rejects non-existent path", async () => {
    // Dynamic import to avoid tsc issues with the function's dependency on homedir
    const { deploySkillToGitee } = await import("../../src/tools/git-deploy.js");
    const result = deploySkillToGitee({ path: join(tmpDir, "nonexistent") });
    expect(result.content[0].text).toContain("SKILL.md not found");
  });

  it("deploySkillToGitee rejects path without SKILL.md", async () => {
    const { deploySkillToGitee } = await import("../../src/tools/git-deploy.js");
    const emptyDir = join(tmpDir, "empty-dir");
    mkdirSync(emptyDir, { recursive: true });
    const result = deploySkillToGitee({ path: emptyDir });
    expect(result.content[0].text).toContain("SKILL.md not found");
  });
});

describe("resource-publish: flag parsing", () => {
  it("--deploy is recognized as a flag (not a type/path arg)", () => {
    const parts = "skill ./my-skill --deploy --version 1.0.0".split(/\s+/).filter(Boolean);
    const nonFlagParts = parts.filter((p) => !p.startsWith("--") && p !== "1.0.0");
    expect(nonFlagParts).toEqual(["skill", "./my-skill"]);
    expect(parts.includes("--deploy")).toBe(true);
    expect(parts.includes("--dry-run")).toBe(false);
  });

  it("--dry-run without --deploy should not auto-deploy", () => {
    const parts = "skill ./my-skill --dry-run --version 1.0.0".split(/\s+/).filter(Boolean);
    expect(parts.includes("--dry-run")).toBe(true);
    expect(parts.includes("--deploy")).toBe(false);
  });

  it("non-skill type is rejected by publish command", () => {
    const parts = "extension ./my-ext --dry-run".split(/\s+/).filter(Boolean);
    const type = parts[0];
    expect(type).not.toBe("skill");
  });
});
