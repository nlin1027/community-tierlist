import { TIERS, TIER_META, heroIcon } from '../lib/heroes';

export function HeroCard({ hero, detail, draggable, onDragStart, onDragEnter, insertBefore, onClick, selected }) {
  const classes = ['hero-card'];
  if (insertBefore) classes.push('insert-before');
  if (draggable) classes.push('is-draggable');
  if (selected) classes.push('is-selected');
  return (
    <div
      className={classes.join(' ')}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onClick={onClick}
      title={detail ? `${hero} — ${detail}` : hero}
    >
      <div className="hero-portrait">
        <img
          src={heroIcon(hero)}
          alt={hero}
          draggable={false}
          onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        />
      </div>
      <span className="hero-name">{hero}</span>
    </div>
  );
}

export function TierLabel({ tier }) {
  const { color, title } = TIER_META[tier];
  return (
    <div className="tier-label" style={{ '--tier-color': color }}>
      <span className="tier-letter">{tier}</span>
      <span className="tier-title">{title}</span>
    </div>
  );
}

// Read-only board. `board` maps tier -> [{ hero, detail? }].
export function TierBoard({ board, emptyText = '—' }) {
  return (
    <div className="tierlist">
      {TIERS.map((tier) => (
        <div className="tier-row" key={tier} style={{ '--tier-color': TIER_META[tier].color }}>
          <TierLabel tier={tier} />
          <div className="tier-zone">
            {board[tier].length === 0 && <span className="tier-empty">{emptyText}</span>}
            {board[tier].map(({ hero, detail }) => (
              <HeroCard key={hero} hero={hero} detail={detail} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeroBank({ heroes, title, children, ...zoneProps }) {
  return (
    <section className="hero-bank-wrap">
      {title && <h3 className="bank-title">{title}</h3>}
      <div className="hero-bank" {...zoneProps}>
        {children ?? heroes.map((hero) => <HeroCard key={hero} hero={hero} />)}
      </div>
    </section>
  );
}
