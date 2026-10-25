import { expect, test } from '@playwright/test';
import { hasCreds, login, resetLadder } from './helpers';

/**
 * Root-level functional checks against the deployed app with the role=test account.
 * Each step prints an EVIDENCE line (used in reports). Requires seed.sql (one main task).
 */
test.describe.serial('systems (prod, test account)', () => {
  test.skip(!hasCreds(), 'E2E_TEST_EMAIL/E2E_TEST_PASSWORD not set');
  test.setTimeout(180_000);

  test('tasks, ladder, events/streak, chat plan context + level tool, SOS', async ({ page }) => {
    await login(page);
    await resetLadder(page);
    const api = page.request;

    // tasks: plan
    const plan = await (await api.get('/api/v1/tasks/plan')).json();
    console.log('EVIDENCE plan', JSON.stringify(plan.tasks.map((t: { title: string; currentLevel: number }) => [t.title, t.currentLevel])));
    expect(plan.tasks.length).toBe(1); // dedupe: exactly one live card
    const task = plan.tasks[0];

    // ladder: easier then back
    const down = await (await api.post('/api/v1/tasks/level', { data: { assignmentId: task.id, direction: 'easier', reason: 'e2e systems' } })).json();
    expect(down.ok).toBe(true);
    const up = await (await api.post('/api/v1/tasks/level', { data: { assignmentId: task.id, direction: 'harder', reason: 'e2e systems' } })).json();
    expect(up.ok).toBe(true);
    console.log('EVIDENCE ladder', down.from, '→', down.to, '→', up.to);

    // events → doneToday / streak
    const ev = await api.post('/api/v1/tasks/event', { data: { assignmentId: task.id, kind: 'done' } });
    console.log('EVIDENCE event status', ev.status(), await ev.text());
    const plan2 = await (await api.get('/api/v1/tasks/plan')).json();
    console.log('EVIDENCE after done', JSON.stringify({ doneToday: plan2.tasks[0].doneToday, streak: plan2.tasks[0].streakDays }));
    expect(plan2.tasks[0].doneToday).toBeGreaterThanOrEqual(1);

    // chat: plan context + level tool
    const chat = async (text: string) => {
      const r = await api.post('/api/v1/ai/chat', {
        data: { messages: [{ id: `e2e-${Date.now()}`, role: 'user', parts: [{ type: 'text', text }] }] },
        timeout: 120_000,
      });
      const body = await r.text();
      const textOut = body
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => {
          try {
            const j = JSON.parse(l.slice(5));
            return j.type === 'text-delta' ? j.delta ?? '' : '';
          } catch {
            return '';
          }
        })
        .join('');
      return { status: r.status(), text: textOut || body.slice(0, 400) };
    };
    const c1 = await chat('מה המשימה הראשית שלי עכשיו בתוכנית?');
    console.log('EVIDENCE chat plan', c1.status, c1.text.slice(0, 300));
    expect(c1.status).toBe(200);
    expect(c1.text).toMatch(/מים|כוס/);
    const c2 = await chat('המשימה של המים ממש קשה לי השבוע, תוריד לי אותה רמה אחת בבקשה');
    console.log('EVIDENCE chat level tool', c2.status, c2.text.slice(0, 300));
    const plan3 = await (await api.get('/api/v1/tasks/plan')).json();
    console.log('EVIDENCE level after chat', plan3.tasks[0].currentLevel);
    expect(plan3.tasks[0].currentLevel).toBeLessThan(0);
    // restore
    await api.post('/api/v1/tasks/level', { data: { assignmentId: task.id, direction: 'harder', reason: 'e2e restore' } });

    // SOS
    const sos = await api.post('/api/v1/ai/sos', { data: { trigger: 'logistical', note: 'יום עמוס, אין לי כוח', focus_task: null }, timeout: 90_000 });
    const sj = await sos.json().catch(() => ({}));
    console.log('EVIDENCE sos', sos.status(), JSON.stringify(sj).slice(0, 300));
    expect(sos.status()).toBe(200);
    // test account is female (seed) — SOS must address her in feminine, never 'אתה'
    expect(JSON.stringify(sj)).not.toMatch(/(?<![א-ת])אתה(?![א-ת])/);
  });
});
