-- round-4 security: memory_text holds ciphertext (enc:v1 today, enc:v2 next), so a plaintext length CHECK
-- cannot live in the DB. The 4..600 plaintext rule is enforced server-side before encryption
-- (apps/web/lib/ai/user-memories/memory-text.ts). Keep only a non-empty + generous ciphertext ceiling.
ALTER TABLE public.user_memories DROP CONSTRAINT IF EXISTS user_memories_text_len;
ALTER TABLE public.user_memories ADD CONSTRAINT user_memories_text_len CHECK (char_length(memory_text) BETWEEN 4 AND 20000);
COMMENT ON COLUMN public.user_memories.memory_text IS 'ciphertext (enc:v1 / enc:v2); plaintext length 4..600 enforced in app before encryption';
