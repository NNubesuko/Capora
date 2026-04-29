import { z } from "zod";
import type { CapabilityDefinition } from "./types.js";

export const defineCapability = <TInput extends z.ZodTypeAny, TResult>(
  capability: CapabilityDefinition<TInput, TResult>
): CapabilityDefinition<TInput, TResult> => capability;
