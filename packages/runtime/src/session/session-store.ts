import type {
  CapabilityExecutionRecord,
  JsonLike,
  TraceEvent,
  WorkflowPlan
} from "@capora/core";

export type WorkflowSessionStatus = "awaiting_input" | "awaiting_approval";

export interface WorkflowSession {
  id: string;
  goal: string;
  plan: WorkflowPlan;
  status: WorkflowSessionStatus;
  pendingStepIndex: number;
  providedInput: Record<string, JsonLike>;
  memory: Record<string, JsonLike>;
  results: CapabilityExecutionRecord[];
  trace: TraceEvent[];
  traceId: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowSessionStore {
  get: (sessionId: string) => Promise<WorkflowSession | undefined> | WorkflowSession | undefined;
  save: (session: WorkflowSession) => Promise<void> | void;
  delete: (sessionId: string) => Promise<void> | void;
}

export class InMemoryWorkflowSessionStore implements WorkflowSessionStore {
  private readonly sessions = new Map<string, WorkflowSession>();

  get(sessionId: string): WorkflowSession | undefined {
    return this.sessions.get(sessionId);
  }

  save(session: WorkflowSession): void {
    this.sessions.set(session.id, session);
  }

  delete(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
