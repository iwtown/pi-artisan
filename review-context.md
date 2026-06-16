# Reviewer 任务：审查 Pi Agent 按需加载方案

## 背景

当前已经完成的实现（本会话中已完成）：
1. `.dotfiles/AGENTS.md` — 6929→909 chars ✅
2. `~/.pi/agent/AGENTS.md` — Provider/SubAgent 表已删除，Skill 按需加载章节已追加 ✅
3. `.on-demand-registry.json` — 创建了包含 17 个按需 skill 的注册表 ✅
4. `disable-model-invocation: true` — 17 个非核心 skill 全部标记 ✅
5. 当前会话 reload 后 available_skills 只显示 7 个常驻 skill ✅

## 需审查的方案 plan.md

文件地址：/home/wtown/projects/.dotfiles/modules/pi-artisan/plan.md

## Oracle 核心结论

1. 自定义 registry JSON 是「必要」的 — Pi 的 `disable-model-invocation` 把 skill 完全隐藏，agent 连存在都不知道
2. `disable-model-invocation` 是正确机制，不需要改用 settings -path 排除
3. 三路径触达合理但可以精简描述
4. Extension 层做触发桥性价比低 — registry + AGENTS.md 规则已够用
5. 当前 hybrid 方案是最优解

## 审查方向

1. plan.md 方案与 oracle 结论是否一致
2. 对已实现的部分，是否有改进空间（不是重做）
3. 剩余未做的事中，哪些值得做、哪些不值得
4. 整体方案的可靠性评估
