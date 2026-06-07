import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  BedrockConverseStructuredOutputModel,
  buildAuditTrace,
  buildReproducibilityPack,
  createCaporaFromEnvironment,
  createCapora,
  createPlannerFromEnvironment,
  createStructuredOutputModelFromEnvironment,
  InMemoryWorkflowSessionStore,
  LLMPlanner,
  OpenAIResponsesPlannerModel,
  OpenAIResponsesStructuredOutputModel,
  replayAuditTrace,
  replayReproducibilityPack,
  resolvePlannerFromEnvironment,
  RuleBasedPlanner
} from "../dist/index.js";
import { buildEffectiveInput } from "../dist/input/build-effective-input.js";
import {
  createIdentifier,
  createSessionId,
  createTraceId
} from "../dist/shared/create-identifier.js";
import {
  createUuidV7,
  isUuid,
  isUuidV7
} from "../dist/shared/uuid.js";
import { normalizeCapabilityContract } from "../../core/dist/index.js";

const createPlanner = (steps) => ({
  createPlan: ({ goal }) => ({
    goal,
    steps
  })
});

const createCapability = ({
  name,
  description = name,
  inputSchema,
  requiresApproval,
  run,
  ...contract
}) => ({
  name,
  description,
  inputSchema,
  ...(requiresApproval === undefined ? {} : { requiresApproval }),
  run,
  ...contract
});

const createRuntime = ({
  capabilities,
  steps,
  inputAliases,
  sessionStore = new InMemoryWorkflowSessionStore()
}) => ({
  runtime: createCapora({
    capabilities,
    planner: createPlanner(steps),
    inputAliases,
    sessionStore
  }),
  sessionStore
});

const createApprovalRequiredRuntime = () => {
  let executionCount = 0;

  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: true,
      reason: "Sending an invoice is an external side effect."
    },
    run: ({ invoiceId }) => {
      executionCount += 1;

      return {
        invoiceId,
        status: "sent"
      };
    }
  });

  const sessionStore = new InMemoryWorkflowSessionStore();
  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }],
    sessionStore
  });

  return {
    runtime,
    sessionStore,
    getExecutionCount: () => executionCount
  };
};

const invoicePlannerCapabilities = [
  {
    name: "customer.create",
    description:
      "Create a new customer record and return the customerId needed for later invoice operations."
  },
  {
    name: "customer.find",
    description:
      "Find an existing customer record by email and return the customerId needed for later invoice operations. Use this only for customers that already exist."
  },
  {
    name: "invoice.createDraft",
    description:
      "Create a new invoice draft for an existing customer/customerId. Use this before invoice.send when the user wants to create and send an invoice."
  },
  {
    name: "invoice.send",
    description:
      "Send an existing invoice draft. Requires an invoiceId from a previously created draft and does not create invoices by itself."
  }
];

const createOpenAIFetchResponse = (payload, ok = true) =>
  async (_url, init) => {
    return {
      ok,
      json: async () => payload,
      requestBody: init?.body
    };
  };

test("normalizes capabilities that do not specify contract metadata", () => {
  const capability = {
    name: "customer.find",
    description: "Find a customer",
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    run: ({ customerEmail }) => ({
      customerEmail
    })
  };

  const normalized = normalizeCapabilityContract(capability);

  assert.equal(normalized.version, "1.0.0");
  assert.equal(normalized.sideEffect, "none");
  assert.deepEqual(normalized.approval, {
    required: false
  });
  assert.deepEqual(normalized.audit, {
    recordInput: true,
    recordOutput: true
  });
  assert.deepEqual(normalized.idempotency, {
    required: false
  });
});

test("normalizes legacy requiresApproval into approval.required", () => {
  const capability = {
    name: "invoice.send",
    description: "Send an invoice",
    inputSchema: z.object({}),
    requiresApproval: true,
    run: () => ({
      status: "sent"
    })
  };

  const normalized = normalizeCapabilityContract(capability);

  assert.deepEqual(normalized.approval, {
    required: true
  });
});

test("uses explicit approval policy before legacy requiresApproval", () => {
  const capability = {
    name: "invoice.preview",
    description: "Preview an invoice",
    inputSchema: z.object({}),
    requiresApproval: true,
    approval: {
      required: false
    },
    run: () => ({
      status: "previewed"
    })
  };

  const normalized = normalizeCapabilityContract(capability);

  assert.deepEqual(normalized.approval, {
    required: false
  });
});

test("RuleBasedPlanner matches the representative invoice evaluation cases", async () => {
  const planner = new RuleBasedPlanner();
  const cases = [
    {
      goal: "Send the April design retainer invoice to Alice.",
      expected: ["customer.find", "invoice.createDraft", "invoice.send"]
    },
    {
      goal: "Create a new customer for Alice and send the April design retainer invoice.",
      expected: ["customer.create", "invoice.createDraft", "invoice.send"]
    },
    {
      goal: "Register Alice as a new customer.",
      expected: ["customer.create"]
    },
    {
      goal: "Create a draft invoice for Alice.",
      expected: ["customer.find", "invoice.createDraft"]
    },
    {
      goal: "Send the existing invoice to Alice.",
      expected: ["customer.find", "invoice.send"]
    },
    {
      goal: "Find Alice's existing customer record and send the invoice.",
      expected: ["customer.find", "invoice.createDraft", "invoice.send"]
    },
    {
      goal: "Send an invoice to an already registered customer Alice.",
      expected: ["customer.find", "invoice.createDraft", "invoice.send"]
    },
    {
      goal: "Find Alice's customer record.",
      expected: ["customer.find"]
    },
    {
      goal: "Send an invoice draft to Alice after it has already been created.",
      expected: ["customer.find", "invoice.send"]
    }
  ];

  for (const testCase of cases) {
    const plan = await planner.createPlan({
      goal: testCase.goal,
      capabilities: invoicePlannerCapabilities
    });

    assert.deepEqual(
      plan.steps.map((step) => step.capability),
      testCase.expected
    );
  }
});

test("buildEffectiveInput treats special alias targets as data keys", () => {
  const effectiveInput = buildEffectiveInput(
    "invoice.send",
    {
      dangerous: {
        leaked: true
      }
    },
    {},
    {
      "invoice.send": {
        ["__proto__"]: "dangerous"
      }
    }
  );

  assert.equal(Object.getPrototypeOf(effectiveInput), Object.prototype);
  assert.equal(effectiveInput.leaked, undefined);
  assert.equal(
    Object.prototype.hasOwnProperty.call(effectiveInput, "__proto__"),
    true
  );
  assert.deepEqual(effectiveInput["__proto__"], {
    leaked: true
  });
});

test("createUuidV7 delegates to the uuid package v7 generator", () => {
  const first = createUuidV7({
    msecs: 0,
    random: new Uint8Array(16)
  });
  const second = createUuidV7({
    msecs: 0,
    random: new Uint8Array(16),
    seq: 1
  });

  assert.equal(first, "00000000-0000-7000-8000-000000000000");
  assert.equal(second, "00000000-0000-7000-8000-040000000000");
  assert.equal(isUuid(first), true);
  assert.equal(isUuidV7(first), true);
  assert.equal(first < second, true);
});

test("createIdentifier emits UUID v7 identifiers", () => {
  const sessionId = createIdentifier("session");
  const traceId = createTraceId();

  assert.match(sessionId, /^session_/);
  assert.match(traceId, /^trace_/);
  assert.equal(isUuidV7(sessionId.slice("session_".length)), true);
  assert.equal(isUuidV7(traceId.slice("trace_".length)), true);
});

