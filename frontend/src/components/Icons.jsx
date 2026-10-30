const P = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  layers: "M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5",
  chat: "M4 5h16v11H8l-4 4V5z",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6 6 18",
  check: "M5 12l5 5 9-10",
  menu: "M4 7h16M4 12h16M4 17h16",
  chevronLeft: "M14 6l-6 6 6 6",
  chevronRight: "M10 6l6 6-6 6",
  field: "M3 20 9 4h6l6 16H3zM6 14h12M8 9h8",
  plans: "M6 3h9l4 4v14H6zM9 11h7M9 15h7M9 7h3",
  data: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  drop: "M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.4-5 1.3-5 3.8 0 1 1.1 1.6 2.5 1.6s2.5-.5 2.5-1.5",
  sprout: "M12 21v-9M12 12c0-4 3-7 8-7 0 4-3 7-8 7zM12 14c0-3-2-5-7-5 0 3 2 5 7 5z",
  undo: "M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2",
  edit: "M4 20h4L19 9l-4-4L4 16v4z",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  share: "M12 3v12M7 8l5-5 5 5M5 14v6h14v-6",
  copy: "M8 8h12v12H8zM4 4h12v4M4 4v12h4",
  pdf: "M6 3h9l4 4v14H6zM9 13h6M9 17h4",
  send: "M4 12 20 4l-6 16-3-7-7-1z",
  stop: "M7 7h10v10H7z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  snow: "M12 2v20M4 6l16 12M20 6 4 18",
  download: "M12 3v12M7 10l5 5 5-5M5 20h14",
  pin: "M12 22s7-6.3 7-12a7 7 0 0 0-14 0c0 5.7 7 12 7 12zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  help: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01",
  home: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5",
};

// Brand marks for the share buttons, drawn in each service's own colours.
export function TelegramLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path fill="#fff" d="M5.2 11.7l11.9-4.6c.55-.2 1.03.13.85.97l-2.03 9.56c-.15.68-.55.84-1.12.53l-3.1-2.28-1.5 1.44c-.16.16-.3.3-.62.3l.22-3.15 5.74-5.18c.25-.22-.05-.34-.39-.12l-7.1 4.47-3.06-.96c-.66-.2-.68-.66.14-.98z" />
    </svg>
  );
}

export function WhatsAppLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#25D366" />
      <path fill="none" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" d="M6.3 17.7l.8-2.8A5.9 5.9 0 1 1 9.3 17z" />
      <path fill="#fff" d="M9.6 8.6c.15-.35.32-.36.47-.36h.4c.13 0 .32.05.48.4.17.38.56 1.33.6 1.43.05.1.08.21.02.34-.07.13-.1.21-.2.33l-.3.35c-.1.1-.2.21-.09.42.12.2.52.86 1.12 1.4.77.68 1.42.9 1.62 1 .2.1.32.08.44-.05.12-.14.5-.59.64-.79.13-.2.27-.17.45-.1.18.06 1.16.55 1.36.65.2.1.33.15.38.23.05.09.05.48-.11.95-.17.46-.97.9-1.33.93-.36.04-.7.17-2.38-.5-2.02-.8-3.3-2.86-3.4-3-.1-.13-.8-1.07-.8-2.04 0-.97.5-1.45.69-1.65z" />
    </svg>
  );
}

export function PdfLogo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#E5252A" />
      <text x="12" y="15.6" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif">PDF</text>
    </svg>
  );
}

export default function Icon({ name, size = 20, className = "" }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}
