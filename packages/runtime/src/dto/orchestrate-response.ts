import type {
  CapabilityExecutionRecord,
  TraceEvent,
  WorkflowPlan,
  WorkflowPlanStep
} from "@capora/core";

export interface MissingField {
  field: string;
  question: string;
}

export type OrchestrationStatus =
  | "needs_input"
  | "needs_approval"
  | "completed"
  | "failed";

export interface OrchestrationStateBase<TStatus extends OrchestrationStatus> {
  status: TStatus;
  traceId: string;
  plan: WorkflowPlan;
  trace: TraceEvent[];
}

export interface PausedOrchestrationStateBase<
  TStatus extends Exclude<OrchestrationStatus, "completed" | "failed">
> extends OrchestrationStateBase<TStatus> {
  sessionId: string;
}

export interface NeedsInputState extends PausedOrchestrationStateBase<"needs_input"> {
  pendingStep: WorkflowPlanStep;
  capability: string;
  fields: MissingField[];
}

export interface NeedsApprovalState extends PausedOrchestrationStateBase<"needs_approval"> {
  pendingStep: WorkflowPlanStep;
  capability: string;
  reason: string;
}

export interface CompletedState extends OrchestrationStateBase<"completed"> {
  results: CapabilityExecutionRecord[];
}

export interface FailedState extends OrchestrationStateBase<"failed"> {
  results: CapabilityExecutionRecord[];
  error: string;
  failedStep?: WorkflowPlanStep;
  capability?: string;
}

export type MissingInfoResponse = NeedsInputState;
export type ApprovalResponse = NeedsApprovalState;
export type ExecutionResponse = CompletedState | FailedState;
export type FailureResponse = FailedState;
export type OrchestrationState =
  | NeedsInputState
  | NeedsApprovalState
  | CompletedState
  | FailedState;
export type OrchestrationResponse = OrchestrationState;
