import type { CapabilitySideEffect } from "../capability/types.js";
import type { TraceEvent } from "./trace-event.js";

export type AuditTraceVersion = "1.0";

export type AuditActor = {
  userId?: string;
  tenantId?: string;
  roles?: string[];
};

export type AuditApprovalDecision = {
  approved: boolean;
  approvedBy?: string;
  reason?: string;
  comment?: string;
  decidedAt?: string;
};

export type AuditStepStatus =
  | "pending"
  | "awaiting_input"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "executed"
  | "completed"
  | "failed";

export type AuditStepTrace = {
  stepIndex: number;
  capability: string;
  capabilityVersion: string;
  sideEffect: CapabilitySideEffect | "unknown";
  approvalRequired: boolean;
  approval?: AuditApprovalDecision;
  inputRecorded: boolean;
  outputRecorded: boolean;
  inputHash?: string;
  outputHash?: string;
  status: AuditStepStatus;
  startedAt?: string;
  endedAt?: string;
  error?: string;
};

export type AuditTrace = {
  version: AuditTraceVersion;
  traceId: string;
  goal: string;
  status: "needs_input" | "needs_approval" | "completed" | "failed";
  actor?: AuditActor;
  plan: {
    stepCount: number;
    capabilities: string[];
  };
  steps: AuditStepTrace[];
  rawTrace: TraceEvent[];
  createdAt: string;
  exportedAt: string;
};
