import type {
  StructuredOutputModel,
  StructuredOutputModelRequest
} from "./structured-output-model.js";

interface OpenAIResponsesApiResponse {
  error?: {
    message?: string;
  };
  output?: Array<{
    type?: string;
    content?: Array<
      | {
          type?: "output_text";
          text?: string;
        }
      | {
          type?: "refusal";
          refusal?: string;
        }
      | {
          type?: string;
        }
    >;
  }>;
}

const isRefusalContent = (
  item:
    | {
        type?: "output_text";
        text?: string;
      }
    | {
        type?: "refusal";
        refusal?: string;
      }
    | {
        type?: string;
      }
): item is { type?: "refusal"; refusal?: string } => item.type === "refusal";

const isOutputTextContent = (
  item:
    | {
        type?: "output_text";
        text?: string;
      }
    | {
        type?: "refusal";
        refusal?: string;
      }
    | {
        type?: string;
      }
): item is { type?: "output_text"; text?: string } => item.type === "output_text";

export interface OpenAIResponsesStructuredOutputModelOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  maxOutputTokens?: number;
}

export class OpenAIResponsesStructuredOutputModel
  implements StructuredOutputModel
{
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxOutputTokens?: number;

  constructor(options: OpenAIResponsesStructuredOutputModelOptions) {
    if (!options.apiKey) {
      throw new Error(
        "OpenAIResponsesStructuredOutputModel requires an apiKey."
      );
    }

    if (!options.model) {
      throw new Error(
        "OpenAIResponsesStructuredOutputModel requires a model."
      );
    }

    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.maxOutputTokens = options.maxOutputTokens;

    if (options.fetch) {
      this.fetchImpl = options.fetch;
      return;
    }

    if (typeof globalThis.fetch !== "function") {
      throw new Error(
        "OpenAIResponsesStructuredOutputModel requires fetch support."
      );
    }

    this.fetchImpl = globalThis.fetch.bind(globalThis);
  }

  async generateObject(request: StructuredOutputModelRequest): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        input: [
          {
            role: "system",
            content: request.systemPrompt
          },
          {
            role: "user",
            content: request.userPrompt
          }
        ],
        max_output_tokens: this.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: request.schemaName,
            strict: true,
            schema: request.schema
          }
        }
      })
    });

    const payload = (await response.json()) as OpenAIResponsesApiResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? "OpenAI Responses API request failed.");
    }

    const refusal = payload.output
      ?.filter((item) => item.type === "message")
      .flatMap((item) => item.content ?? [])
      .find(isRefusalContent);

    if (refusal?.type === "refusal") {
      throw new Error(refusal.refusal ?? "OpenAI model refused the request.");
    }

    const jsonText =
      payload.output
        ?.filter((item) => item.type === "message")
        .flatMap((item) => item.content ?? [])
        .filter(isOutputTextContent)
        .map((item) => item.text ?? "")
        .join("") ?? "";

    if (!jsonText.trim()) {
      throw new Error("OpenAI model did not return structured output.");
    }

    return JSON.parse(jsonText) as unknown;
  }
}

export type OpenAIResponsesPlannerModelOptions =
  OpenAIResponsesStructuredOutputModelOptions;

export {
  OpenAIResponsesStructuredOutputModel as OpenAIResponsesPlannerModel
};
