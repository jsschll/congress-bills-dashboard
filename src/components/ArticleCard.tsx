import React, { useCallback, useState } from "react";
import type { BillMetricsProps } from "./BillMetrics";
import { ReactionDock } from "./ReactionDock";
import {
  resolveArticleTheme,
  ThemeWrapper,
} from "./ThemeWrapper";
import {
  DEFAULT_REACTIONS,
  EMPTY_VOTE_COUNTS,
  type ReactionId,
  type ThemeVariant,
  type VoteCounts,
} from "./types";

export type ArticleCardProps = {
  billId: string;
  title: string;
  category: string;
  keyImpacts: string[];
  themeVariant?: ThemeVariant;
  /** Human-centric magazine hook (Editorial Collage header). */
  humanHook?: string;
  /** Conversational prompt inside the sticker capsule. */
  promptQuestion?: string;
  /** Editorial photograph for collage themes. */
  imageSrc?: string;
  imageAlt?: string;
  /** High-level financial / structural summary (Bento Grid main cell). */
  financialSummary?: string;
  /** Optional metrics row (Net Cost, Vote Totals, Days Left, …). */
  metrics?: BillMetricsProps["metrics"];
  /** Seed vote totals from the server when available. */
  initialVoteCounts?: Partial<VoteCounts>;
  /** Called after a reaction is committed (for analytics / API sync). */
  onReactionSubmit?: (payload: {
    billId: string;
    reactionId: ReactionId;
    voteCounts: VoteCounts;
  }) => void;
  /** Optional bill body slot — keeps themes from owning content. */
  children?: React.ReactNode;
  className?: string;
  /** Show the floating ReactionDock (default true). */
  showReactionDock?: boolean;
};

function mergeCounts(seed?: Partial<VoteCounts>): VoteCounts {
  return { ...EMPTY_VOTE_COUNTS, ...seed };
}

/**
 * Master container for Article 1 bill content.
 * Owns universal interaction state (reaction + vote counts).
 * Theme selection is delegated to ThemeWrapper.
 */
export function ArticleCard({
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
  initialVoteCounts,
  onReactionSubmit,
  children,
  className = "",
  showReactionDock = true,
}: ArticleCardProps) {
  const [selectedReaction, setSelectedReaction] = useState<ReactionId | null>(
    null
  );
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [voteCounts, setVoteCounts] = useState<VoteCounts>(() =>
    mergeCounts(initialVoteCounts)
  );

  const handleReact = useCallback(
    (reactionId: ReactionId) => {
      setVoteCounts((prev) => {
        const next = { ...prev };

        if (selectedReaction && selectedReaction !== reactionId) {
          next[selectedReaction] = Math.max(0, next[selectedReaction] - 1);
        }
        if (selectedReaction !== reactionId) {
          next[reactionId] = next[reactionId] + 1;
        }

        onReactionSubmit?.({ billId, reactionId, voteCounts: next });
        return next;
      });
      setSelectedReaction(reactionId);
      setHasSubmitted(true);
    },
    [billId, onReactionSubmit, selectedReaction]
  );

  const totalVotes = Object.values(voteCounts).reduce((sum, n) => sum + n, 0);
  const resolvedTheme = resolveArticleTheme(category, themeVariant);

  const resolvedMetrics =
    metrics.length > 0
      ? metrics
      : [
          {
            id: "votes",
            label: "Vote Totals",
            value: String(totalVotes),
            tone: "info" as const,
          },
        ];

  const reactionLabel =
    hasSubmitted && selectedReaction
      ? DEFAULT_REACTIONS.find((r) => r.id === selectedReaction)?.label ??
        selectedReaction
      : null;

  const reactionEcho =
    reactionLabel !== null ? (
      <p
        className={
          resolvedTheme === "bento-grid"
            ? "text-xs font-medium text-slate-500"
            : "text-xs font-medium text-[#8A6A45]"
        }
        aria-live="polite"
      >
        You reacted: {reactionLabel}
        {" · "}
        {totalVotes} total reaction{totalVotes === 1 ? "" : "s"}
      </p>
    ) : null;

  return (
    <article
      className={["a1-article-card relative", className]
        .filter(Boolean)
        .join(" ")}
      data-bill-id={billId}
      data-submitted={hasSubmitted ? "true" : "false"}
      data-a1-shell="article-card"
      data-theme={resolvedTheme}
    >
      <ThemeWrapper
        billId={billId}
        title={title}
        category={category}
        keyImpacts={keyImpacts}
        themeVariant={themeVariant}
        humanHook={humanHook}
        promptQuestion={promptQuestion}
        imageSrc={imageSrc}
        imageAlt={imageAlt}
        financialSummary={financialSummary}
        metrics={resolvedMetrics}
      >
        {children}
        {reactionEcho}
      </ThemeWrapper>

      {showReactionDock ? (
        <ReactionDock
          selectedReaction={selectedReaction}
          disabled={false}
          onReact={handleReact}
        />
      ) : null}
    </article>
  );
}

export default ArticleCard;
