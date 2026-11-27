import { TIERS, TIER_COLORS, heroIcon } from '../lib/heroes';

export function HeroIcon({ hero, detail, draggable, onDragStart, onDragEnter, insertBefore, onClick, selected }) {
  const classes = ['hero-icon'];
  if (insertBefore) classes.push('insert-before');
  if (selected) classes.push('selected');
  return (
    <div
      className={classes.join(' ')}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onClick={onClick}
      title={detail ? `${hero} (${detail})` : hero}
    >
      <img
        src={heroIcon(hero)}
        alt={hero}
        draggable={false}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <span className="hero-name">{hero}</span>
    </div>
  );
}

export function TierLabel({ tier }) {
  return (
    <div className="tier-label" style={{ background: TIER_COLORS[tier] }}>
      {tier}
    </div>
  );
}

// Read-only board. `board` maps tier -> [{ hero, detail? }].
export function TierBoard({ board }) {
  return (
    <div className="tierlist">
      {TIERS.map((tier) => (
        <div className="tier-row" key={tier}>
          <TierLabel tier={tier} />
          <div className="tier-drop-zone">
            {board[tier].map(({ hero, detail }) => (
              <HeroIcon key={hero} hero={hero} detail={detail} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeroBank({ heroes, title }) {
  return (
    <div>
      {title && <h3 className="bank-title">{title}</h3>}
      <div className="hero-bank">
        {heroes.map((hero) => <HeroIcon key={hero} hero={hero} />)}
      </div>
    </div>
  );
}
