# pi-artisan Re-Architecture Implementation Plan

> Generated: 2026-06-18 | Based on investigation from 3 parallel agents
> Status: ✅ Direction correct — no rewrites needed. Incremental changes only.

## Goal

Close the 3 pipeline gaps (monitoring, retire, rollback), shore up the 2 reliability gaps (engine.ts tests, execSync), add the 1 missing ecosystem rule (namespace prefix), and keep P3 items gated on conditions — all in ponytail-friendly small batches.

---

## Phase 0 — Pre-Flight (gate for all later phases)

### 0.1 Add `engine.test.ts` for adaptation engine

**Why**: The 686-line engine.ts is the most critical module (36 rules determine assembly) and has zero test coverage. Every later change to engine.ts needs regression safety.

**What**:
- File: `test/adaptation/engine.test.ts` (new)
- Pattern: Follow existing test structure (`test/validators/skill.test.ts` uses fixtures, `test/hooks/before-start.test.ts` uses pure function calls)
- Test targets:
  - `adaptResource()` — test each rule type (skill, extension, prompt, theme, package) using existing fixtures
  - `adaptByType()` — smoke test that it runs without throwing
  - `formatAdaptReport()` — test pass/fail/mixed reports
  - `formatAdaptSummary()` — test counts and text
  - `isReadyForAssembly()` — test strict vs non-strict mode
  - Edge cases: missing files, malformed JSON, empty directories, null resource fields
- Fixtures: `test/fixtures/` already has `valid-skill/`, `invalid-skill/`, `valid-theme.json`. Add:
  - `valid-extension/` — simple `index.ts` with export default + SDK import
  - `valid-prompt/` — simple `.md` with frontmatter
  - `invalid-extension/` — missing export default
  - `invalid-theme.json` — missing 51 tokens

**Acceptance**: `npx vitest run test/adaptation/` — all tests pass, covering all 5 resource types' rules.

**Risk**: Low. Pure functions tested via fixtures, same pattern as existing 16 test files.

**Dependencies**: None — can be done first.

---

### 0.2 Test `observations.ts` write safety

**Why**: `writeFileSync` without atomic write can corrupt on crash. This is a quick fix that prevents data loss.

**What**:
- File: `src/catalog/observations.ts`
- Change: Replace `writeFileSync(path, data)` with write-to-temp-then-rename pattern
- Approach: `writeFileSync(tmpPath, data) → renameSync(tmpPath, path)`
- Add test in `test/catalog/observations.test.ts` (new):
  - Test that write produces valid JSON
  - Test that concurrent writes don't corrupt (write sequentially, verify both entries survive)

**Acceptance**: Atomic write: file either fully written or fully missing (no partial writes).

**Risk**: Minimal — 5 line change, well-known pattern.

---

## Phase 1 — Pipeline Connections (P1)

### 1.1 birth → deploy pipeline

**Why**: Birth certificate passes but user has to manually `/resource-birth` then separately call `skill_git_deploy`. This is the most obvious UX gap.

**What**:
- File: `src/commands/resource-publish.ts`
- Change: After successful publish (not dry-run), offer deploy option:
  ```
  ✅ 发布成功。是否部署到 Gitee pi-capabilities? [y/N]
  ```
  If yes, call `deploySkillToGitee({ path: dirPath, message: `feat: publish ${slug} v${version}` })`
- File: `src/tools/index.ts` — export `deploySkillToGitee` for reuse
- Add `--deploy` flag to `/resource-publish` for non-interactive mode

**Acceptance**: After `/resource-publish skill ./my-skill`, user gets deploy prompt. After agreeing, skill appears in `~/projects/pi-capabilities/skills/`.

**Risk**: Low. Only adds optional post-publish step; existing behavior unchanged. `--deploy` flag for CI/non-interactive.

**Dependencies**: None.

---

### 1.2 Scaffold validation for 4 non-skill types

