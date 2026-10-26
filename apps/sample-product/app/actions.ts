'use server';
import { AuthError } from '@platform/auth';
import { makeEngine } from '@/lib/platform';
import { serverAuth } from '@/lib/server-auth';

export type AskState = { reply: string | null; error: string | null };

export async function askAction(_prev: AskState, form: FormData): Promise<AskState> {
  const question = String(form.get('q') ?? '').trim().slice(0, 500);
  if (!question) return { reply: null, error: 'כתבו שאלה קצרה' };
  try {
    const { auth } = await serverAuth();
    const user = await auth.requireUser();
    const res = await makeEngine().ask(
      [{ role: 'system', content: 'ענו בעברית, בקצרה ובלשון רבים.' }, { role: 'user', content: question }],
      { feature: 'sample.ask', userRef: user.id, maxTokens: 120 },
    );
    return { reply: res.text, error: null };
  } catch (e) {
    if (e instanceof AuthError) return { reply: null, error: 'צריך להתחבר כדי לשאול' };
    return { reply: null, error: 'משהו השתבש, נסו שוב' };
  }
}
