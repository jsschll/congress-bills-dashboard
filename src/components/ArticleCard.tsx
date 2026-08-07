import React, { useCallback, useEffect, useState } from "react";
import type { BillMetricsProps } from "./BillMetrics";
import { ReactionDock } from "./ReactionDock";
import {
  resolveArticleTheme,
  ThemeWrapper,
} from "./ThemeWrapper";
import {
  VoteFeedback,
  VoteStampOverlay,
  reactionIdToFeedbackStance,
  readLocalFeedVote,
  splitFromCounts,
  writeLocalFeedVote,
  type VoteFeedbackStance,
} from "./VoteFeedback";
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

/** Pass % → mercury color: Red (0°) → Yellow (60°) → Green (120°). */
function passPctToThermoColor(passPct: number): string {
  const t = Math.max(0, Math.min(100, Number(passPct) || 0)) / 100;
  return `hsl(${(t * 120).toFixed(1)} 90% 50%)`;
}

const THERMO_TICKS = [0, 25, 50, 75, 100] as const;

/**
 * Glass vertical thermometer on the card’s right inner edge.
 * Dark glass capsule keeps fluid + ticks readable on dark photo backgrounds.
 */
function GlassThermometer({
  passPct,
  killPct,
}: {
  passPct: number;
  killPct: number;
}) {
  const pct = Math.max(0, Math.min(100, Number(passPct) || 0));
  const color = passPctToThermoColor(pct);

  return (
    <div
      className={[
        "pointer-events-none absolute bottom-28 right-2 top-3 z-20",
        "flex w-6 flex-col items-center rounded-full px-1 py-1.5",
        "bg-black/70 border border-white/40 shadow-lg",
      ].join(" ")}
      role="img"
      aria-label={`${Math.round(pct)}% Pass, ${Math.round(killPct)}% Kill`}
      data-pass-pct={Math.round(pct)}
    >
      <div
        className="relative w-[11px] flex-1 overflow-visible rounded-full border border-white/30 bg-white/10"
        style={{
          boxShadow:
            "inset 0 1px 2px rgba(255,255,255,0.35), inset 0 -1px 3px rgba(0,0,0,0.22)",
          backdropFilter: "blur(6px)",
        }}
      >
        {/* Hash / tick marks along the glass tube */}
        <div
          className="absolute inset-y-1 -right-[3px] left-auto z-[2]"
          aria-hidden
        >
          {THERMO_TICKS.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 block h-[2px] bg-white/70"
              style={{
                bottom: `${tick}%`,
                width: tick % 50 === 0 ? 7 : 4,
              }}
            />
          ))}
        </div>

        {/* Mercury / fluid — keep bright dynamic fill */}
        <div
          className="absolute bottom-0 left-[2px] right-[2px] z-[1] rounded-full"
          style={{
            height: `${pct}%`,
            backgroundColor: color,
            boxShadow: `0 0 10px color-mix(in srgb, ${color} 55%, transparent), inset 0 1px 0 rgba(255,255,255,0.35)`,
            transition:
              "height 700ms cubic-bezier(0.22, 1, 0.36, 1), background-color 700ms ease-out, box-shadow 700ms ease-out",
          }}
        />
      </div>

      {/* Rounded bulb at the base — same dynamic color */}
      <div
        className="relative z-[3] -mt-[3px] h-[18px] w-[18px] shrink-0 rounded-full"
        style={{
          backgroundColor: color,
          border: "1px solid rgba(255,255,255,0.55)",
          boxShadow: `inset 0 2px 3px rgba(255,255,255,0.35), inset 0 -2px 4px rgba(0,0,0,0.2), 0 0 12px color-mix(in srgb, ${color} 45%, transparent)`,
          transition:
            "background-color 700ms ease-out, box-shadow 700ms ease-out",
        }}
        aria-hidden
      />
    </div>
  );
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
  const [motionStance, setMotionStance] = useState<VoteFeedbackStance | null>(
    null
  );
  const [stampStance, setStampStance] = useState<VoteFeedbackStance | null>(
    null
  );

  // Restore Pass/Kill from localStorage so remounted cards stay in voted state.
  useEffect(() => {
    const local = readLocalFeedVote(resolvedBillId);
    if (!local) return;
    setSelectedReaction(local.stance);
    setHasSubmitted(true);
    setVoteCounts((prev) => {
      if (prev.pass + prev.kill > 0) return prev;
      const pass = Math.max(1, Math.round((local.passPct / 100) * Math.max(local.total, 10)));
      const kill = Math.max(0, Math.max(local.total, 10) - pass);
      return { ...prev, pass, kill };
    });
  }, [resolvedBillId]);

  const handleReact = useCallback(
    (reactionId: ReactionId) => {
      const feedbackStance = reactionIdToFeedbackStance(reactionId);

      setVoteCounts((prev) => {
        const next = { ...prev };

        if (selectedReaction && selectedReaction !== reactionId) {
          next[selectedReaction] = Math.max(0, next[selectedReaction] - 1);
        }
        if (selectedReaction !== reactionId) {
          next[reactionId] = next[reactionId] + 1;
        }

        if (feedbackStance) {
          const split = splitFromCounts(next, feedbackStance);
          writeLocalFeedVote(resolvedBillId, {
            stance: feedbackStance,
            passPct: split.passPct,
            killPct: split.killPct,
            total: split.total,
          });
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

      if (feedbackStance) {
        setMotionStance(feedbackStance);
        setStampStance(feedbackStance);
        window.setTimeout(() => setMotionStance(null), 720);
        window.setTimeout(() => setStampStance(null), 900);
      }
    },
    [onReactionSubmit, resolvedBillId, selectedReaction]
  );

  const totalVotes = Object.values(voteCounts).reduce((sum, n) => sum + n, 0);
  const feedbackStance = reactionIdToFeedbackStance(selectedReaction);
  const showPostVote =
    hasSubmitted && (feedbackStance === "pass" || feedbackStance === "kill");
  const passSplit = splitFromCounts(
    voteCounts,
    feedbackStance === "pass" || feedbackStance === "kill"
      ? feedbackStance
      : null
  );

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

  const motionClass =
    motionStance === "pass"
      ? "vote-motion vote-motion--pass is-vote-burst"
      : motionStance === "kill"
        ? "vote-motion vote-motion--kill is-vote-burst"
        : "";

  return (
    <article
      className={[
        "a1-article-card relative flex flex-col",
        motionClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-bill-id={resolvedBillId}
      data-submitted={hasSubmitted ? "true" : "false"}
      data-a1-shell="article-card"
      data-theme={resolvedTheme}
    >
      {/* Hide layout debug theme-name badges; keep topic/category pills. */}
      <style>{`
        .a1-article-card .a1-theme-badge,
        .a1-article-card .a1-story-card__pill--theme {
          display: none !important;
        }
      `}</style>
      <GlassThermometer
        passPct={passSplit.passPct}
        killPct={passSplit.killPct}
      />
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
        actionBar={
          showReactionDock ? (
            showPostVote && feedbackStance ? (
              <VoteFeedback
                stance={feedbackStance}
                voteCounts={voteCounts}
                animate
                onChange={() => {
                  setHasSubmitted(false);
                  setSelectedReaction(null);
                }}
              />
            ) : (
              <ReactionDock
                selectedReaction={selectedReaction}
                disabled={false}
                onReact={handleReact}
                theme={resolvedTheme}
              />
            )
          ) : null
        }
      >
        {children}
        <VoteStampOverlay stance={stampStance} />
      </ThemeWrapper>
    </article>
  );
}

export default ArticleCard;
