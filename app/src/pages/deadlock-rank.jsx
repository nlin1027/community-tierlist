import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/context';
import { apiFetch, errorMessage } from '../lib/api';
import { HEROES, TIERS, TIER_META, emptyBoard } from '../lib/heroes';
import { HeroCard, TierLabel } from '../components/TierList';
import './Deadlock.css';

function removeHero(board, hero) {
  return Object.fromEntries(TIERS.map((t) => [t, board[t].filter((h) => h !== hero)]));
}

function DeadlockRank() {
  const { user, token, ready, expire } = useAuth();

  const [board, setBoard] = useState(emptyBoard);
  const [bank, setBank] = useState(() => [...HEROES]);
  const [insertInfo, setInsertInfo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState(null);
  const insertRef = useRef(null);

  // Start from the signed-in user's saved rankings, once per account.
  const username = user?.username;
  useEffect(() => {
    if (!username || loadedFor === username) return;
    let cancelled = false;
    apiFetch(`/users/${encodeURIComponent(username)}/rankings`).then((result) => {
      if (cancelled) return;
      setLoadedFor(username);
      if (!result.ok || result.data.rankings.length === 0) return;
      const next = emptyBoard();
      for (const { character, tier } of result.data.rankings) {
        if (next[tier] && HEROES.includes(character)) next[tier].push(character);
      }
      const placed = new Set(Object.values(next).flat());
      setBoard(next);
      setBank(HEROES.filter((h) => !placed.has(h)));
      setStatus({ ok: true, message: 'Loaded your saved rankings. Rearrange and submit to update them.' });
    });
    return () => {
      cancelled = true;
    };
  }, [username, loadedFor]);

  const placeHero = (hero, targetTier, index = null) => {
    setBoard((prev) => {
      const next = removeHero(prev, hero);
      const row = [...next[targetTier]];
      if (index === null) row.push(hero);
      else row.splice(index, 0, hero);
      next[targetTier] = row;
      return next;
    });
    setBank((prev) => prev.filter((h) => h !== hero));
    setSelected(null);
  };

  const returnToBank = (hero) => {
    setBoard((prev) => removeHero(prev, hero));
    setBank((prev) => (prev.includes(hero) ? prev : [...prev, hero]));
    setSelected(null);
  };

  const clearInsert = () => {
    insertRef.current = null;
    setInsertInfo(null);
  };

  const handleDragEnterIcon = (tier, index) => {
    const info = { tier, index };
    insertRef.current = info;
    setInsertInfo(info);
  };

  const handleDragEnterZone = (tier) => {
    if (insertRef.current?.tier !== tier) clearInsert();
  };

  const handleDropOnTier = (e, tier) => {
    e.preventDefault();
    const hero = e.dataTransfer.getData('hero');
    const index = insertRef.current?.tier === tier ? insertRef.current.index : null;
    clearInsert();
    if (hero) placeHero(hero, tier, index);
  };

  const handleDropOnBank = (e) => {
    e.preventDefault();
    clearInsert();
    const hero = e.dataTransfer.getData('hero');
    if (hero) returnToBank(hero);
  };

  const startDrag = (hero) => (e) => {
    e.dataTransfer.setData('hero', hero);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Click-to-place, for touch screens and keyboards: pick a hero, then a tier.
  const toggleSelect = (hero) => setSelected((cur) => (cur === hero ? null : hero));

  const clearBoard = () => {
    setBoard(emptyBoard());
    setBank([...HEROES]);
    setSelected(null);
    setStatus(null);
  };

  const placedCount = TIERS.reduce((n, t) => n + board[t].length, 0);

  const handleSubmit = async () => {
    setStatus(null);
    const rankings = TIERS.flatMap((tier) => board[tier].map((character) => ({ character, tier })));
    if (rankings.length === 0) {
      setStatus({ ok: false, message: 'Place at least one hero in the tier list before submitting.' });
      return;
    }

    setSubmitting(true);
    const result = await apiFetch('/submit_list', { method: 'POST', body: { rankings }, token });
    setSubmitting(false);

    if (result.status === 401) {
      expire();
      return;
    }
    if (!result.ok) {
      setStatus({ ok: false, message: errorMessage(result) });
      return;
    }
    setStatus({ ok: true, message: `Sealed and submitted — ${result.data.length} heroes ranked.` });
  };

  if (!ready) {
    return <div className="page"><p className="muted center">Checking your session…</p></div>;
  }

  if (!user) {
    return (
      <div className="page">
        <section className="panel gate">
          <p className="eyebrow">Members only</p>
          <h1 className="page-title">Make your mark</h1>
          <p className="lede">
            Sign in to submit a tier list. Your rankings are saved to your name, count toward the
            community average, and can be looked up by other players.
          </p>
          <Link to="/login" state={{ from: '/deadlock-rank' }} className="btn btn-brass">
            Sign in or create an account
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <p className="eyebrow">Rank the heroes</p>
        <h1 className="page-title">Your Tier List</h1>
        <p className="lede">
          Drag heroes onto a tier, or tap a hero and then a tier. Submitting again replaces your
          earlier ranking for each hero you place.
        </p>
      </header>

      <div className="toolbar panel">
        <span className="toolbar-meta">
          Signed in as <strong>{user.username}</strong> · {placedCount} / {HEROES.length} placed
        </span>
        <div className="toolbar-actions">
          <button type="button" className="btn btn-ghost" onClick={clearBoard} disabled={placedCount === 0}>
            Clear board
          </button>
          <button type="button" className="btn btn-brass" onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit rankings'}
          </button>
        </div>
      </div>

      {status && (
        <p className={`notice ${status.ok ? 'notice-ok' : 'notice-error'}`} role="status">{status.message}</p>
      )}
      {selected && (
        <p className="notice notice-info" role="status">
          <strong>{selected}</strong> selected — tap a tier to place, or the roster to remove.
        </p>
      )}

      <div className="tierlist">
        {TIERS.map((tier) => (
          <div
            className={`tier-row${selected ? ' is-target' : ''}`}
            key={tier}
            style={{ '--tier-color': TIER_META[tier].color }}
          >
            <TierLabel tier={tier} />
            <div
              className="tier-zone droppable"
              onDragOver={(e) => e.preventDefault()}
              onDragEnter={() => handleDragEnterZone(tier)}
              onDrop={(e) => handleDropOnTier(e, tier)}
              onClick={() => selected && placeHero(selected, tier)}
            >
              {board[tier].length === 0 && <span className="tier-empty">Drop heroes here</span>}
              {board[tier].map((hero, i) => (
                <HeroCard
                  key={hero}
                  hero={hero}
                  draggable
                  selected={selected === hero}
                  onDragStart={startDrag(hero)}
                  onDragEnter={() => handleDragEnterIcon(tier, i)}
                  insertBefore={insertInfo?.tier === tier && insertInfo?.index === i}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (selected && selected !== hero) placeHero(selected, tier, i);
                    else toggleSelect(hero);
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <section className="hero-bank-wrap">
        <h3 className="bank-title">The Roster <span className="muted">({bank.length} unplaced)</span></h3>
        <div
          className="hero-bank droppable"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropOnBank}
          onClick={() => selected && returnToBank(selected)}
        >
          {bank.length === 0 && <span className="tier-empty">Every hero has been placed.</span>}
          {bank.map((hero) => (
            <HeroCard
              key={hero}
              hero={hero}
              draggable
              selected={selected === hero}
              onDragStart={startDrag(hero)}
              onClick={(e) => {
                e.stopPropagation();
                toggleSelect(hero);
              }}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default DeadlockRank;
