# Pi Agent 能力包边界框架

依据 [pi.dev/docs/latest](https://pi.dev/docs/latest) 官方文档，定义 5 种能力包类型的精确边界。

## 核心原则

```
能力包类型选择 = f(能力特征, 分布渠道, 自动化程度)
```

| 维度 | 解释 |
|------|------|
| **能力特征** | 是什么形式？指令/程序/模板/颜色/混合 |
| **分布渠道** | 给谁用？自己/团队/GitHub/npm |
| **自动化程度** | 需要什么运行时？LLM 理解执行 vs Pi 引擎执行 |

---

## 类型定义与边界

### 1. Skill — 按需加载的指令包

**官方定义**：`Self-contained capability packages that the agent loads on-demand. A skill provides specialized workflows, setup instructions, helper scripts, and reference documentation for specific tasks.`

| 属性 | 值 |
|------|-----|
| 文件格式 | `SKILL.md` + 辐射目录（scripts/ references/ assets/）|
| 运行时 | LLM 读取指令后自然执行（**非 Pi 引擎执行**）|
| 加载机制 | Progressive disclosure（description 常驻 context，正文按需读取）|
| 核心能力 | 工作流指令、规范、标准、校验清单 |

**必须满足**：frontmatter 有 name + description（缺 description **不加载**）

**适用场景**：
- ✅ 纯规范性说明（code review 规范、commit message 规范）
- ✅ 工作流指令（"先做 A 再做 B 最后做 C"）
- ✅ 最佳实践集合（"做 X 时记住这 5 点"）
- ✅ 不需要编程逻辑、不需要事件钩子

**不适场景**：
- ❌ 需要 API/IO 操作 → Extension
- ❌ 需要条件判断/分支逻辑 → Extension
- ❌ 纯文本模板带参数 → Prompt Template
- ❌ 需要交互式 UI → Extension

---

### 2. Extension — 程序化行为扩展

**官方定义**：`TypeScript modules that extend pi's behavior. They can subscribe to lifecycle events, register custom tools callable by the LLM, add commands, and more.`

| 属性 | 值 |
|------|-----|
| 文件格式 | `.ts`（export default function）|
| 运行时 | **Pi 引擎直接执行**（jiti 加载，TypeScript 无需编译）|
| 加载机制 | 启动时加载，常驻内存，热重载通过 `/reload` |
| 核心能力 | 工具注册、事件拦截、自定义命令、文件系统访问、网络请求 |

**必须满足**：`export default function(pi: ExtensionAPI)` + `@earendil-works/pi-coding-agent` 导入

**三种结构**：
| 复杂度 | 结构 | 何时用 |
|--------|------|--------|
| 简单 | `my-ext.ts` 单文件 | ≤50 行 |
| 中等 | `my-ext/index.ts` + helper | 多函数需组织 |
| 复杂 | `my-ext/package.json` + dependencies | 需 npm 依赖 |

**适用场景**：
- ✅ 需要 API 调用（GitHub API、Slack API、自定义后端）
- ✅ 需要事件钩子（tool_call 前权限检查、tool_result 后数据处理）
- ✅ 需要自定义 TUI 组件
- ✅ 需要注册 LLM 可调用的自定义工具
- ✅ 需要文件系统操作（监控文件变化、批量处理）

**不适场景**：
- ❌ 纯指令/规范 → Skill
- ❌ 纯模板 → Prompt Template
- ❌ 只需一次性的 LLM 引导 → Skill

---

### 3. Prompt Template — 可复用提示词

**官方定义**：`Reusable prompts that expand from slash commands. Filename becomes the command name.`

| 属性 | 值 |
|------|-----|
| 文件格式 | `.md`（frontmatter + content）|
| 运行时 | **Pi 引擎**在编辑器中展开为完整 prompt |
| 加载机制 | `/name` 自动补全、展开时注入参数 |
| 核心能力 | 参数化文本模板（$1, $@, ${1:-default}）|

**必须满足**：文件名 → 命令名（如 `review.md` → `/review`）

**适用场景**：
- ✅ 固定格式的 prompt 模板（"review this code"、"summarize this"）
- ✅ 需要参数插值（`/component Button "onClick"`）
- ✅ 频繁使用的 prompt 模式（`/pr <URL>`、`/issue <id>`）
- ✅ 不需要条件逻辑、纯文本模板

**不适场景**：
- ❌ 需要条件判断/分支 → Skill 或 Extension
- ❌ 需要编程逻辑 → Extension
- ❌ 内容超过 100 行 → 考虑拆分为 Skill
- ❌ 不需要参数化 → 直接写 prompt 即可

---

### 4. Theme — TUI 配色

**官方定义**：`JSON files that define colors for the TUI.`

| 属性 | 值 |
|------|-----|
| 文件格式 | `.json`（51 色值 token）|
| 运行时 | **Pi 引擎**直接应用 |
| 加载机制 | 启动时加载，热重载（编辑后自动生效）|
| 核心能力 | TUI 配色定制 |

**必须满足**：全部 51 个颜色 token，无遗漏

**颜色值格式**：`#rrggbb` / `256 索引` / `vars 引用` / `""（终端默认）`

**适用场景**：
- ✅ 自定义终端配色
- ✅ 暗色/亮色主题切换
- ✅ 品牌色匹配

**不适场景**：
- ❌ 非颜色配置 → 其他类型
- ❌ 需要动态颜色逻辑 → Extension

---

### 5. Package — 资源组合包

**官方定义**：`Bundle extensions, skills, prompt templates, and themes so you can share them through npm or git.`

| 属性 | 值 |
|------|-----|
| 文件格式 | `package.json` + pi 清单 / 约定目录 |
| 运行时 | N/A（载体） |
| 加载机制 | `pi install npm:xxx` / `pi install git:xxx` |
| 核心能力 | 分发、版本管理、依赖管理 |

**必须满足**：`package.json` + `pi-package` 关键词（可选但推荐）

**三种源类型**：
| 源 | 方式 | 版本管理 |
|----|------|---------|
| npm | `npm:@scope/pkg@1.2.3` | 语义化版本锁定 |
| git | `git:github.com/user/repo@v1` | tag/commit 锁定 |
| local | `/absolute/path` / `./relative/path` | 本地文件引用 |

**适用场景**：
- ✅ 多个 skill 需要一起分发
- ✅ skill + extension + prompt 组合
- ✅ 需要 npm 依赖管理的项目
- ✅ 团队共享能力包

---

## 决策树（快速选型）

```
你的能力是什么形式？
│
├─ 纯文本模板，只需参数插值
│   └─ Prompt Template
│
├─ 指令/规范/步骤/标准
│   ├─ 需要条件判断/分支/循环？
│   │   ├─ 是 → Extension（需要编程逻辑）
│   │   └─ 否 → Skill
│   └─ 需要脚本/自动化？
│       ├─ 是 → Skill（scripts/ 目录放脚本）
│       └─ 否 → Skill
│
├─ 程序化逻辑
│   ├─ API 调用/文件 IO/事件钩子？
│   │   └─ Extension
│   ├─ 需要自定义 UI/工具？
│   │   └─ Extension
│   └─ 纯数据处理？
│       ├─ 需要持久化/工具 → Extension
│       └─ 一次性处理 → Skill（scripts/ 放脚本）
│
├─ UI 配色/样式
│   └─ Theme
│
├─ 混合模式（同时需要多种类型）
│   └─ Package
│
└─ 只是问问题/一次性活
    └─ 不需要封装，直接回答
```

## 决策矩阵

| 能力特征 | Skill | Ext | Prompt | Theme | Pkg |
|----------|-------|-----|--------|-------|-----|
| 纯规范性说明 | ★★★ | - | ★ | - | - |
| 需条件判断/分支 | ★ | ★★★ | - | - | ★ |
| 需 API/IO 操作 | - | ★★★ | - | - | ★ |
| 需事件钩子 | - | ★★★ | - | - | ★ |
| 需自定义工具 | - | ★★★ | - | - | ★ |
| 纯文本+参数插值 | ★ | - | ★★★ | - | - |
| 需持久化状态 | - | ★★★ | - | - | ★ |
| 界面配色 | - | - | - | ★★★ | ★ |
| 需脚本/自动化 | ★★ | ★★ | - | - | ★ |
| 团队分发 | ★ | ★ | ★ | ★ | ★★★ |
| 版本管理 | ★ | ★ | ★ | ★ | ★★★ |

★★★ = 最推荐  ★★ = 可用  ★ = 次选  - = 不适用

---

## 适配规则分级（从官方文档推导）

| 级别 | 含义 | 处理 |
|------|------|------|
| 🔴 Critical | Pi 拒绝加载 | **必须修复**，不能跳过 |
| 🟠 Error | Pi 加载但行为异常 | **建议修复**，可临时使用 |
| 🟡 Warning | 违背最佳实践 | 修复更好，不修也能用 |
| 💡 Info | 架构建议 | 按需采纳 |

### 各类型 Critical 规则摘要

| 类型 | Critical 规则 |
|------|-------------|
| Skill | 有 SKILL.md、name 字段、description 字段（缺 desc **不加载**）|
| Extension | export default function、从 @earendil-works/pi-coding-agent 导入 |
| Prompt | —（无 critical，filename 错误只影响命令名）|
| Theme | 合法 JSON、name 字段、51 个颜色 token 完整 |
| Package | 有 package.json |