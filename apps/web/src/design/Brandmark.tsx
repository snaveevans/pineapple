import type { CSSProperties } from "react";

// FieldOps brandmark — the filled hex-nut logo glyph. This is brand identity,
// NOT a UI icon: the Icon set is deliberately stroke-only (fill="none"), and
// the nut is a filled shape, so it lives in its own component to keep the line
// between brand and interface vocabulary clean. Renders the glyph only; wrap it
// in a tile (.hf-logo-mark, .mk-logo-mark, .au-brand-mark, …) for the full
// lockup. Ported verbatim from the FieldOps design system (hifi.jsx).
export interface BrandmarkProps {
  size?: number;
  color?: string;
  style?: CSSProperties;
}

export function Brandmark({ size = 16, color = "currentColor", style }: BrandmarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      style={{ flexShrink: 0, display: "block", ...style }}
    >
      <path
        fillRule="evenodd"
        d="M12 2.6 20.1 7.3 20.1 16.7 12 21.4 3.9 16.7 3.9 7.3 Z M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z"
      />
    </svg>
  );
}
