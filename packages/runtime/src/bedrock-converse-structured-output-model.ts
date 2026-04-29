import {
  BedrockRuntime,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Message
} from "@aws-sdk/client-bedrock-runtime";
import { toErrorMessage } from "./shared/to-error-message.js";
import type {
  StructuredOutputJsonSchema,
  StructuredOutputModel,
  StructuredOutputModelRequest
} from "./structured-output-model.js";

const structuredOutputToolName = "structured_output";

type BedrockTool = NonNullable<
  NonNullable<ConverseCommandInput["toolConfig"]>["tools"]
>[number];

type BedrockToolSpec = NonNullable<
  Extract<BedrockTool, { toolSpec: unknown }>["toolSpec"]
>;

type BedrockToolSchemaDocument = NonNullable<
  Extract<NonNullable<BedrockToolSpec["inputSchema"]>, { json: unknown }>["json"]
>;

const buildMissingStructuredOutputError = (
  response: ConverseCommandOutput
): Error => {
  const stopReasonSuffix = response.stopReason
    ? ` Stop reason: ${response.stopReason}.`
    : "";

  return new Error(
    `Bedrock model did not return structured output.${stopReasonSuffix}`
  );
};

const getOutputMessage = (
  response: ConverseCommandOutput
): Message | undefined => {
  const output = response.output;

  if (!output || !("message" in output)) {
    return undefined;
  }

  return output.message;
};

const isStructuredOutputToolUseBlock = (
  block: NonNullable<Message["content"]>[number]
): block is Extract<
  NonNullable<Message["content"]>[number],
  { toolUse: unknown }
> =>
  "toolUse" in block && block.toolUse?.name === structuredOutputToolName;

const isObjectSchema = (schema: StructuredOutputJsonSchema): boolean =>
  typeof schema === "object" &&
  schema !== null &&
  "type" in schema &&
  schema.type === "object";

export interface BedrockConverseClient {
  converse: (
    input: ConverseCommandInput
  ) => Promise<ConverseCommandOutput> | ConverseCommandOutput;
}

export interface BedrockConverseStructuredOutputModelOptions {
  modelId: string;
  region?: string;
  client?: BedrockConverseClient;
  maxTokens?: number;
}

export class BedrockConverseStructuredOutputModel
  implements StructuredOutputModel
{
  private readonly client: BedrockConverseClient;
  private readonly modelId: string;
  private readonly maxTokens?: number;

  constructor(options: BedrockConverseStructuredOutputModelOptions) {
    if (!options.modelId) {
      throw new Error(
        "BedrockConverseStructuredOutputModel requires a modelId."
      );
    }

    this.modelId = options.modelId;
    this.maxTokens = options.maxTokens;
    this.client =
      options.client ??
      new BedrockRuntime(
        options.region
          ? {
              region: options.region
            }
          : {}
      );
  }

  async generateObject(request: StructuredOutputModelRequest): Promise<unknown> {
    if (!isObjectSchema(request.schema)) {
      throw new Error(
        "BedrockConverseStructuredOutputModel requires an object JSON schema."
      );
    }

    let response: ConverseCommandOutput;

    try {
      response = await this.client.converse({
        modelId: this.modelId,
        system: [
          {
            text: request.systemPrompt
          }
        ],
        messages: [
          {
            role: "user",
            content: [
              {
                text: request.userPrompt
              }
            ]
          }
        ],
        inferenceConfig:
          this.maxTokens === undefined
            ? undefined
            : {
                maxTokens: this.maxTokens
              },
        // Capora treats Bedrock tool use as a transport for schema-validated objects.
        toolConfig: {
          tools: [
            {
              toolSpec: {
                name: structuredOutputToolName,
                description:
                  "Return the structured response object that matches the provided JSON schema.",
                inputSchema: {
                  json: request.schema as BedrockToolSchemaDocument
                },
                strict: true
              }
            }
          ],
          toolChoice: {
            any: {}
          }
        }
      });
    } catch (error) {
      throw new Error(
        `Bedrock Converse API request failed: ${toErrorMessage(error)}`
      );
    }

    const message = getOutputMessage(response);

    if (!message?.content?.length) {
      throw buildMissingStructuredOutputError(response);
    }

    const toolUseBlock = message.content.find(isStructuredOutputToolUseBlock);
    const toolUse = toolUseBlock?.toolUse;

    if (!toolUse || toolUse.input === undefined) {
      throw buildMissingStructuredOutputError(response);
    }

    return toolUse.input as unknown;
  }
}
