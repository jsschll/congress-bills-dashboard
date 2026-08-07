export { ArticleCard } from "./ArticleCard";
export type { ArticleCardProps } from "./ArticleCard";

export { ReactionDock } from "./ReactionDock";
export type { ReactionDockProps } from "./ReactionDock";

export { BillMetrics } from "./BillMetrics";
export type { BillMetricsProps } from "./BillMetrics";

export {
  ThemeWrapper,
  isFinanceCategory,
  isHumanCenteredCategory,
  isInfluenceCategory,
  isLocalCategory,
  isProceduralCategory,
  isVersusCategory,
  resolveArticleTheme,
} from "./ThemeWrapper";
export type {
  ResolvedArticleTheme,
  ThemeWrapperProps,
} from "./ThemeWrapper";

export {
  collectBillThemeSignals,
  collectProceduralSignals,
  extractLiveBillsFromFeed,
  isInfluenceBill,
  isLiveLegislativeBill,
  isLocalBill,
  isProceduralBill,
  isVersusBill,
  mapLiveBillToArticleProps,
  resolveBillCategoryLabel,
  resolveBillId,
  resolveBillTitle,
  resolveLocalImpactFromBill,
  resolvePipelineStepsFromBill,
  resolveStakeholdersFromBill,
  resolveVersusClausesFromBill,
} from "../lib/live-bill";
export type {
  ArticleBillViewModel,
  BillsFeedResponse,
  InfluenceStakeholderView,
  LegislativeBill,
  LocalDistrictView,
  PipelineStepView,
  VersusClauseView,
} from "../lib/live-bill";

export {
  EditorialCollageTheme,
} from "./themes/EditorialCollageTheme";
export type { EditorialCollageThemeProps } from "./themes/EditorialCollageTheme";
/** Alias matching the Article 1 design-system name for Theme #1. */
export { EditorialCollageTheme as EditorialTheme } from "./themes/EditorialCollageTheme";

export { BentoGridTheme } from "./themes/BentoGridTheme";
export type { BentoGridThemeProps } from "./themes/BentoGridTheme";
/** Alias matching the Article 1 design-system name for Theme #2. */
export { BentoGridTheme as BentoTheme } from "./themes/BentoGridTheme";

export { PipelineTheme } from "./themes/PipelineTheme";
export type {
  PipelineStep,
  PipelineStepStatus,
  PipelineThemeProps,
} from "./themes/PipelineTheme";

export { InfluenceTheme } from "./themes/InfluenceTheme";
export type {
  InfluenceStakeholder,
  InfluenceThemeProps,
  StakeholderStance,
} from "./themes/InfluenceTheme";
export {
  INFLUENCE_OPPOSE,
  INFLUENCE_SUPPORT,
} from "./themes/InfluenceTheme";

export { LocalTheme } from "./themes/LocalTheme";
export type {
  LocalDistrictRow,
  LocalThemeProps,
} from "./themes/LocalTheme";

export { VersusTheme } from "./themes/VersusTheme";
export type {
  VersusClause,
  VersusClauseTone,
  VersusThemeProps,
} from "./themes/VersusTheme";
export { VERSUS_AGREE, VERSUS_OPPOSE } from "./themes/VersusTheme";

export {
  DEFAULT_REACTIONS,
  EMPTY_VOTE_COUNTS,
} from "./types";
export type {
  BillMetric,
  ReactionId,
  ReactionOption,
  ThemeVariant,
  VoteCounts,
} from "./types";

export {
  ARTICLE1_PRODUCTION_BUILD_ID,
  ARTICLE1_THEME_EXPORTS,
  ARTICLE1_THEME_ROUTES,
} from "./article1-production";
