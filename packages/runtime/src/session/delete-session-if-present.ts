import type { WorkflowSessionStore } from "./session-store.js";

export const deleteSessionIfPresent = async (
  sessionStore: WorkflowSessionStore,
  sessionId?: string
): Promise<void> => {
  if (!sessionId) {
    return;
  }

  await sessionStore.delete(sessionId);
};