test("intent-specific identifier helpers emit prefixed UUID v7 identifiers", () => {
  const sessionId = createSessionId();
  const traceId = createTraceId();

  assert.match(sessionId, /^session_/);
  assert.match(traceId, /^trace_/);
  assert.equal(isUuid(sessionId.slice("session_".length)), true);
  assert.equal(isUuidV7(sessionId.slice("session_".length)), true);
  assert.equal(isUuidV7(traceId.slice("trace_".length)), true);
});

test("propagates effective input from previous step outputs", async () => {
  const customerFind = createCapability({
    name: "customer.find",
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    run: ({ customerEmail }) => ({
      customerId: "cust_123",
      customerEmail
    })
  });

  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    inputSchema: z.object({
      customerId: z.string().min(3),
      amount: z.number().positive()
    }),
    run: ({ customerId, amount }) => ({
      invoiceId: "inv_123",
      customerId,
      amount
    })
  });

  const { runtime } = createRuntime({
    capabilities: [customerFind, invoiceCreateDraft],
    steps: [
      { capability: "customer.find", reason: "Find the customer first" },
      { capability: "invoice.createDraft", reason: "Create the invoice draft" }
    ]
  });

  const response = await runtime.orchestrate({
    goal: "Create an invoice draft",
    providedInput: {
      customerEmail: "alice@example.com",
      amount: 2500
    }
  });

  assert.equal(response.status, "completed");

  const draftResult = response.results.find(
    (result) => result.capability === "invoice.createDraft"
  );

  assert.ok(draftResult);
  assert.equal(draftResult.input.customerId, "cust_123");
  assert.deepEqual(
    response.trace.map((event) => event.type),
    [
      "goal.received",
      "plan.created",
      "step.entered",
      "step.executed",
      "step.completed",
      "step.entered",
      "step.executed",
      "step.completed",
      "workflow.completed"
    ]
  );

  const completedEvent = response.trace[response.trace.length - 1];
  assert.equal(completedEvent.resultCount, 2);
});

test("detects missing required input and persists the paused session", async () => {
  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    inputSchema: z.object({
      customerEmail: z.string().email(),
      amount: z.number().positive(),
      currency: z.string().min(3).max(3)
    }),
    run: ({ customerEmail, amount, currency }) => ({
      invoiceId: "inv_123",
      customerEmail,
      amount,
      currency
    })
  });

  const sessionStore = new InMemoryWorkflowSessionStore();
  const { runtime } = createRuntime({
    capabilities: [invoiceCreateDraft],
    steps: [{ capability: "invoice.createDraft", reason: "Create the invoice draft" }],
    sessionStore
  });

  const response = await runtime.orchestrate({
    goal: "Create an invoice draft",
    providedInput: {
      customerEmail: "alice@example.com"
    }
  });

  assert.equal(response.status, "needs_input");
  assert.deepEqual(
    response.fields.map((field) => field.field),
    ["amount", "currency"]
  );

  const traceEvent = response.trace[response.trace.length - 1];
  assert.equal(traceEvent.type, "step.awaiting_input");
  assert.equal(traceEvent.capability, "invoice.createDraft");
  assert.equal(traceEvent.stepIndex, 0);
  assert.deepEqual(traceEvent.fields, ["amount", "currency"]);
  assert.ok(await sessionStore.get(response.sessionId));
});

test("pauses for approval before executing approval-required steps", async () => {
  let executionCount = 0;

  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3),
      customerEmail: z.string().email()
    }),
    sideEffect: "external_send",
    requiresApproval: true,
    run: ({ invoiceId, customerEmail }) => {
      executionCount += 1;

      return {
        invoiceId,
        customerEmail,
        status: "sent"
      };
    }
  });

  const sessionStore = new InMemoryWorkflowSessionStore();
  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }],
    sessionStore
  });

  const response = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123",
      customerEmail: "alice@example.com"
    }
  });

  assert.equal(response.status, "needs_approval");
  assert.equal(response.reason, "invoice.send requires approval before execution.");
  assert.equal(executionCount, 0);

  const traceEvent = response.trace[response.trace.length - 1];
  assert.equal(traceEvent.type, "step.awaiting_approval");
  assert.equal(traceEvent.capability, "invoice.send");
  assert.equal(traceEvent.stepIndex, 0);
  assert.equal(traceEvent.reason, "invoice.send requires approval before execution.");
  assert.ok(await sessionStore.get(response.sessionId));
});

test("pauses for approval when approval.required is true", async () => {
  let executionCount = 0;

  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3),
      customerEmail: z.string().email()
    }),
    sideEffect: "external_send",
    approval: {
      required: true,
      reason: "Sending an invoice is an external side effect."
    },
    run: ({ invoiceId, customerEmail }) => {
      executionCount += 1;

      return {
        invoiceId,
        customerEmail,
        status: "sent"
      };
    }
  });

  const sessionStore = new InMemoryWorkflowSessionStore();
  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }],
    sessionStore
  });

  const response = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123",
      customerEmail: "alice@example.com"
    }
  });

  assert.equal(response.status, "needs_approval");
  assert.equal(response.reason, "Sending an invoice is an external side effect.");
  assert.equal(executionCount, 0);

  const traceEvent = response.trace[response.trace.length - 1];
  assert.equal(traceEvent.type, "step.awaiting_approval");
  assert.equal(traceEvent.capability, "invoice.send");
  assert.equal(traceEvent.stepIndex, 0);
  assert.equal(traceEvent.reason, "Sending an invoice is an external side effect.");
  assert.ok(await sessionStore.get(response.sessionId));
});

test("legacy approved resumes approval-required workflows", async () => {
  const { runtime, sessionStore, getExecutionCount } = createApprovalRequiredRuntime();

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  assert.equal(firstResponse.status, "needs_approval");

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approved: true
  });

  assert.equal(response.status, "completed");
  assert.equal(getExecutionCount(), 1);
  assert.equal(await sessionStore.get(firstResponse.sessionId), undefined);
});

test("approval object resumes workflows and records approval details", async () => {
  const { runtime, getExecutionCount } = createApprovalRequiredRuntime();

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approval: {
      approved: true,
      approvedBy: "user_123",
      comment: "Confirmed."
    }
  });

  assert.equal(response.status, "completed");
  assert.equal(getExecutionCount(), 1);

  const approvedEvent = response.trace.find(
    (event) => event.type === "step.approved"
  );
  assert.ok(approvedEvent);
  assert.equal(approvedEvent.capability, "invoice.send");
  assert.equal(approvedEvent.stepIndex, 0);
  assert.equal(approvedEvent.approvedBy, "user_123");
  assert.equal(approvedEvent.comment, "Confirmed.");
});

test("approval object takes priority over legacy approved", async () => {
  const { runtime, getExecutionCount } = createApprovalRequiredRuntime();

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approved: true,
    approval: {
      approved: false,
      approvedBy: "user_123"
    }
  });

  assert.equal(response.status, "failed");
  assert.equal(response.error, "Approval was rejected.");
  assert.equal(getExecutionCount(), 0);

  const rejectedEvent = response.trace.find(
    (event) => event.type === "step.rejected"
  );
  assert.ok(rejectedEvent);
  assert.equal(rejectedEvent.rejectedBy, "user_123");
});

