export type TraceEventType =
  | "goal.received"
  | "plan.created"
  | "step.entered"
  | "step.resumed"
  | "step.awaiting_input"
  | "step.awaiting_approval"
  | "step.executed"
  | "step.completed"
  | "step.failed"
  | "workflow.completed"
  | "workflow.failed";

export interface TraceEventBase<TType extends TraceEventType> {
  type: TType;
  message: string;
  at: string;
}

export interface GoalReceivedTraceEvent extends TraceEventBase<"goal.received"> {
  goal: string;
}

export interface PlanCreatedTraceEvent extends TraceEventBase<"plan.created"> {
  stepCount: number;
  capabilities: string[];
}

export interface StepEnteredTraceEvent extends TraceEventBase<"step.entered"> {
  capability: string;
  stepIndex: number;
}

export interface StepResumedTraceEvent extends TraceEventBase<"step.resumed"> {
  capability: string;
  stepIndex: number;
}

export interface StepAwaitingInputTraceEvent
  extends TraceEventBase<"step.awaiting_input"> {
  capability: string;
  stepIndex: number;
  fields: string[];
}

export interface StepAwaitingApprovalTraceEvent
  extends TraceEventBase<"step.awaiting_approval"> {
  capability: string;
  stepIndex: number;
  reason: string;
}

export interface StepExecutedTraceEvent extends TraceEventBase<"step.executed"> {
  capability: string;
  stepIndex: number;
}

export interface StepCompletedTraceEvent extends TraceEventBase<"step.completed"> {
  capability: string;
  stepIndex: number;
}

export interface StepFailedTraceEvent extends TraceEventBase<"step.failed"> {
  capability: string;
  stepIndex: number;
  error: string;
}

export interface WorkflowCompletedTraceEvent
  extends TraceEventBase<"workflow.completed"> {
  resultCount: number;
}

export interface WorkflowFailedTraceEvent extends TraceEventBase<"workflow.failed"> {
  error: string;
  capability?: string;
  stepIndex?: number;
}

export type TraceEvent =
  | GoalReceivedTraceEvent
  | PlanCreatedTraceEvent
  | StepEnteredTraceEvent
  | StepResumedTraceEvent
  | StepAwaitingInputTraceEvent
  | StepAwaitingApprovalTraceEvent
  | StepExecutedTraceEvent
  | StepCompletedTraceEvent
  | StepFailedTraceEvent
  | WorkflowCompletedTraceEvent
  | WorkflowFailedTraceEvent;
