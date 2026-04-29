import {
  workflowPlanSchema,
  type CapabilityDefinition,
  type WorkflowPlan
} from "@capora/core";

const MAX_WORKFLOW_PLAN_STEPS = 100;

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
    if (!capabilityMap.has(step.capability)) {
      throw new Error(`Planner returned unknown capability "${step.capability}".`);
    }
  }

  return {
    goal,
    steps: parsedPlan.steps
  };
};
