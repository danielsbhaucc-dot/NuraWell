'use client';
import { useActionState } from 'react';
import { askAction, type AskState } from './actions';

export function AskForm() {
  const [state, action, pending] = useActionState<AskState, FormData>(askAction, { reply: null, error: null });
  return (
    <form action={action} style={{ display: 'grid', gap: 12 }}>
      <label htmlFor="q" style={{ fontWeight: 700 }}>מה תרצו לשאול?</label>
      <input id="q" name="q" maxLength={500} placeholder="למשל: איך מתחילים?" />
      <button className="btn" type="submit" disabled={pending}>{pending ? 'שולח…' : 'שאלו'}</button>
      {state.reply ? <p aria-live="polite">{state.reply}</p> : null}
      {state.error ? <p role="alert" style={{ color: '#9f1239' }}>{state.error}</p> : null}
    </form>
  );
}
