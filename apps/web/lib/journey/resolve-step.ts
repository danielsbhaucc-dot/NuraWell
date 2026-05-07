/**
 * Journey step URLs use short numeric paths (/journey/1) while admin still uses UUIDs.
 */
export function isJourneyStepUuid(param: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param);
}

export function isJourneyStepNumber(param: string): boolean {
  return /^\d+$/.test(param);
}
