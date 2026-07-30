export const IconDashboard = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <rect x="3" y="3" width="10" height="9" rx="1.5" fill="currentColor" opacity="0.9" />
    <rect x="15" y="3" width="6" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <rect x="15" y="11" width="6" height="10" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <rect x="3" y="14" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export const IconNutricao = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <path
      d="M12 21 C7 17 4 13 4 9 A5 5 0 0 1 12 5 A5 5 0 0 1 20 9 C20 13 17 17 12 21 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <line x1="12" y1="21" x2="12" y2="10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const IconPlug = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <rect x="3" y="9" width="7" height="6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <rect x="14" y="9" width="7" height="6" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <line x1="10" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export const IconAgendar = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <line x1="4" y1="9.5" x2="20" y2="9.5" stroke="currentColor" strokeWidth="1.7" />
    <line x1="8" y1="3" x2="8" y2="7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="16" y1="3" x2="16" y2="7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);

export const IconAgente = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <path
      d="M4 6 A2 2 0 0 1 6 4 L18 4 A2 2 0 0 1 20 6 L20 14 A2 2 0 0 1 18 16 L9 16 L5 20 L5 16 A2 2 0 0 1 4 14 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
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
