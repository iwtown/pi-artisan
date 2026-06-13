#!/bin/bash
# ── init-skill.sh ──
# 生成 SKILL.md 骨架（name + description frontmatter + 目录结构 + gotchas/eval 占位）
# 用法: init-skill.sh <name> "description"
# 示例: init-skill.sh my-skill "Does X when user mentions Y"

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: init-skill.sh <name> \"description\""
  echo "  name: kebab-case, 1-64 chars (e.g., my-skill)"
  exit 1
fi

NAME="$1"
DESC="${2:-}"

# ── Validation ──
if [ -z "$NAME" ]; then
  echo "Usage: init-skill.sh <name> \"description\""
  echo "  name: kebab-case, 1-64 chars (e.g., my-skill)"
  exit 1
fi

if ! echo "$NAME" | grep -qE '^[a-z0-9]+(-[a-z0-9]+)*$'; then
  echo "❌ name must be kebab-case (lowercase, digits, hyphens only)"
  echo "   Got: $NAME"
  exit 1
fi

if [ ${#NAME} -gt 64 ]; then
  echo "❌ name too long (${#NAME} chars, max 64)"
  exit 1
fi

if [ -z "$DESC" ]; then
  echo "❌ description is required"
  exit 1
fi

if [ ${#DESC} -gt 1024 ]; then
  echo "❌ description too long (${#DESC} chars, max 1024)"
  exit 1
fi

# ── Determine target directory ──
# If in a project with skills/ dir, use that. Otherwise, create in cwd.
if [ -d "skills" ]; then
  TARGET="skills/$NAME"
else
  TARGET="$NAME"
fi

if [ -d "$TARGET" ]; then
  echo "⚠️  Directory already exists: $TARGET"
  confirm="N"
  # 交互式环境才询问，非交互（管道/CI）自动跳过
  if [ -t 0 ]; then
    read -t 10 -rp "Overwrite SKILL.md? [y/N] " confirm || confirm="N"
  fi
  if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

mkdir -p "$TARGET"

# ── Generate SKILL.md ──
cat > "$TARGET/SKILL.md" << EOF
---
name: $NAME
description: >-
  $DESC
tested-models: []
---

# $NAME

## Overview

Brief overview of what this skill does.

## When to Use

- Trigger 1: when user ...
- Trigger 2: when you need to ...

## Instructions

1. Step 1
2. Step 2
3. Step 3

## Examples

### Example 1

\`\`\`
User: "..."
Agent: ...
\`\`\`

## Gotchas

<!-- 真实失败案例。每次使用此 skill 出错后追加，格式：- [场景] 问题描述 -->
<!-- gotchas 是最有价值的内容，正面原则模型已经知道，负面边界才是专家经验 -->

## Forbidden Load

<!-- 什么场景下本 skill 绝不加载？ -->

## Eval

### 正例（应加载此 skill 的场景）
-
### 反例（不应加载的场景）
-

## References

- [related-skill](../related-skill/SKILL.md)
EOF

# ── 创建辐射目录结构 ──
mkdir -p "$TARGET/references"
mkdir -p "$TARGET/scripts"
mkdir -p "$TARGET/assets"
touch "$TARGET/references/.gitkeep"
touch "$TARGET/scripts/.gitkeep"
touch "$TARGET/assets/.gitkeep"

echo ""
echo "✅ Skill scaffolded: $TARGET/SKILL.md"
echo ""
echo "  name:        $NAME"
echo "  description: $DESC"
echo "  location:    $(realpath "$TARGET")"
echo ""
echo "Next: edit $TARGET/SKILL.md to fill in instructions and examples."
echo "  gotchas/eval/forbidden sections are pre-created — fill with real content."
echo "  references/ scripts/ assets/ dirs created for '辐射厚' architecture."