test("rejected approval ends the workflow without executing the capability", async () => {
  const { runtime, sessionStore, getExecutionCount } = createApprovalRequiredRuntime();

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approval: {
      approved: false,
      approvedBy: "user_123",
      reason: "Invoice amount is wrong."
    }
  });

  assert.equal(response.status, "failed");
  assert.equal(response.error, "Approval was rejected.");
  assert.equal(getExecutionCount(), 0);
  assert.equal(await sessionStore.get(firstResponse.sessionId), undefined);
  assert.deepEqual(
    response.trace.map((event) => event.type),
    [
      "goal.received",
      "plan.created",
      "step.entered",
      "step.awaiting_approval",
      "step.resumed",
      "step.rejected",
      "workflow.failed"
    ]
  );

  const rejectedEvent = response.trace[response.trace.length - 2];
  assert.equal(rejectedEvent.type, "step.rejected");
  assert.equal(rejectedEvent.capability, "invoice.send");
  assert.equal(rejectedEvent.stepIndex, 0);
  assert.equal(rejectedEvent.rejectedBy, "user_123");
  assert.equal(rejectedEvent.reason, "Invoice amount is wrong.");
});

test("builds audit trace for a completed approval workflow", async () => {
  const customerFind = createCapability({
    name: "customer.find",
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    audit: {
      recordInput: true,
      recordOutput: true
    },
    run: ({ customerEmail }) => ({
      customerId: "cust_123",
      customerEmail
    })
  });

  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    inputSchema: z.object({
      customerId: z.string().min(3),
      amount: z.number().positive()
    }),
    sideEffect: "write",
    audit: {
      recordInput: true,
      recordOutput: true
    },
    run: ({ customerId, amount }) => ({
      invoiceId: "inv_123",
      customerId,
      amount
    })
  });

  const invoiceSend = createCapability({
    name: "invoice.send",
    version: "1.0.0",
    inputSchema: z.object({
      invoiceId: z.string().min(3),
      customerEmail: z.string().email()
    }),
    sideEffect: "external_send",
    approval: {
      required: true,
      reason: "Sending an invoice is an external side effect."
    },
    audit: {
      recordInput: true,
      recordOutput: true
    },
    run: ({ invoiceId, customerEmail }) => ({
      invoiceId,
      customerEmail,
      status: "sent"
    })
  });

  const capabilities = [customerFind, invoiceCreateDraft, invoiceSend];
  const { runtime } = createRuntime({
    capabilities,
    steps: [
      { capability: "customer.find", reason: "Find the customer first" },
      { capability: "invoice.createDraft", reason: "Create the invoice draft" },
      { capability: "invoice.send", reason: "Send the invoice" }
    ]
  });

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      customerEmail: "alice@example.com",
      amount: 2500
    }
  });

  assert.equal(firstResponse.status, "needs_approval");

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approval: {
      approved: true,
      approvedBy: "user_123",
      comment: "Invoice details confirmed."
    }
  });

  assert.equal(response.status, "completed");

  const auditTrace = buildAuditTrace({
    response,
    capabilities,
    actor: {
      userId: "user_123",
      tenantId: "tenant_abc",
      roles: ["finance"]
    }
  });
  const sendStep = auditTrace.steps[2];

  assert.equal(auditTrace.version, "1.0");
  assert.equal(auditTrace.traceId, response.traceId);
  assert.equal(auditTrace.status, "completed");
  assert.equal(auditTrace.actor.userId, "user_123");
  assert.equal(auditTrace.plan.stepCount, 3);
  assert.deepEqual(auditTrace.plan.capabilities, [
    "customer.find",
    "invoice.createDraft",
    "invoice.send"
  ]);
  assert.equal(auditTrace.steps.length, 3);
  assert.equal(sendStep.capability, "invoice.send");
  assert.equal(sendStep.capabilityVersion, "1.0.0");
  assert.equal(sendStep.sideEffect, "external_send");
  assert.equal(sendStep.approvalRequired, true);
  assert.equal(sendStep.approval.approved, true);
  assert.equal(sendStep.approval.approvedBy, "user_123");
  assert.equal(sendStep.approval.comment, "Invoice details confirmed.");
  assert.ok(sendStep.approval.decidedAt);
  assert.equal(sendStep.status, "completed");
  assert.ok(sendStep.startedAt);
  assert.ok(sendStep.endedAt);
  assert.match(sendStep.inputHash, /^[a-f0-9]{64}$/);
  assert.match(sendStep.outputHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(auditTrace.rawTrace, response.trace);
  assert.ok(auditTrace.createdAt);
  assert.ok(auditTrace.exportedAt);
});

test("builds audit trace for a rejected approval workflow", async () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: true
    },
    run: ({ invoiceId }) => ({
      invoiceId,
      status: "sent"
    })
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }]
  });

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approval: {
      approved: false,
      approvedBy: "user_123",
      reason: "Invoice amount is wrong."
    }
  });

  const auditTrace = buildAuditTrace(response, [invoiceSend]);
  const sendStep = auditTrace.steps[0];

  assert.equal(auditTrace.status, "failed");
  assert.ok(["rejected", "failed"].includes(sendStep.status));
  assert.equal(sendStep.approval.approved, false);
  assert.equal(sendStep.approval.approvedBy, "user_123");
  assert.equal(sendStep.approval.reason, "Invoice amount is wrong.");
});

test("includes capability metadata in audit step summaries", async () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    version: "1.0.0",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: true
    },
    audit: {
      recordInput: false,
      recordOutput: true
    },
    run: ({ invoiceId }) => ({
      invoiceId,
      status: "sent"
    })
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }]
  });

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approved: true
  });

  const auditTrace = buildAuditTrace(response, [invoiceSend]);
  const sendStep = auditTrace.steps[0];

  assert.equal(sendStep.capability, "invoice.send");
  assert.equal(sendStep.capabilityVersion, "1.0.0");
  assert.equal(sendStep.sideEffect, "external_send");
  assert.equal(sendStep.approvalRequired, true);
  assert.equal(sendStep.inputRecorded, false);
  assert.equal(sendStep.outputRecorded, true);
});

test("audit trace records input and output hashes without raw values", async () => {
  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    inputSchema: z.object({
      customerEmail: z.string().email(),
      secretMemo: z.string()
    }),
    audit: {
      recordInput: true,
      recordOutput: true
    },
    run: ({ customerEmail }) => ({
      invoiceId: "inv_123",
      customerEmail,
      providerToken: "output-secret-token"
    })
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceCreateDraft],
    steps: [{ capability: "invoice.createDraft", reason: "Create the invoice draft" }]
  });

  const response = await runtime.orchestrate({
    goal: "Create an invoice draft",
    providedInput: {
      customerEmail: "alice@example.com",
      secretMemo: "input-secret-memo"
    }
  });

  const auditTrace = buildAuditTrace(response, [invoiceCreateDraft]);
  const step = auditTrace.steps[0];
  const serializedAuditTrace = JSON.stringify(auditTrace);

  assert.match(step.inputHash, /^[a-f0-9]{64}$/);
  assert.match(step.outputHash, /^[a-f0-9]{64}$/);
  assert.equal("input" in step, false);
  assert.equal("output" in step, false);
  assert.equal(serializedAuditTrace.includes("input-secret-memo"), false);
  assert.equal(serializedAuditTrace.includes("output-secret-token"), false);
});

