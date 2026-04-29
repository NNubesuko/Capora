import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createCaporaFromEnvironment, type JsonLike } from "@capora/sdk";
import { z } from "zod";
import { demoCapabilities } from "./capabilities.js";

const jsonLikeSchema: z.ZodType<JsonLike> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonLikeSchema),
    z.record(jsonLikeSchema)
  ])
);

const orchestrateRequestSchema = z.object({
  goal: z.string().trim().min(1),
  providedInput: z.record(jsonLikeSchema).optional(),
  approved: z.boolean().optional()
});

const resumeRequestSchema = z.object({
  sessionId: z.string().trim().min(1),
  providedInput: z.record(jsonLikeSchema).optional(),
  approved: z.boolean().optional()
});

const { runtime, plannerName, selection } = createCaporaFromEnvironment({
  env: process.env,
  capabilities: demoCapabilities
});

const port = Number.parseInt(
  process.env.DEMO_API_PORT ?? process.env.PORT ?? "3031",
  10
);
const host = process.env.DEMO_API_HOST ?? "127.0.0.1";

const baseHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store"
};

const sendJson = (
  response: ServerResponse,
  statusCode: number,
  payload: unknown
): void => {
  response.writeHead(statusCode, {
    ...baseHeaders,
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = async (request: IncomingMessage): Promise<unknown> => {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8").trim();

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
};

const handleRequestError = (response: ServerResponse, error: unknown): void => {
  if (error instanceof z.ZodError) {
    sendJson(response, 400, {
      error: error.issues.map((issue) => issue.message).join("; ")
    });
    return;
  }

  if (
    error instanceof Error &&
    error.message.startsWith('Workflow session "') &&
    error.message.endsWith('" was not found.')
  ) {
    sendJson(response, 404, { error: error.message });
    return;
  }

  sendJson(response, 500, {
    error: error instanceof Error ? error.message : "Unexpected server error."
  });
};

const server = createServer(async (request, response) => {
  try {
    const method = request.method ?? "GET";
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? `${host}:${port}`}`
    );

    if (method === "OPTIONS") {
      response.writeHead(204, baseHeaders);
      response.end();
      return;
    }

    if (method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, {
        ok: true,
        planner: selection.plannerKind,
        llmProvider: selection.provider
      });
      return;
    }

    if (method === "POST" && url.pathname === "/orchestrate") {
      const requestBody = orchestrateRequestSchema.parse(await readJsonBody(request));
      const runtimeResponse = await runtime.orchestrate(requestBody);
      sendJson(response, 200, runtimeResponse);
      return;
    }

    if (method === "POST" && url.pathname === "/resume") {
      const requestBody = resumeRequestSchema.parse(await readJsonBody(request));
      const runtimeResponse = await runtime.resume(requestBody);
      sendJson(response, 200, runtimeResponse);
      return;
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    handleRequestError(response, error);
  }
});

server.listen(port, host, () => {
  console.log(`Capora demo API listening on http://${host}:${port}`);
  console.log(`Planner: ${plannerName}`);
});
