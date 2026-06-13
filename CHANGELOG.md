# Changelog

## [2.1.0] — 2026-06-13

### 🎯 质量门控增强（迭代 1）

- **新增 version 必填 + semver 格式检查**：frontmatter 必须含 version 字段
- **新增 gotchas 占位符检测**：自动识别并提示替换 "真实失败案例" "TODO" "待补充" 等占位符
- **新增 gotchas 实际条目检测**：至少需要 1 条以 `- ` 或 `* ` 开头的非注释列表项
- **新增 Eval 正例/反例子节细分**：Eval 节必须包含 ## 正例 和 ## 反例 子节
- **新增 Forbidden Load 占位符检测**：自动识别并提示替换占位符内容
- **新增 Forbidden Load 实际条目检测**：至少需要 1 条具体的不加载条件
- **新增辐射目录内容非空检查**：references/ scripts/ assets/ 有实际文件（非 .gitkeep）
- **新增 tested-models 结果记录格式建议**：建议记录 model + result + notes
- **新增 prompt tags 字段建议**：提示添加 tags 分类字段

### 🧪 测试基础设施

- **新增 vitest 测试框架**：包含 10 个测试用例覆盖全部新检查
- **新增 test/fixtures/**：合规/不合规的 SKILL.md、extension、prompt 样本
- 测试脚本：`npm test`（vitest run + node --check）

## [2.3.0] — 2026-06-13

### 🗂️ 资源目录管理（catalog 模块）

- **目录扫描器** (`src/catalog/scanner.ts`)：发现 5 种资源类型（skills/extensions/prompts/themes/packages）的本地安装
- **质量评分模型** (`src/catalog/score.ts`)：多维加权评分，每种资源类型独立评分维度
- **报告生成器** (`src/catalog/report.ts`)：TUI 格式化质量报告输出
- **老化检测** (`src/catalog/aging.ts`)：90 天 stale / 180 天 archived
- **版本追踪** (`src/catalog/version.ts`)：本地 version vs skillhub/npm 远程版本比对

### 📋 资源管理命令

- `/resource-list [type] [--json]` — 列出所有/指定类型资源
- `/resource-status <type> <name>` — 查看单个资源详细质量报告
- `/resource-maintain [--check-only]` — 老化检测 + 版本落后检测
- `/resource-publish skill <path> [--dry-run]` — 校验→skillhub publish 编排

### 🔧 LLM 工具（新增 4 个）

- `resource_list` — 列出已安装资源
- `resource_status` — 查看资源质量报告
- `resource_maintain` — 维护检测报告
- `resource_publish` — 发布技能

### 🧪 测试

- 10 个测试文件，60 项测试全部通过
- catalog 模块专用测试（scanner/score/report/aging）
- YAML 列表语法、HTML 注释边界情况等 edge cases

### 🐛 Bug 修复

- `allowed-tools` 正则缺 `_` → 支持 `read_file` 等 snake_case 工具名
- `extractFieldValue` 不支持 YAML 列表 → 支持 `- model` 格式解析
- `<!--` 占位符检测过宽 → 仅含关键词的注释才触发
- ESM 中 `require()` → 全部改为 ESM import

## [2.1.0] — 2026-06-13

### ✅ 质量门控增强（+8 项检查）

- **Skills**：version 必填 + semver 格式、gotchas 占位符检测 + 实际条目、Eval 正例/反例子节细分、Forbidden Load 占位符 + 条目检测、辐射目录内容非空、tested-models 结果记录格式
- **Extensions**：命名空间前缀建议
- **Prompts**：tags 字段建议
- **Themes**：文件名 kebab-case 规范
- **Packages**：description ≤80 字符

### 🧪 测试基础设施

- 安装 vitest，6 个测试文件 39 项测试
- test/fixtures/ 完整合法/非法样本

## [2.0.0] — 2026-06-13

### 🏗️ 架构重构

- **模块化拆分**：将 ~700 行 `index.ts` 单体拆分为 12 个独立模块
  - `src/utils/` — 路径、YAML、结果格式化工具
  - `src/validators/` — 5 个独立 validator（skill/extension/prompt/theme/package）
  - `src/hooks/` — tool_call / tool_result 自动校验钩子
  - `src/commands/` — 5 个 `/validate-*` 斜杠命令
  - `src/tools/` — 5 个 `validate_*` LLM 工具
  - `src/scaffold/` — TypeScript 脚手架工具
- **新增 `tsconfig.json`**：strict 模式 + ES2022 目标
- **类型系统**：`ValidationIssue`、`ValidatorFn`、`PathValidatorFn` 共享接口
- **测试目录**：`test/validators/` + `test/fixtures/` 骨架
- **脚本保留**：`scripts/init-skill.sh` 向后兼容

### 📦 外部接口

- **保持不变**：全部 5 个工具名称、5 个命令名称、hook 行为
- **保持不变**：package.json 的 `pi.extensions` 入口路径
