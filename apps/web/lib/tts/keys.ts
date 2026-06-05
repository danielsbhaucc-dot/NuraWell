export type JourneyTtsKind = 'quiz' | 'game';

/** Deterministic R2 key — one file per question id (overwrite on text change). */
export function buildJourneyTtsObjectKey(params: {
  stationId: string | null | undefined;
  stepId: string;
  kind: JourneyTtsKind;
  questionId: string;
}): string {
  const station = params.stationId?.trim() || '_unassigned';
  return `tts/journey/${station}/${params.stepId}/${params.kind}/${params.questionId}.mp3`;
}

/** Human-readable folder for media manager. */
export function buildJourneyTtsFolder(params: {
  stationTitle?: string | null;
  stepNumber: number;
  stepTitle?: string | null;
}): string {
  const station = params.stationTitle?.trim() || 'ללא תחנה';
  const stepLabel = params.stepTitle?.trim()
    ? `צעד ${params.stepNumber} — ${params.stepTitle.trim()}`
    : `צעד ${params.stepNumber}`;
  return `tts/${station}/${stepLabel}`;
}
