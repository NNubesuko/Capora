import {
  normalizeCapabilityContract,
  type AuditActor,
  type AuditStepTrace,
  type AuditTrace,
  type CapabilityDefinition,
  type CapabilityExecutionRecord,
  type TraceEvent
} from "@capora/core";
import type { OrchestrationResponse } from "../dto/orchestrate-response.js";
import { stableJsonHash } from "../shared/stable-hash.js";

export type BuildAuditTraceOptions = {
  response: OrchestrationResponse;
  capabilities: CapabilityDefinition<any, any>[];
  actor?: AuditActor;
};

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const createCapabilityMap = (
  capabilities: CapabilityDefinition<any, any>[]
): Map<string, CapabilityDefinition<any, any>> =>
  new Map(capabilities.map((capability) => [capability.name, capability]));

const createBaseStepTrace = (
  stepIndex: number,
  capabilityName: string,
  capabilityMap: Map<string, CapabilityDefinition<any, any>>
): AuditStepTrace => {
  const capability = capabilityMap.get(capabilityName);

  if (!capability) {
    return {
      stepIndex,
      capability: capabilityName,
      capabilityVersion: "unknown",
      sideEffect: "unknown",
      approvalRequired: false,
      inputRecorded: false,
      outputRecorded: false,
      status: "pending"
    };
  }

  const normalizedCapability = normalizeCapabilityContract(capability);

  return {
    stepIndex,
    capability: capabilityName,
    capabilityVersion: normalizedCapability.version,
    sideEffect: normalizedCapability.sideEffect,
    approvalRequired: normalizedCapability.approval.required,
    inputRecorded: normalizedCapability.audit.recordInput,
    outputRecorded: normalizedCapability.audit.recordOutput,
    status: "pending"
  };
};

const getEventStepIndex = (event: TraceEvent): number | undefined =>
  "stepIndex" in event ? event.stepIndex : undefined;

const applyTraceEventToStep = (
  step: AuditStepTrace,
  event: TraceEvent
): void => {
  switch (event.type) {
    case "step.entered":
      step.startedAt = event.at;
      break;
    case "step.awaiting_input":
      step.status = "awaiting_input";
      break;
    case "step.awaiting_approval":
      step.status = "awaiting_approval";
      break;
    case "step.approved":
      step.status = "approved";
      step.approval = {
        approved: true,
        approvedBy: event.approvedBy,
        reason: event.reason,
        comment: event.comment,
        decidedAt: event.at
      };
      break;
    case "step.rejected":
      step.status = "rejected";
      step.endedAt = event.at;
      step.approval = {
        approved: false,
        approvedBy: event.rejectedBy,
        reason: event.reason,
        comment: event.comment,
        decidedAt: event.at
      };
      break;
    case "step.executed":
      step.status = "executed";
      break;
    case "step.completed":
      step.status = "completed";
      step.endedAt = event.at;
      break;
    case "step.failed":
      step.status = "failed";
      step.endedAt = event.at;
      step.error = event.error;
      break;
    case "workflow.failed":
      step.status = "failed";
      step.endedAt = step.endedAt ?? event.at;
      step.error = step.error ?? event.error;
      break;
    default:
      break;
  }
};

const mapResultsToSteps = (
  steps: { capability: string }[],
  results: CapabilityExecutionRecord[]
): Array<CapabilityExecutionRecord | undefined> => {
  let resultSearchIndex = 0;

  return steps.map((step) => {
    const resultIndex = results.findIndex(
      (result, index) =>
        index >= resultSearchIndex && result.capability === step.capability
    );

    if (resultIndex === -1) {
      return undefined;
    }

    resultSearchIndex = resultIndex + 1;

    return results[resultIndex];
  });
};

const buildFromOptions = (options: BuildAuditTraceOptions): AuditTrace => {
  const capabilityMap = createCapabilityMap(options.capabilities);
  const steps = options.response.plan.steps.map((step, stepIndex) =>
    createBaseStepTrace(stepIndex, step.capability, capabilityMap)
  );

  for (const event of options.response.trace) {
    const stepIndex = getEventStepIndex(event);

    if (stepIndex === undefined) {
      continue;
    }

    const step = steps[stepIndex];

    if (!step) {
      continue;
    }

    applyTraceEventToStep(step, event);
  }

  const results = "results" in options.response ? options.response.results : [];
  const resultsByStep = mapResultsToSteps(options.response.plan.steps, results);

  for (const [stepIndex, step] of steps.entries()) {
    const result = resultsByStep[stepIndex];

    if (!result) {
      continue;
    }

    if (step.inputRecorded) {
      step.inputHash = stableJsonHash(result.input);
    }

    if (step.outputRecorded && hasOwn(result, "output")) {
      step.outputHash = stableJsonHash(result.output);
    }
  }

  const createdAt =
    options.response.trace[0]?.at ?? new Date().toISOString();

  return {
    version: "1.0",
    traceId: options.response.traceId,
    goal: options.response.plan.goal,
    status: options.response.status,
    actor: options.actor,
    plan: {
      stepCount: options.response.plan.steps.length,
      capabilities: options.response.plan.steps.map((step) => step.capability)
    },
    steps,
    rawTrace: options.response.trace,
    createdAt,
    exportedAt: new Date().toISOString()
  };
};

export function buildAuditTrace(options: BuildAuditTraceOptions): AuditTrace;
export function buildAuditTrace(
  response: OrchestrationResponse,
  capabilities: CapabilityDefinition<any, any>[],
  actor?: AuditActor
): AuditTrace;
export function buildAuditTrace(
  optionsOrResponse: BuildAuditTraceOptions | OrchestrationResponse,
  capabilities?: CapabilityDefinition<any, any>[],
  actor?: AuditActor
): AuditTrace {
  if ("response" in optionsOrResponse) {
    return buildFromOptions(optionsOrResponse);
  }

  return buildFromOptions({
    response: optionsOrResponse,
    capabilities: capabilities ?? [],
    actor
  });
}
