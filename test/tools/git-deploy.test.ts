import { describe, it, expect } from "vitest";
import { revertDeploy, listDeploys, deployToGitee, TYPE_DIR_MAP, type DeployableType } from "../../src/tools/git-deploy.js";

describe("revertDeploy", () => {
  it("fails on empty hash", () => {
    const r = revertDeploy("");
    expect(r.details.error).toContain("Invalid commit hash");
  });

  it("fails on non-hex hash", () => {
    const r = revertDeploy("xyz-123");
    expect(r.details.error).toContain("Invalid commit hash");
  });

  it("fails on short hex (under 4 chars)", () => {
    const r = revertDeploy("abc");
    expect(r.details.error).toContain("Invalid commit hash");
  });

  it("accepts a valid short hash", () => {
    // Won't find the repo (CI/local), so fails on that, not on hash validation
    const r = revertDeploy("abcd1234");
    expect(r.details.error).not.toContain("Invalid commit hash");
  });

  it("accepts a valid long hash", () => {
    const r = revertDeploy("abcdef0123456789abcdef0123456789abcdef01");
    expect(r.details.error).not.toContain("Invalid commit hash");
  });
});

describe("listDeploys", () => {
  it("returns a result (fails gracefully without repo)", () => {
    const r = listDeploys();
    expect(r.content).toBeDefined();
  });
});

describe("TYPE_DIR_MAP", () => {
  const types: DeployableType[] = ["skill", "extension", "prompt", "theme", "package"];
  for (const t of types) {
    it(`maps ${t} to a directory`, () => {
      expect(TYPE_DIR_MAP[t]).toBeDefined();
      expect(TYPE_DIR_MAP[t].length).toBeGreaterThan(0);
    });
  }
});

describe("deployToGitee", () => {
  it("rejects unknown type", () => {
    const r = deployToGitee("widget" as any, "/tmp/x");
    expect(r.details.error).toContain("Unknown resource type");
  });

  it("rejects missing source", () => {
    const r = deployToGitee("prompt", "/nonexistent/file.md");
    expect(r.details.error).toContain("Source not found");
  });

  it("rejects prompt type with a directory source", () => {
    const r = deployToGitee("prompt", "/tmp");
    expect(r.details.error).toContain("must be a single file");
  });

  it("rejects skill type with a file source", async () => {
    const { writeFileSync, mkdtempSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { tmpdir } = await import("node:os");
    const dir = mkdtempSync(join(tmpdir(), "test-"));
    const f = join(dir, "SKILL.md");
    writeFileSync(f, "---\nname: test\n---");
    const r = deployToGitee("skill", f);
    expect(r.details.error).toContain("must be a directory");
  });
});
