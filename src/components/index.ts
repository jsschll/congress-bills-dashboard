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
  isProceduralCategory,
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
  isProceduralBill,
  mapLiveBillToArticleProps,
  resolveBillCategoryLabel,
  resolveBillId,
  resolveBillTitle,
  resolvePipelineStepsFromBill,
  resolveStakeholdersFromBill,
} from "../lib/live-bill";
export type {
  ArticleBillViewModel,
  BillsFeedResponse,
  InfluenceStakeholderView,
  LegislativeBill,
  PipelineStepView,
} from "../lib/live-bill";

export {
  EditorialCollageTheme,
} from "./themes/EditorialCollageTheme";
export type { EditorialCollageThemeProps } from "./themes/EditorialCollageTheme";

export { BentoGridTheme } from "./themes/BentoGridTheme";
export type { BentoGridThemeProps } from "./themes/BentoGridTheme";

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

