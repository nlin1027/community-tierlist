import { useEffect, useState } from 'react';
import './Deadlock.css';

const TIERS = ['Z', 'S', 'A', 'B', 'C', 'D'];

const TIER_COLORS = {
  Z: '#ff6b6b',
  S: '#ff9f43',
  A: '#ffd32a',
  B: '#0be881',
  C: '#48dbfb',
  D: '#a29bfe',
};

const TIER_BY_NUMBER = {
  6: 'Z',
  5: 'S',
  4: 'A',
  3: 'B',
  2: 'C',
  1: 'D',
};

const API_URL = import.meta.env.PROD
  ? import.meta.env.VITE_API_URL_PROD
  : import.meta.env.VITE_API_URL_LOCAL;

function heroToFilename(hero) {
  return hero.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.png';
}

function HeroIcon({ hero }) {
  return (
    <div className="hero-icon" title={hero}>
      <img
        src={`/deadlock-icons/${heroToFilename(hero)}`}
        alt={hero}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <span className="hero-name">{hero}</span>
    </div>
  );
}

function TierRow({ tier, heroes }) {
  return (
    <div className="tier-row">
      <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>
        {tier}
      </div>
      <div className="tier-drop-zone">
        {heroes.map((hero) => (
          <HeroIcon key={hero} hero={hero} />
        ))}
      </div>
    </div>
  );
}

function DeadlockView() {
  const [tierList, setTierList] = useState(null);
  const [unranked, setUnranked] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchAverages() {
      try {
        const res = await fetch(`${API_URL}/average_list`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'request failed');
          return;
        }

        const grouped = Object.fromEntries(TIERS.map((t) => [t, []]));
        const unrankedHeroes = [];

        for (const { character, average_tier } of data) {
          if (average_tier === null) {
            unrankedHeroes.push(character);
            continue;
          }
          const tierNumber = Math.min(6, Math.max(1, Math.round(parseFloat(average_tier))));
          grouped[TIER_BY_NUMBER[tierNumber]].push({ character, average_tier: parseFloat(average_tier) });
        }

        for (const t of TIERS) {
          grouped[t].sort((a, b) => b.average_tier - a.average_tier);
        }

        setTierList(Object.fromEntries(TIERS.map((t) => [t, grouped[t].map((h) => h.character)])));
        setUnranked(unrankedHeroes);
      } catch (err) {
        setError(err.message);
      }
    }

    fetchAverages();
  }, []);

  return (
    <div className="deadlock-page">
      <h1 className="view-title">Community Tierlist</h1>
      <p className="view-subtitle">Average hero rankings based on user submissions</p>

      {error && <p className="status error">{error}</p>}

      {tierList && (
        <div className="tierlist-section">
          <div className="tierlist">
            {TIERS.map((t) => (
              <TierRow key={t} tier={t} heroes={tierList[t]} />
            ))}
          </div>

          {unranked.length > 0 && (
            <div className="hero-bank">
              {unranked.map((hero) => (
                <HeroIcon key={hero} hero={hero} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default DeadlockView;
