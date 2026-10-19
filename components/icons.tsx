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

// ── Holiday (chat) — mesmo traco 1.7 e currentColor dos icones acima ──

export const IconCamera = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <path
      d="M4 8.5 A1.5 1.5 0 0 1 5.5 7 H8 L9.5 5 H14.5 L16 7 H18.5 A1.5 1.5 0 0 1 20 8.5 V17.5 A1.5 1.5 0 0 1 18.5 19 H5.5 A1.5 1.5 0 0 1 4 17.5 Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12.8" r="3.3" fill="none" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);

export const IconMic = (props: { className?: string; muted?: boolean }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5.5 11 A6.5 6.5 0 0 0 18.5 11" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <line x1="12" y1="17.5" x2="12" y2="21" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    {props.muted && <line x1="4" y1="3.5" x2="20" y2="20.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />}
  </svg>
);

export const IconStop = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
  </svg>
);

export const IconSpeaker = (props: { className?: string; muted?: boolean }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <path d="M4 9.5 H7.5 L12 5.5 V18.5 L7.5 14.5 H4 Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    {props.muted ? (
      <>
        <line x1="16" y1="9.5" x2="21" y2="14.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <line x1="21" y1="9.5" x2="16" y2="14.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    ) : (
      <>
        <path d="M15.5 9 A4 4 0 0 1 15.5 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M18 6.5 A7.5 7.5 0 0 1 18 17.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </>
    )}
  </svg>
);

export const IconPlay = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <path d="M8 5.5 L18.5 12 L8 18.5 Z" fill="currentColor" />
  </svg>
);

export const IconAutomacao = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M12 7.5 V12 L15 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18.5 3.5 V7 H15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const IconMore = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <circle cx="5" cy="12" r="1.8" fill="currentColor" />
    <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    <circle cx="19" cy="12" r="1.8" fill="currentColor" />
  </svg>
);

export const IconLogout = (props: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={props.className}>
    <path d="M10 5 H6 A2 2 0 0 0 4 7 V17 A2 2 0 0 0 6 19 H10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M15 8 L19 12 L15 16 M19 12 H9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
