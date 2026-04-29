# Capora

**AI-native orchestration framework for conversation-first business workflows.**

- [English](#english)
- [日本語](#日本語)

---

## English

### What is Capora

**Capora** is an AI-native orchestration framework for building conversation-first business workflows.

Instead of forcing users to navigate complex UIs and multi-step forms, Capora lets service developers declare:

- what the system can do (**capabilities**)
- what inputs are required
- where approval is needed
- what must be logged

From there, Capora helps AI turn a user's goal into a safe, minimal-interaction workflow.

### Why Capora

Traditional SaaS products are built around screens — list screens, edit screens, settings screens, confirmation screens. But users do not actually want screens. They want outcomes.

They want to say:

- "Create and send the invoice for customer A"
- "Register a new employee"
- "Approve this request"

Capora enables developers to build systems where:

- a user starts with natural language
- AI plans the workflow
- missing information is collected only when needed
- risky actions are gated by approval
- execution is traceable and auditable

**Capora is a runtime for letting AI safely compose business workflows.**

### What Capora is not

- just a chat UI
- just an LLM wrapper
- just an MCP server generator
- just a workflow automation tool
- just a prompt library

Its main job is not to talk. Its main job is to **safely execute business intent through AI-assisted orchestration**.

### Design goals

| Principle | Description |
|---|---|
| **Goal-first** | Users describe what they want to achieve, not which screen to open. |
| **Capability-first** | Developers define business capabilities, not UI flows. |
| **Minimal interaction** | Only ask the user for information that is actually missing. |
| **Human control** | High-risk or irreversible actions must support approval gates. |
| **Auditability** | Every meaningful step should be explainable and traceable. |
| **UI-agnostic** | The same runtime works with web, Slack, voice, MCP, and future interfaces. |

### Architecture

```text
User
  ↓
UI Adapter (web / chat / voice / MCP)
  ↓
Capora Runtime
  ├─ Planner
  ├─ Missing Info Collector
  ├─ Approval Gate
  ├─ Executor
  └─ Audit Trace
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

**Capora** は、会話を起点とするビジネスワークフローを構築するための、AIネイティブなオーケストレーションフレームワークです。

複雑なUIや多段階のフォームをユーザーに操作させるのではなく、Caporaはサービス開発者が以下を宣言できるようにします。

- システムが何をできるか（**capabilities**）
- どの入力が必要か
- どこで承認が必要か
- 何を記録しなければならないか

その上で、CaporaはAIがユーザーの目標を、安全で最小限のやり取りによるワークフローへ変換できるよう支援します。

### なぜCaporaなのか

従来のSaaSプロダクトは画面を中心に作られています。しかし、ユーザーが本当に欲しいのは画面ではありません。欲しいのは結果です。

- 「顧客Aの請求書を作って送って」
- 「新しい従業員を登録して」
- 「この申請を承認して」

Caporaは、それを可能にするために存在します。

- ユーザーが自然言語で開始する
- AIがワークフローを計画する
- 足りない情報は必要になったときだけ収集される
- リスクのある操作は承認によって制御される
- 実行は追跡可能で監査可能である

**Caporaは、AIが安全にビジネスワークフローを組み立てられるようにするためのランタイムです。**

### Caporaではないもの

- 単なるチャットUI
- 単なるLLMラッパー
- 単なるMCPサーバージェネレーター
- 単なるワークフロー自動化ツール
- 単なるプロンプトライブラリ

Caporaの主な役割は会話することではありません。**AI支援のオーケストレーションによってビジネス上の意図を安全に実行すること**です。

### 設計目標

| 原則 | 内容 |
|---|---|
| **Goal-first** | ユーザーは、どの画面を開くかではなく、何を達成したいかを説明できるべきです。 |
| **Capability-first** | 開発者は、UIフローではなくビジネスcapabilityを定義します。 |
| **Minimal interaction** | 実際に不足している情報だけをユーザーに尋ねます。 |
| **Human control** | 高リスクまたは取り消し不能な操作では、承認ゲートが必要です。 |
| **Auditability** | 意味のあるすべてのステップは、説明可能で追跡可能であるべきです。 |
| **UI-agnostic** | 同じランタイムが、Web・Slack・音声・MCP・将来のインターフェースと連携できます。 |

### アーキテクチャ

```text
ユーザー
  ↓
UIアダプター（web / chat / voice / MCP）
  ↓
Capora Runtime
  ├─ Planner
  ├─ Missing Info Collector
  ├─ Approval Gate
  ├─ Executor
  └─ Audit Trace
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
