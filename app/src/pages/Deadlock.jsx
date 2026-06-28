import { useState } from 'react';
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
  'Mo & Krill',
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

const API_URL = import.meta.env.PROD
  ? import.meta.env.VITE_API_URL_PROD
  : import.meta.env.VITE_API_URL_LOCAL;

const USERNAME_PATTERN = /^[a-zA-Z0-9]{3,20}$/;

function RankHero() {
  const [user, setUser] = useState('');
  const [character, setCharacter] = useState(HEROES[0]);
  const [tier, setTier] = useState(TIERS[0]);
  const [status, setStatus] = useState(null);

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

    try {
      const res = await fetch(`${API_URL}/submit_character`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, character, tier }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus({ ok: false, message: data.error || 'request failed' });
        return;
      }

      setStatus({ ok: true, message: `Ranked ${data.character} as ${data.tier} tier` });
    } catch (err) {
      setStatus({ ok: false, message: err.message });
    }
  };

  return (
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

      <div className="field">
        <label htmlFor="character">Hero</label>
        <select
          id="character"
          value={character}
          onChange={(e) => setCharacter(e.target.value)}
        >
          {HEROES.map((hero) => (
            <option key={hero} value={hero}>
              {hero}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="tier">Tier</label>
        <select id="tier" value={tier} onChange={(e) => setTier(e.target.value)}>
          {TIERS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <button type="submit">Submit</button>

      {status && (
        <p className={`status ${status.ok ? 'ok' : 'error'}`}>{status.message}</p>
      )}
    </form>
  );
}

export default RankHero;
