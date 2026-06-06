# Capora

**Lightweight capability orchestration for safe, auditable AI-driven business workflows.**

Capora is not another general-purpose agent framework. Instead of letting an AI agent freely call arbitrary tools, Capora helps developers define explicit business capabilities and lets an LLM plan, ask for missing inputs, and execute only those approved capabilities.

Capora is designed to work alongside agent frameworks, LLM providers, and tool protocols such as OpenAI, Amazon Bedrock, and MCP. Its focus is the business execution layer: capability contracts, workflow planning, missing input resolution, approvals, audit-friendly traces, and reproducibility.

- [English](#english)
- [日本語](#日本語)

---

## English

### What is Capora

**Capora** is a lightweight capability orchestration framework for building safe, auditable AI-driven business workflows.

It is not a replacement for OpenAI Agents, Amazon Bedrock Agents, LangGraph, MCP, or other agent and tool ecosystems. Capora focuses on the layer where AI-driven plans become business operations with clear contracts, controlled side effects, missing input handling, approval pauses, and traceable execution.

Instead of exposing arbitrary tools to an agent, Capora lets service developers declare:

- what the system can do (**capabilities**)
- what inputs are required
- where approval is needed
- what execution should record

From there, Capora helps an LLM or agent turn a user's goal into a constrained workflow plan, collect only the missing information, pause when approval is required, and execute in-memory handlers through the capability registry.

### Why Capora

Modern AI agents can plan, call tools, and complete multi-step tasks. However, business applications often need more than tool calling.

They need:

- explicit capability definitions
- controlled side effects
- missing input resolution
- human approval before risky actions
- audit-friendly execution traces
- reproducible workflow runs
- provider-agnostic LLM integration

Capora focuses on this layer.

It is useful when users want outcomes rather than screens:

- "Create and send the invoice for customer A"
- "Register a new employee"
- "Approve this request"

**Capora helps structure safer AI-driven workflows around explicit business capabilities.**

### How Capora relates to Agents and MCP

Capora is not intended to replace agent frameworks or MCP.

Agent frameworks provide reasoning loops, tool calling, handoffs, memory, and runtime behavior. MCP provides a standard way for AI applications to connect to external tools and data sources.

Capora sits between AI planning and business execution.

```text
Agent / LLM / MCP client
        ↓
Capora
        ↓
Business capabilities / APIs / databases / SaaS
```

Capora can use LLMs to create workflow plans, and future versions may wrap MCP tools as Capora capabilities. The goal is to make agentic workflows safer, more auditable, and easier to integrate into business applications.

### Capabilities

A capability is an explicit business operation that Capora is allowed to execute.

Examples:

- `customer.find`
- `customer.create`
- `invoice.createDraft`
- `invoice.send`

Unlike a raw tool call, a capability is meant to represent a business operation with a clear contract. Today, capabilities define names, descriptions, zod input schemas, approval requirements, side-effect level, idempotency, and in-memory handlers. Over time, the contract can evolve to include richer business metadata such as audit policy, capability versioning, and stronger idempotency rules.

### What Capora is not

- just a chat UI
- just an LLM wrapper
- an MCP replacement
- a complete general-purpose agent framework
- just a workflow automation tool
- just a prompt library

Its main job is not to provide general-purpose autonomy. Its main job is to **orchestrate explicit business capabilities so LLMs and agents can plan, ask for missing inputs, and execute workflows in a safer, auditable, business-oriented way**.

### Design goals

| Principle | Description |
|---|---|
| **Goal-first** | Users describe what they want to achieve, not which screen to open. |
| **Capability-first** | Developers define business operations and constraints, not arbitrary tool access. |
| **Minimal interaction** | Only ask the user for information that is actually missing. |
| **Human control** | High-risk or irreversible actions must support approval gates. |
| **Auditability** | Meaningful steps should be explainable and traceable. |
| **Provider-agnostic** | Planning can work with rule-based logic or compatible LLM providers. |
| **Integration-friendly** | Capora is designed to sit behind web, chat, voice, agent, and future MCP-based interfaces. |

### Architecture

```text
User
  ↓
UI / Agent / LLM
  ↓
Capora Runtime
  ├─ Planner
  ├─ Missing Info Collector
  ├─ Approval Gate
  ├─ Executor
  └─ Trace Events
  ↓
Capability Registry
  ↓
Business Handlers / Internal APIs / External Services
```

### Packages

| Package | Description |
|---|---|
| `@capora/core` | Stable domain contracts and capability definition helpers |
| `@capora/runtime` | Workflow orchestration and execution engine |
| `@capora/sdk` | Public developer-facing API |
| `@capora/ui-contracts` | UI-neutral response models for frontends |
| `@capora/adapter-web` | Web-friendly response mapping helpers |

```bash
npm install @capora/sdk
```

### Capability definition

```ts
import { z } from "zod";
import { defineCapability } from "@capora/sdk";

export const createInvoiceDraft = defineCapability({
  name: "invoice.createDraft",
  description: "Create a draft invoice for a customer",
  input: z.object({
    customerId: z.string(),
    amount: z.number(),
    currency: z.string(),
    description: z.string(),
  }),
  approval: { required: false },
  idempotent: true,
  sideEffect: "low",
  handler: async ({ input }) => {
    return { invoiceId: "inv_123", status: "draft" };
  },
});
```

### Using the runtime

```ts
import { createCapora } from "@capora/sdk";

const runtime = createCapora({ capabilities });

const result = await runtime.orchestrate({
  goal: "Send the April design retainer invoice to Alice.",
});
```

Use `createCaporaFromEnvironment` to select the planner from environment variables:

```ts
import { createCaporaFromEnvironment } from "@capora/sdk";

const { runtime } = createCaporaFromEnvironment({
  env: process.env,
  capabilities,
});
```

### LLM planner

Capora includes a `RuleBasedPlanner` (default, no LLM required) and an `LLMPlanner` that delegates planning to any compatible model.

**OpenAI-compatible** (OpenAI, Ollama, Groq, OpenRouter, Azure, LM Studio, etc.):

```ts
import { createCapora, LLMPlanner, OpenAIChatCompletionsStructuredOutputModel } from "@capora/sdk";

const runtime = createCapora({
  capabilities,
  planner: new LLMPlanner({
    model: new OpenAIChatCompletionsStructuredOutputModel({
      apiKey: process.env.CAPORA_LLM_API_KEY!,
      model: process.env.CAPORA_LLM_MODEL!,
      baseUrl: process.env.CAPORA_LLM_BASE_URL!, // e.g. https://api.openai.com/v1
    }),
  }),
});
```

**AWS Bedrock** (uses the AWS SDK credential chain — no API key needed):

```ts
import { createCapora, LLMPlanner, BedrockConverseStructuredOutputModel } from "@capora/sdk";

const runtime = createCapora({
  capabilities,
  planner: new LLMPlanner({
    model: new BedrockConverseStructuredOutputModel({
      modelId: process.env.BEDROCK_MODEL_ID!,
      region: process.env.AWS_REGION,
    }),
  }),
});
```

**Environment variable reference** (used by `createCaporaFromEnvironment`):

| Variable | Description |
|---|---|
| `CAPORA_PLANNER` | `rule-based` (default) or `llm` |
| `CAPORA_LLM_PROVIDER` | `openai-compatible`, `openai`, or `bedrock` |
| `CAPORA_LLM_BASE_URL` | Base URL for OpenAI-compatible API (e.g. `https://api.openai.com/v1`) |
| `CAPORA_LLM_API_KEY` | API key for `openai-compatible` or `openai` |
| `CAPORA_LLM_MODEL` | Model name for `openai-compatible` |
| `OPENAI_API_KEY` | API key for `openai` provider |
| `OPENAI_MODEL` | Model name for `openai` provider |
| `BEDROCK_MODEL_ID` | Model ID for `bedrock` provider |
| `AWS_REGION` / `BEDROCK_REGION` | AWS region for `bedrock` provider |

### Orchestration states

Runtime responses are modeled as explicit states:

| State | Description |
|---|---|
| `needs_input` | Capora is waiting for missing required fields |
| `needs_approval` | Capora is paused before a capability that requires approval |
| `completed` | Workflow executed successfully |
| `failed` | Workflow encountered an unrecoverable error |

Paused states include a `sessionId` so callers can resume with `runtime.resume()`.

### Trace events

Every turn produces structured trace events:

`goal.received` → `plan.created` → `step.entered` → `step.awaiting_input` → `step.resumed` → `step.executed` → `step.completed` → `workflow.completed`

### Try the demo

The consolidated `demo/` directory contains a standalone web GUI that does not require the monorepo workspace. It uses the published npm packages.

```bash
cd demo
cp .env.example .env   # configure LLM provider if desired
pnpm install
pnpm dev               # API on :3031, web UI on :5173
```

Open `http://localhost:5173` and try:

> "2026年12月の請求書を新規顧客に送りたい"

The demo walks through the full invoice flow: collect customer info → collect invoice details → request approval → complete.

### Example output

```
Goal: Send the April design retainer invoice to Alice.

Turn 1 — needs_input
  Plan: customer.find → invoice.createDraft → invoice.send
  Waiting for: customerEmail

Turn 2 — needs_input (after customerEmail: alice@example.com)
  Waiting for: amount, currency, description

Turn 3 — needs_approval (after invoice details)
  Paused before: invoice.send (requires approval)

Turn 4 — completed (after approval)
  customer.find: success
  invoice.createDraft: success
  invoice.send: success
  Trace events recorded: 15
```

### Use cases

Capora is a good fit for:

- invoicing and back-office operations
- approval-heavy internal systems
- HR workflows
- CRM and case handling
- AI-native SaaS products
- conversational frontends over existing business systems

### Roadmap

Capora is moving toward a capability orchestration layer for safe, auditable agentic workflows.

Planned areas include:

- Capability Contract v1
  - side effect metadata
  - approval metadata
  - audit metadata
  - idempotency metadata

- Plan Validation
  - validate LLM-generated plans before execution
  - block unknown or unsafe capabilities
  - detect missing inputs before runtime

- Human Approval
  - pause before risky operations
  - resume after approval
  - record approval decisions in traces

- Audit Trace
  - run-level and step-level traces
  - capability version records
  - input/output hashing or redaction
  - trace export

- Reproducibility
  - replay from trace
  - dry-run execution
  - regression tests for planner behavior

- MCP Integration
  - wrap MCP tools as Capora capabilities
  - apply Capora approval and audit policies to MCP tool calls

### Non-goals for v0

- multi-agent orchestration
- advanced visual workflow builders
- full no-code authoring
- self-improving autonomous workflows
- broad enterprise RBAC frameworks

### Contributing

Contributions, design discussions, and feedback are welcome.

Especially valuable in the early phase:

- capability model design
- runtime contracts
- approval and trace model
- TypeScript DX improvements
- adapter implementations (MCP, Slack, voice)

### License

Apache License 2.0. See [LICENSE](./LICENSE) for the full text.

---

## 日本語

### Caporaとは

**Capora** は、安全で監査しやすいAI駆動のビジネスワークフローを構築するための、軽量なcapability orchestration frameworkです。

Caporaは、OpenAI Agents、Amazon Bedrock Agents、LangGraph、MCPなどを置き換えるものではありません。AIが作成した計画を、明確な契約、制御された副作用、不足入力の解決、承認による一時停止、追跡可能な実行を持つビジネス操作へつなぐ層に集中します。

任意のtoolをagentに自由に公開するのではなく、Caporaはサービス開発者が以下を宣言できるようにします。

- システムが何をできるか（**capabilities**）
- どの入力が必要か
- どこで承認が必要か
- 実行時に何を記録するか

その上で、CaporaはLLMやagentがユーザーの目標を制約されたworkflow planに変換し、不足情報だけを集め、承認が必要な箇所で一時停止し、capability registryを通じてin-memory handlerを実行できるよう支援します。

### なぜCaporaなのか

現代のAI agentは、計画を立て、toolを呼び出し、複数ステップのタスクを実行できます。しかし、ビジネスアプリケーションでは単なるtool calling以上のものが必要になることがよくあります。

必要になるもの:

- 明示的なcapability定義
- 制御された副作用
- 不足入力の解決
- リスクのある操作前の人間による承認
- 監査しやすい実行trace
- 再現可能なworkflow run
- LLM providerに依存しない統合

Caporaはこの層に集中します。

ユーザーが欲しいのは画面ではなく、結果です。

- 「顧客Aの請求書を作って送って」
- 「新しい従業員を登録して」
- 「この申請を承認して」

**Caporaは、明示的な業務capabilityを中心に、より安全なAI駆動ワークフローを構造化するためのものです。**

### Agent / MCPとの関係

Caporaは、agent frameworkやMCPを置き換えることを目的としていません。

Agent frameworkは、reasoning loop、tool calling、handoff、memory、runtime behaviorを提供します。MCPは、AIアプリケーションが外部toolやdata sourceへ接続するための標準的な方法を提供します。

Caporaは、AIによる計画とビジネス実行の間に位置します。

```text
Agent / LLM / MCP client
        ↓
Capora
        ↓
Business capabilities / APIs / databases / SaaS
```

CaporaはLLMを使ってworkflow planを作成できます。将来的にはMCP toolをCapora capabilityとしてwrapする可能性があります。目的は、agentic workflowをより安全で監査しやすく、ビジネスアプリケーションへ統合しやすくすることです。

### Capabilities

Capabilityは、Caporaが実行を許可された明示的な業務操作です。

例:

- `customer.find`
- `customer.create`
- `invoice.createDraft`
- `invoice.send`

生のtool callとは異なり、capabilityは明確な契約を持つ業務操作を表すことを意図しています。現時点では、capabilityはname、description、zod input schema、approval requirement、side-effect level、idempotency、in-memory handlerを定義します。今後は、audit policy、capability versioning、より強いidempotency ruleなどの業務メタデータを含められるように発展させる予定です。

### Caporaではないもの

- 単なるチャットUI
- 単なるLLMラッパー
- MCPの代替
- 完全な汎用agent framework
- 単なるワークフロー自動化ツール
- 単なるプロンプトライブラリ

Caporaの主な役割は、汎用的な自律性を提供することではありません。**明示的な業務capabilityをオーケストレーションし、LLMやagentがplanを作り、不足入力を確認し、より安全で監査しやすいビジネス指向のworkflowとして実行できるようにすること**です。

### 設計目標

| 原則 | 内容 |
|---|---|
| **Goal-first** | ユーザーは、どの画面を開くかではなく、何を達成したいかを説明できるべきです。 |
| **Capability-first** | 開発者は、任意のtool accessではなく、業務操作と制約を定義します。 |
| **Minimal interaction** | 実際に不足している情報だけをユーザーに尋ねます。 |
| **Human control** | 高リスクまたは取り消し不能な操作では、承認ゲートが必要です。 |
| **Auditability** | 意味のあるステップは、説明可能で追跡可能であるべきです。 |
| **Provider-agnostic** | planningはrule-based logicまたは互換性のあるLLM providerで動作できます。 |
| **Integration-friendly** | Caporaは、Web・chat・音声・agent・将来のMCPベースinterfaceの背後に配置できるよう設計されています。 |

### アーキテクチャ

```text
ユーザー
  ↓
UI / Agent / LLM
  ↓
Capora Runtime
  ├─ Planner
  ├─ Missing Info Collector
  ├─ Approval Gate
  ├─ Executor
  └─ Trace Events
  ↓
Capability Registry
  ↓
Business Handlers / Internal APIs / External Services
```

### パッケージ

| パッケージ | 内容 |
|---|---|
| `@capora/core` | ドメイン契約とcapability定義ヘルパー |
| `@capora/runtime` | ワークフローオーケストレーションエンジン |
| `@capora/sdk` | 開発者向けの公開API |
| `@capora/ui-contracts` | UIに依存しないレスポンスモデル |
| `@capora/adapter-web` | Web向けレスポンス整形ヘルパー |

```bash
npm install @capora/sdk
```

### capability定義の例

```ts
import { z } from "zod";
import { defineCapability } from "@capora/sdk";

export const createInvoiceDraft = defineCapability({
  name: "invoice.createDraft",
  description: "顧客向けの請求書ドラフトを作成する",
  input: z.object({
    customerId: z.string(),
    amount: z.number(),
    currency: z.string(),
    description: z.string(),
  }),
  approval: { required: false },
  idempotent: true,
  sideEffect: "low",
  handler: async ({ input }) => {
    return { invoiceId: "inv_123", status: "draft" };
  },
});
```

### ランタイムの利用

```ts
import { createCapora } from "@capora/sdk";

const runtime = createCapora({ capabilities });

const result = await runtime.orchestrate({
  goal: "4月分のデザイン費の請求書をAliceに送って。",
});
```

環境変数でプランナーを選択する場合は `createCaporaFromEnvironment` を使います。

```ts
import { createCaporaFromEnvironment } from "@capora/sdk";

const { runtime } = createCaporaFromEnvironment({
  env: process.env,
  capabilities,
});
```

### LLMプランナー

CaporaはデフォルトでLLM不要の `RuleBasedPlanner` を使います。`LLMPlanner` に切り替えると、任意のAIモデルでワークフローを計画できます。

**OpenAI互換** (OpenAI, Ollama, Groq, OpenRouter, Azure, LM Studioなど):

```ts
import { createCapora, LLMPlanner, OpenAIChatCompletionsStructuredOutputModel } from "@capora/sdk";

const runtime = createCapora({
  capabilities,
  planner: new LLMPlanner({
    model: new OpenAIChatCompletionsStructuredOutputModel({
      apiKey: process.env.CAPORA_LLM_API_KEY!,
      model: process.env.CAPORA_LLM_MODEL!,
      baseUrl: process.env.CAPORA_LLM_BASE_URL!, // 例: https://api.openai.com/v1
    }),
  }),
});
```

**AWS Bedrock** (APIキー不要、AWS SDKの認証チェーンを使用):

```ts
import { createCapora, LLMPlanner, BedrockConverseStructuredOutputModel } from "@capora/sdk";

const runtime = createCapora({
  capabilities,
  planner: new LLMPlanner({
    model: new BedrockConverseStructuredOutputModel({
      modelId: process.env.BEDROCK_MODEL_ID!,
      region: process.env.AWS_REGION,
    }),
  }),
});
```

**環境変数リファレンス** (`createCaporaFromEnvironment` で使用):

| 変数 | 内容 |
|---|---|
| `CAPORA_PLANNER` | `rule-based`（デフォルト）または `llm` |
| `CAPORA_LLM_PROVIDER` | `openai-compatible`、`openai`、または `bedrock` |
| `CAPORA_LLM_BASE_URL` | OpenAI互換APIのベースURL（例: `https://api.openai.com/v1`） |
| `CAPORA_LLM_API_KEY` | `openai-compatible` または `openai` のAPIキー |
| `CAPORA_LLM_MODEL` | `openai-compatible` のモデル名 |
| `OPENAI_API_KEY` | `openai` プロバイダーのAPIキー |
| `OPENAI_MODEL` | `openai` プロバイダーのモデル名 |
| `BEDROCK_MODEL_ID` | `bedrock` プロバイダーのモデルID |
| `AWS_REGION` / `BEDROCK_REGION` | `bedrock` プロバイダーのAWSリージョン |

### オーケストレーション状態

| 状態 | 内容 |
|---|---|
| `needs_input` | 必須フィールドの入力待ち |
| `needs_approval` | 承認が必要なcapability実行前の一時停止 |
| `completed` | ワークフロー正常完了 |
| `failed` | 回復不能なエラー発生 |

一時停止状態は `sessionId` を持ち、`runtime.resume()` で再開できます。

### デモの試し方

統合された `demo/` ディレクトリは、モノレポのワークスペースに依存しないスタンドアロンのWebデモです。npmパッケージを使用します。

```bash
cd demo
cp .env.example .env   # LLMプランナーを使う場合は設定する
pnpm install
pnpm dev               # API: :3031、Web UI: :5173
```

ブラウザで `http://localhost:5173` を開き、次のように入力してみてください。

> 「2026年12月の請求書を新規顧客に送りたい」

顧客情報の収集 → 請求書情報の収集 → 承認リクエスト → 完了、という一連のフローを体験できます。

### 使用例

Caporaは次のようなシステムに適しています。

- 請求処理やバックオフィス業務
- 承認の多い社内システム
- HRワークフロー
- CRMやケース処理
- AIネイティブなSaaSプロダクト
- 既存の業務システム上に載る会話型フロントエンド

### ロードマップ

Caporaは、安全で監査しやすいagentic workflowのためのcapability orchestration layerへ向かっています。

今後の予定領域:

- Capability Contract v1
  - side effect metadata
  - approval metadata
  - audit metadata
  - idempotency metadata

- Plan Validation
  - LLMが生成したplanを実行前に検証する
  - 未知または安全でないcapabilityをブロックする
  - runtime前に不足入力を検出する

- Human Approval
  - リスクのある操作前に一時停止する
  - 承認後に再開する
  - 承認判断をtraceに記録する

- Audit Trace
  - run-level / step-level trace
  - capability version record
  - input/output hashingまたはredaction
  - trace export

- Reproducibility
  - traceからのreplay
  - dry-run execution
  - planner behaviorのregression test

- MCP Integration
  - MCP toolをCapora capabilityとしてwrapする
  - MCP tool callにCaporaのapproval / audit policyを適用する

### 初期バージョンにおける非目標

- マルチエージェントオーケストレーション
- 高度なビジュアルワークフロービルダー
- 完全なノーコードオーサリング
- 自己改善型の自律ワークフロー
- 広範なエンタープライズRBACフレームワーク

### コントリビュート

コントリビューション、設計に関する議論、フィードバックを歓迎します。

初期フェーズでは、特に次のような貢献が有益です。

- capabilityモデル設計
- ランタイム契約
- 承認／トレースモデル
- TypeScript DX
- アダプター実装（MCP、Slack、音声）

### ライセンス

Apache License 2.0。詳細は [LICENSE](./LICENSE) を参照してください。
