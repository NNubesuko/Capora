import { createUuidV7 } from "./uuid.js";

export const createIdentifier = (prefix: string): string => {
  return `${prefix}_${createUuidV7()}`;
};

export const createSessionId = (): string => createIdentifier("session");

export const createTraceId = (): string => createIdentifier("trace");
