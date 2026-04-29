import type {
  CapabilityExecutionRecord,
  JsonLike,
  TraceEvent,
  WorkflowPlan
} from "@capora/core";

export interface WorkflowExecutionState {
  sessionId?: string;
  createdAt?: string;
  goal: string;
  plan: WorkflowPlan;
  providedInput: Record<string, JsonLike>;
  memory: Record<string, JsonLike>;
  results: CapabilityExecutionRecord[];
  trace: TraceEvent[];
  traceId: string;
  pendingStepIndex: number;
}
