/**
 * Article 1 production readiness checklist (Themes 1–6).
 * Kept as a committed module so a fresh Vercel production build is forced
 * after theme + seed verification.
 *
 * Actual theme files:
 * - EditorialCollageTheme.tsx (alias: EditorialTheme)
 * - BentoGridTheme.tsx        (alias: BentoTheme)
 * - PipelineTheme.tsx
 * - InfluenceTheme.tsx
 * - LocalTheme.tsx
 * - VersusTheme.tsx
 * Router: ThemeWrapper.tsx
 * Feed:   /api/bills-feed (+ processed_votes theme seeds)
 * Live:   article1-themes.js / article1-themes.css
 */
export const ARTICLE1_PRODUCTION_BUILD_ID = "2026-08-07-editorial-aspect-3-4";

export const ARTICLE1_THEME_EXPORTS = [
  "EditorialCollageTheme",
  "EditorialTheme",
  "BentoGridTheme",
  "BentoTheme",
  "PipelineTheme",
  "InfluenceTheme",
  "LocalTheme",
  "VersusTheme",
  "ThemeWrapper",
] as const;

export const ARTICLE1_THEME_ROUTES = {
  versus: "versus",
  local: "local",
  finance: "bento-grid",
  procedural: "pipeline",
  influence: "influence",
  default: "editorial-collage",
} as const;
