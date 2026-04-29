import type { OrchestrationResponse } from "@capora/runtime";
import type { UiResponseModel } from "@capora/ui-contracts";

const stateLabels: Record<OrchestrationResponse["status"], string> = {
  needs_input: "Needs Input",
  needs_approval: "Needs Approval",
  completed: "Completed",
  failed: "Failed"
};

const buildSummary = (response: OrchestrationResponse): string => {
  if (response.status === "needs_input") {
    return `Missing required fields for ${response.capability}.`;
  }

  if (response.status === "needs_approval") {
    return `Approval required for ${response.capability}.`;
  }

  if (response.status === "failed") {
    return `Workflow failed${response.capability ? ` during ${response.capability}` : ""}.`;
  }

  return `Workflow completed with ${response.results.length} result(s).`;
};

const buildPlan = (response: OrchestrationResponse): UiResponseModel["plan"] => {
  const completedStepIndices = new Set<number>();
  let activeStepIndex: number | undefined;
  let failedStepIndex: number | undefined;

  for (const event of response.trace) {
    if (
      event.type === "step.entered" ||
      event.type === "step.resumed" ||
      event.type === "step.awaiting_input" ||
      event.type === "step.awaiting_approval" ||
      event.type === "step.executed"
    ) {
      activeStepIndex = event.stepIndex;
      continue;
    }

    if (event.type === "step.completed") {
      completedStepIndices.add(event.stepIndex);

      if (activeStepIndex === event.stepIndex) {
        activeStepIndex = undefined;
      }

      continue;
    }

    if (event.type === "step.failed") {
      failedStepIndex = event.stepIndex;

      if (activeStepIndex === event.stepIndex) {
        activeStepIndex = undefined;
      }

      continue;
    }

    if (event.type === "workflow.failed" && event.stepIndex !== undefined) {
      failedStepIndex = event.stepIndex;
    }
  }

  return response.plan.steps.map((step, index) => ({
    index,
    capability: step.capability,
    reason: step.reason,
    status:
      failedStepIndex === index
        ? "failed"
        : completedStepIndices.has(index)
          ? "completed"
          : activeStepIndex === index
            ? "active"
            : "pending"
  }));
};

export const toWebResponse = (response: OrchestrationResponse): UiResponseModel => {
  const results = response.status === "completed" || response.status === "failed"
    ? response.results.map((result) => ({
        capability: result.capability,
        status: result.status,
        input: result.input,
        output: result.output,
        error: result.error
      }))
    : [];

  return {
    status: response.status,
    stateLabel: stateLabels[response.status],
    summary: buildSummary(response),
    goal: response.plan.goal,
    traceId:
      response.status === "completed" || response.status === "failed"
        ? response.traceId
        : undefined,
    sessionId:
      response.status === "needs_input" || response.status === "needs_approval"
        ? response.sessionId
        : undefined,
    pendingCapability:
      response.status === "needs_input" || response.status === "needs_approval"
        ? response.capability
        : undefined,
    plan: buildPlan(response),
    requiredFields: response.status === "needs_input" ? response.fields : [],
    approval:
      response.status === "needs_approval"
        ? {
            capability: response.capability,
            reason: response.reason
          }
        : undefined,
    results,
    error: response.status === "failed" ? response.error : undefined,
    trace: response.trace.map((event) => ({ ...event }))
  };
};
