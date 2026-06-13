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
| `SKILL.md` | frontmatter 字段、description 路由格式、gotchas/eval/forbidden 存在性、行数阈值、辐射目录 |
| `.ts` 扩展 | export default function、SDK import、工具名 snake_case、无 .js import |

### 手动命令

| 命令 | 说明 |
|:-----|:------|
| `/validate-skill <path>` | 校验 SKILL.md |
| `/validate-extension <path>` | 校验 .ts 扩展 |
| `/validate-prompt <path>` | 校验 prompt 模板 |
| `/validate-theme <path>` | 校验主题配色 |
| `/validate-package <path>` | 校验 Pi Package 目录 |

### LLM 工具

| 工具 | 说明 |
|:-----|:------|
| `validate_skill` | 校验 SKILL.md + 目录结构 |
| `validate_extension` | 校验 .ts 扩展 |
| `validate_prompt` | 校验 prompt 模板 |
| `validate_theme` | 校验主题配色 |
| `validate_package` | 校验 Pi Package |

## 14 项质量检查（持续增长）

| 类别 | 检查项 |
|:-----|:-------|
| **格式** | name(kebab-case)、description(≤1024)、compatibility(≤500)、尾换行、YAML 有效性 |
| **路由** | description 路由式格式（非广告） |
| **结构** | gotchas 存在性 + 内容非空、Eval 存在性、Forbidden Load 存在性 + 内容非空、辐射目录(references/scripts/assets/)、行数 ≤300 |
| **可选** | tested-models 格式 |
| **扩展** | export default、SDK import、tool name snake_case、无 .js import |

## 脚手架

```bash
bash scripts/init-skill.sh my-skill "当用户需要…时加载"
```

生成带 gotchas/eval/forbidden 占位的完整 SKILL.md 骨架 + references/ scripts/ assets/ 辐射目录。

## 与 pi-llm-wiki 的对称

| | pi-artisan | pi-llm-wiki |
|:---|:-----------|:-------------|
| **管理面** | 人工封装 | 自动内化 |
| **对象** | skills/extensions/prompts/packages/themes | sessions → raw → wiki/基因/ |
| **方法** | 质量门控 | 进化管道 |
| **工具** | 5 个 validate_* 工具 | 7 个 obs-* 工具 |

## License

MIT
