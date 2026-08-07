import React from "react";
import { BentoGridTheme } from "./themes/BentoGridTheme";
import { EditorialCollageTheme } from "./themes/EditorialCollageTheme";
import { InfluenceTheme } from "./themes/InfluenceTheme";
import { PipelineTheme } from "./themes/PipelineTheme";
import type { BillMetric, ThemeVariant } from "./types";
import {
  collectBillThemeSignals,
  collectProceduralSignals,
  isInfluenceBill,
  isProceduralBill,
  mapLiveBillToArticleProps,
  resolveBillCategoryLabel,
  type InfluenceStakeholderView,
  type LegislativeBill,
  type PipelineStepView,
} from "../lib/live-bill";

/** Visual themes ThemeWrapper can dynamically select between. */
export type ResolvedArticleTheme =
  | "editorial-collage"
  | "bento-grid"
  | "pipeline"
  | "influence";

const FINANCE_SIGNAL_PATTERN =
  /\b(finance|financial|budget|budgets|economy|economic|fiscal|trade|appropriations?|treasury|tax|taxes|revenue|deficit|debt|commerce|banking|securities)\b/i;

const HUMAN_CENTERED_SIGNAL_PATTERN =
  /\b(education|health|healthcare|housing|social|civil rights|labor|immigration|family|children|veterans|disability|welfare|nutrition|public health)\b/i;

const PROCEDURAL_SIGNAL_PATTERN =
  /\b(procedural|authorization|tracker|tracking|floor\s*debate|floor\s*action|chamber\s*vote|final\s*(action|passage)|cloture|pipeline|conference\s*report|veto\s*override|engrossed|enrolled|signed into law|markup hearing)\b/i;

const INFLUENCE_SIGNAL_PATTERN =
  /\b(regulatory|regulation|lobbying|lobbyist|stakeholder(\s+map)?|influence(\s+network)?|donor|pac)\b/i;

export type ThemeWrapperProps = {
  /** Live / structured bill object — preferred source for routing + copy. */
  bill?: LegislativeBill;
  billId?: string;
  title?: string;
  category?: string;
  keyImpacts?: string[];
  /**
   * Explicit theme override. When omitted, bill category / tags decide among
   * Influence, Pipeline, Bento, and Editorial.
   */
  themeVariant?: ThemeVariant;
  humanHook?: string;
  promptQuestion?: string;
  imageSrc?: string;
  imageAlt?: string;
  financialSummary?: string;
  whatItDoes?: string;
  pipelineSteps?: PipelineStepView[];
  stakeholders?: InfluenceStakeholderView[];
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
 * True when signals describe procedural legislative tracking.
 */
export function isProceduralCategory(signals = ""): boolean {
  return PROCEDURAL_SIGNAL_PATTERN.test(signals);
}

/**
 * True when signals describe regulatory / lobbying / stakeholder-map content.
 */
export function isInfluenceCategory(signals = ""): boolean {
  return INFLUENCE_SIGNAL_PATTERN.test(signals);
}

/**
 * Resolve which Article 1 visual theme to render from real bill properties.
 *
 * Routing (Task C):
 * - Finance / Budget / Appropriations → Bento
 * - Procedural / Authorization / Tracker → Pipeline
 * - Regulatory / Lobbying / Stakeholder Map → Influence
 * - Everything else → Editorial
 */
export function resolveArticleTheme(
  categoryOrSignals = "",
  themeVariant?: ThemeVariant,
  bill?: LegislativeBill
): ResolvedArticleTheme {
  if (themeVariant === "influence") return "influence";
  if (themeVariant === "pipeline" || themeVariant === "urgent") {
    return "pipeline";
  }
  if (themeVariant === "bento-grid" || themeVariant === "fiscal") {
    return "bento-grid";
  }
  if (themeVariant === "editorial-collage") {
    return "editorial-collage";
  }

  const signals = [
    categoryOrSignals,
    bill ? collectProceduralSignals(bill) : "",
    bill ? collectBillThemeSignals(bill) : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Regulatory / Lobbying / Stakeholder Map → Influence Network
  if ((bill && isInfluenceBill(bill)) || isInfluenceCategory(signals)) {
    return "influence";
  }

  // Procedural / Authorization / Tracker → Pipeline
  if ((bill && isProceduralBill(bill)) || isProceduralCategory(signals)) {
    return "pipeline";
  }

  // Finance / Budget / Appropriations → Bento
  if (isFinanceCategory(signals)) {
    return "bento-grid";
  }

  // Default fallback → Editorial Collage
  return "editorial-collage";
}

/**
 * Dynamic theme router for Article 1.
 * Prefers a live `bill` object's category / subject / type / stakeholders,
 * then falls back to explicit props. Vote state stays outside this wrapper.
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
  whatItDoes,
  pipelineSteps,
  stakeholders,
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
  const resolvedWhatItDoes = whatItDoes || mapped?.whatItDoes || resolvedTitle;
  const resolvedPipelineSteps =
    pipelineSteps && pipelineSteps.length > 0
      ? pipelineSteps
      : mapped?.pipelineSteps || [];
  const resolvedStakeholders =
    stakeholders && stakeholders.length > 0
      ? stakeholders
      : mapped?.stakeholders || [];

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
      {resolvedTheme === "influence" ? (
        <InfluenceTheme
          billId={resolvedBillId}
          title={resolvedTitle}
          category={resolvedCategory}
          keyImpacts={resolvedKeyImpacts}
          summary={resolvedWhatItDoes}
          stakeholders={resolvedStakeholders}
        >
          {children}
        </InfluenceTheme>
      ) : resolvedTheme === "pipeline" ? (
        <PipelineTheme
          billId={resolvedBillId}
          title={resolvedTitle}
          category={resolvedCategory}
          keyImpacts={resolvedKeyImpacts}
          whatItDoes={resolvedWhatItDoes}
          pipelineSteps={resolvedPipelineSteps}
        >
          {children}
        </PipelineTheme>
      ) : resolvedTheme === "bento-grid" ? (
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
