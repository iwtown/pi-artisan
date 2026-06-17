# pi-artisan 🧬

> 人工封装面的质量门控 — Skills / Extensions / Prompts / Packages / Themes 的自动校验器

对应 [[能力的两种生产方式|能力的两种生产方式]] 中的**人工封装**轨。与 `pi-llm-wiki`（自动内化面的进化引擎）对称。

## 安装

```bash
# 本地安装
pi install ~/projects/pi-artisan

# 或在项目目录下
cd ~/projects/pi
pi install ./packages/pi-artisan
```

## 功能

### 自动校验（write/edit 后触发）

| 文件类型 | 校验内容 |
|:---------|:---------|
| `SKILL.md` | frontmatter 字段、description 路由格式、version、gotchas/eval/forbidden 存在性+非占位、行数阈值、辐射目录 |
| `.ts` 扩展 | export default function、SDK import、工具名 snake_case、命名空间前缀、无 .js import |

### 校验命令

| 命令 | 说明 |
|:-----|:------|
| `/validate-skill <path>` | 校验 SKILL.md |
| `/validate-extension <path>` | 校验 .ts 扩展 |
| `/validate-prompt <path>` | 校验 prompt 模板 |
| `/validate-theme <path>` | 校验主题配色 |
| `/validate-package <path>` | 校验 Pi Package 目录 |

### 资源管理命令

| 命令 | 说明 |
|:-----|:------|
| `/resource-list [type] [--json]` | 列出所有/指定类型的已安装资源 |
| `/resource-status <type> <name>` | 查看单个资源的详细质量报告 |
| `/resource-maintain [--check-only]` | 老化检测 + 版本落后检测 + 观察清单 |
| `/resource-publish skill <path> [--dry-run]` | 校验 → skillhub publish 编排发布 |
| `/resource-birth <type> <name>` | 出生证——检查资源是否真的准备好发布 |
| `/optimize-skill <path>` | 8 维 Rubric 诊断 + 定制改进建议 |

### LLM 工具

| 工具 | 说明 |
|:-----|:------|
| `validate_skill` | 校验 SKILL.md + 目录结构 |
| `validate_extension` | 校验 .ts 扩展 |
| `validate_prompt` | 校验 prompt 模板 |
| `validate_theme` | 校验主题配色 |
| `validate_package` | 校验 Pi Package |
| `resource_list` | 列出已安装资源（支持 `--type` 过滤） |
| `resource_status` | 查看资源质量报告 |
| `resource_maintain` | 维护检测报告 |
| `resource_publish` | 发布技能（校验 → skillhub publish） |
| `resource_birth` | 出生证检查 |
| `optimize_skill` | Rubric 诊断 + 改进建议 |

## 资源管理覆盖

pi-artisan 管理 5 种人工封装的能力资源：

| 类型 | 识别方式 | 生命周期阶段 | 线上平台 |
|:-----|:---------|:------------|:---------|
| **Skills** | SKILL.md + 辐射目录 | 创建→校验→测试→**发布**→维护 | [skillhub.cn](https://skillhub.cn) |
| **Extensions** | `.ts` export default | 校验→维护 | GitHub |
| **Prompts** | `.md` 前有 frontmatter | 校验→维护 | — |
| **Themes** | `.json` + 51 tokens | 校验→维护 | — |
| **Packages** | npm 包 + pi manifest | 校验→维护 | npm |

### SkillHub 集成

使用 [skillhub.cn](https://skillhub.cn) 作为 Skills 的线上发布和管理平台：

| 操作 | 方式 | pi-artisan 角色 |
|:-----|:-----|:---------------|
| 搜索 | `skillhub search` | 不封装，直接调用 CLI |
| 安装 | `skillhub install` | 不封装，直接调用 CLI |
| **发布** | `/resource-publish` | **编排** — validate → skillhub publish |
| **版本检测** | `/resource-maintain` | **检测** — 本地 vs skillhub 最新版 |
| 升级 | `skillhub upgrade` | 检测后给出提示 |

## 25 项质量检查（持续增长）

| 类别 | 检查项 | 新增于 |
|:-----|:-------|:-------|
| **格式** | name(kebab-case)、description(≤1024)、compatibility(≤500)、尾换行、YAML 有效性 | — |
| **版本** | version 必填 + semver 格式 (x.y.z) | v2.1 |
| **路由** | description 路由式格式（非广告） | — |
| **结构** | gotchas 存在性 + 内容非空 + 占位符检测 + 实际条目检测 | v2.1 |
| **结构** | Eval 存在性 + 正例/反例子节细分 | v2.1 |
| **结构** | Forbidden Load 存在性 + 内容非空 + 占位符检测 + 实际条目检测 | v2.1 |
| **结构** | 辐射目录(references/scripts/assets/) 存在 + 目录内容非空 | v2.1 |
| **结构** | 行数 ≤300 | — |
| **可选** | tested-models 格式 + 测试结果记录格式 | v2.1 |
| **扩展** | export default、SDK import、tool name snake_case、**命名空间前缀**、无 .js import | v2.1 |
| **提示词** | 文件名合规、description ≤200、argument-hint 格式、尾换行、**tags 字段** | v2.1 |
| **主题** | 51 tokens 完整、颜色值有效、**文件名 kebab-case** | v2.1 |
| **包** | pi manifest、**description ≤80** | v2.1 |

## 脚手架

```bash
bash scripts/init-skill.sh my-skill "当用户需要…时加载"
```

生成带 gotchas/eval/forbidden 占位的完整 SKILL.md 骨架 + references/ scripts/ assets/ 辐射目录。

### 资源管理架构

```
┌─ pi-artisan ──────────────────────────────────┐
│                                                │
│  validators/    ← 5 种资源类型的 25 项校验      │
│  catalog/       ← 扫描 + 评分 + 报告 + 老化    │
│  commands/      ← validate + resource 命令      │
│  tools/         ← LLM 可调用的工具              │
│  hooks/         ← write/edit 自动校验           │
│                                                │
│  Skills → skillhub.cn（发布+版本检测）          │
└────────────────────────────────────────────────┘
```

## 与 pi-llm-wiki 的对称

| | pi-artisan | pi-llm-wiki |
|:---|:-----------|:-------------|
| **管理面** | 人工封装 | 自动内化 |
| **对象** | skills/extensions/prompts/packages/themes | sessions → raw → wiki/基因/ |
| **方法** | 质量门控 + 目录管理 + 发布编排 | 进化管道 |
| **工具** | 5 个 validate_* + 4 个 resource_* 工具 | 7 个 obs-* 工具 |
| **线上平台** | skillhub.cn（skills） | — |

## 更多文档

- [`_docs/boundary-framework.md`](_docs/boundary-framework.md) — 5 种能力类型的边界定义 + 决策树 + 适配规则速查
- [`SKILL.md`](SKILL.md) — pi-artisan 的使用指南（渐进式披露，按需加载）
- [`src/adaptation/`](src/adaptation/) — 36 条适配规则实现
- [`src/catalog/`](src/catalog/) — 资源扫描 + 评分 + 老化 + 版本追踪

## License

MIT
