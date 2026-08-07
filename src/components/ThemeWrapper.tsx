import React from "react";
import { BentoGridTheme } from "./themes/BentoGridTheme";
import { EditorialCollageTheme } from "./themes/EditorialCollageTheme";
import type { BillMetric, ThemeVariant } from "./types";

/** Visual themes ThemeWrapper can dynamically select between. */
export type ResolvedArticleTheme = "editorial-collage" | "bento-grid";

const FINANCE_CATEGORY_PATTERN =
  /\b(finance|financial|budget|budgets|economy|economic|fiscal|trade|appropriations?|treasury|tax|revenue|deficit|debt)\b/i;

export type ThemeWrapperProps = {
  billId: string;
  title: string;
  category: string;
  keyImpacts: string[];
  /**
   * Explicit theme override. When omitted (or a legacy shell variant),
   * category keywords decide between Bento Grid and Editorial Collage.
   */
  themeVariant?: ThemeVariant;
  humanHook?: string;
  promptQuestion?: string;
  imageSrc?: string;
  imageAlt?: string;
  financialSummary?: string;
  metrics?: BillMetric[];
  className?: string;
  children?: React.ReactNode;
};

/**
 * True when the category string signals finance / budget / economy content.
 */
export function isFinanceCategory(category = ""): boolean {
  return FINANCE_CATEGORY_PATTERN.test(category);
}

/**
 * Resolve which Article 1 visual theme to render.
 * Explicit `bento-grid` / `editorial-collage` (and `fiscal`) win;
 * otherwise finance-like categories → Bento, everything else → Editorial.
 */
export function resolveArticleTheme(
  category = "",
  themeVariant?: ThemeVariant
): ResolvedArticleTheme {
  if (themeVariant === "bento-grid" || themeVariant === "fiscal") {
    return "bento-grid";
  }
  if (themeVariant === "editorial-collage") {
    return "editorial-collage";
  }
  if (isFinanceCategory(category)) {
    return "bento-grid";
  }
  return "editorial-collage";
}

/**
 * Dynamic theme router for Article 1.
 * Selects Bento Grid vs Editorial Collage from `themeVariant` / `category`,
 * then forwards bill props into the active theme without touching vote state.
 */
export function ThemeWrapper({
  billId,
  title,
  category,
  keyImpacts,
  themeVariant,
  humanHook,
  promptQuestion,
  imageSrc,
  imageAlt,
  financialSummary,
  metrics = [],
  className = "",
  children,
}: ThemeWrapperProps) {
  const resolvedTheme = resolveArticleTheme(category, themeVariant);
  const wrapperClass = [
    "a1-theme",
    `a1-theme--${resolvedTheme}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={wrapperClass}
      data-theme={resolvedTheme}
      data-theme-requested={themeVariant ?? "auto"}
      data-a1-shell="theme-wrapper"
    >
      {resolvedTheme === "bento-grid" ? (
        <BentoGridTheme
          billId={billId}
          title={title}
          category={category}
          keyImpacts={keyImpacts}
          financialSummary={financialSummary}
          metrics={metrics}
        >
          {children}
        </BentoGridTheme>
      ) : (
        <EditorialCollageTheme
          billId={billId}
          title={title}
          category={category}
          keyImpacts={keyImpacts}
          humanHook={humanHook}
          promptQuestion={promptQuestion}
          imageSrc={imageSrc}
          imageAlt={imageAlt}
        >
          {children}
        </EditorialCollageTheme>
      )}
    </div>
  );
}

export default ThemeWrapper;
