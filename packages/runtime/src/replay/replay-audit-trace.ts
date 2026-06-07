import type { AuditTrace, ReproducibilityPack } from "@capora/core";
import { createAuditTraceHashInput } from "./build-reproducibility-pack.js";
import { stableJsonHash } from "../shared/stable-hash.js";

export type ReplayStepSummary = {
  stepIndex: number;
  capability: string;
  status: string;
  sideEffect: string;
  approvalRequired: boolean;
  approved?: boolean;
  warning?: string;
};

export type ReplaySummary = {
  traceId: string;
  goal: string;
  status: string;
  stepCount: number;
  steps: ReplayStepSummary[];
  warnings: string[];
};

const highRiskSideEffects = new Set(["external_send", "payment", "delete"]);

const formatStep = (stepIndex: number, capability: string): string =>
  `Step ${stepIndex + 1} ${capability}`;

const buildStepWarnings = (step: AuditTrace["steps"][number]): string[] => {
  const stepLabel = formatStep(step.stepIndex, step.capability);
  const warnings: string[] = [];

  if (step.status === "failed") {
    warnings.push(`${stepLabel} failed.`);
  }

  if (step.approvalRequired && !step.approval) {
    warnings.push(`${stepLabel} required approval but has no approval decision.`);
  }

  if (step.approvalRequired && step.approval?.approved === true) {
    const approver = step.approval.approvedBy
      ? ` by ${step.approval.approvedBy}`
      : "";
    warnings.push(`${stepLabel} required approval and was approved${approver}.`);
  }

  if (step.approvalRequired && step.approval?.approved === false) {
    const approver = step.approval.approvedBy
      ? ` by ${step.approval.approvedBy}`
      : "";
    warnings.push(`${stepLabel} required approval and was rejected${approver}.`);
  }

  if (highRiskSideEffects.has(step.sideEffect)) {
    warnings.push(`${stepLabel} has high-risk sideEffect ${step.sideEffect}.`);
  }

  if (step.capabilityVersion === "unknown") {
    warnings.push(`${stepLabel} has unknown capabilityVersion.`);
  }

  if (step.sideEffect === "unknown") {
    warnings.push(`${stepLabel} has unknown sideEffect.`);
  }

  return warnings;
};

export const replayAuditTrace = (auditTrace: AuditTrace): ReplaySummary => {
  const steps = auditTrace.steps.map<ReplayStepSummary>((step) => {
    const warnings = buildStepWarnings(step);

    return {
      stepIndex: step.stepIndex,
      capability: step.capability,
      status: step.status,
      sideEffect: step.sideEffect,
      approvalRequired: step.approvalRequired,
      approved: step.approval?.approved,
      warning: warnings[0]
    };
  });
  const warnings = auditTrace.steps.flatMap(buildStepWarnings);

  return {
    traceId: auditTrace.traceId,
    goal: auditTrace.goal,
    status: auditTrace.status,
    stepCount: auditTrace.steps.length,
    steps,
    warnings
  };
};

export const replayReproducibilityPack = (
  pack: ReproducibilityPack
): ReplaySummary => {
  const replaySummary = replayAuditTrace(pack.auditTrace);
  const warnings = [...replaySummary.warnings];

  if (
    stableJsonHash(createAuditTraceHashInput(pack.auditTrace)) !==
    pack.hashes.auditTraceHash
  ) {
    warnings.push("Reproducibility pack auditTraceHash does not match auditTrace.");
  }

  if (
    stableJsonHash(pack.capabilitySnapshots) !==
    pack.hashes.capabilitySnapshotsHash
  ) {
    warnings.push(
      "Reproducibility pack capabilitySnapshotsHash does not match capabilitySnapshots."
    );
  }

  return {
    ...replaySummary,
    warnings
  };
};
