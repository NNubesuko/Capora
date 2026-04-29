import { toWebResponse } from "@capora/adapter-web";

interface ConversationMessage {
  role: "user" | "system";
  title: string;
  body: string;
}

type RuntimeResponse = Parameters<typeof toWebResponse>[0];
type UiResponseModel = ReturnType<typeof toWebResponse>;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("App root not found");

app.innerHTML = `
  <style>
    :root {
      color-scheme: light;
      --bg: #f4efe4;
      --bg-accent: #fff9ef;
      --surface: rgba(255, 252, 245, 0.88);
      --surface-strong: #fffdf8;
      --border: rgba(91, 70, 44, 0.16);
      --text: #2e2418;
      --muted: #74624c;
      --primary: #994d22;
      --primary-strong: #7c3815;
      --success: #285943;
      --warning: #9a6b10;
      --danger: #9a3526;
      --shadow: 0 24px 60px rgba(101, 78, 53, 0.12);
      --radius: 22px;
      --mono: "SFMono-Regular", "Cascadia Code", "Courier New", monospace;
      --sans: "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      color: var(--text);
      font-family: var(--sans);
      background:
        radial-gradient(circle at top left, rgba(255, 214, 153, 0.28), transparent 32%),
        radial-gradient(circle at top right, rgba(217, 130, 54, 0.18), transparent 24%),
        linear-gradient(180deg, var(--bg-accent), var(--bg));
    }

    button,
    input,
    textarea {
      font: inherit;
    }

    button {
      cursor: pointer;
      border: none;
      border-radius: 999px;
      transition: transform 120ms ease, background 120ms ease, opacity 120ms ease;
    }

    button:hover {
      transform: translateY(-1px);
    }

    button:disabled {
      cursor: wait;
      opacity: 0.7;
      transform: none;
    }

    .shell {
      width: min(1180px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 32px 0 48px;
    }

    .hero {
      padding: 28px;
      border: 1px solid var(--border);
      border-radius: 30px;
      background: linear-gradient(180deg, rgba(255, 251, 243, 0.98), rgba(255, 247, 235, 0.92));
      box-shadow: var(--shadow);
    }

    .eyebrow {
      margin: 0;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--primary);
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      margin-top: 10px;
      font-size: clamp(2rem, 3vw, 3.1rem);
      line-height: 1.02;
      letter-spacing: -0.04em;
    }

    .lead {
      margin-top: 14px;
      max-width: 760px;
      color: var(--muted);
      line-height: 1.6;
    }

    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr);
      gap: 18px;
      margin-top: 24px;
    }

    .field,
    .hero-card,
    .card,
    .timeline-item,
    .message {
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: var(--radius);
    }

    .field {
      display: block;
      padding: 18px;
      background: var(--surface-strong);
    }

    .field span,
    .mini-label {
      display: block;
      margin-bottom: 10px;
      font-size: 0.8rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--muted);
    }

    textarea,
    input {
      width: 100%;
      border: 1px solid rgba(91, 70, 44, 0.14);
      border-radius: 16px;
      padding: 14px 16px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.8);
    }

    textarea {
      min-height: 112px;
      resize: vertical;
      line-height: 1.55;
    }

    .hero-card {
      padding: 18px;
    }

    .hero-card ol {
      margin: 0;
      padding-left: 20px;
      color: var(--muted);
      line-height: 1.7;
    }

    .controls {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 20px;
    }

    .primary {
      padding: 13px 20px;
      color: white;
      background: linear-gradient(135deg, var(--primary), var(--primary-strong));
    }

    .secondary {
      padding: 13px 20px;
      color: var(--text);
      background: rgba(255, 255, 255, 0.66);
      border: 1px solid var(--border);
    }

    .dashboard {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      margin-top: 22px;
    }

    .card,
    .card-wide,
    details.card {
      padding: 20px;
      box-shadow: 0 18px 36px rgba(101, 78, 53, 0.08);
    }

    .card h2,
    details summary {
      font-size: 1rem;
      letter-spacing: -0.02em;
    }

    .span-2 {
      grid-column: span 2;
    }

    .stack {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }

    .empty {
      padding: 14px 16px;
      border-radius: 16px;
      color: var(--muted);
      background: rgba(255, 255, 255, 0.64);
    }

    .message {
      padding: 16px;
    }

    .message-user {
      background: rgba(255, 244, 230, 0.9);
    }

    .message-system {
      background: rgba(248, 250, 244, 0.92);
    }

    .message-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .message pre,
    .result pre,
    #raw {
      margin: 0;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--mono);
      font-size: 0.86rem;
      line-height: 1.55;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 7px 12px;
      border-radius: 999px;
      font-size: 0.82rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      background: rgba(153, 77, 34, 0.12);
      color: var(--primary);
    }

    .badge-completed {
      background: rgba(40, 89, 67, 0.14);
      color: var(--success);
    }

    .badge-needs_approval,
    .badge-active {
      background: rgba(154, 107, 16, 0.14);
      color: var(--warning);
    }

    .badge-failed {
      background: rgba(154, 53, 38, 0.12);
      color: var(--danger);
    }

    .meta {
      display: grid;
      gap: 10px;
      margin-top: 16px;
    }

    .meta-row {
      padding: 12px 14px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.66);
    }

    .meta-row strong {
      display: block;
      margin-bottom: 4px;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .plan {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }

    .plan-step {
      display: grid;
      gap: 8px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.68);
    }

    .plan-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .plan-step small {
      color: var(--muted);
      line-height: 1.5;
    }

    .field-grid {
      display: grid;
      gap: 12px;
      margin-top: 14px;
    }

    .action-card {
      margin-top: 16px;
      padding: 16px;
      border-radius: 18px;
      border: 1px solid rgba(153, 77, 34, 0.16);
      background: rgba(255, 248, 240, 0.94);
    }

    .action-card p {
      margin-top: 8px;
      color: var(--muted);
      line-height: 1.55;
    }

    .result-list,
    .timeline {
      display: grid;
      gap: 12px;
      margin-top: 16px;
    }

    .result {
      padding: 16px;
      border-radius: 18px;
      border: 1px solid var(--border);
      background: rgba(255, 255, 255, 0.7);
    }

    .result-header,
    .timeline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
    }

    .timeline-item {
      padding: 16px;
    }

    .timeline-item p {
      margin-top: 6px;
      color: var(--muted);
      line-height: 1.55;
    }

    details summary {
      cursor: pointer;
      list-style: none;
    }

    @media (max-width: 860px) {
      .hero-grid,
      .dashboard {
        grid-template-columns: 1fr;
      }

      .span-2 {
        grid-column: auto;
      }
    }
  </style>

  <main class="shell">
    <section class="hero">
      <p class="eyebrow">Conversation-first orchestration demo</p>
      <h1>Capora Demo</h1>
      <p class="lead">
        Start with a natural-language goal, let Capora plan the workflow, collect only
        missing structured input, pause for approval, and resume the same session to finish.
      </p>

      <div class="hero-grid">
        <label class="field">
          <span>Natural language goal</span>
          <textarea id="goal">Send the April design retainer invoice to Alice.</textarea>
        </label>

        <div class="hero-card">
          <p class="mini-label">Suggested walkthrough</p>
          <ol>
            <li>Start the workflow with the default goal.</li>
            <li>Provide <code>customerEmail</code> when asked.</li>
            <li>Provide <code>amount</code>, <code>currency</code>, and <code>description</code>.</li>
            <li>Approve the final send step to complete the workflow.</li>
          </ol>
        </div>
      </div>

      <div class="controls">
        <button id="run" class="primary">Start workflow</button>
        <button id="reset" class="secondary">Clear session</button>
      </div>
    </section>

    <section class="dashboard">
      <article class="card span-2">
        <h2>Conversation</h2>
        <div id="conversation" class="stack"></div>
      </article>

      <article class="card">
        <h2>Workflow state</h2>
        <div id="state"></div>
        <div id="next-action"></div>
      </article>

      <article class="card">
        <h2>Plan</h2>
        <div id="plan"></div>
      </article>

      <article class="card span-2">
        <h2>Execution result</h2>
        <div id="results"></div>
      </article>

      <article class="card span-2">
        <h2>Trace summary</h2>
        <div id="trace"></div>
      </article>

      <details class="card span-2">
        <summary>Developer view</summary>
        <pre id="raw"></pre>
      </details>
    </section>
  </main>
`;

