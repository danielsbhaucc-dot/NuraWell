const STORAGE_KEY = 'nura_challenge_pending_v1';

export type PendingChallengeCompletion = {
  id: string;
  task_definition_id: string;
  slot_key: string | null;
  created_at: string;
};

function readQueue(): PendingChallengeCompletion[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingChallengeCompletion[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(items: PendingChallengeCompletion[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function enqueuePendingCompletion(
  taskDefinitionId: string,
  slotKey: string | null,
): PendingChallengeCompletion {
  const item: PendingChallengeCompletion = {
    id: crypto.randomUUID(),
    task_definition_id: taskDefinitionId,
    slot_key: slotKey,
    created_at: new Date().toISOString(),
  };
  const queue = readQueue();
  queue.push(item);
  writeQueue(queue);
  return item;
}

export function listPendingCompletions(): PendingChallengeCompletion[] {
  return readQueue();
}

export function removePendingCompletion(id: string): void {
  writeQueue(readQueue().filter((x) => x.id !== id));
}

export function pendingCount(): number {
  return readQueue().length;
}

export async function syncPendingCompletions(): Promise<{ synced: number; failed: number }> {
  const queue = readQueue();
  if (!queue.length) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const res = await fetch('/api/v1/challenge/tasks', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_definition_id: item.task_definition_id,
          slot_key: item.slot_key,
        }),
      });
      if (res.ok) {
        removePendingCompletion(item.id);
        synced++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}
