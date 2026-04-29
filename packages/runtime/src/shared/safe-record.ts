import type { JsonLike } from "@capora/core";

export const setRecordValue = (
  target: Record<string, JsonLike>,
  key: string,
  value: JsonLike
): void => {
  Object.defineProperty(target, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true
  });
};

export const copyRecord = (
  source: Record<string, JsonLike>
): Record<string, JsonLike> => {
  const target: Record<string, JsonLike> = {};

  for (const [key, value] of Object.entries(source)) {
    setRecordValue(target, key, value);
  }

  return target;
};

export const mergeRecords = (
  ...sources: Array<Record<string, JsonLike> | undefined>
): Record<string, JsonLike> => {
  const target: Record<string, JsonLike> = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      setRecordValue(target, key, value);
    }
  }

  return target;
};
