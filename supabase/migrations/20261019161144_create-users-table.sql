-- Auth tables: users, linked sign-in identities, and refresh-token sessions.
-- Purely additive: nothing here touches public.deadlock (that is a later migration).
--
-- All three tables have RLS enabled with no policies, so Supabase's auto-generated
-- REST API (anon/publishable key) cannot read them. The Express server connects as
-- the postgres role via DATABASE_URL, which bypasses RLS, so the API is unaffected.

-- One row per person. `id` is the permanent internal identifier that other tables
-- reference; `username` is the public name and the login handle for password accounts.
create table if not exists public.users (
  id            uuid        primary key default gen_random_uuid(),
  username      text        not null check (username ~ '^[a-zA-Z0-9]{3,20}$'),
  password_hash text,                       -- null for accounts that only sign in with Google
  created_at    timestamptz not null default now()
);

-- Usernames are unique case-insensitively ("Nathan" and "nathan" are the same name).
create unique index if not exists users_username_lower_key on public.users (lower(username));

alter table public.users enable row level security;

-- Outside accounts linked to a user. Provider is validated in the API (not a check
-- constraint) so new providers such as YouTube need no schema change.
-- provider_subject is the provider's stable ID for the person (Google's `sub` claim).
create table if not exists public.auth_identities (
  id               uuid        primary key default gen_random_uuid(),
  user_id          uuid        not null references public.users (id) on delete cascade,
  provider         text        not null,
  provider_subject text        not null,
  created_at       timestamptz not null default now(),
  unique (provider, provider_subject)
);

create index if not exists auth_identities_user_id_idx on public.auth_identities (user_id);

alter table public.auth_identities enable row level security;

-- Login sessions. Only a hash of the refresh token is stored, never the raw value.
-- Tokens are rotated on use and revoked (revoked_at) on logout.
create table if not exists public.refresh_tokens (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references public.users (id) on delete cascade,
  token_hash text        not null unique,   -- the unique index also serves the lookup on refresh
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists refresh_tokens_user_id_idx on public.refresh_tokens (user_id);

alter table public.refresh_tokens enable row level security;
