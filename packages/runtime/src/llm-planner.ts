import { z } from "zod";
import {
  workflowPlanStepSchema,
  type Planner,
  type PlannerCapability,
  type PlannerRequest,
  type WorkflowPlan
} from "@capora/core";
import type {
  StructuredOutputJsonSchema,
  StructuredOutputModel
} from "./structured-output-model.js";

const llmPlannerResponseSchema = z.object({
  steps: z.array(workflowPlanStepSchema)
});

const defaultSystemPrompt = [
  "You are the planning module for Capora, an orchestration runtime.",
  "Your job is to propose the smallest ordered workflow plan that can satisfy the user goal.",
  "Use only the provided capabilities and keep their names exact.",
  "Do not invent capabilities, ask follow-up questions, request approval, or execute anything.",
  "The runtime will validate and execute the returned plan separately.",
  "Later capabilities may depend on IDs or entities produced by earlier capabilities.",
  "Prefer plans that derive required inputs from available capabilities instead of asking the user for internal IDs.",
  "When a capability creates a draft or record needed by a later step, include that creation step first."
].join(" ");

const formatCapabilities = (capabilities: PlannerCapability[]): string =>
  capabilities
    .map((capability) => `- ${capability.name}: ${capability.description}`)
    .join("\n");

const buildUserPrompt = (request: PlannerRequest): string => [
  "User goal:",
  request.goal,
  "",
  "Available capabilities:",
  formatCapabilities(request.capabilities),
  "",
  "Return only the steps needed to satisfy the goal, in execution order."
].join("\n");

export interface LLMPlannerOptions {
  model: StructuredOutputModel;
  systemPrompt?: string;
}

export class LLMPlanner implements Planner {
  private readonly model: StructuredOutputModel;
  private readonly systemPrompt: string;

  constructor(options: LLMPlannerOptions) {
    this.model = options.model;
    this.systemPrompt = options.systemPrompt ?? defaultSystemPrompt;
  }

  async createPlan(request: PlannerRequest): Promise<WorkflowPlan> {
    const result = await this.model.generateObject({
      systemPrompt: this.systemPrompt,
      userPrompt: buildUserPrompt(request),
      schemaName: "capora_workflow_plan",
      schema: plannerResponseJsonSchema
    });
    const response = llmPlannerResponseSchema.parse(result);

    return {
      goal: request.goal,
      steps: response.steps
    };
  }
}

const plannerResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["steps"],
  properties: {
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["capability", "reason"],
        properties: {
          capability: {
            type: "string",
            description: "Exact capability name from the provided list."
          },
          reason: {
            type: "string",
            description: "Short explanation for why the step is needed."
          }
        }
      }
    }
  }
} as const satisfies StructuredOutputJsonSchema;
