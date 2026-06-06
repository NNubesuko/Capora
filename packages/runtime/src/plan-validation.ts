import {
  normalizeCapabilityContract,
  workflowPlanSchema,
  type CapabilityDefinition,
  type WorkflowPlan
} from "@capora/core";
import { defaultPlanSafetyPolicy } from "./safety/default-safety-policy.js";

const MAX_WORKFLOW_PLAN_STEPS = 100;

const approvalRequiredSideEffects = new Set(
  defaultPlanSafetyPolicy.approvalRequiredSideEffects
);

export const validateWorkflowPlan = (
  plan: unknown,
  goal: string,
  capabilityMap: Map<string, CapabilityDefinition<any, any>>
): WorkflowPlan => {
  const parsedPlan = workflowPlanSchema.parse(plan);

  if (parsedPlan.steps.length > MAX_WORKFLOW_PLAN_STEPS) {
    throw new Error(
      `Workflow plan exceeds the maximum supported step count of ${MAX_WORKFLOW_PLAN_STEPS}.`
    );
  }

  for (const step of parsedPlan.steps) {
    const capability = capabilityMap.get(step.capability);

    if (!capability) {
      throw new Error(`Planner returned unknown capability "${step.capability}".`);
    }

    const normalizedCapability = normalizeCapabilityContract(capability);

    if (
      approvalRequiredSideEffects.has(normalizedCapability.sideEffect) &&
      !normalizedCapability.approval.required
    ) {
      throw new Error(
        `Capability "${capability.name}" has sideEffect "${normalizedCapability.sideEffect}" but approval.required is not true.`
      );
    }
  }

  return {
    goal,
    steps: parsedPlan.steps
  };
};
