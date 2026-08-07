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
import {
  collectBillThemeSignals,
  mapLiveBillToArticleProps,
  type LegislativeBill,
} from "../lib/live-bill";

export type ArticleCardProps = {
  /** Live / structured legislative bill — preferred over flat props. */
  bill?: LegislativeBill;
  billId?: string;
  title?: string;
  category?: string;
  keyImpacts?: string[];
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
  /** Show the anchored ReactionDock below the theme body (default true). */
  showReactionDock?: boolean;
};

function mergeCounts(seed?: Partial<VoteCounts>): VoteCounts {
  return { ...EMPTY_VOTE_COUNTS, ...seed };
}

/**
 * Master container for Article 1 bill content.
 * Owns universal interaction state (reaction + vote counts).
 * Theme selection is delegated to ThemeWrapper using live bill properties.
 */
export function ArticleCard({
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
  metrics = [],
  initialVoteCounts,
  onReactionSubmit,
  children,
  className = "",
  showReactionDock = true,
}: ArticleCardProps) {
  const mapped = bill ? mapLiveBillToArticleProps(bill) : null;
  const resolvedBillId = billId || mapped?.billId || "Bill";
  const resolvedTitle = title || mapped?.title || "Untitled legislation";
  const resolvedCategory = category || mapped?.category || "Legislation";
  const resolvedKeyImpacts = keyImpacts?.length
    ? keyImpacts
    : mapped?.keyImpacts || [];
  const resolvedMetrics = metrics.length
    ? metrics
    : mapped?.metrics || [];
  const resolvedThemeVariant = themeVariant || mapped?.themeVariant;
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

        onReactionSubmit?.({
          billId: resolvedBillId,
          reactionId,
          voteCounts: next,
        });
        return next;
      });
      setSelectedReaction(reactionId);
      setHasSubmitted(true);
    },
    [onReactionSubmit, resolvedBillId, selectedReaction]
  );

  const totalVotes = Object.values(voteCounts).reduce((sum, n) => sum + n, 0);

  const displayMetrics =
    resolvedMetrics.length > 0
      ? resolvedMetrics
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
          resolvedTheme === "editorial-collage"
            ? "text-xs font-medium text-[#8A6A45]"
            : "text-xs font-medium text-slate-500"
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
      className={["a1-article-card relative flex flex-col", className]
        .filter(Boolean)
        .join(" ")}
      data-bill-id={resolvedBillId}
      data-submitted={hasSubmitted ? "true" : "false"}
      data-a1-shell="article-card"
      data-theme={resolvedTheme}
    >
      <ThemeWrapper
        bill={bill}
        billId={resolvedBillId}
        title={resolvedTitle}
        category={resolvedCategory}
        keyImpacts={resolvedKeyImpacts}
        themeVariant={resolvedThemeVariant}
        humanHook={humanHook || mapped?.humanHook}
        promptQuestion={promptQuestion || mapped?.promptQuestion}
        imageSrc={imageSrc || mapped?.imageSrc}
        imageAlt={imageAlt || mapped?.imageAlt}
        financialSummary={financialSummary || mapped?.financialSummary}
        metrics={displayMetrics}
      >
        {children}
        {reactionEcho}
      </ThemeWrapper>

      {showReactionDock ? (
        <ReactionDock
          selectedReaction={selectedReaction}
          disabled={false}
          onReact={handleReact}
          theme={resolvedTheme}
        />
      ) : null}
    </article>
  );
}

export default ArticleCard;
