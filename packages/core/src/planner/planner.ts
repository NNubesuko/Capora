import type { WorkflowPlan } from "../plan/workflow-plan.js";

export interface PlannerCapability {
  name: string;
  description: string;
}

export interface PlannerRequest {
  goal: string;
  capabilities: PlannerCapability[];
}

export interface Planner {
  createPlan: (request: PlannerRequest) => Promise<WorkflowPlan> | WorkflowPlan;
}
