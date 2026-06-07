import type { AuditTrace } from "../audit/audit-trace.js";

export type ReproducibilityPackVersion = "1.0";

export type CapabilitySnapshot = {
  name: string;
  description: string;
  version: string;
  sideEffect: string;
  approvalRequired: boolean;
  approvalReason?: string;
  audit: {
    recordInput: boolean;
    recordOutput: boolean;
    redaction?: string[];
  };
  idempotency: {
    required: boolean;
    keyFields?: string[];
  };
};

export type ReproducibilityPack = {
  version: ReproducibilityPackVersion;
  traceId: string;
  goal: string;
  status: "needs_input" | "needs_approval" | "completed" | "failed";
  auditTrace: AuditTrace;
  capabilitySnapshots: CapabilitySnapshot[];
  hashes: {
    auditTraceHash: string;
    capabilitySnapshotsHash: string;
  };
  createdAt: string;
  exportedAt: string;
};
