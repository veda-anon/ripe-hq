export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
      <g stroke="currentColor" strokeWidth="6" strokeLinecap="round">
        <line x1="24.7" y1="14" x2="75.3" y2="14" />
        <line x1="13.1" y1="26" x2="86.9" y2="26" />
        <line x1="7.7" y1="38" x2="92.3" y2="38" />
        <line x1="6" y1="50" x2="94" y2="50" stroke="#B15538" />
        <line x1="7.7" y1="62" x2="92.3" y2="62" />
        <line x1="13.1" y1="74" x2="86.9" y2="74" />
        <line x1="24.7" y1="86" x2="75.3" y2="86" />
      </g>
    </svg>
  );
}
