# Community Tierlist

A full-stack web app for crowdsourcing community tier list rankings for Valve's *Deadlock*. Users drag-and-drop the game's 38 heroes into a tier list (D through Z) and submit it under a username; the backend aggregates every submission into a single community-average tier list anyone can view.

**Live demo:** https://community-tierlist.onrender.com · **API:** https://community-tierlist-api.onrender.com

## Why I built this
Every Deadlock YouTuber and streamer puts out their own tier list, but there was no single place to see them all together. This app gives every opinion a home: submissions are stored individually so they can eventually be browsed one at a time (e.g. "what does this YouTuber think?"), and they're also aggregated in real time into one cohesive community tier list that reflects the consensus rather than any single voice.

## What it does
- **Rank** — drag-and-drop tier list builder; assign each hero to a tier and submit in one request
- **View** — read-only community tier list, built server-side from the average of every submission
- **Docs** — in-app API reference with request/response examples for every endpoint
- Per-route rate limiting on all public write/read endpoints to resist abuse

## Architecture

```
app/ (React + Vite SPA) --fetch--> api/ (Express REST API) --pg--> PostgreSQL
                                          |
                                          +--redis--> Redis (rate-limit counters)
```

- **Frontend** (`app/`) — React 19 SPA routed with `react-router-dom`. Three pages: a rank-submission page using native HTML5 drag-and-drop, a read-only aggregate view, and an API docs page.
- **Backend** (`api/`) — Express 5 REST API. Every write validates the username pattern, hero whitelist, and tier enum server-side before any query runs, so the API doesn't trust the client.
- **Database** — a single Postgres table (`deadlock`) storing one row per `(user, character, tier)` submission. Averages are computed on read via a `CASE`-mapped `AVG()` query rather than pre-aggregated on write.
- **Rate limiting** — `express-rate-limit` backed by a Redis store (`rate-limit-redis`), so limits are shared across server instances instead of living in per-process memory.

## API

| Method | Route | Purpose |
|---|---|---|
| POST | `/submit_character` | Submit a single hero ranking |
| POST | `/submit_list` | Submit a full tier list in one request |
| GET | `/get_character/:character` | Average tier for one hero |
| GET | `/average_list` | Average tier for all 38 heroes |
| GET | `/health` | Liveness check |

Full request/response schemas and examples are served at `/docs` in the app (see [`app/src/pages/Docs.jsx`](app/src/pages/Docs.jsx)).

## Problems solved
- **Keeping a changing hero roster consistent** — `/average_list` seeds every hero with a `null`-average placeholder and overlays real aggregate rows on top, so new/unranked heroes still appear instead of silently disappearing from the list.
- **Not trusting the client** — every POST endpoint re-validates username format, hero identity, and tier value against server-side whitelists before touching Postgres, independent of whatever the frontend already checked.
- **Abuse resistance across instances** — rate-limit counters live in Redis rather than in-memory, so limits hold even with multiple server processes or restarts.

## What I learned
Builting this full-stack application taught me the nuances of joining the frontend and backend in a concise manner. Utilizing smarter and more efficient queries in the backend cleared up traffic and speeds up the requests. Rate-limiting makes sure that the application is more secure and is not vulnerable to attacks from malicious users.

## Known issues / next steps
- Viewing other user's rankings and upvoting/downvoting/commenting
- Utilize Redis caching to create a page for viewing most recent rankings and most popular/least popular rankings
- CI/CD pipeline for ease of future implementation

**Prerequisites:** Node.js, PostgreSQL, Redis

```bash
# backend
cd api
npm install
# .env needs: DATABASE_URL (or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE), REDIS_URL, PORT
node server.js

# frontend
cd app
npm install
# .env needs: VITE_API_URL_LOCAL
npm run dev
```

## Tech stack
**Frontend:** React 19, Vite, React Router
**Backend:** Node.js, Express 5, express-rate-limit
**Data:** PostgreSQL (`pg`), Redis (`redis`, `rate-limit-redis`)
