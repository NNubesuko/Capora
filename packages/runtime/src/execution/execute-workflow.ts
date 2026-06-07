import type {
  ApprovalDecision,
  CapabilityContext,
  CapabilityDefinition,
  JsonLike
} from "@capora/core";
import { normalizeCapabilityContract } from "@capora/core";
import type { OrchestrationResponse } from "../dto/orchestrate-response.js";
import type { InputAliases } from "../input/input-aliases.js";
import type { WorkflowSessionStore } from "../session/session-store.js";
import type { WorkflowExecutionState } from "../state/workflow-execution-state.js";
import { buildEffectiveInput } from "../input/build-effective-input.js";
import { getMissingRequiredFields } from "../input/get-missing-required-fields.js";
import { persistPausedSession } from "../session/persist-paused-session.js";
import { setRecordValue } from "../shared/safe-record.js";
import { deleteSessionIfPresent } from "../session/delete-session-if-present.js";
import { failWorkflow } from "./fail-workflow.js";
import { pushStepProgressTrace, pushTrace } from "../trace/push-trace.js";

export const executeWorkflow = async (
  state: WorkflowExecutionState,
  capabilityMap: Map<string, CapabilityDefinition<any, any>>,
  sessionStore: WorkflowSessionStore,
  inputAliases: InputAliases | undefined,
  approvalDecision?: ApprovalDecision
): Promise<OrchestrationResponse> => {
  let pendingApprovalDecision = approvalDecision;

  for (let stepIndex = state.pendingStepIndex; stepIndex < state.plan.steps.length; stepIndex += 1) {
    const step = state.plan.steps[stepIndex];
    pushStepProgressTrace(state.trace, step, stepIndex);

    const capability = capabilityMap.get(step.capability);
    if (!capability) {
      const effectiveInput = buildEffectiveInput(
        step.capability,
        state.providedInput,
        state.memory,
        inputAliases
      );

      return failWorkflow(state, sessionStore, {
        error: "Capability not found",
        capability: step.capability,
        step,
        stepIndex,
        input: effectiveInput
      });
    }

    const effectiveInput = buildEffectiveInput(
      capability.name,
      state.providedInput,
      state.memory,
      inputAliases
    );

    const missingFields = getMissingRequiredFields(capability, effectiveInput);
    if (missingFields.length > 0) {
      pushTrace(state.trace, {
        type: "step.awaiting_input",
        message: `Waiting for required input for ${capability.name}`,
        capability: capability.name,
        stepIndex,
        fields: missingFields.map((field) => field.field)
      });

      const sessionId = await persistPausedSession(
        sessionStore,
        state,
        "awaiting_input",
        stepIndex
      );

      return {
        status: "needs_input",
        sessionId,
        plan: state.plan,
        pendingStep: step,
        capability: capability.name,
        fields: missingFields,
        trace: state.trace
      };
    }

    const normalizedCapability = normalizeCapabilityContract(capability);

    if (normalizedCapability.approval.required) {
      if (!pendingApprovalDecision) {
        const reason =
          normalizedCapability.approval.reason ??
          `${capability.name} requires approval before execution.`;

        pushTrace(state.trace, {
          type: "step.awaiting_approval",
          message: `Waiting for approval before ${capability.name}`,
          capability: capability.name,
          stepIndex,
          reason
        });

        const sessionId = await persistPausedSession(
          sessionStore,
          state,
          "awaiting_approval",
          stepIndex
        );

        return {
          status: "needs_approval",
          sessionId,
          plan: state.plan,
          pendingStep: step,
          capability: capability.name,
          reason,
          trace: state.trace
        };
      }

      if (!pendingApprovalDecision.approved) {
        const error = "Approval was rejected.";

        pushTrace(state.trace, {
          type: "step.rejected",
          message: `Rejected ${capability.name}`,
          capability: capability.name,
          stepIndex,
          rejectedBy: pendingApprovalDecision.approvedBy,
          reason: pendingApprovalDecision.reason,
          comment: pendingApprovalDecision.comment
        });

        pushTrace(state.trace, {
          type: "workflow.failed",
          message: `Workflow failed during ${capability.name}: ${error}`,
          error,
          capability: capability.name,
          stepIndex
        });

        await deleteSessionIfPresent(sessionStore, state.sessionId);

        return {
          status: "failed",
          traceId: state.traceId,
          plan: state.plan,
          results: state.results,
          error,
          failedStep: step,
          capability: capability.name,
          trace: state.trace
        };
      }

      pushTrace(state.trace, {
        type: "step.approved",
        message: `Approved ${capability.name}`,
        capability: capability.name,
        stepIndex,
        approvedBy: pendingApprovalDecision.approvedBy,
        reason: pendingApprovalDecision.reason,
        comment: pendingApprovalDecision.comment
      });

      pendingApprovalDecision = undefined;
    }

    try {
      pushTrace(state.trace, {
        type: "step.executed",
        message: `Executing ${capability.name}`,
        capability: capability.name,
        stepIndex
      });

      const parsedInput = capability.inputSchema.parse(effectiveInput);
      const context: CapabilityContext = {
        now: new Date(),
        memory: state.memory,
        traceId: state.traceId
      };

      const output = (await capability.run(parsedInput, context)) as JsonLike;
      setRecordValue(state.memory, capability.name, output);

      state.results.push({
        capability: capability.name,
        status: "success",
        input: effectiveInput,
        output
      });

      pushTrace(state.trace, {
        type: "step.completed",
        message: `Completed ${capability.name}`,
        capability: capability.name,
        stepIndex
      });
    } catch (error) {
      return failWorkflow(state, sessionStore, {
        error,
        capability: capability.name,
        step,
        stepIndex,
        input: effectiveInput
      });
    }
  }

  pushTrace(state.trace, {
    type: "workflow.completed",
    message: "Workflow execution completed",
    resultCount: state.results.length
  });

  if (state.sessionId) {
    await sessionStore.delete(state.sessionId);
  }

  return {
    status: "completed",
    traceId: state.traceId,
    plan: state.plan,
    results: state.results,
    trace: state.trace
  };
};
