import type { JsonLike } from "@capora/core";

export interface OrchestrateRequest {
  goal: string;
  providedInput?: Record<string, JsonLike>;
  approved?: boolean;
}

export interface ResumeRequest {
  sessionId: string;
  providedInput?: Record<string, JsonLike>;
  approved?: boolean;
}
