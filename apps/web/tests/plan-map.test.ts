import { describe, expect, it } from 'vitest';
import { buildMapStations } from '../lib/journey/map-stations';
import { habitIcon, resolveHabitKey, HABIT_ICONS } from '../lib/journey/habit-icons';
import { Lock, Sprout } from 'lucide-react';

describe('journey map (data-driven)', () => {
  it('14-station curriculum: done / current / locked, other tracks excluded', () => {
    const stations = Array.from({ length: 14 }, (_, i) => ({ id: `s${i}`, title: `תחנה ${i}`, sort_order: 14 - i, habit_key: i === 0 ? 'water' : null }));
    stations.push({ id: 'x', title: 'מסלול קיץ', sort_order: 0, habit_key: null, track: 'summer' } as never);
    const steps = stations.map((s) => ({ id: `st-${s.id}`, station_id: s.id }));
    const map = buildMapStations(stations, steps, new Set(['st-s13', 'st-s12']));
    expect(map).toHaveLength(14);
    expect(map[0].id).toBe('s13'); // sorted by sort_order
    expect(map.slice(0, 2).every((m) => m.state === 'done')).toBe(true);
    expect(map[2].state).toBe('current');
    expect(map.slice(3).every((m) => m.state === 'locked')).toBe(true);
    expect(buildMapStations(stations, steps, new Set(), 'summer')).toHaveLength(1);
  });
  it('icon per habit key, title fallback, generic fallback, lock when locked', () => {
    expect(habitIcon('water', 'x', 'current')).toBe(HABIT_ICONS.water);
    expect(resolveHabitKey(null, 'שינה טובה')).toBe('sleep');
    expect(habitIcon('unknown', 'משהו', 'current')).toBe(Sprout);
    expect(habitIcon('water', 'x', 'locked')).toBe(Lock);
  });
});
