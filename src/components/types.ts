/**
 * Shared types for the Article 1 core shell.
 * Theme-agnostic: visual themes plug in via `themeVariant` without touching interaction state.
 */

export type ThemeVariant =
  | "default"
  | "civic"
  | "urgent"
  | "fiscal"
  | "compact"
  | "editorial-collage"
  | "bento-grid"
  | "pipeline";

export type ReactionId =
  | "pass"
  | "kill"
  | "insightful"
  | "costly"
  | "undecided";

export type ReactionOption = {
  id: ReactionId;
  label: string;
  emoji: string;
};

export type VoteCounts = Record<ReactionId, number>;

export type BillMetric = {
  id: string;
  label: string;
  value: string;
  /** Optional tone for high-contrast badge styling. */
  tone?: "neutral" | "positive" | "negative" | "warning" | "info";
};

export const DEFAULT_REACTIONS: readonly ReactionOption[] = [
  { id: "pass", label: "Pass It", emoji: "👍" },
  { id: "kill", label: "Kill It", emoji: "👎" },
  { id: "insightful", label: "Insightful", emoji: "💡" },
  { id: "costly", label: "Costly", emoji: "💸" },
  { id: "undecided", label: "Undecided", emoji: "🤔" },
] as const;

export const EMPTY_VOTE_COUNTS: VoteCounts = {
  pass: 0,
  kill: 0,
  insightful: 0,
  costly: 0,
  undecided: 0,
};
