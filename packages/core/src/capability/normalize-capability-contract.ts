import { z } from "zod";
import type {
  CapabilityApprovalPolicy,
  CapabilityAuditPolicy,
  CapabilityDefinition,
  CapabilityIdempotencyPolicy,
  CapabilitySideEffect
} from "./types.js";

export type NormalizedCapabilityDefinition<
  TInput extends z.ZodTypeAny,
  TResult
> = CapabilityDefinition<TInput, TResult> & {
  version: string;
  sideEffect: CapabilitySideEffect;
  approval: CapabilityApprovalPolicy;
  audit: CapabilityAuditPolicy;
  idempotency: CapabilityIdempotencyPolicy;
};

export const normalizeCapabilityContract = <
  TInput extends z.ZodTypeAny,
  TResult
>(
  capability: CapabilityDefinition<TInput, TResult>
): NormalizedCapabilityDefinition<TInput, TResult> => ({
  ...capability,
  version: capability.version ?? "1.0.0",
  sideEffect: capability.sideEffect ?? "none",
  approval: capability.approval ?? {
    required: capability.requiresApproval ?? false
  },
  audit: capability.audit ?? {
    recordInput: true,
    recordOutput: true
  },
  idempotency: capability.idempotency ?? {
    required: false
  }
});
