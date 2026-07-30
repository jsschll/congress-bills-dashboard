import React from "react";
import { DEFAULT_NAY_LABEL, DEFAULT_YEA_LABEL } from "../types/bill-summary";

export type VoteCardProps = {
  /** Official bill / vote title. */
  title: string;
  /** Official CRS or chamber summary text (raw). */
  summary?: string | null;
  billNumber?: string;
  memberVote?: string | null;
  result?: string | null;
  dateLabel?: string | null;
  /** Only rendered when both are present and non-generic. */
  yeaMeans?: string | null;
  nayMeans?: string | null;
  /** Explicit short action labels; otherwise Support / Oppose Measure. */
  yeaLabel?: string | null;
  nayLabel?: string | null;
  onVote?: (stance: "yea" | "nay") => void | Promise<void>;
  userStance?: "yea" | "nay" | null;
  className?: string;
};

function isGenericMeans(text = ""): boolean {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return true;
  return (
    /described in this measure/.test(value) ||
    /^a yea vote supports advancing this (measure|bill)/.test(value) ||
    /^a nay vote supports rejecting this (measure|bill)/.test(value) ||
    /^a yea vote supports passing this bill/.test(value) ||
    /^a nay vote supports rejecting this bill/.test(value) ||
    /^a yea vote supports this amendment/.test(value) ||
    /^a nay vote supports rejecting this amendment/.test(value) ||
    /^voting yes means you want this to move forward/.test(value) ||
    /^voting no means you want to stop this/.test(value) ||
    /^you support advancing this measure/.test(value) ||
    /^you support rejecting this measure/.test(value) ||
    /^you support ending this program described in this measure/.test(value) ||
    /^you support keeping this program in place/.test(value) ||
    /^you support ending .+ described in this measure/.test(value) ||
    /^support this (roll-call|roll call|measure|bill)/.test(value) ||
    /^oppose this (roll-call|roll call|measure|bill)/.test(value)
  );
}

function isShortLabel(text = ""): boolean {
  const value = String(text || "").trim();
  if (!value) return false;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 4 && value.length <= 28;
}

function voteTone(vote?: string | null) {
  const value = String(vote || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "yea";
  if (value === "nay" || value === "no") return "nay";
  if (value.includes("present")) return "present";
  return "other";
}

/**
 * Runtime VoteCard — no AI generation.
 * Uses the official title/summary and only shows Yea/Nay means when
 * concrete, non-generic copy is supplied on the data object.
 */
export function VoteCard({
  title,
  summary,
  billNumber,
  memberVote,
  result,
  dateLabel,
  yeaMeans,
  nayMeans,
  yeaLabel: yeaLabelProp,
  nayLabel: nayLabelProp,
  onVote,
  userStance = null,
  className = "",
}: VoteCardProps) {
  const [pending, setPending] = React.useState<"yea" | "nay" | null>(null);

  const officialSummary = String(summary || "").trim() || String(title || "").trim();
  const yeaMeansClean = String(yeaMeans || "").trim();
  const nayMeansClean = String(nayMeans || "").trim();
  const showMeans =
    Boolean(yeaMeansClean) &&
    Boolean(nayMeansClean) &&
    !isGenericMeans(yeaMeansClean) &&
    !isGenericMeans(nayMeansClean);

  const yeaLabel = isShortLabel(yeaLabelProp || "")
    ? String(yeaLabelProp).trim()
    : DEFAULT_YEA_LABEL;
  const nayLabel = isShortLabel(nayLabelProp || "")
    ? String(nayLabelProp).trim()
    : DEFAULT_NAY_LABEL;

  async function handleVote(stance: "yea" | "nay") {
    if (!onVote) return;
    setPending(stance);
    try {
      await onVote(stance);
    } finally {
      setPending(null);
    }
  }

  const meta = [result, dateLabel].filter(Boolean).join(" · ");
  const memberTone = voteTone(memberVote);

  return (
    <article className={`vote-card bill-summary-card ${className}`.trim()}>
      <header className="bill-summary-card__header">
        {memberVote ? (
          <span
            className={`bill-summary-card__cast is-${memberTone}`}
            title="Recorded member vote"
          >
            {memberVote}
          </span>
        ) : null}
        <div>
          <div className="bill-summary-card__badges">
            {billNumber ? (
              <span className="bill-summary-card__bill">{billNumber}</span>
            ) : null}
          </div>
          <h3 className="bill-summary-card__title">{title}</h3>
          {meta ? <p className="bill-summary-card__meta">{meta}</p> : null}
        </div>
      </header>

      <section className="bill-summary-card__summary" aria-label="Official summary">
        <h4>What’s proposed</h4>
        <p className="vote-card__summary-text line-clamp-3">{officialSummary}</p>
      </section>

      {showMeans ? (
        <div
          className="bill-summary-card__meanings"
          aria-label="What Yea and Nay mean"
        >
          <div className="bill-summary-card__meaning is-yea">
            <strong>Yea means</strong>
            <p>{yeaMeansClean}</p>
          </div>
          <div className="bill-summary-card__meaning is-nay">
            <strong>Nay means</strong>
            <p>{nayMeansClean}</p>
          </div>
        </div>
      ) : null}

      <div
        className="bill-summary-card__actions"
        role="group"
        aria-label="How would you vote?"
      >
        <p className="bill-summary-card__prompt">How would you vote?</p>
        <button
          type="button"
          className={`bill-summary-card__btn is-yea ${
            userStance === "yea" ? "is-active" : ""
          }`}
          disabled={!onVote || pending !== null}
          onClick={() => handleVote("yea")}
        >
          {pending === "yea" ? "Saving…" : yeaLabel}
        </button>
        <button
          type="button"
          className={`bill-summary-card__btn is-nay ${
            userStance === "nay" ? "is-active" : ""
          }`}
          disabled={!onVote || pending !== null}
          onClick={() => handleVote("nay")}
        >
          {pending === "nay" ? "Saving…" : nayLabel}
        </button>
      </div>
    </article>
  );
}

export default VoteCard;
