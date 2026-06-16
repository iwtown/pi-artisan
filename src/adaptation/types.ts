/**
 * pi-artisan 适配化改造类型定义
 *
 * 在装配能力包之前，pi-artisan 必须对其进行 Pi Agent 适配化改造。
 * 改造依据: https://pi.dev/docs/latest (customization 各章节)
 *
 * 适配规则分三层：
 *   critical — 不合规则无法被 Pi 加载，必须修复
 *   error    — 违背规范，但 Pi 可能兼容运行
 *   warning  — 最佳实践偏离，建议修复
 *   info     — 可选的增强项
 */

import type { ResourceType } from "../types.js";

/** 适配规则严重级别 */
export type AdapterSeverity = "critical" | "error" | "warning" | "info";

/** 一条适配规则 */
export interface AdapterRule {
  /** 规则唯一 ID，如 "skill-name-format" */
  id: string;
  /** 适用资源类型 */
  type: ResourceType;
  /** 严重级别 */
  severity: AdapterSeverity;
  /** 规则说明 */
  description: string;
  /** 依据来源 — pi.dev/docs/latest 的对应章节 */
  source: string;
  /** 是否可自动修复 */
  autoFixable: boolean;
}

/** 一条规则的检查结果 */
export interface AdapterResult {
  ruleId: string;
  resource: string;
  passed: boolean;
  severity: AdapterSeverity;
  message: string;
  autoFixable: boolean;
}

/** 适配检查报告 */
export interface AdapterReport {
  resourceName: string;
  resourceType: ResourceType;
  resourcePath: string;
  results: AdapterResult[];
  criticalCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  allPassed: boolean;
}

/** 适配配置 */
export interface AdapterConfig {
  /** 全局开关 */
  enabled: boolean;
  /** 严格模式：不合规即阻止装配 */
  strictMode: boolean;
  /** 自动修复开关 */
  autoFix: boolean;
  /** 按类型的规则开关 */
  rules: Record<ResourceType, boolean>;
}

export const DEFAULT_ADAPTER_CONFIG: AdapterConfig = {
  enabled: true,
  strictMode: true,
  autoFix: false,
  rules: {
    skill: true,
    extension: true,
    prompt: true,
    theme: true,
    package: true,
  },
};
