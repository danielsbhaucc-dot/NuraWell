-- טיקט חד-פעמי להעברת סשן מדומיין ראשי לדומיין Ops (עוגיות לא משותפות בין hosts שונים)
CREATE TABLE IF NOT EXISTS public.ops_auth_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ops_auth_tickets_expires_at ON public.ops_auth_tickets (expires_at);

REVOKE ALL ON public.ops_auth_tickets FROM PUBLIC;
GRANT ALL ON public.ops_auth_tickets TO service_role;

COMMENT ON TABLE public.ops_auth_tickets IS 'שימוש רק דרך service_role — מחיקה אחרי ניצול או פקיעה';
