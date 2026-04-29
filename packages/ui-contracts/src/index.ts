import type { OrchestrationResponse } from "@capora/runtime";

export type UiPlanStepStatus = "completed" | "active" | "pending" | "failed";

export interface UiPlanStep {
  index: number;
  capability: string;
  reason: string;
  status: UiPlanStepStatus;
}

export interface UiRequiredField {
  field: string;
  question: string;
}

export interface UiApprovalPrompt {
  capability: string;
  reason: string;
}

export interface UiExecutionResult {
  capability: string;
  status: "success" | "failed";
  input: Record<string, unknown>;
  output?: unknown;
  error?: string;
}

export interface UiTraceSummaryItem {
  type: string;
  message: string;
  at: string;
  capability?: string;
  stepIndex?: number;
  goal?: string;
  stepCount?: number;
  capabilities?: string[];
  fields?: string[];
  reason?: string;
  error?: string;
  resultCount?: number;
}

export interface UiResponseModel {
  status: OrchestrationResponse["status"];
  stateLabel: string;
  summary: string;
  goal: string;
  traceId?: string;
  sessionId?: string;
  pendingCapability?: string;
  plan: UiPlanStep[];
  requiredFields: UiRequiredField[];
  approval?: UiApprovalPrompt;
  results: UiExecutionResult[];
  error?: string;
  trace: UiTraceSummaryItem[];
}
