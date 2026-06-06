import { defineCapability } from "@capora/sdk";
import { z } from "zod";

const customerCreateContract = {
  version: "1.0.0",
  sideEffect: "write" as const,
  approval: {
    required: false
  },
  audit: {
    recordInput: true,
    recordOutput: true
  },
  idempotency: {
    required: true,
    keyFields: ["customerEmail"]
  }
};

const customerFindContract = {
  version: "1.0.0",
  sideEffect: "read" as const,
  approval: {
    required: false
  },
  audit: {
    recordInput: true,
    recordOutput: true
  },
  idempotency: {
    required: false
  }
};

const invoiceCreateDraftContract = {
  version: "1.0.0",
  sideEffect: "write" as const,
  approval: {
    required: false
  },
  audit: {
    recordInput: true,
    recordOutput: true
  },
  idempotency: {
    required: true,
    keyFields: ["customerId", "customerEmail", "description"]
  }
};

const invoiceSendContract = {
  version: "1.0.0",
  sideEffect: "external_send" as const,
  approval: {
    required: true,
    reason: "Sending an invoice is an external side effect."
  },
  audit: {
    recordInput: true,
    recordOutput: true
  },
  idempotency: {
    required: true,
    keyFields: ["invoiceId", "customerEmail"]
  }
};

export const demoCapabilities = [
  defineCapability({
    name: "customer.create",
    description:
      "Create a new customer record and return the customerId needed for later invoice operations.",
    ...customerCreateContract,
    inputSchema: z.object({
      customerEmail: z.string().email(),
      customerName: z.string().min(3),
      billingContact: z.string().min(3),
    }),
    run: ({ customerEmail, customerName, billingContact }) => ({
      customerId: "cust_acme_001",
      customerEmail,
      customerName,
      billingContact,
    })
  }),
  defineCapability({
    name: "customer.find",
    description:
      "Find an existing customer record by email and return the customerId needed for later invoice operations. Use this only for customers that already exist.",
    ...customerFindContract,
    inputSchema: z.object({
      customerEmail: z.string().email()
    }),
    run: ({ customerEmail }) => ({
      customerId: "cust_acme_001",
      customerEmail,
      customerName: "Acme Corp",
      billingContact: "Alice Johnson"
    })
  }),
  defineCapability({
    name: "invoice.createDraft",
    description:
      "Create a new invoice draft for an existing customer/customerId. Use this before invoice.send when the user wants to create and send an invoice.",
    ...invoiceCreateDraftContract,
    inputSchema: z.object({
      customerId: z.string().min(3),
      customerEmail: z.string().email(),
      amount: z.number().positive(),
      currency: z.string().length(3),
      description: z.string().min(3)
    }),
    run: ({ customerId, customerEmail, amount, currency, description }) => ({
      invoiceId: "inv_draft_2026_001",
      customerId,
      customerEmail,
      amount,
      currency,
      description,
      status: "draft",
      previewUrl: "https://example.com/invoices/inv_draft_2026_001"
    })
  }),
  defineCapability({
    name: "invoice.send",
    description:
      "Send an existing invoice draft. Requires an invoiceId from a previously created draft and does not create invoices by itself.",
    ...invoiceSendContract,
    inputSchema: z.object({
      invoiceId: z.string().min(3),
      customerEmail: z.string().email()
    }),
    /**
     * Keep requiresApproval for compatibility during this migration.
     * The runtime should eventually rely on approval.required.
     */
    requiresApproval: true,
    run: ({ invoiceId, customerEmail }, context) => ({
      invoiceId,
      customerEmail,
      status: "sent",
      deliveryChannel: "email",
      sentAt: context.now.toISOString()
    })
  })
];
