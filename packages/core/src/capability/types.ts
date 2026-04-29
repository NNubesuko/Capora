import { z } from "zod";
import type { JsonLike } from "../shared/json-like.js";

export interface CapabilityContext {
  now: Date;
  memory: Record<string, JsonLike>;
  traceId: string;
}

export interface CapabilityDefinition<TInput extends z.ZodTypeAny, TResult> {
  name: string;
  description: string;
  inputSchema: TInput;
  requiresApproval?: boolean;
  run: (input: z.infer<TInput>, context: CapabilityContext) => Promise<TResult> | TResult;
}
