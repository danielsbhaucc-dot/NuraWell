import type { MemoryRecallCategory } from './categories';

export type MemoryStatusLabel = 'Active' | 'Deprecated' | 'NeedsVerification';

export type UserMemoryHit = {
  id: string;
  fact: string;
  status: MemoryStatusLabel;
  category: string;
  created_at: string;
  updated_at: string;
  occurred_at_label: string;
};

export type SearchUserMemoryResult = {
  query: string;
  category_filter: MemoryRecallCategory | null;
  found_count: number;
  search_mode: 'semantic' | 'text_fallback';
  memories: UserMemoryHit[];
};
