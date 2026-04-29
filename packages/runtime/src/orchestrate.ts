import type { CaporaRuntime } from "./capora-runtime.js";
import type { OrchestrateRequest, ResumeRequest } from "./dto/orchestrate-request.js";
import type { OrchestrationResponse } from "./dto/orchestrate-response.js";

export const orchestrate = async (
  runtime: CaporaRuntime,
  request: OrchestrateRequest
): Promise<OrchestrationResponse> => runtime.orchestrate(request);

export const resume = async (
  runtime: CaporaRuntime,
  request: ResumeRequest
): Promise<OrchestrationResponse> => runtime.resume(request);
