import type { CapabilityDefinition, JsonLike } from "@capora/core";
import { z } from "zod";
import type { MissingField } from "../dto/orchestrate-response.js";

export const getMissingRequiredFields = (
  capability: CapabilityDefinition<any, any>,
  input: Record<string, JsonLike>
): MissingField[] => {
  if (!(capability.inputSchema instanceof z.ZodObject)) {
    return [];
  }

  const shape = capability.inputSchema.shape as Record<string, z.ZodTypeAny>;

  return Object.entries(shape)
    .filter(([, schema]) => {
      const isOptional = schema instanceof z.ZodOptional || schema instanceof z.ZodDefault;
      return !isOptional;
    })
    .filter(([field]) => input[field] === undefined || input[field] === null || input[field] === "")
    .map(([field]) => ({
      field,
      question: `Please provide ${field}.`
    }));
};
