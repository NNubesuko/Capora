import type { CapabilitySideEffect } from "@capora/core";

export type PlanSafetyPolicy = {
  approvalRequiredSideEffects: CapabilitySideEffect[];
};

export const defaultPlanSafetyPolicy: PlanSafetyPolicy = {
  approvalRequiredSideEffects: ["external_send", "payment", "delete"]
};
