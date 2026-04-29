import type { Planner } from "@capora/core";
import { BedrockConverseStructuredOutputModel } from "./bedrock-converse-structured-output-model.js";
import type { CaporaRuntime, CreateCaporaOptions } from "./capora-runtime.js";
import { createCapora } from "./create-capora.js";
import { LLMPlanner } from "./llm-planner.js";
import { OpenAIChatCompletionsStructuredOutputModel } from "./openai-chat-completions-structured-output-model.js";
import { OpenAIResponsesStructuredOutputModel } from "./openai-responses-structured-output-model.js";
import { RuleBasedPlanner } from "./rule-based-planner.js";
import type { StructuredOutputModel } from "./structured-output-model.js";

export type LLMProvider = "openai" | "openai-compatible" | "bedrock";

export type PlannerKind = "rule-based" | "llm";

export interface PlannerEnvironmentOptions {
  env: Record<string, string | undefined>;
  planner?: string | undefined;
}

export interface ResolvedPlannerEnvironment {
  plannerKind: PlannerKind;
  provider?: LLMProvider;
  plannerName: string;
  usesLegacyBedrockPlannerAlias: boolean;
}

export interface StructuredOutputModelFactoryOptions
  extends PlannerEnvironmentOptions {
  provider?: LLMProvider;
}

export interface CreatePlannerFromEnvironmentResult {
  planner: Planner;
  plannerName: string;
  selection: ResolvedPlannerEnvironment;
}

export interface CreateCaporaFromEnvironmentOptions
  extends PlannerEnvironmentOptions {
  capabilities: CreateCaporaOptions["capabilities"];
  inputAliases?: CreateCaporaOptions["inputAliases"];
  sessionStore?: CreateCaporaOptions["sessionStore"];
}

export interface CreateCaporaFromEnvironmentResult {
  runtime: CaporaRuntime;
  plannerName: string;
  selection: ResolvedPlannerEnvironment;
}

const ruleBasedPlannerAliases = new Set(["rule-based", "rule", "default"]);

const readPlannerValue = (
  options: PlannerEnvironmentOptions
): string | undefined => options.planner ?? options.env.CAPORA_PLANNER;

const getPlannerName = (provider?: LLMProvider): string => {
  if (provider === undefined) return "RuleBasedPlanner";
  if (provider === "bedrock") return "LLMPlanner (Bedrock)";
  if (provider === "openai-compatible") return "LLMPlanner (OpenAI-compatible)";
  return "LLMPlanner (OpenAI)";
};

const resolveLLMProvider = (
  options: PlannerEnvironmentOptions
): { provider: LLMProvider; usesLegacyBedrockPlannerAlias: boolean } => {
  const selectedPlanner = readPlannerValue(options);

  if (selectedPlanner === "bedrock") {
    return {
      provider: "bedrock",
      usesLegacyBedrockPlannerAlias: true
    };
  }

  const provider = options.env.CAPORA_LLM_PROVIDER;

  if (!provider || provider === "openai") {
    return {
      provider: "openai",
      usesLegacyBedrockPlannerAlias: false
    };
  }

  if (provider === "bedrock") {
    return {
      provider: "bedrock",
      usesLegacyBedrockPlannerAlias: false
    };
  }

  if (provider === "openai-compatible") {
    return {
      provider: "openai-compatible",
      usesLegacyBedrockPlannerAlias: false
    };
  }

  throw new Error(
    `Unsupported CAPORA_LLM_PROVIDER "${provider}". Use "openai", "openai-compatible", or "bedrock".`
  );
};

const requireEnvironmentValue = (
  env: Record<string, string | undefined>,
  name: string,
  errorMessage: string
): string => {
  const value = env[name];

  if (!value) {
    throw new Error(errorMessage);
  }

  return value;
};

const readBedrockRegion = (
  env: Record<string, string | undefined>
): string | undefined => env.BEDROCK_REGION ?? env.AWS_REGION;

