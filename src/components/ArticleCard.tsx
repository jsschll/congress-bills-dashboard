import React, { useCallback, useState } from "react";
import { BillMetrics, type BillMetricsProps } from "./BillMetrics";
import { ReactionDock } from "./ReactionDock";
import { ThemeWrapper } from "./ThemeWrapper";
import { EditorialCollageTheme } from "./themes/EditorialCollageTheme";
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
 * Visual themes attach via ThemeWrapper / themeVariant only.
 */
export function ArticleCard({
  billId,
  title,
  category,
  keyImpacts,
  themeVariant = "default",
  humanHook,
  promptQuestion,
  imageSrc,
  imageAlt,
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

  const reactionEcho =
    hasSubmitted && selectedReaction ? (
      <p className="text-xs font-medium text-[#8A6A45]" aria-live="polite">
        You reacted:{" "}
        {DEFAULT_REACTIONS.find((r) => r.id === selectedReaction)?.label ??
          selectedReaction}
        {" · "}
        {totalVotes} total reaction{totalVotes === 1 ? "" : "s"}
      </p>
    ) : null;

  const isEditorialCollage = themeVariant === "editorial-collage";

  return (
    <article
      className={["a1-article-card relative", className]
        .filter(Boolean)
        .join(" ")}
      data-bill-id={billId}
      data-submitted={hasSubmitted ? "true" : "false"}
      data-a1-shell="article-card"
      data-theme={themeVariant}
    >
      {isEditorialCollage ? (
        <ThemeWrapper themeVariant="editorial-collage">
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
            {reactionEcho}
          </EditorialCollageTheme>
        </ThemeWrapper>
      ) : (
        <ThemeWrapper themeVariant={themeVariant}>
          <header className="a1-article-header flex flex-col gap-2">
            <span className="inline-flex w-fit items-center rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/80">
              {category}
            </span>
            <h2 className="text-xl font-bold leading-snug tracking-tight text-white sm:text-2xl">
              {title}
            </h2>
          </header>

          {keyImpacts.length > 0 ? (
            <section className="a1-key-impacts" aria-label="Key impacts">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">
                Key Impacts
              </h3>
              <ul className="flex flex-col gap-1.5">
                {keyImpacts.map((impact, index) => (
                  <li
                    key={`${billId}-impact-${index}`}
                    className="text-sm leading-relaxed text-white/85"
                  >
                    {impact}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <BillMetrics metrics={resolvedMetrics} />

          {children}

          {hasSubmitted && selectedReaction ? (
            <p
              className="text-xs font-medium text-white/60"
              aria-live="polite"
            >
              You reacted:{" "}
              {DEFAULT_REACTIONS.find((r) => r.id === selectedReaction)
                ?.label ?? selectedReaction}
              {" · "}
              {totalVotes} total reaction{totalVotes === 1 ? "" : "s"}
            </p>
          ) : null}
        </ThemeWrapper>
      )}

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