const goalInput = document.querySelector<HTMLTextAreaElement>("#goal");
const runButton = document.querySelector<HTMLButtonElement>("#run");
const resetButton = document.querySelector<HTMLButtonElement>("#reset");
const conversationPanel = document.querySelector<HTMLElement>("#conversation");
const statePanel = document.querySelector<HTMLElement>("#state");
const nextActionPanel = document.querySelector<HTMLElement>("#next-action");
const planPanel = document.querySelector<HTMLElement>("#plan");
const resultsPanel = document.querySelector<HTMLElement>("#results");
const tracePanel = document.querySelector<HTMLElement>("#trace");
const rawPanel = document.querySelector<HTMLElement>("#raw");

if (
  !goalInput ||
  !runButton ||
  !resetButton ||
  !conversationPanel ||
  !statePanel ||
  !nextActionPanel ||
  !planPanel ||
  !resultsPanel ||
  !tracePanel ||
  !rawPanel
) {
  throw new Error("Missing required UI elements");
}

let activeSessionId: string | null = null;
let currentUi: UiResponseModel | null = null;
let conversation: ConversationMessage[] = [];
let busy = false;

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const formatJson = (value: unknown): string => JSON.stringify(value, null, 2);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isApiError = (value: unknown): value is { error: string } =>
  isRecord(value) && typeof value.error === "string";

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unexpected request failure.";