test("builds reproducibility pack for a completed approval workflow", async () => {
  const customerFind = createCapability({
    name: "customer.find",
    description: "Find a customer",
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    run: ({ customerEmail }) => ({
      customerId: "cust_123",
      customerEmail
    })
  });

  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    description: "Create an invoice draft",
    inputSchema: z.object({
      customerId: z.string().min(3),
      amount: z.number().positive()
    }),
    sideEffect: "write",
    run: ({ customerId, amount }) => ({
      invoiceId: "inv_123",
      customerId,
      amount
    })
  });

  const invoiceSend = createCapability({
    name: "invoice.send",
    description: "Send an invoice",
    version: "1.0.0",
    inputSchema: z.object({
      invoiceId: z.string().min(3),
      customerEmail: z.string().email()
    }),
    sideEffect: "external_send",
    approval: {
      required: true,
      reason: "Sending an invoice is an external side effect."
    },
    run: ({ invoiceId, customerEmail }) => ({
      invoiceId,
      customerEmail,
      status: "sent"
    })
  });

  const capabilities = [customerFind, invoiceCreateDraft, invoiceSend];
  const { runtime } = createRuntime({
    capabilities,
    steps: [
      { capability: "customer.find", reason: "Find the customer first" },
      { capability: "invoice.createDraft", reason: "Create the invoice draft" },
      { capability: "invoice.send", reason: "Send the invoice" }
    ]
  });

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      customerEmail: "alice@example.com",
      amount: 2500
    }
  });
  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approval: {
      approved: true,
      approvedBy: "user_123"
    }
  });

  const pack = buildReproducibilityPack({
    response,
    capabilities,
    actor: {
      userId: "user_123"
    }
  });

  assert.equal(pack.version, "1.0");
  assert.equal(pack.status, "completed");
  assert.equal(pack.traceId, response.traceId);
  assert.equal(pack.goal, "Send the invoice");
  assert.equal(pack.auditTrace.status, "completed");
  assert.equal(pack.capabilitySnapshots.length, 3);
  assert.match(pack.hashes.auditTraceHash, /^[a-f0-9]{64}$/);
  assert.match(pack.hashes.capabilitySnapshotsHash, /^[a-f0-9]{64}$/);
  assert.ok(pack.createdAt);
  assert.ok(pack.exportedAt);
});

test("reproducibility pack excludes raw input and output values", async () => {
  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    description: "Create an invoice draft",
    inputSchema: z.object({
      customerEmail: z.string().email(),
      secretMemo: z.string()
    }),
    audit: {
      recordInput: true,
      recordOutput: true
    },
    run: ({ customerEmail }) => ({
      invoiceId: "inv_123",
      customerEmail,
      providerToken: "output-secret-token"
    })
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceCreateDraft],
    steps: [{ capability: "invoice.createDraft", reason: "Create the invoice draft" }]
  });

  const response = await runtime.orchestrate({
    goal: "Create an invoice draft",
    providedInput: {
      customerEmail: "alice@example.com",
      secretMemo: "input-secret-memo"
    }
  });

  const pack = buildReproducibilityPack({
    response,
    capabilities: [invoiceCreateDraft]
  });
  const serializedPack = JSON.stringify(pack);

  assert.equal(serializedPack.includes("input-secret-memo"), false);
  assert.equal(serializedPack.includes("output-secret-token"), false);
  assert.match(pack.auditTrace.steps[0].inputHash, /^[a-f0-9]{64}$/);
  assert.match(pack.auditTrace.steps[0].outputHash, /^[a-f0-9]{64}$/);
});

test("reproducibility pack snapshots capability metadata", async () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    description: "Send an invoice",
    version: "1.0.0",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: true,
      reason: "Finance approval is required."
    },
    audit: {
      recordInput: true,
      recordOutput: false,
      redaction: ["providerToken"]
    },
    idempotency: {
      required: true,
      keyFields: ["invoiceId"]
    },
    run: ({ invoiceId }) => ({
      invoiceId,
      status: "sent"
    })
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }]
  });
  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });
  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approved: true
  });

  const pack = buildReproducibilityPack({
    response,
    capabilities: [invoiceSend]
  });
  const snapshot = pack.capabilitySnapshots[0];

  assert.equal(snapshot.name, "invoice.send");
  assert.equal(snapshot.description, "Send an invoice");
  assert.equal(snapshot.version, "1.0.0");
  assert.equal(snapshot.sideEffect, "external_send");
  assert.equal(snapshot.approvalRequired, true);
  assert.equal(snapshot.approvalReason, "Finance approval is required.");
  assert.deepEqual(snapshot.audit, {
    recordInput: true,
    recordOutput: false,
    redaction: ["providerToken"]
  });
  assert.deepEqual(snapshot.idempotency, {
    required: true,
    keyFields: ["invoiceId"]
  });
});

test("dry replay does not execute capability run handlers", () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    description: "Send an invoice",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: true
    },
    run: () => {
      throw new Error("capability.run must not be called during dry replay");
    }
  });
  const response = {
    status: "completed",
    traceId: "trace_replay",
    plan: {
      goal: "Send the invoice",
      steps: [
        {
          capability: "invoice.send",
          reason: "Send the invoice"
        }
      ]
    },
    results: [
      {
        capability: "invoice.send",
        input: {
          invoiceId: "inv_123"
        },
        output: {
          status: "sent"
        }
      }
    ],
    trace: [
      {
        type: "goal.received",
        message: "Received user goal",
        goal: "Send the invoice",
        at: "2026-04-12T00:00:00.000Z"
      },
      {
        type: "plan.created",
        message: "Generated workflow plan",
        stepCount: 1,
        capabilities: ["invoice.send"],
        at: "2026-04-12T00:00:01.000Z"
      },
      {
        type: "step.entered",
        message: "Entered invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:02.000Z"
      },
      {
        type: "step.approved",
        message: "Approved invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        approvedBy: "user_123",
        at: "2026-04-12T00:00:03.000Z"
      },
      {
        type: "step.executed",
        message: "Executed invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:04.000Z"
      },
      {
        type: "step.completed",
        message: "Completed invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:05.000Z"
      },
      {
        type: "workflow.completed",
        message: "Workflow completed",
        resultCount: 1,
        at: "2026-04-12T00:00:06.000Z"
      }
    ]
  };

  const pack = buildReproducibilityPack({
    response,
    capabilities: [invoiceSend]
  });
  const auditSummary = replayAuditTrace(pack.auditTrace);
  const packSummary = replayReproducibilityPack(pack);

  assert.equal(auditSummary.traceId, "trace_replay");
  assert.equal(auditSummary.stepCount, 1);
  assert.equal(packSummary.steps[0].capability, "invoice.send");
});