export const resolvePlannerFromEnvironment = (
  options: PlannerEnvironmentOptions
): ResolvedPlannerEnvironment => {
  const selectedPlanner = readPlannerValue(options);

  if (!selectedPlanner || ruleBasedPlannerAliases.has(selectedPlanner)) {
    return {
      plannerKind: "rule-based",
      plannerName: "RuleBasedPlanner",
      usesLegacyBedrockPlannerAlias: false
    };
  }

  if (selectedPlanner === "llm" || selectedPlanner === "bedrock") {
    const {
      provider,
      usesLegacyBedrockPlannerAlias
    } = resolveLLMProvider(options);

    return {
      plannerKind: "llm",
      provider,
      plannerName: getPlannerName(provider),
      usesLegacyBedrockPlannerAlias
    };
  }

  throw new Error(
    `Unsupported planner "${selectedPlanner}". Use "rule-based", "llm", or "bedrock".`
  );
};

export const createStructuredOutputModelFromEnvironment = (
  options: StructuredOutputModelFactoryOptions
): StructuredOutputModel => {
  const provider =
    options.provider ?? resolvePlannerFromEnvironment(options).provider;

  if (!provider) {
    throw new Error(
      "Structured output model creation requires CAPORA_PLANNER=llm or an explicit provider."
    );
  }

  if (provider === "bedrock") {
    return new BedrockConverseStructuredOutputModel({
      modelId: requireEnvironmentValue(
        options.env,
        "BEDROCK_MODEL_ID",
        "CAPORA_PLANNER=llm with CAPORA_LLM_PROVIDER=bedrock requires BEDROCK_MODEL_ID."
      ),
      region: readBedrockRegion(options.env)
    });
  }

  if (provider === "openai-compatible") {
    return new OpenAIChatCompletionsStructuredOutputModel({
      apiKey: requireEnvironmentValue(
        options.env,
        "CAPORA_LLM_API_KEY",
        "CAPORA_LLM_PROVIDER=openai-compatible requires CAPORA_LLM_API_KEY, CAPORA_LLM_MODEL, and CAPORA_LLM_BASE_URL."
      ),
      model: requireEnvironmentValue(
        options.env,
        "CAPORA_LLM_MODEL",
        "CAPORA_LLM_PROVIDER=openai-compatible requires CAPORA_LLM_API_KEY, CAPORA_LLM_MODEL, and CAPORA_LLM_BASE_URL."
      ),
      baseUrl: requireEnvironmentValue(
        options.env,
        "CAPORA_LLM_BASE_URL",
        "CAPORA_LLM_PROVIDER=openai-compatible requires CAPORA_LLM_BASE_URL (e.g. http://localhost:11434/v1)."
      )
    });
  }

  return new OpenAIResponsesStructuredOutputModel({
    apiKey: requireEnvironmentValue(
      options.env,
      "OPENAI_API_KEY",
      "CAPORA_PLANNER=llm with CAPORA_LLM_PROVIDER=openai requires OPENAI_API_KEY and OPENAI_MODEL."
    ),
    model: requireEnvironmentValue(
      options.env,
      "OPENAI_MODEL",
      "CAPORA_PLANNER=llm with CAPORA_LLM_PROVIDER=openai requires OPENAI_API_KEY and OPENAI_MODEL."
    )
  });
};

export const createPlannerFromEnvironment = (
  options: PlannerEnvironmentOptions
): CreatePlannerFromEnvironmentResult => {
  const selection = resolvePlannerFromEnvironment(options);

  if (selection.plannerKind === "rule-based") {
    return {
      planner: new RuleBasedPlanner(),
      plannerName: selection.plannerName,
      selection
    };
  }

  return {
    planner: new LLMPlanner({
      model: createStructuredOutputModelFromEnvironment({
        env: options.env,
        planner: options.planner,
        provider: selection.provider
      })
    }),
    plannerName: selection.plannerName,
    selection
  };
};

export const createCaporaFromEnvironment = (
  options: CreateCaporaFromEnvironmentOptions
): CreateCaporaFromEnvironmentResult => {
  const { planner, plannerName, selection } = createPlannerFromEnvironment({
    env: options.env,
    planner: options.planner
  });

  return {
    runtime: createCapora({
      capabilities: options.capabilities,
      planner,
      inputAliases: options.inputAliases,
      sessionStore: options.sessionStore
    }),
    plannerName,
    selection
  };
};