const createClientFailureResponse = (message: string): RuntimeResponse => ({
  status: "failed",
  traceId: "",
  plan: {
    goal: currentUi?.goal ?? (goalInput.value.trim() || "Unknown goal"),
    steps:
      currentUi?.plan.map((step) => ({
        capability: step.capability,
        reason: step.reason
      })) ?? []
  },
  results: [],
  error: message,
  trace: []
});

const postRuntimeRequest = async (
  path: "/orchestrate" | "/resume",
  body: Record<string, unknown>
): Promise<RuntimeResponse> => {
  const response = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const payload = (await response.json().catch(() => undefined)) as unknown;

  if (!response.ok) {
    throw new Error(
      isApiError(payload)
        ? payload.error
        : `API request failed with status ${response.status}.`
    );
  }

  return payload as RuntimeResponse;
};

const formatInputSummary = (input: Record<string, string | number | boolean>): string =>
  Object.entries(input)
    .map(([field, value]) => `${field}: ${String(value)}`)
    .join("\n");

const describeSystemTurn = (ui: UiResponseModel): string => {
  if (ui.status === "needs_input") {
    return [
      `Plan is ready and the workflow is paused at ${ui.pendingCapability}.`,
      `Capora needs ${ui.requiredFields.map((field) => field.field).join(", ")} before it can continue.`
    ].join("\n");
  }

  if (ui.status === "needs_approval") {
    return [
      `All required input has been collected and execution reached ${ui.pendingCapability}.`,
      ui.approval?.reason ?? "Approval is required before continuing."
    ].join("\n");
  }

  if (ui.status === "failed") {
    return `The workflow failed: ${ui.error ?? "Unknown error"}`;
  }

  return `The workflow completed successfully with ${ui.results.length} result(s).`;
};

const addConversationMessage = (
  role: ConversationMessage["role"],
  title: string,
  body: string
): void => {
  conversation = [...conversation, { role, title, body }];
};

const coerceFieldValue = (field: string, value: string): string | number => {
  if (field === "amount") {
    return Number(value);
  }

  return value;
};

const setBusy = (nextBusy: boolean): void => {
  busy = nextBusy;
  runButton.disabled = nextBusy;
  resetButton.disabled = nextBusy;
  runButton.textContent = nextBusy ? "Working..." : "Start workflow";
};

const renderConversation = (): void => {
  if (conversation.length === 0) {
    conversationPanel.innerHTML = `
      <div class="empty">
        No workflow yet. Start with the suggested goal to see the conversation,
        the paused states, and the final trace unfold.
      </div>
    `;
    return;
  }

  conversationPanel.innerHTML = conversation
    .map(
      (message, index) => `
        <article class="message message-${message.role}">
          <div class="message-header">
            <span>${message.role === "user" ? "User" : "Capora"}</span>
            <span>Turn ${index + 1}</span>
          </div>
          <strong>${escapeHtml(message.title)}</strong>
          <pre>${escapeHtml(message.body)}</pre>
        </article>
      `
    )
    .join("");
};

