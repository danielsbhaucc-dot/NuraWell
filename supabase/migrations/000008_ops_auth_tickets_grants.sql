-- PostgREST: וידוא שרק service_role נוגע בטבלה (anon גורם ל-401 אם נשלח מפתח שגוי / הרשאות ברירת מחדל)
REVOKE ALL ON public.ops_auth_tickets FROM anon;
REVOKE ALL ON public.ops_auth_tickets FROM authenticated;
GRANT ALL ON public.ops_auth_tickets TO service_role;