**Why**: `create-extension`, `create-prompt`, `create-theme`, `create-package` commands are registered but their scaffold output has never been verified against actual Pi runtime.

**What**:
- Read each create-* command source to verify:
  - `src/commands/create-extension.ts` — does it generate valid `.ts` with `export default` + SDK import?
  - `src/commands/create-prompt.ts` — does it generate valid frontmatter?
  - `src/commands/create-theme.ts` — does it generate valid 51-token theme JSON?
  - `src/commands/create-package.ts` — does it generate valid `package.json` with `pi` manifest?
- Add smoke tests in `test/commands/` (new, pure-function testable portion):
  - Test that scaffold functions return correct file structures
  - Test that scaffold output passes respective validate_* checks
- Fix any scaffold bugs found (expected: minor template issues)

**Acceptance**: All 4 `/create-*` commands produce output that passes their respective validator. Tests cover at minimum file existence and required fields.

**Risk**: Medium — these files may have been created as stubs and never tested. If scaffold is completely missing, need at minimum a working template. Ponytail: if scaffold is a stub, the minimal fix is one working template per type (5-10 lines).

**Dependencies**: None — independent of other phases.

---

## Phase 2 — Missing End-to-End (P0)

### 2.1 Retire/deprecate flow

**Why**: No way to mark a capability as deprecated. Aging detection marks `stale`/`archived` but takes no action. This will create confusion as the library grows.

**What**:
- File: `src/commands/resource-retire.ts` (new)
  - Usage: `/resource-retire <type> <name> [--reason "..."] [--force]`
  - Action:
    1. Add `deprecated: true` and `deprecated_reason: "..."` to SKILL.md frontmatter
    2. Add `deprecated_at: YYYY-MM-DD` to SKILL.md frontmatter
    3. For extension/prompt/theme/package: add a `.deprecated` marker file or update frontmatter
  - `--force`: skip confirmation prompt
- File: `src/catalog/report.ts` — update `generateReport()` to show `⚠️ DEPRECATED` badge
- File: `src/catalog/scanner.ts` — add `deprecated` field to `ResourceInfo` (optional boolean, null by default)
- File: `src/types.ts` — add `deprecated?: boolean | null` and `deprecatedReason?: string | null` to `ResourceInfo`

**Acceptance**: After `/resource-retire skill my-old-skill --reason "Replaced by my-new-skill"`, `SKILL.md` has `deprecated: true` in frontmatter. `/resource-status` shows deprecated badge.

**Ponytail note**: No separate "unpublish" or "archive" flow. Deprecation mark + aging auto-archival is sufficient for single-user. Add un-retire if needed later.

**Risk**: Low. Only adds frontmatter fields and marking. No destructive action.

**Dependencies**: After Phase 0.1 (engine.ts tests) to ensure scanner changes don't break adapt.

---

### 2.2 Rollback support for git deploy

**Why**: No way to undo a bad deploy. User has to manually `git revert`.

**What**:
- File: `src/tools/git-deploy.ts`
  - Add `--revert <hash>` flag: runs `git revert <hash>` in pi-capabilities repo, then pushes
  - Add `--list` flag: shows last 5 git log entries with hash + message
- Approach: `deploySkillToGitee()` already has `git add/commit/push`. Revert is just: `git revert --no-edit <hash>` + `git push`.

**Acceptance**: `skill_git_deploy --revert abc1234` creates a revert commit and pushes it.

**Risk**: Low. 10-line addition to existing git workflow.

**Dependencies**: None.

---

### 2.3 Post-publish monitoring (observations extension)

**Why**: observations.ts records when a skill was published, but nothing reads the data to produce actionable insights. No monitoring loop.

**What**:
- File: `src/catalog/observations.ts`
  - Add `DAYS_BETWEEN_CHECKS = 90` constant
  - Add `nextCheckDate` auto-calculation on publish: `new Date(Date.now() + 90 * 86400000).toISOString()`
  - Add `getOverdueChecks()` — returns entries where `nextCheckDate < now`
