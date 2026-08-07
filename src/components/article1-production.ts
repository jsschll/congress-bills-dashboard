/**
 * Article 1 production readiness checklist (Themes 1–4).
 * Kept as a committed module so a fresh Vercel production build is forced
 * after theme + seed verification.
 *
 * Actual theme files:
 * - EditorialCollageTheme.tsx (alias: EditorialTheme)
 * - BentoGridTheme.tsx        (alias: BentoTheme)
 * - PipelineTheme.tsx
 * - InfluenceTheme.tsx
 * Router: ThemeWrapper.tsx
 * Feed:   /api/bills-feed (+ processed_votes theme seeds)
 */
export const ARTICLE1_PRODUCTION_BUILD_ID = "2026-08-07-themes-1-4-verify";

export const ARTICLE1_THEME_EXPORTS = [
  "EditorialCollageTheme",
  "EditorialTheme",
  "BentoGridTheme",
  "BentoTheme",
  "PipelineTheme",
  "InfluenceTheme",
  "ThemeWrapper",
] as const;

export const ARTICLE1_THEME_ROUTES = {
  finance: "bento-grid",
  procedural: "pipeline",
  influence: "influence",
  default: "editorial-collage",
} as const;
