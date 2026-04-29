import { z } from "zod";

export const workflowPlanStepSchema = z.object({
  capability: z.string().min(1),
  reason: z.string().min(1)
});

export const workflowPlanSchema = z.object({
  goal: z.string().min(1),
  steps: z.array(workflowPlanStepSchema)
});

export type WorkflowPlanStep = z.infer<typeof workflowPlanStepSchema>;
export type WorkflowPlan = z.infer<typeof workflowPlanSchema>;