const renderState = (): void => {
  if (!currentUi) {
    statePanel.innerHTML = `<div class="empty">Workflow state will appear here.</div>`;
    return;
  }

  const badgeClass =
    currentUi.status === "completed"
      ? "badge badge-completed"
      : currentUi.status === "failed"
        ? "badge badge-failed"
        : currentUi.status === "needs_approval"
          ? "badge badge-needs_approval"
          : "badge";

  statePanel.innerHTML = `
    <div class="${badgeClass}">${escapeHtml(currentUi.stateLabel)}</div>
    <div class="meta">
      <div class="meta-row">
        <strong>Summary</strong>
        <div>${escapeHtml(currentUi.summary)}</div>
      </div>
      <div class="meta-row">
        <strong>Goal</strong>
        <div>${escapeHtml(currentUi.goal)}</div>
      </div>
      ${
        currentUi.traceId
          ? `
            <div class="meta-row">
              <strong>Trace ID</strong>
              <div><code>${escapeHtml(currentUi.traceId)}</code></div>
            </div>
          `
          : ""
      }
      ${
        currentUi.pendingCapability
          ? `
            <div class="meta-row">
              <strong>Current capability</strong>
              <div>${escapeHtml(currentUi.pendingCapability)}</div>
            </div>
          `
          : ""
      }
      ${
        currentUi.sessionId
          ? `
            <div class="meta-row">
              <strong>Session</strong>
              <div><code>${escapeHtml(currentUi.sessionId)}</code></div>
            </div>
          `
          : ""
      }
    </div>
  `;
};

const renderNextAction = (): void => {
  if (!currentUi) {
    nextActionPanel.innerHTML = `<div class="empty">Next actions will appear here.</div>`;
    return;
  }

  if (currentUi.status === "needs_input") {
    nextActionPanel.innerHTML = `
      <div class="action-card">
        <div class="mini-label">Required fields</div>
        <form id="resume-form">
          <div class="field-grid">
            ${currentUi.requiredFields
              .map(
                (field) => `
                  <label>
                    <span>${escapeHtml(field.question)}</span>
                    <input name="${escapeHtml(field.field)}" placeholder="${escapeHtml(field.field)}" />
                  </label>
                `
              )
              .join("")}
          </div>
          <div class="controls">
            <button type="submit" class="primary">Resume with input</button>
          </div>
        </form>
      </div>
    `;

    const resumeForm = document.querySelector<HTMLFormElement>("#resume-form");
    resumeForm?.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (!activeSessionId || busy || !resumeForm) {
        return;
      }

      const formData = new FormData(resumeForm);
      const providedInput: Record<string, string | number> = {};

      for (const [field, value] of formData.entries()) {
        if (typeof value !== "string" || value.trim() === "") {
          continue;
        }

        providedInput[field] = coerceFieldValue(field, value.trim());
      }

      addConversationMessage("user", "Provided structured input", formatInputSummary(providedInput));
      renderConversation();

      setBusy(true);

      try {
        const response = await postRuntimeRequest("/resume", {
          sessionId: activeSessionId,
          providedInput
        });

        applyResponse(response);
      } catch (error) {
        applyClientFailure(error);
      } finally {
        setBusy(false);
      }
    });

    return;
  }

  if (currentUi.status === "needs_approval") {
    nextActionPanel.innerHTML = `
      <div class="action-card">
        <div class="mini-label">Approval prompt</div>
        <h3>${escapeHtml(currentUi.pendingCapability ?? "Approval required")}</h3>
        <p>${escapeHtml(currentUi.approval?.reason ?? "Approval is required before continuing.")}</p>
        <div class="controls">
          <button id="approve" class="primary">Approve and resume</button>
        </div>
      </div>
    `;

    const approveButton = document.querySelector<HTMLButtonElement>("#approve");
    approveButton?.addEventListener("click", async () => {
      if (!activeSessionId || busy) {
        return;
      }

      addConversationMessage("user", "Approval granted", "approved: true");
      renderConversation();

      setBusy(true);

      try {
        const response = await postRuntimeRequest("/resume", {
          sessionId: activeSessionId,
          approved: true
        });

        applyResponse(response);
      } catch (error) {
        applyClientFailure(error);
      } finally {
        setBusy(false);
      }
    });

    return;
  }

  nextActionPanel.innerHTML = `
    <div class="empty">
      ${
        currentUi.status === "completed"
          ? "Workflow complete. Start another run to replay the full conversation."
          : "The workflow ended in a failed state. Adjust the scenario or the capability definitions and run it again."
      }
    </div>
  `;
};

