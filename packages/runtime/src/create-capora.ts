import type {
  ApprovalDecision,
  CapabilityDefinition,
  PlannerCapability,
  TraceEvent,
  WorkflowPlan
} from "@capora/core";
import type { CaporaRuntime, CreateCaporaOptions } from "./capora-runtime.js";
import type {
  ApprovalDecisionInput,
  OrchestrateRequest,
  ResumeRequest
} from "./dto/orchestrate-request.js";
import type { OrchestrationResponse } from "./dto/orchestrate-response.js";
import { executeWorkflow } from "./execution/execute-workflow.js";
import { validateWorkflowPlan } from "./plan-validation.js";
import { RuleBasedPlanner } from "./rule-based-planner.js";
import {
  InMemoryWorkflowSessionStore,
  type WorkflowSessionStore
} from "./session/session-store.js";
import { createTraceId } from "./shared/create-identifier.js";
import { toErrorMessage } from "./shared/to-error-message.js";
import { deleteSessionIfPresent } from "./session/delete-session-if-present.js";
import { pushTrace } from "./trace/push-trace.js";

const createCapabilityMap = (
  capabilities: CapabilityDefinition<any, any>[]
): Map<string, CapabilityDefinition<any, any>> =>
  new Map(capabilities.map((capability) => [capability.name, capability]));

const createPlannerCapabilities = (
  capabilities: CapabilityDefinition<any, any>[]
): PlannerCapability[] =>
  capabilities.map((capability) => ({
    name: capability.name,
    description: capability.description
  }));

const hasOwn = (value: object, key: PropertyKey): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const createApprovalDecision = (
  approval: ApprovalDecisionInput
): ApprovalDecision => ({
  approved: approval.approved,
  approvedBy: approval.approvedBy,
  reason: approval.reason,
  comment: approval.comment,
  decidedAt: new Date().toISOString()
});

const createLegacyApprovalDecision = (approved: boolean): ApprovalDecision => ({
  approved,
  decidedAt: new Date().toISOString()
});

const resolveResumeApprovalDecision = (
  request: ResumeRequest
): ApprovalDecision | undefined => {
  if (request.approval) {
    return createApprovalDecision(request.approval);
  }

  if (hasOwn(request, "approved")) {
    return createLegacyApprovalDecision(request.approved === true);
  }

  return undefined;
};

const resolveOrchestrateApprovalDecision = (
  request: OrchestrateRequest
): ApprovalDecision | undefined =>
  request.approved === true ? createLegacyApprovalDecision(true) : undefined;

const createPlanningFailureResponse = (
  request: OrchestrateRequest,
  trace: TraceEvent[],
  traceId: string,
  error: unknown
): OrchestrationResponse => {
  const errorMessage = toErrorMessage(error);

  pushTrace(trace, {
    type: "workflow.failed",
    message: `Workflow planning failed: ${errorMessage}`,
    error: errorMessage
  });

  return {
    status: "failed",
    traceId,
    plan: {
      goal: request.goal,
      steps: []
    },
    results: [],
    error: errorMessage,
    trace
  };
};

const resumeWorkflow = async (
  request: ResumeRequest,
  capabilityMap: Map<string, CapabilityDefinition<any, any>>,
  sessionStore: WorkflowSessionStore,
  options: CreateCaporaOptions
): Promise<OrchestrationResponse> => {
  const session = await sessionStore.get(request.sessionId);

  if (!session) {
    throw new Error(`Workflow session "${request.sessionId}" was not found.`);
  }

  let plan: WorkflowPlan;

  try {
    plan = validateWorkflowPlan(
      session.plan,
      session.goal,
      capabilityMap
    );
  } catch (error) {
    const trace = [...session.trace];
    const errorMessage = toErrorMessage(error);

    pushTrace(trace, {
      type: "workflow.failed",
      message: `Stored workflow plan validation failed: ${errorMessage}`,
      error: errorMessage
    });

    await deleteSessionIfPresent(sessionStore, session.id);

    return {
      status: "failed",
      traceId: session.traceId,
      plan: {
        goal: session.goal,
        steps: []
      },
      results: [...session.results],
      error: errorMessage,
      trace
    };
  }

  return executeWorkflow(
    {
      sessionId: session.id,
      createdAt: session.createdAt,
      goal: session.goal,
      plan,
      providedInput: {
        ...session.providedInput,
        ...(request.providedInput ?? {})
      },
      memory: { ...session.memory },
      results: [...session.results],
      trace: [...session.trace],
      traceId: session.traceId,
      pendingStepIndex: session.pendingStepIndex
    },
    capabilityMap,
    sessionStore,
    options.inputAliases,
    session.status === "awaiting_approval"
      ? resolveResumeApprovalDecision(request)
      : undefined
  );
};

export const createCapora = (options: CreateCaporaOptions): CaporaRuntime => {
  const capabilityMap = createCapabilityMap(options.capabilities);
  const planner = options.planner ?? new RuleBasedPlanner();
  const sessionStore = options.sessionStore ?? new InMemoryWorkflowSessionStore();
  const plannerCapabilities = createPlannerCapabilities(options.capabilities);

  return {
    orchestrate: async (request: OrchestrateRequest): Promise<OrchestrationResponse> => {
      const trace: TraceEvent[] = [];
      const providedInput = request.providedInput ?? {};
      const traceId = createTraceId();

      pushTrace(trace, {
        type: "goal.received",
        message: "Received user goal",
        goal: request.goal
      });

      let plan: WorkflowPlan;

      try {
        const proposedPlan = await planner.createPlan({
          goal: request.goal,
          capabilities: plannerCapabilities
        });

        plan = validateWorkflowPlan(
          proposedPlan,
          request.goal,
          capabilityMap
        );
      } catch (error) {
        return createPlanningFailureResponse(request, trace, traceId, error);
      }

      pushTrace(trace, {
        type: "plan.created",
        message: "Generated workflow plan",
        stepCount: plan.steps.length,
        capabilities: plan.steps.map((step) => step.capability)
      });

      return executeWorkflow(
        {
          goal: request.goal,
          plan,
          providedInput,
          memory: {},
          results: [],
          trace,
          traceId,
          pendingStepIndex: 0
        },
        capabilityMap,
        sessionStore,
        options.inputAliases,
        resolveOrchestrateApprovalDecision(request)
      );
    },
    resume: (request: ResumeRequest): Promise<OrchestrationResponse> =>
      resumeWorkflow(request, capabilityMap, sessionStore, options)
  };
};
