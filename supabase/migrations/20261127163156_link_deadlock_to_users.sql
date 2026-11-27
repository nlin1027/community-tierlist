-- Link tier list submissions to accounts and support date-range averages.
-- Purely additive, so the currently deployed API (which inserts without user_id)
-- keeps working. Older anonymous rows keep user_id = null and still count toward
-- the community average; they just are not attached to any account.

alter table public.deadlock
  add column if not exists user_id uuid references public.users (id) on delete set null;

-- GET /users/:username/rankings reads each user's latest tier per hero.
create index if not exists deadlock_user_character_date_idx
  on public.deadlock (user_id, character, date desc)
  where user_id is not null;

-- GET /average_list?from=&to= filters submissions by date.
create index if not exists deadlock_date_idx on public.deadlock (date);