test("reproducibility pack audit trace hash ignores exportedAt", () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    description: "Send an invoice",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: true
    },
    run: ({ invoiceId }) => ({
      invoiceId,
      status: "sent"
    })
  });
  const response = {
    status: "completed",
    traceId: "trace_hash",
    plan: {
      goal: "Send the invoice",
      steps: [
        {
          capability: "invoice.send",
          reason: "Send the invoice"
        }
      ]
    },
    results: [
      {
        capability: "invoice.send",
        input: {
          invoiceId: "inv_123"
        },
        output: {
          status: "sent"
        }
      }
    ],
    trace: [
      {
        type: "goal.received",
        message: "Received user goal",
        goal: "Send the invoice",
        at: "2026-04-12T00:00:00.000Z"
      },
      {
        type: "plan.created",
        message: "Generated workflow plan",
        stepCount: 1,
        capabilities: ["invoice.send"],
        at: "2026-04-12T00:00:01.000Z"
      },
      {
        type: "step.entered",
        message: "Entered invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:02.000Z"
      },
      {
        type: "step.completed",
        message: "Completed invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:03.000Z"
      },
      {
        type: "workflow.completed",
        message: "Workflow completed",
        resultCount: 1,
        at: "2026-04-12T00:00:04.000Z"
      }
    ]
  };

  const firstPack = buildReproducibilityPack({
    response,
    capabilities: [invoiceSend]
  });
  const secondPack = buildReproducibilityPack({
    response,
    capabilities: [invoiceSend]
  });

  secondPack.auditTrace.exportedAt = "2099-01-01T00:00:00.000Z";

  assert.equal(
    firstPack.hashes.auditTraceHash,
    secondPack.hashes.auditTraceHash
  );
});

test("dry replay hash validation ignores audit trace exportedAt", () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    description: "Send an invoice",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    run: ({ invoiceId }) => ({
      invoiceId,
      status: "sent"
    })
  });
  const response = {
    status: "completed",
    traceId: "trace_replay_hash",
    plan: {
      goal: "Send the invoice",
      steps: [
        {
          capability: "invoice.send",
          reason: "Send the invoice"
        }
      ]
    },
    results: [
      {
        capability: "invoice.send",
        input: {
          invoiceId: "inv_123"
        },
        output: {
          status: "sent"
        }
      }
    ],
    trace: [
      {
        type: "goal.received",
        message: "Received user goal",
        goal: "Send the invoice",
        at: "2026-04-12T00:00:00.000Z"
      },
      {
        type: "plan.created",
        message: "Generated workflow plan",
        stepCount: 1,
        capabilities: ["invoice.send"],
        at: "2026-04-12T00:00:01.000Z"
      },
      {
        type: "step.entered",
        message: "Entered invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:02.000Z"
      },
      {
        type: "step.completed",
        message: "Completed invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:03.000Z"
      },
      {
        type: "workflow.completed",
        message: "Workflow completed",
        resultCount: 1,
        at: "2026-04-12T00:00:04.000Z"
      }
    ]
  };

  const pack = buildReproducibilityPack({
    response,
    capabilities: [invoiceSend]
  });

  pack.auditTrace.exportedAt = "2099-01-01T00:00:00.000Z";

  const summary = replayReproducibilityPack(pack);

  assert.equal(
    summary.warnings.some((warning) =>
      warning.includes("auditTraceHash does not match")
    ),
    false
  );
});

test("dry replay summarizes rejected approval workflows", async () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    description: "Send an invoice",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: true
    },
    run: ({ invoiceId }) => ({
      invoiceId,
      status: "sent"
    })
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }]
  });
  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });
  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approval: {
      approved: false,
      approvedBy: "user_123"
    }
  });
  const auditTrace = buildAuditTrace(response, [invoiceSend]);
  const summary = replayAuditTrace(auditTrace);

  assert.equal(summary.status, "failed");
  assert.ok(["rejected", "failed"].includes(summary.steps[0].status));
  assert.equal(summary.steps[0].approved, false);
  assert.ok(
    summary.warnings.some((warning) =>
      warning.includes("required approval and was rejected by user_123")
    )
  );
});

test("dry replay warns about unknown capability metadata", () => {
  const response = {
    status: "failed",
    traceId: "trace_unknown",
    plan: {
      goal: "Send an invoice",
      steps: [
        {
          capability: "invoice.send",
          reason: "Send the invoice"
        }
      ]
    },
    results: [],
    error: "Capability not found",
    trace: [
      {
        type: "goal.received",
        message: "Received user goal",
        goal: "Send an invoice",
        at: "2026-04-12T00:00:00.000Z"
      },
      {
        type: "plan.created",
        message: "Generated workflow plan",
        stepCount: 1,
        capabilities: ["invoice.send"],
        at: "2026-04-12T00:00:01.000Z"
      },
      {
        type: "step.entered",
        message: "Entered invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:02.000Z"
      },
      {
        type: "step.failed",
        message: "Failed invoice.send: Capability not found",
        capability: "invoice.send",
        stepIndex: 0,
        error: "Capability not found",
        at: "2026-04-12T00:00:03.000Z"
      }
    ]
  };

  const auditTrace = buildAuditTrace(response, []);
  const summary = replayAuditTrace(auditTrace);

  assert.ok(
    summary.warnings.some((warning) =>
      warning.includes("unknown capabilityVersion")
    )
  );
  assert.ok(
    summary.warnings.some((warning) => warning.includes("unknown sideEffect"))
  );
});

test("audit trace respects disabled input and output recording", async () => {
  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    audit: {
      recordInput: false,
      recordOutput: false
    },
    run: ({ customerEmail }) => ({
      invoiceId: "inv_123",
      customerEmail
    })
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceCreateDraft],
    steps: [{ capability: "invoice.createDraft", reason: "Create the invoice draft" }]
  });

  const response = await runtime.orchestrate({
    goal: "Create an invoice draft",
    providedInput: {
      customerEmail: "alice@example.com"
    }
  });

  const auditTrace = buildAuditTrace(response, [invoiceCreateDraft]);
  const step = auditTrace.steps[0];

  assert.equal(step.inputRecorded, false);
  assert.equal(step.outputRecorded, false);
  assert.equal(step.inputHash, undefined);
  assert.equal(step.outputHash, undefined);
});

test("audit trace tolerates unknown capabilities in historical responses", () => {
  const response = {
    status: "failed",
    traceId: "trace_legacy",
    plan: {
      goal: "Send an invoice",
      steps: [
        {
          capability: "invoice.send",
          reason: "Send the invoice"
        }
      ]
    },
    results: [],
    error: "Capability not found",
    trace: [
      {
        type: "goal.received",
        message: "Received user goal",
        goal: "Send an invoice",
        at: "2026-04-12T00:00:00.000Z"
      },
      {
        type: "plan.created",
        message: "Generated workflow plan",
        stepCount: 1,
        capabilities: ["invoice.send"],
        at: "2026-04-12T00:00:01.000Z"
      },
      {
        type: "step.entered",
        message: "Entered invoice.send",
        capability: "invoice.send",
        stepIndex: 0,
        at: "2026-04-12T00:00:02.000Z"
      },
      {
        type: "step.failed",
        message: "Failed invoice.send: Capability not found",
        capability: "invoice.send",
        stepIndex: 0,
        error: "Capability not found",
        at: "2026-04-12T00:00:03.000Z"
      },
      {
        type: "workflow.failed",
        message: "Workflow failed during invoice.send: Capability not found",
        capability: "invoice.send",
        stepIndex: 0,
        error: "Capability not found",
        at: "2026-04-12T00:00:04.000Z"
      }
    ]
  };

  const auditTrace = buildAuditTrace(response, []);
  const step = auditTrace.steps[0];

  assert.equal(auditTrace.status, "failed");
  assert.equal(auditTrace.createdAt, "2026-04-12T00:00:00.000Z");
  assert.equal(step.capability, "invoice.send");
  assert.equal(step.capabilityVersion, "unknown");
  assert.equal(step.sideEffect, "unknown");
  assert.equal(step.approvalRequired, false);
  assert.equal(step.inputRecorded, false);
  assert.equal(step.outputRecorded, false);
  assert.equal(step.status, "failed");
  assert.equal(step.error, "Capability not found");
});

