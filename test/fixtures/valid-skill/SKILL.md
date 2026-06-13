---
name: test-skill
slug: test-skill
version: 1.0.0
description: >-
  当用户需要测试质量门控功能时加载。用于验证 pi-artisan 的各项检查是否正常工作。
tested-models:
  - model: deepseek-v4-pro
    result: pass
    notes: "All checks pass correctly"
  - model: gpt-4
    result: pass
    notes: "Works as expected"
---

# Test Skill

## Overview

A test skill for pi-artisan validation.

## Instructions

1. Run validate_skill
2. Check output
3. Confirm all checks pass

## Gotchas

- [环境] 当输入包含中文标点时，模型可能遗漏引号匹配，需要在后处理中补充
- [依赖] 如果系统未安装 node >=18，类型检查会失败，需在调用前检测环境
- [路径] WSL2 下绝对路径与 Windows 路径混用会导致文件找不到，应统一使用相对路径

## Forbidden Load

- 用户只是询问什么是 skill，不需要实际校验时不加载
- 当用户需要的是自动生成 SKILL.md 骨架而非校验时，请使用 init-skill.sh
- 当前会话上下文明显是讨论 pi-agent 架构而非具体 skill 质量时

## Eval

### 正例
- 用户说"帮我检查这个 SKILL.md 有没有问题" → 应加载此 skill
- 用户说"/validate-skill path/to/SKILL.md" → 应加载此 skill

### 反例
- 用户说"帮我写一个 SKILL.md" → 不应加载，应使用 scaffold
- 用户问"什么是 pi-artisan" → 不应加载

## References

- [pi-artisan README](../README.md)
