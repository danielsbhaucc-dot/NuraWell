-- 000098: data-driven journey map — per-station habit key (icon) and track (main curriculum / future tracks).
alter table public.journey_stations add column if not exists habit_key text;
alter table public.journey_stations add column if not exists track text not null default 'main';
create index if not exists idx_journey_stations_track_order on public.journey_stations(track, sort_order);
