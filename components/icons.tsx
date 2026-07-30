export const IconPlug = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <rect x="3" y="9" width="7" height="6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <rect x="14" y="9" width="7" height="6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export const IconFlask = (props: { className?: string; color?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <path
      d="M10 3 L10 10 L5 19 A2 2 0 0 0 7 22 L17 22 A2 2 0 0 0 19 19 L14 10 L14 3"
      fill="none"
      stroke={props.color || "currentColor"}
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
    <line x1="9" y1="3" x2="15" y2="3" stroke={props.color || "currentColor"} strokeWidth="1.6" strokeLinecap="round" />
    <line x1="7" y1="15" x2="17" y2="15" stroke={props.color || "currentColor"} strokeWidth="1.6" />
  </svg>
);
