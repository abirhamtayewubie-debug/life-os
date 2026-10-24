/** Shown only when Life OS runs as an installed app; pure CSS so it animates before anything loads. */
export function LaunchScreen() {
  return (
    <div className="launch-screen" aria-hidden>
      <svg viewBox="0 0 64 64" width="112" height="112">
        <circle className="launch-ring" cx="32" cy="32" r="14" fill="none" stroke="#f3efe6" strokeWidth="4.5" pathLength="100" />
        <g className="launch-dot">
          <circle cx="42" cy="22" r="7" fill="#2b2a26" />
          <circle cx="42" cy="22" r="4.6" fill="#c2734f" />
        </g>
      </svg>
      <span className="launch-name font-display text-[30px] font-normal tracking-[-0.01em]">Life OS</span>
    </div>
  );
}
