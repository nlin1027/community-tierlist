# Community Tierlist

A full-stack web app for crowdsourcing community tier list rankings for Valve's *Deadlock*. Players create an account, drag-and-drop the game's 44 heroes into a tier list (D through Z) and submit it; the backend aggregates every submission into a single community-average tier list anyone can view for any time period, and anyone can look up another player's individual rankings.

**Live demo:** https://community-tierlist.onrender.com · **API:** https://api--community-tierlist--xgjq82288nbr.code.run

## Why I built this
Every Deadlock YouTuber and streamer puts out their own tier list, but there was no single place to see them all together. This app gives every opinion a home: submissions are stored individually so they can eventually be browsed one at a time (e.g. "what does this YouTuber think?"), and they're also aggregated in real time into one cohesive community tier list that reflects the consensus rather than any single voice.

## What it does
- **Accounts** — register / sign in with a username and password; sessions last one week
- **Rank** — drag-and-drop (or tap-to-place) tier list builder; signed-in players submit in one request, and their saved rankings are loaded back in next time
- **View** — read-only community tier list, averaged over all time or any date range (presets or custom from/to)
- **Search** — find another player by username and view their latest tier list
- **Docs** — in-app API reference with request/response examples for every endpoint
- Per-route rate limiting on every endpoint to resist abuse
- Occult art-deco theme inspired by Deadlock's alternate 1900s New York

## Architecture

```
app/ (React + Vite SPA) --fetch--> api/ (Express REST API) --pg--> PostgreSQL
                                          |
                                          +--redis--> Redis (rate-limit counters)
```

- **Frontend** (`app/`) — React 19 SPA routed with `react-router-dom`. Pages: rank (native HTML5 drag-and-drop plus tap-to-place), community view with a date-range picker, player search, sign in / register, and API docs. The session token lives in `localStorage` and is sent as a Bearer token.
- **Backend** (`api/`) — Express 5 REST API. Every write validates the username pattern, hero whitelist, and tier enum server-side before any query runs, so the API doesn't trust the client.
- **Database** — `deadlock` stores one row per `(user, character, tier)` submission, linked to `users` via `user_id`. Averages are computed on read via a `CASE`-mapped `AVG()` query (optionally filtered by date) rather than pre-aggregated on write. `users` holds accounts (scrypt password hashes) and `refresh_tokens` holds sessions (SHA-256 token hashes, 7-day expiry, revoked on sign-out). Schema changes live in `supabase/migrations/`.
- **Rate limiting** — `express-rate-limit` backed by a Redis store (`rate-limit-redis`), so limits are shared across server instances instead of living in per-process memory.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/auth/register` | Create an account; returns a one-week session token |
| POST | `/auth/login` | Sign in; returns a one-week session token |
| GET | `/auth/me` 🔒 | The account behind a token |
| POST | `/auth/logout` 🔒 | Revoke the current token |
| POST | `/submit_character` 🔒 | Submit a single hero ranking |
| POST | `/submit_list` 🔒 | Submit a full tier list in one request |
| GET | `/get_character/:character` | Average tier for one hero |
| GET | `/average_list?from=&to=` | Average tier for all 44 heroes, optionally within a date range |
| GET | `/users/search?q=` | Find players by username |
| GET | `/users/:username/rankings` | A player's latest tier for each hero |
| GET | `/health` | Liveness check |

🔒 = requires `Authorization: Bearer <token>`.

Full request/response schemas and examples are served at `/docs` in the app (see [`app/src/pages/Docs.jsx`](app/src/pages/Docs.jsx)).

## Problems solved
- **Keeping a changing hero roster consistent** — `/average_list` seeds every hero with a `null`-average placeholder and overlays real aggregate rows on top, so new/unranked heroes still appear instead of silently disappearing from the list.
- **Not trusting the client** — every POST endpoint re-validates username format, hero identity, and tier value against server-side whitelists before touching Postgres, independent of whatever the frontend already checked.
- **Abuse resistance across instances** — rate-limit counters live in Redis rather than in-memory, so limits hold even with multiple server processes or restarts.

## What I learned
Builting this full-stack application taught me the nuances of joining the frontend and backend in a concise manner. Utilizing smarter and more efficient queries in the backend cleared up traffic and speeds up the requests. Rate-limiting makes sure that the application is more secure and is not vulnerable to attacks from malicious users.

## Known issues / next steps
- Upvoting/downvoting/commenting on other players' rankings
- Sign in with Google (the `auth_identities` table is ready for it)
- Submissions made before accounts existed are anonymous: they count toward averages but are not attached to any player
- Utilize Redis caching to create a page for viewing most recent rankings and most popular/least popular rankings
- CI/CD pipeline for ease of future implementation

**Prerequisites:** Node.js, a Supabase (Postgres) project, Redis

```bash
# backend
cd api
npm install
# .env needs: DATABASE_URL (Supabase session pooler), REDIS_URL, PORT (see .env.example)
# Supabase CA cert must be at api/certs/supabase-ca.crt
node server.js

# frontend
cd app
npm install
# .env needs: VITE_API_URL_LOCAL (dev) and VITE_API_URL_PROD (production build)
npm run dev
```

## Tech stack
**Frontend:** React 19, Vite, React Router
**Backend:** Node.js, Express 5, express-rate-limit
**Data:** PostgreSQL (`pg`), Redis (`redis`, `rate-limit-redis`)
