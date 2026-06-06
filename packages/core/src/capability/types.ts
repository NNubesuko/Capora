import { z } from "zod";
import type { JsonLike } from "../shared/json-like.js";

export type CapabilitySideEffect =
  | "none"
  | "read"
  | "write"
  | "external_send"
  | "payment"
  | "delete";

export type CapabilityApprovalPolicy = {
  required: boolean;
  reason?: string;
};

export type CapabilityAuditPolicy = {
  recordInput: boolean;
  recordOutput: boolean;
  redaction?: string[];
};

export type CapabilityIdempotencyPolicy = {
  required: boolean;
  keyFields?: string[];
};

export interface CapabilityContext {
  now: Date;
  memory: Record<string, JsonLike>;
  traceId: string;
}

export interface CapabilityDefinition<TInput extends z.ZodTypeAny, TResult> {
  name: string;
  description: string;
  version?: string;
  inputSchema: TInput;
  outputSchema?: unknown;
  /**
   * Deprecated-compatible field.
   * Keep this for backward compatibility with existing demo/runtime behavior.
   */
  requiresApproval?: boolean;
  sideEffect?: CapabilitySideEffect;
  approval?: CapabilityApprovalPolicy;
  audit?: CapabilityAuditPolicy;
  idempotency?: CapabilityIdempotencyPolicy;
  run: (input: z.infer<TInput>, context: CapabilityContext) => Promise<TResult> | TResult;
}
