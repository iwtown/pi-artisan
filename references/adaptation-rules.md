# Adaptation Rules Quick Reference

Total: 36 rules across 5 types

## Skill (13)
| Rule | Severity | Description |
|------|----------|-------------|
| dir-exists | critical | SKILL.md must exist |
| frontmatter-name | critical | name field required |
| frontmatter-desc | critical | description field required |
| name-format | error | kebab-case, 1-64 chars |
| desc-length | error | ≤1024 chars |
| desc-specific | warning | describe trigger scenario |
| relative-paths | warning | no absolute paths in instructions |
| progressive-disclosure | info | concise trigger, detailed body |
| radiant-dirs | info | references/ scripts/ assets/ |
| disable-model-invocation | info | adds to on-demand registry |
| skill-allow-unknown-fields | info | frontmatter may have custom fields |
| skill-license-field | info | license recommended |
| skill-allowed-tools | warning | specify if restricts tool access |

## Extension (7)
| Rule | Severity | Description |
|------|----------|-------------|
| ext-export-default | critical | export default function(pi) |
| ext-import-package | critical | import from pi-coding-agent |
| ext-tool-naming | warning | snake_case tool names |
| ext-session-scope | warning | background resource lifecycle |
| ext-no-js-import | warning | no .js file imports |
| ext-package-deps | info | dependencies in package.json |
| ext-structure | info | single file vs dir vs package |

## Prompt (4)
| Rule | Severity | Description |
|------|----------|-------------|
| prompt-description | error | description frontmatter |
| prompt-filename | error | kebab-case, /command format |
| prompt-argument-hint | info | argument-hint for autocomplete |
| prompt-args-format | info | $1, $@, ${1:-default} patterns |

## Theme (6)
| Rule | Severity | Description |
|------|----------|-------------|
| theme-valid-json | critical | valid JSON |
| theme-name | error | name field in JSON |
| theme-51-colors | error | all 51 tokens present |
| theme-color-formats | warning | hex/rgb/variable refs |
| theme-vars-reuse | info | use variables for consistency |
| theme-schema-ref | info | $schema reference |
| theme-export-html | info | export section for HTML rendering |

## Package (6)
| Rule | Severity | Description |
|------|----------|-------------|
| pkg-package-json | critical | package.json exists |
| pkg-pi-manifest | error | pi key with paths |
| pkg-conventional-dirs | info | extensions/ skills/ prompts/ themes/ |
| pkg-keyword | info | pi-package keyword |
| pkg-peer-deps | info | pi SDK as peerDependencies |
| pkg-filter | info | settings.json filtering
| pkg-pi-manifest-keys | warning | allowed manifest keys

