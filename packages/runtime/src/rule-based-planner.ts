import type { Planner, PlannerRequest, WorkflowPlan } from "@capora/core";

const includesAny = (value: string, terms: string[]): boolean =>
  terms.some((term) => value.includes(term));

const hasCapability = (request: PlannerRequest, capability: string): boolean =>
  request.capabilities.some((candidate) => candidate.name === capability);

const buildPlan = (
  request: PlannerRequest,
  steps: WorkflowPlan["steps"]
): WorkflowPlan => ({
  goal: request.goal,
  steps
});

export class RuleBasedPlanner implements Planner {
  createPlan(request: PlannerRequest): WorkflowPlan {
    const lower = request.goal.toLowerCase();
    const canCreateCustomer = hasCapability(request, "customer.create");
    const canFindCustomer = hasCapability(request, "customer.find");
    const canCreateDraft = hasCapability(request, "invoice.createDraft");
    const canSendInvoice = hasCapability(request, "invoice.send");
    const mentionsInvoice = lower.includes("invoice");
    const wantsSend = lower.includes("send");
    const wantsDraft = lower.includes("draft");
    const wantsNewCustomer = includesAny(lower, [
      "new customer",
      "create a customer",
      "create customer"
    ]);
    const wantsExistingCustomer = includesAny(lower, [
      "existing customer",
      "existing customer record",
      "customer record",
      "already registered customer",
      "already registered",
      "find "
    ]);
    const mentionsExistingInvoice = includesAny(lower, [
      "existing invoice",
      "existing draft",
      "invoice draft",
      "already created",
      "already been created",
      "already drafted"
    ]);
    const customerCapability =
      wantsNewCustomer && canCreateCustomer
        ? "customer.create"
        : canFindCustomer
          ? "customer.find"
          : canCreateCustomer
            ? "customer.create"
            : undefined;

    if (wantsNewCustomer && !mentionsInvoice && canCreateCustomer) {
      return buildPlan(request, [
        {
          capability: "customer.create",
          reason: "User intent explicitly asks to register a new customer"
        }
      ]);
    }

    if (
      wantsExistingCustomer &&
      !mentionsInvoice &&
      canFindCustomer
    ) {
      return buildPlan(request, [
        {
          capability: "customer.find",
          reason: "User intent explicitly asks for an existing customer record"
        }
      ]);
    }

    if (
      customerCapability &&
      wantsSend &&
      mentionsInvoice &&
      mentionsExistingInvoice &&
      canSendInvoice
    ) {
      return buildPlan(request, [
        {
          capability: customerCapability,
          reason:
            customerCapability === "customer.create"
              ? "Need to create the new customer before invoice actions"
              : "Need customer lookup before invoice actions"
        },
        {
          capability: "invoice.send",
          reason: "User intent is to send an existing invoice draft"
        }
      ]);
    }

    if (
      customerCapability &&
      wantsSend &&
      mentionsInvoice &&
      canCreateDraft &&
      canSendInvoice
    ) {
      return buildPlan(request, [
        {
          capability: customerCapability,
          reason:
            customerCapability === "customer.create"
              ? "Need to create the new customer before invoice actions"
              : "Need customer lookup before invoice actions"
        },
        {
          capability: "invoice.createDraft",
          reason: "Need a draft to send"
        },
        {
          capability: "invoice.send",
          reason: "User intent includes sending invoice"
        }
      ]);
    }

    if (customerCapability && wantsDraft && mentionsInvoice && canCreateDraft) {
      return buildPlan(request, [
        {
          capability: customerCapability,
          reason:
            customerCapability === "customer.create"
              ? "Need to create the new customer before invoice actions"
              : "Need customer lookup before invoice actions"
        },
        {
          capability: "invoice.createDraft",
          reason: "User intent includes draft creation"
        }
      ]);
    }

    if (canFindCustomer) {
      return buildPlan(request, [
        {
          capability: "customer.find",
          reason: "Fallback discovery step"
        }
      ]);
    }

    if (canCreateCustomer) {
      return buildPlan(request, [
        {
          capability: "customer.create",
          reason: "Fallback customer creation step"
        }
      ]);
    }

    return buildPlan(request, []);
  }
}
