# AGENTS.md

## Project overview

Capora is an AI-native orchestration framework for conversation-first business workflows.

The core idea:
- Developers define business capabilities and constraints.
- Users express goals in natural language.
- Capora plans a workflow, collects only missing information, requests approval when needed, executes capabilities, and records audit traces.

## Engineering goals

- Keep the architecture simple and extensible.
- Prefer small, understandable modules.
- Build a minimal but real vertical slice first.
- Optimize for clarity over abstraction.
- Avoid framework lock-in in core packages.

## Architecture rules

- `packages/core` contains stable domain contracts and helper APIs.
- `packages/runtime` contains orchestration logic.
- `packages/sdk` exposes the public developer-facing API.
- `packages/ui-contracts` contains UI-neutral response models.
- `packages/adapter-web` maps runtime output into web-friendly structures.
- `demo/` contains the consolidated standalone demo.

## Coding conventions

- Use TypeScript.
- Use zod for input schemas.
- Prefer named exports.
- Prefer explicit interfaces and types.
- Avoid unnecessary inheritance.
- Keep functions focused and composable.
- Avoid introducing persistence or network dependencies unless clearly required.

## MVP scope

The MVP should prove this flow:
1. define capabilities
2. send a natural language goal
3. produce a simple workflow plan
4. detect missing required information
5. request approval when needed
6. execute in-memory handlers
7. return a traceable result

## Non-goals for now

- No MCP support yet
- No database integration yet
- No multi-agent system
- No advanced retry engine
- No enterprise auth system
- No visual workflow builder

## Review guidelines

- Favor minimal, high-confidence changes.
- Preserve package boundaries.
- Do not leak UI concerns into core.
- Do not expose raw CRUD concepts where capability concepts are clearer.
- Keep README and example code aligned with actual implementation.