test("approval object can approve without an approver", async () => {
  const { runtime, getExecutionCount } = createApprovalRequiredRuntime();

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  const response = await runtime.resume({
    sessionId: firstResponse.sessionId,
    approval: {
      approved: true
    }
  });

  assert.equal(response.status, "completed");
  assert.equal(getExecutionCount(), 1);
});

test("resumes paused workflows and completes successfully", async () => {
  const customerFind = createCapability({
    name: "customer.find",
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    run: ({ customerEmail }) => ({
      customerId: "cust_123",
      customerEmail
    })
  });

  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    inputSchema: z.object({
      customerEmail: z.string().email(),
      amount: z.number().positive()
    }),
    run: ({ customerEmail, amount }) => ({
      invoiceId: "inv_456",
      customerEmail,
      amount
    })
  });

  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3),
      customerEmail: z.string().email()
    }),
    requiresApproval: true,
    run: ({ invoiceId, customerEmail }) => ({
      invoiceId,
      customerEmail,
      status: "sent"
    })
  });

  const sessionStore = new InMemoryWorkflowSessionStore();
  const { runtime } = createRuntime({
    capabilities: [customerFind, invoiceCreateDraft, invoiceSend],
    steps: [
      { capability: "customer.find", reason: "Find the customer first" },
      { capability: "invoice.createDraft", reason: "Create the invoice draft" },
      { capability: "invoice.send", reason: "Send the invoice" }
    ],
    sessionStore
  });

  const firstResponse = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      customerEmail: "alice@example.com"
    }
  });

  assert.equal(firstResponse.status, "needs_input");

  const secondResponse = await runtime.resume({
    sessionId: firstResponse.sessionId,
    providedInput: {
      amount: 2500
    }
  });

  assert.equal(secondResponse.status, "needs_approval");
  assert.equal(secondResponse.sessionId, firstResponse.sessionId);

  const thirdResponse = await runtime.resume({
    sessionId: secondResponse.sessionId,
    approved: true
  });

  assert.equal(thirdResponse.status, "completed");

  const draftResult = thirdResponse.results.find(
    (result) => result.capability === "invoice.createDraft"
  );
  const sendResult = thirdResponse.results.find(
    (result) => result.capability === "invoice.send"
  );

  assert.ok(draftResult);
  assert.ok(sendResult);
  assert.equal(sendResult.input.invoiceId, draftResult.output.invoiceId);
  assert.equal(sendResult.input.customerEmail, "alice@example.com");
  assert.deepEqual(
    thirdResponse.trace.map((event) => event.type),
    [
      "goal.received",
      "plan.created",
      "step.entered",
      "step.executed",
      "step.completed",
      "step.entered",
      "step.awaiting_input",
      "step.resumed",
      "step.executed",
      "step.completed",
      "step.entered",
      "step.awaiting_approval",
      "step.resumed",
      "step.approved",
      "step.executed",
      "step.completed",
      "workflow.completed"
    ]
  );
  assert.equal(await sessionStore.get(firstResponse.sessionId), undefined);
});

test("resumes existing paused sessions that were stored with UUID v4 identifiers", async () => {
  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    inputSchema: z.object({
      customerEmail: z.string().email(),
      amount: z.number().positive()
    }),
    run: ({ customerEmail, amount }) => ({
      invoiceId: "inv_legacy",
      customerEmail,
      amount
    })
  });

  const sessionStore = new InMemoryWorkflowSessionStore();
  const legacySessionId = "session_6fe91142-6ada-45fb-bf8c-947b15449ce3";

  sessionStore.save({
    id: legacySessionId,
    goal: "Create an invoice draft",
    plan: {
      goal: "Create an invoice draft",
      steps: [
        {
          capability: "invoice.createDraft",
          reason: "Create the invoice draft."
        }
      ]
    },
    status: "awaiting_input",
    pendingStepIndex: 0,
    providedInput: {
      customerEmail: "alice@example.com"
    },
    memory: {},
    results: [],
    trace: [],
    traceId: "trace_6fe91142-6ada-45fb-bf8c-947b15449ce3",
    createdAt: "2026-04-12T00:00:00.000Z",
    updatedAt: "2026-04-12T00:00:00.000Z"
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceCreateDraft],
    steps: [{ capability: "invoice.createDraft", reason: "Create the invoice draft" }],
    sessionStore
  });

  const response = await runtime.resume({
    sessionId: legacySessionId,
    providedInput: {
      amount: 2500
    }
  });

  assert.equal(response.status, "completed");
  assert.equal(response.results[0].status, "success");
  assert.equal(await sessionStore.get(legacySessionId), undefined);
});

test("returns a failed state with trace details when execution throws", async () => {
  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    run: () => {
      throw new Error("Email provider unavailable");
    }
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }]
  });

  const response = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  assert.equal(response.status, "failed");
  assert.equal(response.error, "Email provider unavailable");
  assert.equal(response.results.length, 1);
  assert.equal(response.results[0].status, "failed");
  assert.equal(response.results[0].capability, "invoice.send");
  assert.deepEqual(
    response.trace.map((event) => event.type),
    [
      "goal.received",
      "plan.created",
      "step.entered",
      "step.executed",
      "step.failed",
      "workflow.failed"
    ]
  );

  const stepFailedEvent = response.trace[response.trace.length - 2];
  assert.equal(stepFailedEvent.type, "step.failed");
  assert.equal(stepFailedEvent.capability, "invoice.send");
  assert.equal(stepFailedEvent.stepIndex, 0);
  assert.equal(stepFailedEvent.error, "Email provider unavailable");

  const traceEvent = response.trace[response.trace.length - 1];
  assert.equal(traceEvent.type, "workflow.failed");
  assert.equal(traceEvent.capability, "invoice.send");
  assert.equal(traceEvent.stepIndex, 0);
  assert.equal(traceEvent.error, "Email provider unavailable");
});

test("uses LLMPlanner structured output to build a workflow plan", async () => {
  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    description: "Create an invoice draft for a customer.",
    inputSchema: z.object({
      customerEmail: z.string().email(),
      amount: z.number().positive()
    }),
    run: ({ customerEmail, amount }) => ({
      invoiceId: "inv_789",
      customerEmail,
      amount
    })
  });

  let lastPrompt;
  const planner = new LLMPlanner({
    model: {
      generateObject: (request) => {
        lastPrompt = request;

        return {
          steps: [
            {
              capability: "invoice.createDraft",
              reason: "The user asked to create an invoice draft."
            }
          ]
        };
      }
    }
  });

  const runtime = createCapora({
    capabilities: [invoiceCreateDraft],
    planner
  });

  const response = await runtime.orchestrate({
    goal: "Create an invoice draft for alice@example.com",
    providedInput: {
      customerEmail: "alice@example.com",
      amount: 2500
    }
  });

  assert.equal(response.status, "completed");
  assert.ok(lastPrompt);
  assert.equal(lastPrompt.schemaName, "capora_workflow_plan");
  assert.equal(lastPrompt.schema.type, "object");
  assert.match(lastPrompt.userPrompt, /invoice\.createDraft/);
  assert.deepEqual(
    response.plan.steps,
    [
      {
        capability: "invoice.createDraft",
        reason: "The user asked to create an invoice draft."
      }
    ]
  );
});

