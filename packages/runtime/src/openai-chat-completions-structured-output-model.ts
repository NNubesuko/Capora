import type {
  StructuredOutputModel,
  StructuredOutputModelRequest
} from "./structured-output-model.js";

interface ChatCompletionsApiResponse {
  error?: {
    message?: string;
  };
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
    finish_reason?: string;
  }>;
}

export interface OpenAIChatCompletionsStructuredOutputModelOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  maxTokens?: number;
}

export class OpenAIChatCompletionsStructuredOutputModel
  implements StructuredOutputModel
{
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxTokens?: number;

  constructor(options: OpenAIChatCompletionsStructuredOutputModelOptions) {
    if (!options.apiKey) {
      throw new Error(
        "OpenAIChatCompletionsStructuredOutputModel requires an apiKey."
      );
    }

    if (!options.model) {
      throw new Error(
        "OpenAIChatCompletionsStructuredOutputModel requires a model."
      );
    }

    this.apiKey = options.apiKey;
    this.model = options.model;
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
    this.maxTokens = options.maxTokens;

    if (options.fetch) {
      this.fetchImpl = options.fetch;
      return;
    }

    if (typeof globalThis.fetch !== "function") {
      throw new Error(
        "OpenAIChatCompletionsStructuredOutputModel requires fetch support."
      );
    }

    this.fetchImpl = globalThis.fetch.bind(globalThis);
  }

  async generateObject(
    request: StructuredOutputModelRequest
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt }
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: request.schemaName,
          strict: true,
          schema: request.schema
        }
      }
    };

    if (this.maxTokens !== undefined) {
      body.max_tokens = this.maxTokens;
    }

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    const payload = (await response.json()) as ChatCompletionsApiResponse;

    if (!response.ok) {
      throw new Error(
        payload.error?.message ?? "Chat Completions API request failed."
      );
    }

    const choice = payload.choices?.[0];

    if (!choice) {
      throw new Error("Chat Completions API returned no choices.");
    }

    if (choice.message?.refusal) {
      throw new Error(choice.message.refusal);
    }

    const jsonText = choice.message?.content;

    if (!jsonText?.trim()) {
      throw new Error(
        "Chat Completions API did not return structured output."
      );
    }

    return JSON.parse(jsonText) as unknown;
  }
}
