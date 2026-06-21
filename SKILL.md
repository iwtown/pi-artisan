---
name: pi-artisan
description: 当用户需要创建/校验/适配/发布/管理 Pi 能力包（技能/扩展/提示词模板/主题/包）时加载。也用于将运行中积累的经验沉淀为标准能力包（结晶化流程）。
version: 2.3.0
author: wtown
license: MIT
tags: [pi-artisan, capability-management, quality-gate, adapter, validator]
tested-models: [deepseek-v4-flash]
trigger: 能力包, skill, extension, 扩展, prompt, 提示词, theme, 主题, package, 包, artisan, 工坊, 质量管理, 适配, 校验, 发布
disable-model-invocation: true
---

# pi-artisan — 能力包管理工坊

## Overview

pi-artisan 是 Pi Agent 人工封装能力包（Skills、Extensions、Prompts、Themes、Packages）的质量管理工坊。负责从生到养的全生命周期：

```
需要能力 → 搜索/创建 → 适配标准化 → 部署安装 → 版本管理 → 持续监测
```

## When to Use

| 场景 | 触发词 | 操作 |
|------|--------|------|
| 创建新能力包 | 创/skill/扩展/包 | `/create-skill` `/create-extension` `/create-prompt` `/create-theme` `/create-package` |
| 校验文件格式 | 校验/validate/检查 | `/validate-skill` `/validate-extension` `/validate-prompt` `/validate-theme` `/validate-package` |
| Pi Agent 适配检查 | 适配/adapt/兼容 | `/adapt` 或 `adapt_resource` 工具 |
| 列出已安装资源 | 列表/list/资源 | `/resource-list` 或 `resource_list` 工具 |
| 查看资源质量 | 状态/status/质量 | `/resource-status` 或 `resource_status` 工具 |
| 健康巡检+版本追踪 | 巡检/维护/老化 | `/resource-maintain` 或 `resource_maintain` 工具 |
| 发布到 SkillHub | 发布/publish | `/resource-publish` 或 `resource_publish` 工具 |
| 优化 skill 质量 | 优化/评分/Rubric | `/optimize-skill` 或 `optimize_skill` 工具 |
| 出门前综合检查 | 出生证/birth/ready | `/resource-birth` 或 `resource_birth` 工具 |
| 沉淀经验为能力包 | 沉淀/固化/结晶/crystallize | 自动触发结晶化检测，引导类型选择 |
| 部署到 Gitee | 部署/deploy/上传 | `skill_git_deploy` 工具 |

## Tool/Command Quick Reference

### 校验命令（5 种类型）

```
/validate-skill      validate_skill      SKILL.md 格式 + 目录结构
/validate-extension  validate_extension  .ts 扩展文件格式
/validate-prompt     validate_prompt     提示词模板 frontmatter
/validate-theme      validate_theme      51 色值 JSON 主题
/validate-package    validate_package    Pi Package 目录结构
```

### 资源管理命令

```
/resource-list       resource_list       按类型列出已安装资源
/resource-status     resource_status     查看详情质量报告
/resource-maintain   resource_maintain   老化检测 + 版本追踪
/resource-publish    resource_publish    校验 + SkillHub 发布
/resource-birth      resource_birth      出生证检查（发布前综合门禁）
/optimize-skill      optimize_skill      8 维 Rubric 诊断 + 改进建议
/adapt               adapt_resource      Pi Agent 适配化检查
```

### 创建命令

```
/create-skill        skill_create      脚手架 SKILL.md + radiant 目录
/create-extension    extension_create  脚手架 .ts 扩展骨架
/create-prompt       prompt_create     脚手架 .md 提示词模板
/create-theme        theme_create      脚手架 51 色值主题 JSON
/create-package      package_create    脚手架 package.json + pi 清单
```

### 部署命令

```
skill_git_deploy     部署 skill 到 Gitee pi-capabilities 仓库
```

## Type Selection (选择封装备料)

不确定该封装成哪种类型？参考边界决策矩阵：

```
纯指令模板（无代码/无事件）          → Skill (SKILL.md + radiant dirs)
文本模板 + 参数替换                  → Prompt (.md 的 $1 $@ 参数)
程序逻辑 + 钩子/工具/命令注册        → Extension (.ts export default)
UI 颜色/样式                        → Theme (51 色值 JSON)
混合类型（包含多种资源）             → Package (package.json pi 清单)
```

完整决策树详见 `_docs/boundary-framework.md`。

## Adaptation Standards

