import type { SupabaseClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTENT_RE = /^\/(journey|guides|lessons)\/([^/]+)\/?$/;
const STEP_NUMBER_RE = /^\d{1,6}$/;
const JOURNEY_STATIC = new Set(['declined', 'history']);
const TABLE_BY_KIND: Record<string, string> = { journey: 'journey_steps', guides: 'courses', lessons: 'lessons' };

/** Row exists by id? Lookup errors count as "exists" so navigation is never blocked by a DB hiccup. */
const missingById = async (supabase: SupabaseClient, table: string, id: string): Promise<boolean> => {
  const { data, error } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
  return !error && !data;
};

const missingStepNumber = async (supabase: SupabaseClient, stepNumber: number): Promise<boolean> => {
  const { data, error } = await supabase
    .from('journey_steps')
    .select('id')
    .eq('step_number', stepNumber)
    .eq('is_published', true)
    .limit(1);
  return !error && !data?.length;
};

/**
 * True when `pathname` is /journey|guides|lessons/:id and that content does not exist (under the caller's RLS).
 * Used by the proxy to return a real 404 status — the (dashboard) loading boundary otherwise commits 200 first.
 */
export const isMissingContent = async (supabase: SupabaseClient, pathname: string): Promise<boolean> => {
  const match = CONTENT_RE.exec(pathname);
  if (!match) return false;
  const [, kind, raw] = match;
  let param: string;
  try {
    param = decodeURIComponent(raw);
  } catch {
    return true;
  }
  if (kind === 'journey' && JOURNEY_STATIC.has(param)) return false;
  try {
    if (UUID_RE.test(param)) return await missingById(supabase, TABLE_BY_KIND[kind], param);
    if (kind === 'journey' && STEP_NUMBER_RE.test(param)) return await missingStepNumber(supabase, Number(param));
    return true;
  } catch {
    return false;
  }
};
