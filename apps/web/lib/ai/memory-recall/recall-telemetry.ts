/**
 * טלמטריה לקריאות recall_past_memory — מקשר בין execute לבין onStepFinish.
 */

export type RecallToolExecution = {
  toolName: 'recall_past_memory';
  arguments: { topic: string; category?: string };
  resultCount: number;
  searchMode?: 'semantic' | 'text_fallback';
};

export function createRecallToolTelemetry() {
  const executions: RecallToolExecution[] = [];

  return {
    record(execution: RecallToolExecution) {
      executions.push(execution);
    },
    drain(): RecallToolExecution[] {
      const copy = [...executions];
      executions.length = 0;
      return copy;
    },
    peek(): RecallToolExecution[] {
      return [...executions];
    },
  };
}

export type RecallToolTelemetry = ReturnType<typeof createRecallToolTelemetry>;
