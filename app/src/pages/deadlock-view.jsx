import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiFetch, errorMessage } from '../lib/api';
import { TIERS, emptyBoard, tierFromAverage } from '../lib/heroes';
import { HeroBank, TierBoard } from '../components/TierList';
import './Deadlock.css';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDay(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

const PRESETS = [
  { key: 'all', label: 'All time', range: () => ({ from: '', to: '' }) },
  { key: '7d', label: 'Past week', range: () => ({ from: daysAgo(6), to: isoDay(new Date()) }) },
  { key: '30d', label: 'Past 30 days', range: () => ({ from: daysAgo(29), to: isoDay(new Date()) }) },
  { key: '90d', label: 'Past 90 days', range: () => ({ from: daysAgo(89), to: isoDay(new Date()) }) },
  { key: 'year', label: 'This year', range: () => ({ from: `${new Date().getFullYear()}-01-01`, to: isoDay(new Date()) }) },
];

function formatDay(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function describeRange(from, to) {
  if (!from && !to) return 'All time';
  if (from && to) return from === to ? `On ${formatDay(from)}` : `${formatDay(from)} to ${formatDay(to)}`;
  if (from) return `Since ${formatDay(from)}`;
  return `Up to ${formatDay(to)}`;
}

function buildBoard(data) {
  const board = emptyBoard();
  const unranked = [];
  let total = 0;
  for (const { character, average_tier, count } of data) {
    if (average_tier === null) {
      unranked.push(character);
      continue;
    }
    const avg = parseFloat(average_tier);
    total += Number(count);
    board[tierFromAverage(avg)].push({
      hero: character,
      avg,
      detail: `avg ${avg.toFixed(2)} from ${count} ranking${count === '1' ? '' : 's'}`,
    });
  }
  for (const t of TIERS) board[t].sort((a, b) => b.avg - a.avg);
  return { board, unranked, total };
}

function DeadlockView() {
  const [params, setParams] = useSearchParams();
  const fromParam = params.get('from') ?? '';
  const toParam = params.get('to') ?? '';
  const from = DAY.test(fromParam) ? fromParam : '';
  const to = DAY.test(toParam) ? toParam : '';
  const key = `${from}|${to}`;

  const [draft, setDraft] = useState({ from, to });
  const [result, setResult] = useState({ key: null });
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const query = qs.toString();
    apiFetch(`/average_list${query ? `?${query}` : ''}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setResult({ key, ...buildBoard(res.data) });
      else if (res.status === 404) setResult({ key, empty: true });
      else setResult({ key, error: errorMessage(res) });
    });
    return () => {
      cancelled = true;
    };
  }, [from, to, key]);

  const applyRange = (range) => {
    setFormError(null);
    if (range.from && range.to && range.from > range.to) {
      setFormError('The start date must be on or before the end date.');
      return;
    }
    setDraft(range);
    const next = {};
    if (range.from) next.from = range.from;
    if (range.to) next.to = range.to;
    setParams(next, { replace: true });
  };

  const activePreset = PRESETS.find((p) => {
    const r = p.range();
    return r.from === from && r.to === to;
  })?.key ?? 'custom';

  const loading = result.key !== key;

  return (
    <div className="deadlock-page">
      <h1 className="view-title">Community Tierlist</h1>
      <p className="view-subtitle">Average hero rankings based on user submissions</p>

      <div className="preset-row" role="group" aria-label="Time period">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className={`preset${activePreset === p.key ? ' active' : ''}`}
            onClick={() => applyRange(p.range())}
          >
            {p.label}
          </button>
        ))}
      </div>

      <form
        className="rank-form"
        onSubmit={(e) => {
          e.preventDefault();
          applyRange(draft);
        }}
      >
        <div className="field">
          <label htmlFor="range-from">From</label>
          <input
            id="range-from"
            type="date"
            value={draft.from}
            max={draft.to || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </div>
        <div className="field">
          <label htmlFor="range-to">To</label>
          <input
            id="range-to"
            type="date"
            value={draft.to}
            min={draft.from || undefined}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </div>
        <button type="submit">Apply</button>
        {formError && <p className="status error">{formError}</p>}
      </form>

      <p className="view-subtitle">
        {describeRange(from, to)}
        {!loading && result.total !== undefined && ` · ${result.total.toLocaleString()} hero rankings counted`}
      </p>

      {loading && <p className="view-subtitle">Loading…</p>}
      {!loading && result.error && <p className="status error">{result.error}</p>}
      {!loading && result.empty && (
        <p className="view-subtitle">No rankings were submitted in this period. Try a wider range.</p>
      )}
      {!loading && result.board && (
        <div className="tierlist-section">
          <TierBoard board={result.board} />
          {result.unranked.length > 0 && (
            <HeroBank heroes={result.unranked} title={`Unranked in this period (${result.unranked.length})`} />
          )}
        </div>
      )}
    </div>
  );
}

export default DeadlockView;
