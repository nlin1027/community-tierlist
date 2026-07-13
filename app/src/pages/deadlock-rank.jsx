import { useState, useRef } from 'react';
import './Deadlock.css';

const HEROES = [
  'Abrams',
  'Apollo',
  'Bebop',
  'Billy',
  'Calico',
  'Celeste',
  'Doorman',
  'Drifter',
  'Dynamo',
  'Graves',
  'Grey Talon',
  'Haze',
  'Holliday',
  'Infernus',
  'Ivy',
  'Kelvin',
  'Lady Geist',
  'Lash',
  'Mcginnis',
  'Mina',
  'Mirage',
  'Mo and Krill',
  'Paige',
  'Paradox',
  'Pocket',
  'Rem',
  'Seven',
  'Shiv',
  'Silver',
  'Sinclair',
  'Venator',
  'Victor',
  'Vindicta',
  'Viscous',
  'Vyper',
  'Warden',
  'Wraith',
  'Yamato',
];

const TIERS = ['Z', 'S', 'A', 'B', 'C', 'D'];

const TIER_COLORS = {
  Z: '#ff6b6b',
  S: '#ff9f43',
  A: '#ffd32a',
  B: '#0be881',
  C: '#48dbfb',
  D: '#a29bfe',
};

const API_URL = import.meta.env.PROD
  ? import.meta.env.VITE_API_URL_PROD
  : import.meta.env.VITE_API_URL_LOCAL;

const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,20}$/;

function heroToFilename(hero) {
  return hero.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.png';
}

function HeroIcon({ hero, onDragEnter, insertBefore }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('hero', hero);
  };

  return (
    <div
      className={`hero-icon${insertBefore ? ' insert-before' : ''}`}
      draggable
      onDragStart={handleDragStart}
      onDragEnter={onDragEnter}
      title={hero}
    >
      <img
        src={`/deadlock-icons/${heroToFilename(hero)}`}
        alt={hero}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <span className="hero-name">{hero}</span>
    </div>
  );
}

function TierRow({ tier, heroes, onDrop, insertInfo, onDragEnterIcon, onDragEnterZone }) {
  const handleDragOver = (e) => e.preventDefault();

  const handleDrop = (e) => {
    e.preventDefault();
    const hero = e.dataTransfer.getData('hero');
    if (hero) onDrop(hero, tier);
  };

  return (
    <div className="tier-row">
      <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>
        {tier}
      </div>
      <div
        className="tier-drop-zone"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onDragEnter={onDragEnterZone}
      >
        {heroes.map((hero, i) => (
          <HeroIcon
            key={hero}
            hero={hero}
            onDragEnter={() => onDragEnterIcon(tier, i)}
            insertBefore={insertInfo?.tier === tier && insertInfo?.index === i}
          />
        ))}
      </div>
    </div>
  );
}

function RankHero() {
  const [user, setUser] = useState('');
  const [status, setStatus] = useState(null);

  const initialTierList = Object.fromEntries(TIERS.map((t) => [t, []]));
  const [tierList, setTierList] = useState(initialTierList);
  const [bank, setBank] = useState([...HEROES]);
  const [insertInfo, setInsertInfo] = useState(null);
  const insertRef = useRef(null);

  const handleDragEnterIcon = (tier, index) => {
    const info = { tier, index };
    insertRef.current = info;
    setInsertInfo(info);
  };

  const handleDragEnterZone = (tier) => {
    if (insertRef.current?.tier !== tier) {
      insertRef.current = null;
      setInsertInfo(null);
    }
  };

  const handleDrop = (hero, targetTier) => {
    const index = insertRef.current?.tier === targetTier ? insertRef.current.index : null;
    insertRef.current = null;
    setInsertInfo(null);

    setTierList((prev) => {
      const updated = {};
      for (const t of TIERS) {
        updated[t] = prev[t].filter((h) => h !== hero);
      }
      if (index !== null) {
        const arr = [...updated[targetTier]];
        arr.splice(index, 0, hero);
        updated[targetTier] = arr;
      } else {
        updated[targetTier] = [...updated[targetTier], hero];
      }
      return updated;
    });
    setBank((prev) => prev.filter((h) => h !== hero));
  };

  const handleDropToBank = (e) => {
    e.preventDefault();
    const hero = e.dataTransfer.getData('hero');
    if (!hero) return;
    setTierList((prev) => {
      const updated = {};
      for (const t of TIERS) {
        updated[t] = prev[t].filter((h) => h !== hero);
      }
      return updated;
    });
    setBank((prev) => prev.includes(hero) ? prev : [...prev, hero]);
  };

  const buildRankings = () => {
    const rankings = [];
    for (const t of TIERS) {
      for (const hero of tierList[t]) {
        rankings.push({ character: hero, tier: t });
      }
    }
    return rankings;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatus(null);

    if (!USERNAME_PATTERN.test(user)) {
      setStatus({
        ok: false,
        message: 'User must be 3-20 characters and contain only letters and numbers',
      });
      return;
    }

    const rankings = buildRankings();

    if (rankings.length === 0) {
      setStatus({ ok: false, message: 'Place at least one hero in the tier list before submitting' });
      return;
    }

    try {
      const res = await fetch(`${API_URL}/submit_list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, rankings }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus({ ok: false, message: data.error || 'request failed' });
        return;
      }

      setStatus({ ok: true, message: `Submitted ${data.length} hero rankings` });
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    }
  };

  return (
    <div className="deadlock-page">
      <form className="rank-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="user">User</label>
          <input
            id="user"
            type="text"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            minLength={3}
            maxLength={20}
            pattern="[a-zA-Z0-9]+"
            title="3-20 characters: letters and numbers only"
            required
          />
        </div>

        <button type="submit">Submit</button>

        {status && (
          <p className={`status ${status.ok ? 'ok' : 'error'}`}>{status.message}</p>
        )}
      </form>

      <div className="tierlist-section">
        <div className="tierlist">
          {TIERS.map((t) => (
            <TierRow
              key={t}
              tier={t}
              heroes={tierList[t]}
              onDrop={handleDrop}
              insertInfo={insertInfo}
              onDragEnterIcon={handleDragEnterIcon}
              onDragEnterZone={() => handleDragEnterZone(t)}
            />
          ))}
        </div>

        <div
          className="hero-bank"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDropToBank}
        >
          {bank.map((hero) => (
            <HeroIcon key={hero} hero={hero} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default RankHero;
