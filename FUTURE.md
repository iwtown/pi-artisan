# pi-artisan 未来集成计划

> 当前不做，但不能忘的待办。

---

## pi-llm-wiki Gene 集成

**触发条件**（三个条件都满足才实施）：

1. [ ] pi-llm-wiki 的 `wiki/基因/` 下 Gene 总数 > 50 条
2. [ ] 其中至少 10 条 Gene 的 `gene_skill_slug` 指向本地已安装的 skill
3. [ ] 至少有 3 条 Gene 的 `gene_pattern === "failure"` 且 `gene_confidence > 0.7`

**实现内容**：

```
文件: src/optimizer/rubric.ts
函数: getRelatedGenes(slug, dir) → string[]
当前: 空桩，返回 []

实现后效果:
  optimize-skill 的 gotchas 建议从模板
  "当前 gotchas 仅含占位符"
  变为
  "从实际使用数据发现常见失败模式: X、Y、Z"
```

**查询方式**：读文件系统（`wiki/基因/` 目录），不调 API。
**降级策略**：目录不存在 / 读取失败 → 静默回退模板。
**隔离原则**：只用于 optimize-skill 的 suggestion 增强，不参与 validate/birth-cert 决策。

**参考文件**：
- `src/optimizer/rubric.ts` — `getRelatedGenes()` 空桩
- `~/projects/pi-llm-wiki/` — Gene 数据源

---

## 其他待评估

（暂无）
