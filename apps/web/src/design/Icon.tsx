import type { CSSProperties, ReactNode } from "react";

// Inline SVG icon set (lucide-style, 1.75 default stroke). Ported verbatim
// from the FieldOps design system (hifi.jsx) so the marketing page renders
// pixel-identically to the prototype.
export type IconName =
  | "home-nav"
  | "grid"
  | "calendar"
  | "clock"
  | "truck"
  | "van"
  | "home"
  | "leaf"
  | "bolt"
  | "mower"
  | "wrench"
  | "pin"
  | "clock-sm"
  | "repeat"
  | "check"
  | "snooze"
  | "arrow-right"
  | "chevron-right"
  | "bell"
  | "search"
  | "plus"
  | "alert"
  | "dot"
  | "filter"
  | "menu"
  | "map-pin"
  | "camera"
  | "x"
  | "car"
  | "info"
  | "image"
  | "lock";

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  color?: string;
  style?: CSSProperties;
}

const PATHS: Record<IconName, ReactNode> = {
  "home-nav": (
    <>
      <path d="M3 11 12 3l9 8" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  truck: (
    <>
      <path d="M3 7h11v9H3z" />
      <path d="M14 10h4l3 3v3h-7" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  van: (
    <>
      <path d="M3 7h13v10H3z" />
      <path d="M16 10h3l2 3v4h-5" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  home: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  leaf: (
    <>
      <path d="M4 20c0-8 6-14 16-14 0 10-6 16-14 16-2 0-2-2-2-2z" />
      <path d="M4 20 14 10" />
    </>
  ),
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  mower: (
    <>
      <circle cx="6" cy="17" r="3" />
      <circle cx="17" cy="17" r="3" />
      <path d="M3 14v-3h12l3-5h3v3l-3 5" />
    </>
  ),
  wrench: <path d="M14 6a4 4 0 0 0 5 5l-9 9a3 3 0 0 1-5-5z" />,
  pin: (
    <>
      <path d="M12 22c4-5 7-9 7-12a7 7 0 0 0-14 0c0 3 3 7 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  "clock-sm": (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  repeat: (
    <>
      <path d="M17 3l4 4-4 4" />
      <path d="M3 11V9a2 2 0 0 1 2-2h16" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M21 13v2a2 2 0 0 1-2 2H3" />
    </>
  ),
  check: <path d="M5 13l4 4 10-12" />,
  snooze: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M9 9h5l-5 6h5" />
      <path d="M7 3 4 6M17 3l3 3" />
    </>
  ),
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  "chevron-right": <path d="M9 6l6 6-6 6" />,
  bell: (
    <>
      <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-5-5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  alert: (
    <>
      <path d="M12 4 2 20h20z" />
      <path d="M12 10v5M12 18v.5" />
    </>
  ),
  dot: <circle cx="12" cy="12" r="4" />,
  filter: <path d="M3 5h18l-7 9v6l-4-2v-4z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  "map-pin": (
    <>
      <path d="M12 22c4-5 7-9 7-12a7 7 0 0 0-14 0c0 3 3 7 7 12z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  x: <path d="M6 6l12 12M18 6 6 18" />,
  car: (
    <>
      <path d="M5 11l1.5-4h11L19 11" />
      <path d="M3 16v-3l2-2h14l2 2v3h-3" />
      <path d="M3 16h3M18 16h3" />
      <circle cx="8" cy="17" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8v.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m4 19 5-5 4 4 3-3 4 4" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

export function Icon({ name, size = 16, stroke = 1.75, color = "currentColor", style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }}
    >
      {PATHS[name] ?? <circle cx="12" cy="12" r="9" />}
    </svg>
  );
}
