import { createHash } from "node:crypto";

const normalizeForStableJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableJson(item));
  }

  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;

    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((accumulator, key) => {
        const normalizedValue = normalizeForStableJson(record[key]);

        if (normalizedValue !== undefined) {
          accumulator[key] = normalizedValue;
        }

        return accumulator;
      }, {});
  }

  return value;
};

export const stableJsonHash = (value: unknown): string => {
  const stableJson = JSON.stringify(normalizeForStableJson(value)) ?? "undefined";

  return createHash("sha256").update(stableJson).digest("hex");
};
