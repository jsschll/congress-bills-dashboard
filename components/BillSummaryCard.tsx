import React, { useEffect, useState } from "react";
import {
  DEFAULT_NAY_LABEL,
  DEFAULT_YEA_LABEL,
  formatBillSummary,
  type BillSummaryCard,
} from "../types/bill-summary";

export type BillSummaryCardProps = {
  rawSummary: string;
  billTitle: string;
  billNumber?: string;
  memberVote?: string | null;
  result?: string | null;
  dateLabel?: string | null;
  /** Structured backend fields — preferred over generated fallbacks. */
  yeaMeans?: string | null;
  nayMeans?: string | null;
  yeaLabel?: string | null;
  nayLabel?: string | null;
  /** When provided, Yea/Nay become interactive. */
  onVote?: (stance: "yea" | "nay") => void | Promise<void>;
  userStance?: "yea" | "nay" | null;
  className?: string;
};

const FALLBACK_CARD: BillSummaryCard = {
  summary: "This is a recent congressional roll-call vote on the linked measure.",
  yea_means:
    "A Yea vote supports advancing this measure as written on this roll call.",
  nay_means: "A Nay vote supports rejecting this measure on this roll call.",
  yea_label: DEFAULT_YEA_LABEL,
  nay_label: DEFAULT_NAY_LABEL,
  source: "heuristic",
};

function isGenericMeans(text = ""): boolean {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return true;
  return (
    /^a yea vote supports advancing this measure/.test(value) ||
    /^a nay vote supports rejecting this measure/.test(value) ||
    /^you support advancing this measure/.test(value) ||
    /^you support rejecting this measure/.test(value) ||
    /^support this (roll-call|roll call|measure|bill)/.test(value) ||
    /^oppose this (roll-call|roll call|measure|bill)/.test(value)
  );
}

function isBannedMeansTemplate(text = ""): boolean {
  const value = String(text || "").trim().toLowerCase();
  if (!value) return false;
  return (
    /you support ending this program described in this measure/.test(value) ||
    /you support keeping this program in place/.test(value) ||
    /you support ending .+ described in this measure/.test(value)
  );
}

function voteTone(vote?: string | null) {
  const value = String(vote || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "yea";
  if (value === "nay" || value === "no") return "nay";
  if (value.includes("present")) return "present";
  return "other";
}

/**
 * Apply VoteCard prop rules:
 * - generic/missing means → Support Measure / Oppose Measure labels
 * - never invent banned “ending this program” templates; only keep if
 *   explicitly passed as structured props
 */
function resolveCardProps(
  base: BillSummaryCard,
  props: Pick<
    BillSummaryCardProps,
    "yeaMeans" | "nayMeans" | "yeaLabel" | "nayLabel"
  >
): BillSummaryCard {
  const structuredYea = props.yeaMeans != null;
  const structuredNay = props.nayMeans != null;

  let yea_means = String(
    structuredYea ? props.yeaMeans : base.yea_means || ""
  ).trim();
  let nay_means = String(
    structuredNay ? props.nayMeans : base.nay_means || ""
  ).trim();

  if (isBannedMeansTemplate(yea_means) && !structuredYea) yea_means = "";
  if (isBannedMeansTemplate(nay_means) && !structuredNay) nay_means = "";

  const meansAreGeneric =
    isGenericMeans(yea_means) ||
    isGenericMeans(nay_means) ||
    isBannedMeansTemplate(yea_means) ||
    isBannedMeansTemplate(nay_means);

  let yea_label = String(
    props.yeaLabel != null ? props.yeaLabel : base.yea_label || ""
  ).trim();
  let nay_label = String(
    props.nayLabel != null ? props.nayLabel : base.nay_label || ""
  ).trim();

  if (meansAreGeneric) {
    yea_label = DEFAULT_YEA_LABEL;
    nay_label = DEFAULT_NAY_LABEL;
  }

  return {
    ...base,
    summary: base.summary || FALLBACK_CARD.summary,
    yea_means: yea_means || FALLBACK_CARD.yea_means,
    nay_means: nay_means || FALLBACK_CARD.nay_means,
    yea_label: yea_label || DEFAULT_YEA_LABEL,
    nay_label: nay_label || DEFAULT_NAY_LABEL,
  };
}

/**
 * Sample React VoteCard for the plain-English summary schema.
 */
export function BillSummaryCardView({
  rawSummary,
  billTitle,
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
}: BillSummaryCardProps) {
  const structured = {
    yeaMeans,
    nayMeans,
    yeaLabel: yeaLabelProp,
    nayLabel: nayLabelProp,
  };
  const [card, setCard] = useState<BillSummaryCard>(
    resolveCardProps(FALLBACK_CARD, structured)
  );
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<"yea" | "nay" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");

    formatBillSummary(rawSummary, billTitle)
      .then((next) => {
        if (!cancelled) setCard(resolveCardProps(next, structured));
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message || "Could not load summary.");
          setCard(resolveCardProps(FALLBACK_CARD, structured));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // structured fields are primitive props listed below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawSummary, billTitle, yeaMeans, nayMeans, yeaLabelProp, nayLabelProp]);

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
  const yeaLabel = card.yea_label || DEFAULT_YEA_LABEL;
  const nayLabel = card.nay_label || DEFAULT_NAY_LABEL;

  return (
    <article className={`bill-summary-card ${className}`.trim()}>
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
          <h3 className="bill-summary-card__title">{billTitle}</h3>
          {meta ? <p className="bill-summary-card__meta">{meta}</p> : null}
        </div>
      </header>

      {loading ? (
        <p className="bill-summary-card__status">Writing plain-English card…</p>
      ) : null}
      {error ? <p className="bill-summary-card__error">{error}</p> : null}

      <section className="bill-summary-card__summary" aria-label="Summary">
        <h4>What’s proposed</h4>
        <p>{card.summary || FALLBACK_CARD.summary}</p>
      </section>

      <div
        className="bill-summary-card__meanings"
        aria-label="What Yea and Nay mean"
      >
        <div className="bill-summary-card__meaning is-yea">
          <strong>Yea means</strong>
          <p>{card.yea_means || FALLBACK_CARD.yea_means}</p>
        </div>
        <div className="bill-summary-card__meaning is-nay">
          <strong>Nay means</strong>
          <p>{card.nay_means || FALLBACK_CARD.nay_means}</p>
        </div>
      </div>

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

export default BillSummaryCardView;