- File: `src/catalog/version.ts` — in `checkVersions()`, include `observation.nextCheckDate` in the output; if overdue, mark resource as `needsReview: true`
- File: `src/commands/resource-maintain.ts` — add "n 个资源需要回访检查" to output when overdue checks exist

**Acceptance**: Publish a skill → `nextCheckDate` set to 90 days later. After running `/resource-maintain`, overdue checks appear in output.

**Ponytail note**: No push notifications. No skillhub API polling (add when pi-capabilities > 20 and manual check is annoying). Just status display.

**Risk**: Low. Pure data extension — no behavioral change.

**Dependencies**: After Phase 0.2 (observations atomic write safety).

---

## Phase 3 — Engineering Debt (P2)

### 3.1 Namespace prefix validation for extension tools

**Why**: The only missing ecosystem alignment. pi.dev/docs/latest/extensions requires tool names to be prefixed (`my-ext_tool-name`). Currently only checks `snake_case`.

**What**:
- File: `src/adaptation/rules.ts` — update `ext-tool-naming` description to mention namespace prefix
- File: `src/adaptation/engine.ts` — update `ext-tool-naming` checker:
  - After extracting tool names, check `name.includes("_")` (at least one underscore = namespace separator)
  - Warning if tools exist and none have underscore separator
- Severity: stays "warning" (tools work without prefix, just risk collision)
- Update test in Phase 0.1 to cover this case

**Acceptance**: An extension with `name: "myTool"` triggers warning "⚠️ 工具名 'myTool' 建议用 namespace_prefix 格式". An extension with `name: "my-ext_my-tool"` passes.

**Risk**: Low. 5 lines of regex logic.

**Dependencies**: After Phase 0.1 (engine tests ensure regression safety).

---

### 3.2 `execSync` in async context — timeout guard

**Why**: `version.ts:149` uses `execSync` in `checkVersions()` which is async. If skillhub/npm is slow to respond, the event loop blocks. The 5s timeout is good but doesn't prevent the sync call from blocking.

