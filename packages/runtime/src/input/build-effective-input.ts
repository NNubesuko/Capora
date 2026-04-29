import type { JsonLike } from "@capora/core";
import type { InputAliases } from "./input-aliases.js";
import {
  copyRecord,
  mergeRecords,
  setRecordValue
} from "../shared/safe-record.js";

const hasValue = (value: JsonLike | undefined): value is JsonLike =>
  value !== undefined && value !== null && value !== "";

const isJsonRecord = (value: JsonLike | undefined): value is Record<string, JsonLike> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwnValue = (
  value: Record<string, JsonLike>,
  key: string
): boolean =>
  Object.prototype.hasOwnProperty.call(value, key) && hasValue(value[key]);

const resolveAliasValue = (
  source: string,
  input: Record<string, JsonLike>,
  memory: Record<string, JsonLike>
): JsonLike | undefined => {
  if (hasOwnValue(input, source)) {
    return input[source];
  }

  const separatorIndex = source.lastIndexOf(".");
  if (separatorIndex <= 0 || separatorIndex === source.length - 1) {
    return undefined;
  }

  const capabilityName = source.slice(0, separatorIndex);
  const field = source.slice(separatorIndex + 1);
  const output = memory[capabilityName];

  if (!isJsonRecord(output) || !hasOwnValue(output, field)) {
    return undefined;
  }

  return output[field];
};

const applyInputAliases = (
  capabilityName: string,
  input: Record<string, JsonLike>,
  memory: Record<string, JsonLike>,
  inputAliases?: InputAliases
): Record<string, JsonLike> => {
  const aliases = inputAliases?.[capabilityName];
  if (!aliases) {
    return input;
  }

  const resolvedInput = copyRecord(input);

  for (const [targetField, sources] of Object.entries(aliases)) {
    if (hasOwnValue(resolvedInput, targetField)) {
      continue;
    }

    const sourceList = Array.isArray(sources) ? sources : [sources];

    for (const source of sourceList) {
      const value = resolveAliasValue(source, resolvedInput, memory);
      if (!hasValue(value)) {
        continue;
      }

      setRecordValue(resolvedInput, targetField, value);
      break;
    }
  }

  return resolvedInput;
};

export const buildEffectiveInput = (
  capabilityName: string,
  providedInput: Record<string, JsonLike>,
  memory: Record<string, JsonLike>,
  inputAliases?: InputAliases
): Record<string, JsonLike> => {
  const previousOutputInput: Record<string, JsonLike> = {};

  for (const output of Object.values(memory)) {
    if (!isJsonRecord(output)) {
      continue;
    }

    for (const [key, value] of Object.entries(output)) {
      setRecordValue(previousOutputInput, key, value);
    }
  }

  const input = mergeRecords(previousOutputInput, providedInput);

  return applyInputAliases(capabilityName, input, memory, inputAliases);
};
