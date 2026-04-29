export type StructuredOutputJsonSchema = Record<string, unknown>;

export interface StructuredOutputModelRequest {
  systemPrompt: string;
  userPrompt: string;
  schemaName: string;
  schema: StructuredOutputJsonSchema;
}

export interface StructuredOutputModel {
  generateObject: (
    request: StructuredOutputModelRequest
  ) => Promise<unknown> | unknown;
}
