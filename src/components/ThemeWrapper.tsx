import React from "react";
import type { ThemeVariant } from "./types";

export type ThemeWrapperProps = {
  themeVariant?: ThemeVariant;
  className?: string;
  children: React.ReactNode;
};

/**
 * Layout / class map per theme. Themes only change chrome — never interaction state.
 * Add new variants here without touching ArticleCard vote logic.
 */
const THEME_LAYOUT: Record<
  ThemeVariant,
  { wrapper: string; content: string }
> = {
  default: {
    wrapper: "a1-theme a1-theme--default rounded-2xl overflow-hidden",
    content: "flex flex-col gap-4 p-5 md:p-6",
  },
  civic: {
    wrapper:
      "a1-theme a1-theme--civic rounded-2xl overflow-hidden border border-white/10",
    content: "flex flex-col gap-5 p-5 md:p-7",
  },
  urgent: {
    wrapper:
      "a1-theme a1-theme--urgent rounded-xl overflow-hidden ring-1 ring-amber-400/40",
    content: "flex flex-col gap-3 p-4 md:p-5",
  },
  fiscal: {
    wrapper:
      "a1-theme a1-theme--fiscal rounded-2xl overflow-hidden border border-emerald-500/20",
    content: "flex flex-col gap-4 p-5 md:p-6",
  },
  compact: {
    wrapper: "a1-theme a1-theme--compact rounded-lg overflow-hidden",
    content: "flex flex-col gap-2 p-3 md:p-4",
  },
  /** Full layout lives in EditorialCollageTheme — wrapper stays transparent. */
  "editorial-collage": {
    wrapper: "a1-theme a1-theme--editorial-collage",
    content: "contents",
  },
  /** Full layout lives in BentoGridTheme — wrapper stays transparent. */
  "bento-grid": {
    wrapper: "a1-theme a1-theme--bento-grid",
    content: "contents",
  },
};

/**
 * Dynamic layout wrapper: applies themeVariant classes without remounting
 * children or resetting core interaction state.
 */
export function ThemeWrapper({
  themeVariant = "default",
  className = "",
  children,
}: ThemeWrapperProps) {
  const layout = THEME_LAYOUT[themeVariant] ?? THEME_LAYOUT.default;
  const wrapperClass = [layout.wrapper, className].filter(Boolean).join(" ");

  return (
    <div
      className={wrapperClass}
      data-theme={themeVariant}
      data-a1-shell="theme-wrapper"
    >
      <div className={layout.content}>{children}</div>
    </div>
  );
}

export default ThemeWrapper;
