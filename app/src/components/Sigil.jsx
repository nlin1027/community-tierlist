// Art-deco sunburst seal used as the site mark. Inherits color from CSS.
function Sigil({ className }) {
  const rays = Array.from({ length: 16 }, (_, i) => i * 22.5);
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="32" cy="32" r="30" />
        <circle cx="32" cy="32" r="26" strokeWidth="0.8" />
        {rays.map((deg, i) => (
          <line
            key={deg}
            x1="32"
            y1={i % 2 ? 10 : 7}
            x2="32"
            y2="17"
            transform={`rotate(${deg} 32 32)`}
            strokeWidth={i % 2 ? 0.8 : 1.4}
          />
        ))}
        <path d="M32 19 L45 32 L32 45 L19 32 Z" />
        <path d="M24 32 Q32 24 40 32 Q32 40 24 32 Z" />
      </g>
      <circle cx="32" cy="32" r="3" fill="currentColor" />
    </svg>
  );
}

export default Sigil;
