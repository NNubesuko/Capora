import type { CapabilityDefinition, Planner } from "@capora/core";
import type { OrchestrateRequest, ResumeRequest } from "./dto/orchestrate-request.js";
import type { OrchestrationResponse } from "./dto/orchestrate-response.js";
import type { InputAliases } from "./input/input-aliases.js";
import type { WorkflowSessionStore } from "./session/session-store.js";

export interface CaporaRuntime {
  orchestrate: (request: OrchestrateRequest) => Promise<OrchestrationResponse>;
  resume: (request: ResumeRequest) => Promise<OrchestrationResponse>;
}

export interface CreateCaporaOptions {
  capabilities: CapabilityDefinition<any, any>[];
  inputAliases?: InputAliases;
  planner?: Planner;
  sessionStore?: WorkflowSessionStore;
}
