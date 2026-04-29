import type { JsonLike } from "../shared/json-like.js";

export interface CapabilityExecutionRecord {
  capability: string;
  status: "success" | "failed";
  input: Record<string, JsonLike>;
  output?: JsonLike;
  error?: string;
}
