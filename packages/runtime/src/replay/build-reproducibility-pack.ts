import {
  normalizeCapabilityContract,
  type AuditActor,
  type CapabilityDefinition,
  type CapabilitySnapshot,
  type ReproducibilityPack
} from "@capora/core";
import type { AuditTrace } from "@capora/core";
import { buildAuditTrace } from "../audit/build-audit-trace.js";
import type { OrchestrationResponse } from "../dto/orchestrate-response.js";
import { stableJsonHash } from "../shared/stable-hash.js";

export type BuildReproducibilityPackOptions = {
  response: OrchestrationResponse;
  capabilities: CapabilityDefinition<any, any>[];
  actor?: AuditActor;
};

export const createAuditTraceHashInput = (auditTrace: AuditTrace): Omit<AuditTrace, "exportedAt"> => {
  const { exportedAt, ...hashInput } = auditTrace;

  return hashInput;
};

const snapshotCapability = (
  capability: CapabilityDefinition<any, any>
): CapabilitySnapshot => {
  const normalizedCapability = normalizeCapabilityContract(capability);
  const snapshot: CapabilitySnapshot = {
    name: normalizedCapability.name,
    description: normalizedCapability.description,
    version: normalizedCapability.version,
    sideEffect: normalizedCapability.sideEffect,
    approvalRequired: normalizedCapability.approval.required,
    audit: {
      recordInput: normalizedCapability.audit.recordInput,
      recordOutput: normalizedCapability.audit.recordOutput
    },
    idempotency: {
      required: normalizedCapability.idempotency.required
    }
  };

  if (normalizedCapability.approval.reason !== undefined) {
    snapshot.approvalReason = normalizedCapability.approval.reason;
  }

  if (normalizedCapability.audit.redaction !== undefined) {
    snapshot.audit.redaction = normalizedCapability.audit.redaction;
  }

  if (normalizedCapability.idempotency.keyFields !== undefined) {
    snapshot.idempotency.keyFields = normalizedCapability.idempotency.keyFields;
  }

  return snapshot;
};

export const buildReproducibilityPack = (
  options: BuildReproducibilityPackOptions
): ReproducibilityPack => {
  const auditTrace = buildAuditTrace({
    response: options.response,
    capabilities: options.capabilities,
    actor: options.actor
  });
  const capabilitySnapshots = options.capabilities.map(snapshotCapability);

  return {
    version: "1.0",
    traceId: auditTrace.traceId,
    goal: auditTrace.goal,
    status: auditTrace.status,
    auditTrace,
    capabilitySnapshots,
    hashes: {
      auditTraceHash: stableJsonHash(createAuditTraceHashInput(auditTrace)),
      capabilitySnapshotsHash: stableJsonHash(capabilitySnapshots)
    },
    createdAt: auditTrace.createdAt,
    exportedAt: new Date().toISOString()
  };
};
