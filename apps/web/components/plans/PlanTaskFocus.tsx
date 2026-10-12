'use client';

import { useEffect } from 'react';

/** /plans?task=<id>: scroll to the matching task card (habit or Almog step) and pulse a highlight. */
export function PlanTaskFocus({ taskId }: { taskId: string | null }) {
  useEffect(() => {
    if (!taskId) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const find = () => {
      const el = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`);
      if (el) {
        el.closest('details')?.setAttribute('open', '');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.setAttribute('data-highlight', 'true');
        timer = setTimeout(() => el.removeAttribute('data-highlight'), 4000);
      } else if (tries++ < 10) timer = setTimeout(find, 300); // Almog steps load client-side
    };
    find();
    return () => clearTimeout(timer);
  }, [taskId]);
  return null;
}
