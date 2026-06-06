import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import {
  BedrockConverseStructuredOutputModel,
  createCaporaFromEnvironment,
  createCapora,
  createPlannerFromEnvironment,
  createStructuredOutputModelFromEnvironment,
  InMemoryWorkflowSessionStore,
  LLMPlanner,
  OpenAIResponsesPlannerModel,
  OpenAIResponsesStructuredOutputModel,
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
