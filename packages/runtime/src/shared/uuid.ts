import { v7 as uuidV7, validate as uuidValidate, version as uuidVersion } from "uuid";
import type { Version7Options } from "uuid";

export type { Version7Options } from "uuid";

export const createUuidV7 = (options?: Version7Options): string =>
  uuidV7(options);

export const isUuid = (value: string): boolean => uuidValidate(value);

export const isUuidV7 = (value: string): boolean =>
  uuidValidate(value) && uuidVersion(value) === 7;
