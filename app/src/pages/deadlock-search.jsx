import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api';
import { HEROES, emptyBoard } from '../lib/heroes';
import { HeroBank, TierBoard } from '../components/TierList';
import './Deadlock.css';

const QUERY_PATTERN = /^[a-zA-Z0-9]{1,20}$/;

function formatDate(value) {
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function SearchResults({ q }) {
  const [result, setResult] = useState({ q: null });
  const valid = QUERY_PATTERN.test(q);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    // Wait for typing to pause before searching.
    const timer = setTimeout(() => {
      apiFetch(`/users/search?q=${encodeURIComponent(q)}`).then((res) => {
        if (!cancelled) setResult({ q, ok: res.ok, rows: res.data, error: errorMessage(res) });
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, valid]);

  if (!q) {
    return <p className="view-subtitle">Type a username to find another player's tier list.</p>;
  }
  if (!valid) {
    return <p className="status error">Usernames contain only letters and numbers.</p>;
  }
  if (result.q !== q) {
    return <p className="view-subtitle">Searching…</p>;
  }
  if (!result.ok) {
    return <p className="status error">{result.error}</p>;
  }
  if (result.rows.length === 0) {
    return <p className="view-subtitle">No players match “{q}”.</p>;
  }

  return (
    <ul className="result-list">
      {result.rows.map((row) => (
        <li key={row.username}>
          <Link to={`/deadlock-search/${row.username}`} className="result-name">{row.username}</Link>
          <span className="result-meta">
            {Number(row.heroes_ranked) > 0
              ? `${row.heroes_ranked} heroes ranked · updated ${formatDate(row.last_submitted)}`
              : 'No rankings yet'}
          </span>
        </li>
      ))}
    </ul>
  );
}

function UserRankings({ username }) {
  const [result, setResult] = useState({ username: null });

  useEffect(() => {
    let cancelled = false;
    apiFetch(`/users/${encodeURIComponent(username)}/rankings`).then((res) => {
      if (cancelled) return;
      setResult({ username, status: res.status, data: res.data, error: errorMessage(res) });
    });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (result.username !== username) {
    return <p className="view-subtitle">Loading…</p>;
  }
  if (result.status === 404) {
    return (
      <p className="status error">There is no account named “{username}”.</p>
    );
  }
  if (result.status !== 200) {
    return <p className="status error">{result.error}</p>;
  }

  const { rankings, last_updated: lastUpdated } = result.data;
  const board = emptyBoard();
  for (const { character, tier, date } of rankings) {
    board[tier]?.push({ hero: character, detail: `ranked ${formatDate(date)}` });
  }
  const placed = new Set(rankings.map((r) => r.character));
  const unranked = HEROES.filter((h) => !placed.has(h));

  return (
    <>
      <h2 className="view-title">{result.data.username}</h2>
      <p className="view-subtitle">
        {rankings.length > 0
          ? `${rankings.length} of ${HEROES.length} heroes ranked · last updated ${formatDate(lastUpdated)}`
          : 'This player has not ranked any heroes yet.'}
      </p>
      {rankings.length > 0 && (
        <div className="tierlist-section">
          <TierBoard board={board} />
          {unranked.length > 0 && <HeroBank heroes={unranked} title={`Not ranked by ${result.data.username}`} />}
        </div>
      )}
    </>
  );
}

function DeadlockSearch() {
  const { username } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const q = (params.get('q') ?? '').trim();

  return (
    <div className="deadlock-page">
      <h1 className="view-title">Search Players</h1>
      <p className="view-subtitle">Look up any registered player and see their latest tier list.</p>

      <form
        className="rank-form"
        role="search"
        onSubmit={(e) => {
          // Results update as you type; Enter jumps straight to an exact match.
          e.preventDefault();
          if (QUERY_PATTERN.test(q) && q.length >= 3) navigate(`/deadlock-search/${q}`);
        }}
      >
        <input
          type="search"
          placeholder="Search by username"
          aria-label="Username"
          value={params.get('q') ?? ''}
          maxLength={20}
          autoFocus={username === undefined}
          onChange={(e) => {
            const value = e.target.value;
            if (username !== undefined) {
              navigate(`/deadlock-search?q=${encodeURIComponent(value)}`);
            } else {
              setParams(value ? { q: value } : {}, { replace: true });
            }
          }}
        />
      </form>

      {username !== undefined ? (
        <>
          <Link to={q ? `/deadlock-search?q=${encodeURIComponent(q)}` : '/deadlock-search'} className="back-link">
            ← Back to search
          </Link>
          <UserRankings username={username} />
        </>
      ) : (
        <SearchResults q={q} />
      )}
    </div>
  );
}

export default DeadlockSearch;
