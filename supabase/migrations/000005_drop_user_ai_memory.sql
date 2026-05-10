-- Legacy per-user JSON chat memory (replaced by Upstash Vector RAG).
-- Safe to run after app code no longer references public.user_ai_memory.
DROP TABLE IF EXISTS public.user_ai_memory CASCADE;