pi-artisan 内置 36 条适配规则覆盖全部 5 种类型，依据 pi.dev/docs/latest 官方规范：

| 类型 | 规则数 | 关键检查项 |
|------|--------|-----------|
| Skill | 13 | name 格式, description 长度, frontmatter, radiant 目录, disable-model-invocation, 相对路径, 渐进披露, 许可证, allowed-tools |
| Extension | 7 | export default, SDK import, 工具命名 snake_case, 生命周期钩子, 会话作用域, 依赖管理, 文件结构 |
| Prompt | 4 | description, filename → /command, argument-hint, 参数格式 |
| Theme | 6 | JSON 合法性, name, 51 tokens, 颜色格式, 变量引用, 导出 |
| Package | 6 | package.json, pi 清单, 约定目录, pi-package 关键词, peerDependencies, 过滤 |

## Gitee Version Management

所有能力包通过 Gitee 仓库 `gitee.com/wtown/pi-capabilities` 做版本管理：
- 本地 `~/.pi/agent/skills/` → symlink → `~/projects/pi-capabilities/skills/`
- 编辑即修改 Gitee 跟踪副本
- 每 4 小时自动同步（auto-sync cron）
- 上游追踪（fork 的 skill 标记 original source）

## Gotchas

- 不要混淆 `validate_skill`（格式校验）和 `adapt_resource`（Pi Agent 适配检查）— 前者检查 SKILL.md frontmatter 格式，后者检查是否能在当前 Pi 版本中正确加载。创建新 skill 后两个都要跑。
- `/resource-birth` 不是 created 命令，是 publish 前的综合门禁检查。先 fill content 再跑 birth。
- 适配规则中有 `critical` 级别（export default、package.json 存在）— 这些必须通过，否则不能 assemble。`info` 级别（ext-event-lifecycle 等）是知识性提示，不影响使用。
- 创建命令自动 symlink 到 `~/.pi/agent/`，但不会自动运行 validate/adapt——创建后需要显式调用。

## Forbidden Load

- 不要绕过 pi-artisan 的校验/适配流程直接编辑能力包文件
- 不要直接操作 `~/.pi/agent/skills/` 下的文件（应通过 pi-capabilities 操作）
- 不要用 `vi` 或其他 CLI 编辑能力包文件，除非明确要求

## Eval

### 正例

- 用户说「帮我写个 skill」→ pi-artisan 应触发，引导 `/create-skill`
- 用户说「校验一下这个扩展」→ pi-artisan 应识别为 extension 操作，引导 `/validate-extension`
- 用户说「我每次都要手动格式化代码，想把这个经验固化下来」→ 结晶化流程触发，引导类型选择
- 用户编辑了某个 SKILL.md → tool-result 钩子自动跑 validate_skill 并反馈结果

### 反例

- 用户说「git commit」→ 纯 git 操作，pi-artisan 不应介入
- 用户说「查一下天气」→ 通用查询，与能力包管理无关
- 用户说「这个循环能不能优化」→ 纯代码审查，非能力包操作

成功 = 用户在面对能力包管理任务时，pi-artisan 主动拦截并引导，而非由 LLM 猜测该怎么做。

## Examples

### Example 1: Creating a New Skill

**User**: "我要封装一个自动整理下载文件夹的 skill"

**Agent action**:
1. Detect intent via input hook → crystallization flow triggered
2. Phase A: worth-it? (通用性 ✅, 复现频率 ✅ → 值得做)
3. Phase B: 类型选择 → Skill（纯指令）
4. Call `/create-skill auto-organize-downloads "Organizes ~/Downloads by file type"`
5. Guide user to fill content → `/adapt` → `/validate-skill` → `/resource-birth`

### Example 2: Validating an Extension After Edit

**User**: edits `src/my-extension.ts` in pi-capabilities

**Agent action** (automatic, via tool-result hook):
1. Detect .ts file write → run validate_extension + adapt_resource
2. If issues found: send follow-up user message listing problems
3. If clean: silent (no news is good news)

### Example 3: Checking Upstream Drift

**User**: "我 fork 的 ponytail skill 上游有更新吗"

**Agent action**:
1. Run `./_tools/check-upstream.sh ponytail` from pi-capabilities
2. Compare local SKILL.md vs upstream
3. Report: "Has local modifications" or "Up-to-date"
4. If drifted, suggest diff and optional merge

## References

- `_docs/boundary-framework.md` — 类型选择决策树 + 决策矩阵
- `_docs/adaptation-rules.md` — 36 条适配规则详解
- `_docs/README.md` — pi-artisan 完整文档入口
