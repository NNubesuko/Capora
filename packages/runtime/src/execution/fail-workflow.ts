import type { JsonLike, WorkflowPlanStep } from "@capora/core";
import type { FailedState } from "../dto/orchestrate-response.js";
import type { WorkflowSessionStore } from "../session/session-store.js";
import type { WorkflowExecutionState } from "../state/workflow-execution-state.js";
import { deleteSessionIfPresent } from "../session/delete-session-if-present.js";
import { toErrorMessage } from "../shared/to-error-message.js";
import { pushTrace } from "../trace/push-trace.js";

export const failWorkflow = async (
  state: WorkflowExecutionState,
  sessionStore: WorkflowSessionStore,
  details: {
    error: unknown;
    capability?: string;
    step?: WorkflowPlanStep;
    stepIndex?: number;
    input?: Record<string, JsonLike>;
  }
): Promise<FailedState> => {
  const errorMessage = toErrorMessage(details.error);

  if (details.capability) {
    state.results.push({
      capability: details.capability,
      status: "failed",
      input: details.input ?? state.providedInput,
      error: errorMessage
    });
  }

  if (details.capability && details.stepIndex !== undefined) {
    pushTrace(state.trace, {
      type: "step.failed",
      message: `Failed ${details.capability}: ${errorMessage}`,
      capability: details.capability,
      stepIndex: details.stepIndex,
      error: errorMessage
    });
  }

  pushTrace(state.trace, {
    type: "workflow.failed",
    message: details.capability
      ? `Workflow failed during ${details.capability}: ${errorMessage}`
      : `Workflow execution failed: ${errorMessage}`,
    error: errorMessage,
    capability: details.capability,
    stepIndex: details.stepIndex
  });

  await deleteSessionIfPresent(sessionStore, state.sessionId);

  return {
    status: "failed",
    traceId: state.traceId,
    plan: state.plan,
    results: state.results,
    error: errorMessage,
    failedStep: details.step,
    capability: details.capability,
    trace: state.trace
  };
};
