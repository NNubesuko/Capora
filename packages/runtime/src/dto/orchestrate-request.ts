import type { JsonLike } from "@capora/core";

export interface ApprovalDecisionInput {
  approved: boolean;
  approvedBy?: string;
  reason?: string;
  comment?: string;
}

export interface OrchestrateRequest {
  goal: string;
  providedInput?: Record<string, JsonLike>;
  approved?: boolean;
}

export interface ResumeRequest {
  sessionId: string;
  providedInput?: Record<string, JsonLike>;
  approved?: boolean;
  approval?: ApprovalDecisionInput;
}
