import type { WorkflowExecutionState } from "../state/workflow-execution-state.js";
import type {
  WorkflowSessionStatus,
  WorkflowSessionStore
} from "./session-store.js";
import { createSessionId } from "../shared/create-identifier.js";

export const persistPausedSession = async (
  sessionStore: WorkflowSessionStore,
  state: WorkflowExecutionState,
  status: WorkflowSessionStatus,
  pendingStepIndex: number
): Promise<string> => {
  const now = new Date().toISOString();
  const sessionId = state.sessionId ?? createSessionId();

  await sessionStore.save({
    id: sessionId,
    goal: state.goal,
    plan: state.plan,
    status,
    pendingStepIndex,
    providedInput: { ...state.providedInput },
    memory: { ...state.memory },
    results: [...state.results],
    trace: [...state.trace],
    traceId: state.traceId,
    createdAt: state.createdAt ?? now,
    updatedAt: now
  });

  return sessionId;
};