const renderPlan = (): void => {
  if (!currentUi) {
    planPanel.innerHTML = `<div class="empty">The generated plan will appear here.</div>`;
    return;
  }

  planPanel.innerHTML = `
    <div class="plan">
      ${currentUi.plan
        .map(
          (step) => `
            <article class="plan-step">
              <div class="plan-topline">
                <strong>${step.index + 1}. ${escapeHtml(step.capability)}</strong>
                <span class="badge ${
                  step.status === "completed"
                    ? "badge-completed"
                    : step.status === "failed"
                      ? "badge-failed"
                      : step.status === "active"
                        ? "badge-active"
                        : ""
                }">${escapeHtml(step.status)}</span>
              </div>
              <small>${escapeHtml(step.reason)}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
};

const renderResults = (): void => {
  if (!currentUi) {
    resultsPanel.innerHTML = `<div class="empty">Execution results will appear here.</div>`;
    return;
  }

  if (currentUi.results.length === 0) {
    resultsPanel.innerHTML = `
      <div class="empty">
        No final capability results yet. Use the plan and trace panels to see how far the workflow has progressed.
      </div>
    `;
    return;
  }

  resultsPanel.innerHTML = `
    <div class="result-list">
      ${currentUi.results
        .map(
          (result) => `
            <article class="result">
              <div class="result-header">
                <strong>${escapeHtml(result.capability)}</strong>
                <span class="badge ${
                  result.status === "success" ? "badge-completed" : "badge-failed"
                }">${escapeHtml(result.status)}</span>
              </div>
              <pre>${escapeHtml(
                formatJson({
                  input: result.input,
                  output: result.output,
                  error: result.error
                })
              )}</pre>
            </article>
          `
        )
        .join("")}
    </div>
  `;
};

const renderTrace = (): void => {
  if (!currentUi) {
    tracePanel.innerHTML = `<div class="empty">Trace events will appear here.</div>`;
    return;
  }

  tracePanel.innerHTML = `
    <div class="timeline">
      ${currentUi.trace
        .map(
          (event, index) => `
            <article class="timeline-item">
              <div class="timeline-header">
                <strong>${index + 1}. ${escapeHtml(event.type)}</strong>
                <span>${escapeHtml(new Date(event.at).toLocaleTimeString())}</span>
              </div>
              <p>${escapeHtml(event.message)}</p>
              ${
                event.capability
                  ? `<p><code>${escapeHtml(
                      event.stepIndex !== undefined
                        ? `step ${event.stepIndex + 1} • ${event.capability}`
                        : event.capability
                    )}</code></p>`
                  : ""
              }
            </article>
          `
        )
        .join("")}
    </div>
  `;
};

const renderRaw = (): void => {
  rawPanel.textContent = currentUi ? formatJson(currentUi) : "";
};

const render = (): void => {
  renderConversation();
  renderState();
  renderNextAction();
  renderPlan();
  renderResults();
  renderTrace();
  renderRaw();
};

const applyResponse = (response: RuntimeResponse): void => {
  currentUi = toWebResponse(response);
  activeSessionId = currentUi.sessionId ?? null;
  addConversationMessage("system", currentUi.stateLabel, describeSystemTurn(currentUi));
  render();
};

const applyClientFailure = (error: unknown): void => {
  applyResponse(createClientFailureResponse(toErrorMessage(error)));
};

const resetWorkflow = (): void => {
  activeSessionId = null;
  currentUi = null;
  conversation = [];
  render();
};

runButton.addEventListener("click", async () => {
  if (busy) {
    return;
  }

  resetWorkflow();
  addConversationMessage("user", "Goal submitted", goalInput.value.trim());
  renderConversation();
  setBusy(true);

  try {
    const response = await postRuntimeRequest("/orchestrate", {
      goal: goalInput.value.trim()
    });

    applyResponse(response);
  } catch (error) {
    applyClientFailure(error);
  } finally {
    setBusy(false);
  }
});

resetButton.addEventListener("click", () => {
  if (busy) {
    return;
  }

  resetWorkflow();
});

render();