**What**:
- File: `src/catalog/version.ts`
  - In `fetchSkillhubVersion()` and `fetchNpmVersion()`, keep the `execSync` (replacing with spawn+promisify is a larger change that doesn't pay off for this use case)
  - Ensure `timeout: 5000` is consistent (it's already there)
  - Add try-catch around the execSync call (already present)
- No architectural change — ponytail: the current code already has the correct timeout + catch. Just verify.

**Acceptance**: Same behavior but timeout is verified as consistently 5s. Add test that timeout produces null (not crash).

**Ponytail note**: Full async migration (execSync → spawn promisify) would require restructuring `checkVersions()` across all callers. Since the sync call is inside a nested function called sequentially per-resource, it blocks one resource at a time — not great but not deadlocking. Add when measurement shows it's a bottleneck.

**Risk**: Low. Mostly documentation/verification.

**Dependencies**: None.

---

### 3.3 `pendingPaths` TTL cleanup

**Why**: `tool-call.ts` writes paths to a Map for `tool-result` to consume. If tool-call fires but tool-result never comes (error/crash/timeout), the entry leaks.

**What**:
- File: `src/hooks/tool-call.ts`
  - Add a `TTL = 30000` (30 seconds) constant
  - After `pendingPaths.set()`, schedule a cleanup: `setTimeout(() => pendingPaths.delete(toolCallId), TTL)`
  - Unref the timeout so it doesn't keep Node.js alive

**Acceptance**: An isolated `tool_call` with no matching `tool_result` cleans up the map entry after 30s.

**Ponytail note**: `setTimeout` is the simplest approach. A proper cancellation mechanism (track-consume with cancellable timer) would be ~3x the code. Current solution: 3 lines.

**Risk**: Low. Timeout is fire-and-forget. If tool-result fires before timeout, it still works (delete is idempotent). If after, path is gone (acceptable — delayed validation is better than never).

**Dependencies**: None.

---

### 3.4 GitHub version detection — un-stub

**Why**: `version.ts` returns `null` for `github` and `git` source types. This means forked skills with upstream on GitHub never show version updates.

**What**:
- File: `src/catalog/version.ts`
  - In `fetchRemoteVersion()`, add `github` case:
    ```
    case "github":
      // Fetch latest tag from GitHub via ghproxy
      try {
        const out = execSync(
          `git ls-remote --tags https://ghproxy.net/https://github.com/${source.identifier}.git 2>/dev/null | tail -1`,
          { timeout: 10000, encoding: "utf-8" }
        );
        const tag = out.trim().split(/\s+/).pop();
        return tag || null;
      } catch { return null; }
    ```
  - `source.identifier` format: `owner/repo` (verified in `determineVersionSource`)

**Acceptance**: For a resource with `upstream.source: "github:wtown/pi-artisan"`, version check returns a tag like `v2.3.0`.

**Ponytail note**: `git ls-remote` is the simplest way (0 dependencies). `ghproxy` is already the standard mirror. 10000ms timeout is generous for ghproxy.

**Risk**: Low. The git command is isolated in a try-catch, null on failure is acceptable degradation.

**Dependencies**: None.

---

## Phase 4 — Future-Conditional (P3)

### 4.1 Gene integration (gated)

**Why**: FUTURE.md describes Gene integration for optimize-skill. The **conditions are NOT yet met** (requires >50 Genes, >10 matching skills, >3 failure patterns with confidence >0.7). When they are, implement.

**Gate check**: Add a check in `src/optimizer/rubric.ts` `getRelatedGenes()` that logs the current Gene count and skill match count. When conditions are met, activate.

**What now**:
- No code changes. Only this plan note.
- Add a `src/optimizer/gene-gate-check.ts` (new, optional):
  - On `/optimize-skill` invocation, log: `"Gene integration: 条件未满足 (current=N, need=50/10/3)"`

**When conditions met**:
- File: `src/optimizer/rubric.ts` — implement `getRelatedGenes()`:
  - Read `wiki/基因/` directory
  - Filter by `gene_skill_slug === slug`
  - Extract failure patterns with `gene_confidence > 0.7`
  - Append to gotchas suggestions as "从使用数据发现"

**Risk**: None for now (gate prevents premature activation).

**Dependencies**: None until conditions met.

---

### 4.2 Cross-resource dependency management

**Why**: Current model treats each capability as an island. No dependency declarations or validation.

**Gate check**: Add when pi-capabilities has >20 resources and at least one real dependency chain exists.

**What now**:
- No code changes. Add type scaffold to `src/types.ts`:
  ```typescript
  export interface ResourceDependency {
    type: ResourceType;
    name: string;
    constraint: string; // semver range
  }
  ```
- Add optional field to `ResourceInfo`: `dependencies?: ResourceDependency[]`
- No validation logic yet — future when gate condition met.

**Ponytail note**: Type scaffold only (3 lines). Prevents refactoring pain later. Zero runtime cost — unused optional field.

**Risk**: None — type-only addition.

**Dependencies**: None.

---

## Summary of Changes

### New Files
| File | Phase | Purpose |
|------|-------|---------|
| `test/adaptation/engine.test.ts` | 0.1 | Engine test (critical — do first) |
| `test/fixtures/valid-extension/` | 0.1 | Test fixture |
| `test/fixtures/invalid-extension/` | 0.1 | Test fixture |
| `test/fixtures/invalid-theme.json` | 0.1 | Test fixture |
| `test/catalog/observations.test.ts` | 0.2 | Atomic write test |
| `src/commands/resource-retire.ts` | 2.1 | Retire command |
| `test/commands/create-scaffold.test.ts` | 1.2 | Scaffold smoke tests |
| `src/optimizer/gene-gate-check.ts` | 4.1 | Gate check (optional) |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `src/catalog/observations.ts` | 0.2, 2.3 | Atomic write + nextCheckDate + getOverdueChecks() |
| `src/types.ts` | 2.1, 4.2 | Add deprecated fields + ResourceDependency type |
| `src/catalog/scanner.ts` | 2.1 | Add deprecated to ResourceInfo scan |
| `src/catalog/report.ts` | 2.1 | Show deprecated badge |
| `src/commands/resource-publish.ts` | 1.1 | Post-publish deploy prompt |
| `src/tools/git-deploy.ts` | 2.2 | Add --revert and --list flags |
| `src/tools/index.ts` | 1.1 | Export deploySkillToGitee |
| `src/adaptation/engine.ts` | 3.1 | Namespace prefix check for ext-tool-naming |
| `src/adaptation/rules.ts` | 3.1 | Update ext-tool-naming description |
| `src/hooks/tool-call.ts` | 3.3 | TTL cleanup on pendingPaths |
| `src/catalog/version.ts` | 3.2, 3.4 | GitHub version detection + timeout guard |
| `src/commands/resource-maintain.ts` | 2.3 | Show overdue checks |

### Files Not to Touch
- `src/index.ts` — correct, no changes needed
- `src/hooks/input.ts` — correct, no changes needed
- `src/hooks/before-start.ts` — tested, correct
- `src/hooks/tool-result.ts` — untested but correct; tests added in Phase 0 indirectly via engine.ts
- `src/hooks/tool-call.ts` — only TTL change as above
- `src/birth/` — correct, no changes needed
- `src/validators/*` — all tested, correct
- `src/utils/*` — minimal, correct
- `src/optimizer/rubric.ts` — only gate check in future

---

## Dependencies Graph

```
Phase 0.1 (engine.test.ts)
  ├── enables Phase 3.1 (namespace prefix — changes engine.ts)
  └── enables Phase 2.1 (retire — changes scanner/types)
      └── enables Phase 2.3 (monitoring — uses observations)
          └── independent from Phase 1.x

Phase 0.2 (atomic write)
  └── enables Phase 2.3 (uses observations)

Phase 1.1 (birth→deploy)
  └── independent

Phase 1.2 (scaffold validation)
  └── independent

Phase 2.2 (rollback)
  └── independent

Phase 3.2 (execSync timeout)
  └── independent

Phase 3.3 (pendingPaths TTL)
  └── independent

Phase 3.4 (GitHub version)
  └── independent

Phase 4.x (gene + deps)
  └── gated, no execution here
```

**Recommended execution order**: 0.1 → 3.1 → 0.2 → 2.3 → 2.1 → 2.2 → 1.1 → 1.2 → 3.2 → 3.3 → 3.4 → 4.x

---

## Risk Register

| Risk | Phase | Likelihood | Mitigation |
|------|-------|:----------:|------------|
| engine.ts tests reveal rule logic bugs | 0.1 | Medium | Fix bugs discovered by tests; this is the point of testing |
| create-* commands are stubs with no real scaffold | 1.2 | Medium | Ponytail: one working template per type (5-10 lines) is the minimum |
| Ghproxy latency makes GitHub version check slow | 3.4 | Low | 10s timeout; null on timeout is acceptable degradation |
| TTL cleanup fires before tool-result consumes path | 3.3 | Low | 30s TTL; average tool-result delay < 5s. If triggered add more time or clear on result. |
| Birth→deploy prompt blocks non-interactive sessions | 1.1 | Low | `--deploy` flag for non-interactive; prompt only in TUI mode |

---

## Success Criteria

After all phases:
1. `npx vitest run` — all tests pass (including 16 existing + ~5 new test files)
2. `npx tsc --noEmit` — type check passes
3. `node --check src/index.ts` — no runtime errors
4. `/resource-retire skill x` adds `deprecated: true` to frontmatter
5. `skill_git_deploy --revert abc123` creates a revert commit
6. Published skill shows `nextCheckDate` in observations
7. `ext-tool-naming` warns on unprefixed tool names
8. All 5 `/create-*` commands produce valid, validator-passing output
