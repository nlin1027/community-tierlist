do not edit the project or any files on your own. you may only edit the project if i directly ask you to. you may also ask for permission but it is ultimately up to my own (the prompter's) discretion.

## Database migrations (Supabase)

Production schema changes go through `supabase/migrations/` and are applied automatically by `.github/workflows/migrate.yml` when merged to `main`. Never edit the production schema by hand in the Supabase dashboard.

1. Branch from `main` and run from the repo root: `npx supabase migration new <short_name>`
2. Write the SQL in the new file under `supabase/migrations/`. Use `if not exists` where possible, and `enable row level security` on every new table.
3. Dry-run against production (changes nothing): `npx supabase db push --db-url $env:SUPABASE_DB_URL --dry-run` (session pooler URL, port 5432)
4. Open a PR. Merging to `main` triggers the migrate workflow, which runs `supabase db push` against the production database.
5. Verify: Actions tab -> "Migrate database" is green, and `npx supabase migration list --db-url ...` shows the same version under Local and Remote.

Rules:
- Never edit a migration that has already been applied; add a new one instead.
- Keep migrations backwards-compatible with the currently deployed API (the API deploys separately from the migration): add columns first, ship code that uses them later, drop things in a later migration.
- There is no staging database, so every applied migration hits production.