test("fails before execution when planner returns an unknown capability", async () => {
  let executionCount = 0;

  const customerFind = createCapability({
    name: "customer.find",
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    run: ({ customerEmail }) => {
      executionCount += 1;

      return {
        customerId: "cust_999",
        customerEmail
      };
    }
  });

  const runtime = createCapora({
    capabilities: [customerFind],
    planner: new LLMPlanner({
      model: {
        generateObject: () => ({
          steps: [
            {
              capability: "invoice.send",
              reason: "Attempt to send the invoice."
            }
          ]
        })
      }
    })
  });

  const response = await runtime.orchestrate({
    goal: "Send an invoice",
    providedInput: {
      customerEmail: "alice@example.com"
    }
  });

  assert.equal(response.status, "failed");
  assert.equal(response.error, 'Planner returned unknown capability "invoice.send".');
  assert.equal(response.results.length, 0);
  assert.equal(executionCount, 0);
  assert.deepEqual(
    response.trace.map((event) => event.type),
    ["goal.received", "workflow.failed"]
  );
});

test("fails before execution when external_send does not require approval", async () => {
  let executionCount = 0;

  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    approval: {
      required: false
    },
    run: () => {
      executionCount += 1;

      return {
        status: "sent"
      };
    }
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }]
  });

  const response = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  assert.equal(response.status, "failed");
  assert.equal(
    response.error,
    'Capability "invoice.send" has sideEffect "external_send" but approval.required is not true.'
  );
  assert.equal(response.results.length, 0);
  assert.equal(executionCount, 0);
  assert.deepEqual(
    response.trace.map((event) => event.type),
    ["goal.received", "workflow.failed"]
  );
});

test("allows high-risk side effects when legacy requiresApproval is true", async () => {
  let executionCount = 0;

  const invoiceSend = createCapability({
    name: "invoice.send",
    inputSchema: z.object({
      invoiceId: z.string().min(3)
    }),
    sideEffect: "external_send",
    requiresApproval: true,
    run: () => {
      executionCount += 1;

      return {
        status: "sent"
      };
    }
  });

  const { runtime } = createRuntime({
    capabilities: [invoiceSend],
    steps: [{ capability: "invoice.send", reason: "Send the invoice" }]
  });

  const response = await runtime.orchestrate({
    goal: "Send the invoice",
    providedInput: {
      invoiceId: "inv_123"
    }
  });

  assert.equal(response.status, "needs_approval");
  assert.equal(executionCount, 0);
});

test("fails before execution when delete does not specify approval", async () => {
  let executionCount = 0;

  const customerDelete = createCapability({
    name: "customer.delete",
    inputSchema: z.object({
      customerId: z.string().min(3)
    }),
    sideEffect: "delete",
    run: () => {
      executionCount += 1;

      return {
        status: "deleted"
      };
    }
  });

  const { runtime } = createRuntime({
    capabilities: [customerDelete],
    steps: [{ capability: "customer.delete", reason: "Delete the customer" }]
  });

  const response = await runtime.orchestrate({
    goal: "Delete the customer",
    providedInput: {
      customerId: "cust_123"
    }
  });

  assert.equal(response.status, "failed");
  assert.equal(
    response.error,
    'Capability "customer.delete" has sideEffect "delete" but approval.required is not true.'
  );
  assert.equal(response.results.length, 0);
  assert.equal(executionCount, 0);
});

test("allows write side effects without approval", async () => {
  let executionCount = 0;

  const customerUpdate = createCapability({
    name: "customer.update",
    inputSchema: z.object({
      customerId: z.string().min(3)
    }),
    sideEffect: "write",
    approval: {
      required: false
    },
    run: ({ customerId }) => {
      executionCount += 1;

      return {
        customerId,
        status: "updated"
      };
    }
  });

  const { runtime } = createRuntime({
    capabilities: [customerUpdate],
    steps: [{ capability: "customer.update", reason: "Update the customer" }]
  });

  const response = await runtime.orchestrate({
    goal: "Update the customer",
    providedInput: {
      customerId: "cust_123"
    }
  });

  assert.equal(response.status, "completed");
  assert.equal(response.results.length, 1);
  assert.equal(executionCount, 1);
});

test("fails before execution when planner returns too many steps", async () => {
  let executionCount = 0;

  const customerFind = createCapability({
    name: "customer.find",
    inputSchema: z.object({}),
    run: () => {
      executionCount += 1;

      return {
        customerId: "cust_999"
      };
    }
  });

  const runtime = createCapora({
    capabilities: [customerFind],
    planner: createPlanner(
      Array.from({ length: 101 }, () => ({
        capability: "customer.find",
        reason: "Repeat the same capability."
      }))
    )
  });

  const response = await runtime.orchestrate({
    goal: "Try to do too many things"
  });

  assert.equal(response.status, "failed");
  assert.equal(
    response.error,
    "Workflow plan exceeds the maximum supported step count of 100."
  );
  assert.equal(response.results.length, 0);
  assert.equal(executionCount, 0);
});

test("resolvePlannerFromEnvironment defaults to the rule-based planner", () => {
  const selection = resolvePlannerFromEnvironment({
    env: {}
  });

  assert.deepEqual(selection, {
    plannerKind: "rule-based",
    plannerName: "RuleBasedPlanner",
    usesLegacyBedrockPlannerAlias: false
  });
});

test("resolvePlannerFromEnvironment keeps the legacy CAPORA_PLANNER=bedrock alias", () => {
  const selection = resolvePlannerFromEnvironment({
    env: {
      CAPORA_PLANNER: "bedrock"
    }
  });

  assert.deepEqual(selection, {
    plannerKind: "llm",
    provider: "bedrock",
    plannerName: "LLMPlanner (Bedrock)",
    usesLegacyBedrockPlannerAlias: true
  });
});

test("createPlannerFromEnvironment defaults the llm provider to openai", () => {
  const { planner, plannerName, selection } = createPlannerFromEnvironment({
    env: {
      CAPORA_PLANNER: "llm",
      OPENAI_API_KEY: "test-key",
      OPENAI_MODEL: "gpt-test"
    }
  });

  assert.equal(planner instanceof LLMPlanner, true);
  assert.equal(plannerName, "LLMPlanner (OpenAI)");
  assert.equal(selection.provider, "openai");
});

test("createPlannerFromEnvironment maps the legacy bedrock alias to an llm planner", () => {
  const { planner, plannerName, selection } = createPlannerFromEnvironment({
    env: {
      CAPORA_PLANNER: "bedrock",
      BEDROCK_MODEL_ID: "anthropic.claude-sonnet-4-5-20250929-v1:0"
    }
  });

  assert.equal(planner instanceof LLMPlanner, true);
  assert.equal(plannerName, "LLMPlanner (Bedrock)");
  assert.equal(selection.provider, "bedrock");
  assert.equal(selection.usesLegacyBedrockPlannerAlias, true);
});

test("createStructuredOutputModelFromEnvironment requires an llm planner or explicit provider", () => {
  assert.throws(
    () =>
      createStructuredOutputModelFromEnvironment({
        env: {}
      }),
    /Structured output model creation requires CAPORA_PLANNER=llm or an explicit provider\./
  );
});

