# Context: Capability Crystallization Workflow

## Existing pi-artisan Architecture

```
pi-artisan/
├── src/
│   ├── hooks/
│   │   ├── before-start.ts   — always inject workshop context to system prompt
│   │   ├── input.ts          — detect capability intents, inject routing hints
│   │   ├── tool-call.ts      — capture file paths from write/edit
│   │   └── tool-result.ts    — auto-validate on write/edit, follow-up on issues
│   ├── commands/
│   │   ├── index.ts          — registers all commands
│   │   ├── create-skill.ts   — /create-skill command + skill_create tool
│   │   ├── adapt.ts          — /adapt command (Pi Agent compat check)
│   │   ├── birth-cert.ts     — /resource-birth command
│   │   ├── optimize-skill.ts — /optimize-skill command
│   │   ├── resource-list.ts  — /resource-list
│   │   ├── resource-status.ts
│   │   ├── resource-maintain.ts
│   │   └── resource-publish.ts
│   ├── tools/
│   │   └── index.ts          — registers validate_*, resource_*, adapt, birth, publish, deploy tools
│   ├── scaffold/
│   │   └── skill.ts          — TypeScript scaffolder (unused, covered by init-skill.sh)
│   ├── adaptation/engine.ts  — Pi Agent compat check engine (10 rules for skills, 4 for extensions, etc.)
│   ├── catalog/              — scanner, scoring, aging, version detection
│   ├── optimizer/            — 8-dimension Rubric evaluation
│   ├── birth/                — birth certificate runner
│   └── utils/                — path utilities
├── scripts/
│   └── init-skill.sh         — shell script scaffold for SKILL.md + radiant dirs
```

## 5 Capability Package Types

| Type | What | Where | Validation | Scaffold |
|------|------|-------|-----------|----------|
| Skill | SKILL.md + radiant dirs | ~/.pi/agent/skills/ | validate_skill (25 checks) | /create-skill (init-skill.sh) |
| Extension | .ts with export default | ~/.pi/agent/extensions/ | validate_extension (4 checks) | ❌ NONE |
| Prompt | .md with frontmatter | ~/.pi/agent/prompts/ | validate_prompt (2 checks) | ❌ NONE |
| Theme | .json with 51 color tokens | ~/.pi/agent/themes/ | validate_theme (4 checks) | ❌ NONE |
| Package | npm package.json + pi manifest | pi install (npm/git) | validate_package (3 checks) | ❌ NONE |

Key gap: **Only skills have a create/scaffold flow**. Extensions, prompts, themes, and packages have validation but no creation tooling.

## Existing Lifecycle Tools

All types: /adapt (Pi Agent compat), /resource-birth (readiness check), /validate-* (format check)
Skills only: /create-skill (scaffold), skill_git_deploy (Gitee deploy), /optimize-skill (Rubric)
Extensions only: skill_git_deploy (can deploy .ts too)

## Input Hook Current Detection

Currently detects keywords for 5 types + operation intent keywords (create/write/edit/deploy/install/validate/adapt etc.).
Only routes when BOTH type keyword AND operation keyword match.
Routing hints are type-specific.

## Missing: "Crystallization Intent" Detection

Currently no detection for phrases like:
- "我发现每次做 X 都要查 Y"
- "这个流程应该做成一个 skill"
- "这个经验可以沉淀下来"
- "let's make this a reusable capability"
- "这个做法应该固化下来"

## find-skills SKILL.md

The find-skills SKILL.md already has a comprehensive workflow (Steps 0-8) covering:
- Step 0: Understand the Need
- Step 1: Local Check
- Step 2: Multi-Store Search (6 channels)
- Step 3: Evaluate & Present
- Step 4: Choose Install Path (direct/fork+adapt/recreate/skip)
- Step 5: Fork + Adapt
- Step 6: Create from Scratch (references /create-skill)
- Step 7: Deploy (git commit+push)
- Step 8: Local Link & Verify

But it doesn't include Phase A (worth-it assessment) or Phase B (type selection).

## Platform-Specific Considerations

- GitHub access goes through ghproxy mirror
- Gitee is primary repo for pi-capabilities
- skillhub and clawhub are skill marketplaces
- npm is package registry