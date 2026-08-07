import React from "react";
import { BentoGridTheme } from "./themes/BentoGridTheme";
import { EditorialCollageTheme } from "./themes/EditorialCollageTheme";
import type { BillMetric, ThemeVariant } from "./types";
import {
  collectBillThemeSignals,
  mapLiveBillToArticleProps,
  resolveBillCategoryLabel,
  type LegislativeBill,
} from "../lib/live-bill";

/** Visual themes ThemeWrapper can dynamically select between. */
export type ResolvedArticleTheme = "editorial-collage" | "bento-grid";

const FINANCE_SIGNAL_PATTERN =
  /\b(finance|financial|budget|budgets|economy|economic|fiscal|trade|appropriations?|treasury|tax|taxes|revenue|deficit|debt|commerce|banking|securities)\b/i;

const HUMAN_CENTERED_SIGNAL_PATTERN =
  /\b(education|health|healthcare|housing|social|civil rights|labor|immigration|family|children|veterans|disability|welfare|nutrition|public health)\b/i;

export type ThemeWrapperProps = {
  /** Live / structured bill object — preferred source for routing + copy. */
  bill?: LegislativeBill;
  billId?: string;
  title?: string;
  category?: string;
  keyImpacts?: string[];
  /**
   * Explicit theme override. When omitted, real bill category / subject / type
   * (and tags) decide between Bento Grid and Editorial Collage.
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
 * True when taxonomy signals point at finance / budget / economy content.
 */
export function isFinanceCategory(signals = ""): boolean {
  return FINANCE_SIGNAL_PATTERN.test(signals);
}

/**
 * True when taxonomy signals point at human-centered social policy.
 */
export function isHumanCenteredCategory(signals = ""): boolean {
  return HUMAN_CENTERED_SIGNAL_PATTERN.test(signals);
}

/**
 * Resolve which Article 1 visual theme to render from real bill properties.
 * Explicit `bento-grid` / `editorial-collage` (and `fiscal`) win;
 * otherwise finance-like signals → Bento, everything else → Editorial.
 */
export function resolveArticleTheme(
  categoryOrSignals = "",
  themeVariant?: ThemeVariant,
  bill?: LegislativeBill
): ResolvedArticleTheme {
  if (themeVariant === "bento-grid" || themeVariant === "fiscal") {
    return "bento-grid";
  }
  if (themeVariant === "editorial-collage") {
    return "editorial-collage";
  }

  const signals = [
    categoryOrSignals,
    bill ? collectBillThemeSignals(bill) : "",
  ]
    .filter(Boolean)
    .join(" ");

  if (isFinanceCategory(signals)) {
    return "bento-grid";
  }

  // Education / health / social (and all other non-finance) → Editorial Collage.
  return "editorial-collage";
}

/**
 * Dynamic theme router for Article 1.
 * Prefers a live `bill` object's category / subject / type / tags, then
 * falls back to explicit props. Vote state stays outside this wrapper.
 */
export function ThemeWrapper({
  bill,
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
  metrics,
  className = "",
  children,
}: ThemeWrapperProps) {
  const mapped = bill ? mapLiveBillToArticleProps(bill) : null;

  const resolvedBillId = billId || mapped?.billId || "Bill";
  const resolvedTitle = title || mapped?.title || "Untitled legislation";
  const resolvedCategory =
    category ||
    mapped?.category ||
    (bill ? resolveBillCategoryLabel(bill) : "") ||
    "Legislation";
  const resolvedKeyImpacts = keyImpacts?.length
    ? keyImpacts
    : mapped?.keyImpacts || [];
  const resolvedMetrics = metrics?.length
    ? metrics
    : mapped?.metrics || [];
  const resolvedThemeVariant = themeVariant || mapped?.themeVariant;
  const resolvedHumanHook = humanHook || mapped?.humanHook;
  const resolvedPrompt = promptQuestion || mapped?.promptQuestion;
  const resolvedImageSrc = imageSrc || mapped?.imageSrc;
  const resolvedImageAlt = imageAlt || mapped?.imageAlt;
  const resolvedFinancialSummary =
    financialSummary || mapped?.financialSummary;

  const themeSignals = [
    resolvedCategory,
    mapped?.themeSignals || "",
    bill ? collectBillThemeSignals(bill) : "",
  ]
    .filter(Boolean)
    .join(" ");

  const resolvedTheme = resolveArticleTheme(
    themeSignals,
    resolvedThemeVariant,
    bill
  );

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
      data-theme-requested={resolvedThemeVariant ?? "auto"}
      data-bill-id={resolvedBillId}
      data-a1-shell="theme-wrapper"
    >
      {resolvedTheme === "bento-grid" ? (
        <BentoGridTheme
          billId={resolvedBillId}
          title={resolvedTitle}
          category={resolvedCategory}
          keyImpacts={resolvedKeyImpacts}
          financialSummary={resolvedFinancialSummary}
          metrics={resolvedMetrics}
        >
          {children}
        </BentoGridTheme>
      ) : (
        <EditorialCollageTheme
          billId={resolvedBillId}
          title={resolvedTitle}
          category={resolvedCategory}
          keyImpacts={resolvedKeyImpacts}
          humanHook={resolvedHumanHook}
          promptQuestion={resolvedPrompt}
          imageSrc={resolvedImageSrc}
          imageAlt={resolvedImageAlt}
        >
          {children}
        </EditorialCollageTheme>
      )}
    </div>
  );
}

export default ThemeWrapper;