test("createStructuredOutputModelFromEnvironment keeps provider-specific env validation", () => {
  assert.throws(
    () =>
      createStructuredOutputModelFromEnvironment({
        env: {
          CAPORA_PLANNER: "llm",
          CAPORA_LLM_PROVIDER: "bedrock"
        }
      }),
    /CAPORA_PLANNER=llm with CAPORA_LLM_PROVIDER=bedrock requires BEDROCK_MODEL_ID\./
  );
});

test("createCaporaFromEnvironment wires the resolved planner into the runtime", async () => {
  const invoiceCreateDraft = createCapability({
    name: "invoice.createDraft",
    description: "Create an invoice draft for a customer.",
    inputSchema: z.object({
      customerEmail: z.string().email(),
      amount: z.number().positive()
    }),
    run: ({ customerEmail, amount }) => ({
      invoiceId: "inv_789",
      customerEmail,
      amount
    })
  });

  const { runtime, plannerName, selection } = createCaporaFromEnvironment({
    env: {},
    capabilities: [invoiceCreateDraft]
  });

  const response = await runtime.orchestrate({
    goal: "Create an invoice draft for alice@example.com",
    providedInput: {
      customerEmail: "alice@example.com",
      amount: 2500
    }
  });

  assert.equal(response.status, "completed");
  assert.equal(plannerName, "RuleBasedPlanner");
  assert.equal(selection.plannerKind, "rule-based");
});

test("OpenAIResponsesStructuredOutputModel forwards the requested schema", async () => {
  let requestBody;
  const model = new OpenAIResponsesStructuredOutputModel({
    apiKey: "test-key",
    model: "gpt-test",
    fetch: async (_url, init) => {
      requestBody = JSON.parse(String(init?.body));

      return {
        ok: true,
        json: async () => ({
          output: [
            {
              type: "message",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({
                    steps: []
                  })
                }
              ]
            }
          ]
        })
      };
    }
  });

  const result = await model.generateObject({
    systemPrompt: "system",
    userPrompt: "user",
    schemaName: "custom_schema",
    schema: {
      type: "object",
      additionalProperties: false
    }
  });

  assert.deepEqual(result, {
    steps: []
  });
  assert.equal(requestBody.text.format.name, "custom_schema");
  assert.deepEqual(requestBody.text.format.schema, {
    type: "object",
    additionalProperties: false
  });
});

test("OpenAIResponsesStructuredOutputModel keeps Responses API error handling", async () => {
  const model = new OpenAIResponsesStructuredOutputModel({
    apiKey: "test-key",
    model: "gpt-test",
    fetch: createOpenAIFetchResponse(
      {
        error: {
          message: "Rate limit exceeded"
        }
      },
      false
    )
  });

  await assert.rejects(
    () =>
      model.generateObject({
        systemPrompt: "system",
        userPrompt: "user",
        schemaName: "custom_schema",
        schema: {
          type: "object"
        }
      }),
    /Rate limit exceeded/
  );
});

test("OpenAIResponsesStructuredOutputModel keeps refusal handling", async () => {
  const model = new OpenAIResponsesStructuredOutputModel({
    apiKey: "test-key",
    model: "gpt-test",
    fetch: createOpenAIFetchResponse({
      output: [
        {
          type: "message",
          content: [
            {
              type: "refusal",
              refusal: "I can't do that."
            }
          ]
        }
      ]
    })
  });

  await assert.rejects(
    () =>
      model.generateObject({
        systemPrompt: "system",
        userPrompt: "user",
        schemaName: "custom_schema",
        schema: {
          type: "object"
        }
      }),
    /I can't do that\./
  );
});

test("OpenAIResponsesStructuredOutputModel keeps empty structured output handling", async () => {
  const model = new OpenAIResponsesStructuredOutputModel({
    apiKey: "test-key",
    model: "gpt-test",
    fetch: createOpenAIFetchResponse({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "   "
            }
          ]
        }
      ]
    })
  });

  await assert.rejects(
    () =>
      model.generateObject({
        systemPrompt: "system",
        userPrompt: "user",
        schemaName: "custom_schema",
        schema: {
          type: "object"
        }
      }),
    /did not return structured output/
  );
});

test("OpenAIResponsesPlannerModel remains available as a compatibility alias", async () => {
  const model = new OpenAIResponsesPlannerModel({
    apiKey: "test-key",
    model: "gpt-test",
    fetch: createOpenAIFetchResponse({
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                steps: []
              })
            }
          ]
        }
      ]
    })
  });

  const result = await model.generateObject({
    systemPrompt: "system",
    userPrompt: "user",
    schemaName: "compat_schema",
    schema: {
      type: "object"
    }
  });

  assert.deepEqual(result, {
    steps: []
  });
});

test("BedrockConverseStructuredOutputModel uses strict tool use for structured output", async () => {
  let lastRequest;
  const model = new BedrockConverseStructuredOutputModel({
    modelId: "anthropic.claude-3-5-sonnet",
    region: "us-east-1",
    maxTokens: 512,
    client: {
      converse: async (request) => {
        lastRequest = request;

        return {
          output: {
            message: {
              role: "assistant",
              content: [
                {
                  toolUse: {
                    toolUseId: "tool_1",
                    name: "structured_output",
                    input: {
                      steps: []
                    }
                  }
                }
              ]
            }
          },
          stopReason: "tool_use"
        };
      }
    }
  });

  const result = await model.generateObject({
    systemPrompt: "system",
    userPrompt: "user",
    schemaName: "capora_plan",
    schema: {
      type: "object",
      additionalProperties: false
    }
  });

  assert.deepEqual(result, {
    steps: []
  });
  assert.equal(lastRequest.modelId, "anthropic.claude-3-5-sonnet");
  assert.equal(lastRequest.system[0].text, "system");
  assert.equal(lastRequest.messages[0].content[0].text, "user");
  assert.equal(lastRequest.inferenceConfig.maxTokens, 512);
  assert.equal(lastRequest.outputConfig, undefined);
  assert.equal(lastRequest.toolConfig.toolChoice.any.constructor, Object);
  assert.equal(
    lastRequest.toolConfig.tools[0].toolSpec.inputSchema.json.type,
    "object"
  );
});

test("BedrockConverseStructuredOutputModel wraps Bedrock SDK errors", async () => {
  const model = new BedrockConverseStructuredOutputModel({
    modelId: "anthropic.claude-3-5-sonnet",
    client: {
      converse: async () => {
        throw new Error("Unable to resolve AWS credentials");
      }
    }
  });

  await assert.rejects(
    () =>
      model.generateObject({
        systemPrompt: "system",
        userPrompt: "user",
        schemaName: "capora_plan",
        schema: {
          type: "object"
        }
      }),
    /Bedrock Converse API request failed: Unable to resolve AWS credentials/
  );
});

test("BedrockConverseStructuredOutputModel fails when Bedrock returns no tool output", async () => {
  const model = new BedrockConverseStructuredOutputModel({
    modelId: "anthropic.claude-3-5-sonnet",
    client: {
      converse: async () => ({
        output: {
          message: {
            role: "assistant",
            content: []
          }
        },
        stopReason: "max_tokens"
      })
    }
  });

  await assert.rejects(
    () =>
      model.generateObject({
        systemPrompt: "system",
        userPrompt: "user",
        schemaName: "capora_plan",
        schema: {
          type: "object"
        }
      }),
    /Bedrock model did not return structured output\. Stop reason: max_tokens\./
  );
});
