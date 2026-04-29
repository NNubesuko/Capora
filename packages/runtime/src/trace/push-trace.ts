import type { TraceEvent, WorkflowPlanStep } from "@capora/core";

export type TraceEventInput = TraceEvent extends infer TEvent
  ? TEvent extends { at: string }
    ? Omit<TEvent, "at">
    : never
  : never;

export const pushTrace = (
  trace: TraceEvent[],
  event: TraceEventInput
): TraceEvent => {
  const nextEvent = {
    ...event,
    at: new Date().toISOString()
  } as TraceEvent;

  trace.push(nextEvent);

  return nextEvent;
};

const hasStepBeenEntered = (trace: TraceEvent[], stepIndex: number): boolean =>
  trace.some(
    (event) => event.type === "step.entered" && event.stepIndex === stepIndex
  );

export const pushStepProgressTrace = (
  trace: TraceEvent[],
  step: WorkflowPlanStep,
  stepIndex: number
): void => {
  if (hasStepBeenEntered(trace, stepIndex)) {
    pushTrace(trace, {
      type: "step.resumed",
      message: `Resumed ${step.capability}`,
      capability: step.capability,
      stepIndex
    });

    return;
  }

  pushTrace(trace, {
    type: "step.entered",
    message: `Entered ${step.capability}`,
    capability: step.capability,
    stepIndex
  });
};
