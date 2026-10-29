type P = { size?: number; className?: string; strokeWidth?: number };

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
}

export const IconToday = ({ size = 24, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);

export const IconCalendar = ({ size = 24, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="3.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

export const IconCart = ({ size = 24, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M3 4h2.2l2.3 11.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.3" />
    <circle cx="9.5" cy="20" r="1.2" />
    <circle cx="17" cy="20" r="1.2" />
  </svg>
);

export const IconFork = ({ size = 24, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6" />
    <path d="M17 21V3c-2.2 1.3-3 4-3 7v3h3" />
  </svg>
);

export const IconChecklist = ({ size = 24, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M4 6.5l1.6 1.6L8.5 5M4 13.5l1.6 1.6 2.9-3.1M11.5 7h8.5M11.5 14h8.5M4.5 19.5h.01M11.5 19.5h8.5" />
  </svg>
);

export const IconPlus = ({ size = 20, className, strokeWidth = 2 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconCheck = ({ size = 16, className, strokeWidth = 2.6 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);

export const IconTrash = ({ size = 20, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V4.8c0-.4.4-.8.8-.8h3.4c.4 0 .8.4.8.8V7" />
  </svg>
);

export const IconClock = ({ size = 20, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

export const IconPin = ({ size = 14, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);

export const IconRepeat = ({ size = 13, className, strokeWidth = 1.9 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H19l-3-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H5l3 3" />
  </svg>
);

export const IconChevron = ({ size = 16, className, strokeWidth = 2 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export const IconPerson = ({ size = 20, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c1.3-3.6 4.2-5.2 7.5-5.2s6.2 1.6 7.5 5.2" />
  </svg>
);

export const IconBell = ({ size = 20, className, strokeWidth = 1.8 }: P) => (
  <svg {...base(size, className)} strokeWidth={strokeWidth}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);
