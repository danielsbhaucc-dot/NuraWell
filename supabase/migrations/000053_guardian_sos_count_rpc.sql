-- ============================================================
-- NuraWell — Pre-Lapse Guardian SOS daily counting
-- Migration: 000053_guardian_sos_count_rpc.sql
--
-- Counts SOS events by converting created_at into the user's product timezone.
-- This preserves Override 2: no stored date_key column.
-- ============================================================

CREATE OR REPLACE FUNCTION public.count_guardian_sos_events_for_local_date(
  p_user_id UUID,
  p_timezone TEXT DEFAULT 'Asia/Jerusalem',
  p_local_date DATE DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER
  FROM public.guardian_sos_events
  WHERE user_id = p_user_id
    AND (created_at AT TIME ZONE p_timezone)::date =
      COALESCE(p_local_date, (NOW() AT TIME ZONE p_timezone)::date);
$$;

REVOKE ALL ON FUNCTION public.count_guardian_sos_events_for_local_date(UUID, TEXT, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_guardian_sos_events_for_local_date(UUID, TEXT, DATE) TO authenticated;
