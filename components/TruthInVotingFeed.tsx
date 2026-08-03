import React, { useId, useMemo, useState } from "react";
import type { ScorecardRecentVote } from "../lib/services/scorecardService";
import type { VotePosition } from "../types/scorecard";

export type TruthInVotingFeedProps = {
  votes: ScorecardRecentVote[] | null | undefined;
  /** Optional topic list; defaults are derived from vote categories + common topics. */
  topics?: string[];
  className?: string;
};

const DEFAULT_TOPICS = [
  "Economy",
  "Healthcare",
  "Environment",
  "Immigration",
  "Defense",
  "Civil Rights",
  "Education",
] as const;

const EMPTY_VOTES_MESSAGE =
  "No recent roll-call votes recorded for this representative.";

const VOTE_STYLES: Record<
  VotePosition | "OTHER",
  { label: string; className: string }
> = {
  YES: {
    label: "YES",
    className:
      "bg-emerald-500/15 text-emerald-700 ring-emerald-600/30 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-300/30",
  },
  NO: {
    label: "NO",
    className:
      "bg-rose-500/15 text-rose-700 ring-rose-600/30 dark:bg-rose-400/15 dark:text-rose-200 dark:ring-rose-300/30",
  },
  ABSTAIN: {
    label: "ABSTAIN",
    className:
      "bg-slate-500/15 text-slate-700 ring-slate-500/25 dark:bg-slate-400/15 dark:text-slate-200 dark:ring-slate-300/25",
  },
  NOT_VOTING: {
    label: "NOT VOTING",
    className:
      "bg-slate-500/15 text-slate-700 ring-slate-500/25 dark:bg-slate-400/15 dark:text-slate-200 dark:ring-slate-300/25",
  },
  OTHER: {
    label: "—",
    className:
      "bg-slate-500/15 text-slate-600 ring-slate-500/20 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-300/20",
  },
};

function normalizePosition(value?: string | null): VotePosition | "OTHER" {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (raw === "YES" || raw === "YEA" || raw === "AYE") return "YES";
  if (raw === "NO" || raw === "NAY") return "NO";
  if (raw === "ABSTAIN" || raw === "PRESENT") return "ABSTAIN";
  if (raw === "NOT_VOTING" || raw === "NV") return "NOT_VOTING";
  return "OTHER";
}

function sentenceClamp(text: string, maxSentences = 2): string {
  const cleaned = String(text || "").trim();
  if (!cleaned) return "";
  const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, maxSentences)
    .join(" ");
}

function formatVoteDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(String(value).includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Normalize bill numbers toward "H.R. 3590" / "S. 100" style. */
function normalizeBillNumber(value?: string | null): string | null {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(
    /^(h\.?\s*r\.?|s\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*con\.?\s*res\.?)\s*(\d+)/i
  );
  if (!match) return raw;
  const kind = match[1].toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  const number = match[2];
  if (kind === "hr") return `H.R. ${number}`;
  if (kind === "s") return `S. ${number}`;
  if (kind === "sjres") return `S.J.Res. ${number}`;
  if (kind === "hjres") return `H.J.Res. ${number}`;
  if (kind === "sconres") return `S.Con.Res. ${number}`;
  if (kind === "hconres") return `H.Con.Res. ${number}`;
  return raw;
}

/**
 * Prefer "H.R. 3590: Patient Protection and Affordable Care Act" style titles.
 * Never surfaces Seed:/Placeholder: mock prefixes.
 */
function formatVoteTitle(vote: ScorecardRecentVote): string {
  const number = normalizeBillNumber(vote.billNumber);
  let title = String(vote.title || "")
    .replace(/^(seed|placeholder)\s*:\s*/i, "")
    .trim();
  if (!title) {
    return number || "Congressional roll call";
  }
  if (number) {
    const bare = number.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
    const titleBare = title.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
    if (titleBare.startsWith(bare)) {
      const rest = title.replace(/^[^:]+:\s*/, "").trim();
      if (rest && rest.toLowerCase() !== title.toLowerCase()) {
        return `${number}: ${rest}`;
      }
      if (/^[^:]+:\s*/.test(title)) return title.replace(/^[^:]+/, number);
      return `${number}: ${title}`;
    }
    return `${number}: ${title}`;
  }
  return title;
}

function topicKey(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function voteMatchesTopic(vote: ScorecardRecentVote, topic: string): boolean {
  if (!topic || topic === "all") return true;
  const needle = topicKey(topic);
  const category = topicKey(vote.category || "");
  if (category && (category === needle || category.includes(needle))) return true;

  const haystack = [
    vote.title,
    vote.plainEnglishSummary,
    vote.impacts?.wallet,
    vote.impacts?.community,
    vote.impacts?.rights,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const aliases: Record<string, string[]> = {
    economy: ["econom", "tax", "budget", "wage", "job", "trade", "inflation"],
    healthcare: ["health", "medicaid", "medicare", "hospital", "drug", "insurance"],
    environment: ["climate", "environ", "epa", "energy", "pollut", "conserv"],
    immigration: ["immigra", "border", "asylum", "visa"],
    defense: ["defense", "military", "pentagon", "veteran", "armed"],
    "civil rights": ["rights", "voting", "discrim", "privacy", "amendment"],
    education: ["school", "educat", "student", "university", "tuition"],
  };

  const words = aliases[needle] || [needle];
  return words.some((word) => haystack.includes(word) || category.includes(word));
}

type ImpactKind = "wallet" | "community" | "rights";

const IMPACT_META: Record<
  ImpactKind,
  { label: string; icon: string; className: string }
> = {
  wallet: {
    label: "Wallet Impact",
    icon: "💳",
    className:
      "bg-amber-500/15 text-amber-800 ring-amber-500/25 dark:bg-amber-400/15 dark:text-amber-100 dark:ring-amber-300/25",
  },
  community: {
    label: "Community Impact",
    icon: "🏙️",
    className:
      "bg-sky-500/15 text-sky-800 ring-sky-500/25 dark:bg-sky-400/15 dark:text-sky-100 dark:ring-sky-300/25",
  },
  rights: {
    label: "Rights Impact",
    icon: "⚖️",
    className:
      "bg-violet-500/15 text-violet-800 ring-violet-500/25 dark:bg-violet-400/15 dark:text-violet-100 dark:ring-violet-300/25",
  },
};

function isPlaceholderVote(vote: ScorecardRecentVote): boolean {
  const title = String(vote.title || "");
  const number = String(vote.billNumber || "");
  const summary = String(vote.plainEnglishSummary || "");
  if (/^seed\s*:/i.test(title) || /^placeholder\s*:/i.test(title)) return true;
  if (/-seed-/i.test(number) || /-ph-/i.test(number)) return true;
  if (/seeded placeholder|placeholder vote data/i.test(summary)) return true;
  return false;
}

function buildPlainEnglishSummary(vote: ScorecardRecentVote): string {
  const fromSummary = sentenceClamp(vote.plainEnglishSummary || "", 2);
  if (fromSummary) return fromSummary;

  const impacts = [
    vote.impacts?.wallet,
    vote.impacts?.community,
    vote.impacts?.rights,
  ]
    .map((text) => String(text || "").trim())
    .filter(Boolean);
  if (impacts.length) {
    return sentenceClamp(impacts.slice(0, 2).join(" "), 2);
  }
  return "";
}

function VoteCard({ vote }: { vote: ScorecardRecentVote }) {
  const [expanded, setExpanded] = useState(false);
  const summaryId = useId();
  const position = normalizePosition(vote.votePosition);
  const style = VOTE_STYLES[position] || VOTE_STYLES.OTHER;
  const summary = buildPlainEnglishSummary(vote);
  const dateLabel = formatVoteDate(vote.voteDate);
  const displayTitle = formatVoteTitle(vote);
  const billNumber = normalizeBillNumber(vote.billNumber);
  const impacts = (
    [
      ["wallet", vote.impacts?.wallet],
      ["community", vote.impacts?.community],
      ["rights", vote.impacts?.rights],
    ] as Array<[ImpactKind, string | null | undefined]>
  ).filter(([, text]) => Boolean(String(text || "").trim()));

  return (
    <li className="relative rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 pr-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            {billNumber ? (
              <span className="rounded-md bg-slate-900/90 px-2 py-0.5 text-[0.7rem] font-bold tracking-wide text-white dark:bg-slate-100 dark:text-slate-900">
                {billNumber}
              </span>
            ) : null}
            {vote.category ? (
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {vote.category}
              </span>
            ) : null}
            {dateLabel ? (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {dateLabel}
              </span>
            ) : null}
          </div>
          <h4 className="text-base font-bold leading-snug text-slate-900 dark:text-white">
            {displayTitle}
          </h4>
        </div>

        <span
          className={`ml-auto inline-flex shrink-0 items-center self-start rounded-full px-2.5 py-1 text-xs font-bold tracking-wide ring-1 ring-inset ${style.className}`}
          aria-label={`Voted ${style.label}`}
        >
          {style.label}
        </span>
      </div>

      {impacts.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {impacts.map(([kind, text]) => (
            <span
              key={kind}
              title={String(text)}
              className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${IMPACT_META[kind].className}`}
            >
              <span className="shrink-0" aria-hidden="true">
                {IMPACT_META[kind].icon}
              </span>
              <span className="shrink-0">{IMPACT_META[kind].label}</span>
            </span>
          ))}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-3">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-semibold text-slate-600 transition hover:text-emerald-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 dark:text-slate-300 dark:hover:text-emerald-300"
            aria-expanded={expanded}
            aria-controls={summaryId}
            onClick={() => setExpanded((value) => !value)}
          >
            <span aria-hidden="true" className="text-[0.65rem]">
              {expanded ? "▾" : "▸"}
            </span>
            {expanded ? "Hide plain-English summary" : "What this means"}
          </button>
          {expanded ? (
            <p
              id={summaryId}
              className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
            >
              {summary}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Recent roll-call feed with vote position, plain-English summary, and impact tags.
 */
export function TruthInVotingFeed({
  votes,
  topics,
  className = "",
}: TruthInVotingFeedProps) {
  const filterId = useId();
  const [topic, setTopic] = useState("all");

  const topicOptions = useMemo(() => {
    const fromVotes = (votes || [])
      .filter((vote) => !isPlaceholderVote(vote))
      .map((vote) => String(vote.category || "").trim())
      .filter(Boolean);
    const merged = [
      ...DEFAULT_TOPICS,
      ...(topics || []),
      ...fromVotes,
    ];
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const item of merged) {
      const key = topicKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return unique;
  }, [votes, topics]);

  const cleanedVotes = useMemo(
    () => (Array.isArray(votes) ? votes.filter((vote) => !isPlaceholderVote(vote)) : []),
    [votes]
  );

  const filtered = useMemo(() => {
    return cleanedVotes.filter((vote) => voteMatchesTopic(vote, topic));
  }, [cleanedVotes, topic]);

  return (
    <section
      className={`truth-in-voting-feed rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 sm:p-5 ${className}`.trim()}
      aria-label="Truth in Voting feed"
    >
      <header className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Truth in Voting
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Recent roll calls, in plain English
          </h3>
        </div>

        <div className="w-full sm:w-auto">
          <label
            htmlFor={filterId}
            className="mb-1 block text-[0.7rem] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            Filter by topic
          </label>
          <select
            id={filterId}
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 sm:min-w-[12rem]"
          >
            <option value="all">All topics</option>
            {topicOptions.map((option) => (
              <option key={topicKey(option)} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      </header>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 px-3 py-6 text-center dark:border-slate-600">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {cleanedVotes.length
              ? "No roll calls match that topic yet."
              : EMPTY_VOTES_MESSAGE}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((vote) => (
            <VoteCard
              key={`${vote.billId}-${vote.votePosition}-${vote.voteDate || ""}`}
              vote={vote}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default TruthInVotingFeed;
