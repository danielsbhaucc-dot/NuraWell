-- ============================================================
-- M2: מאפשר status=proposed במשימות אלמוג (אישור משימות דומות).
-- קודם ה-CHECK אפשר רק active|completed|dropped|frozen — ולכן
-- persist של משימות דומות כ-proposed נכשל בשקט (write_errors).
-- ============================================================

ALTER TABLE public.almog_assignments
  DROP CONSTRAINT IF EXISTS almog_assignments_status_check;

ALTER TABLE public.almog_assignments
  ADD CONSTRAINT almog_assignments_status_check
  CHECK (status IN ('proposed', 'active', 'completed', 'dropped', 'frozen'));

COMMENT ON CONSTRAINT almog_assignments_status_check ON public.almog_assignments IS
  'proposed = ממתין לאישור משתמש (למשל כותרת דומה); active/frozen = פתוח; completed/dropped = סגור';
