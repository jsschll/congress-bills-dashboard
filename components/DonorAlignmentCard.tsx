import React, { useMemo } from "react";
import type { DonorIndustry } from "../types/scorecard";
import type { ScorecardCampaignFinance } from "../lib/services/scorecardService";

export type MoneyVsVoteHighlight = {
  industry: string;
  amount?: number | null;
  voteLabel?: string | null;
  votePosition?: string | null;
  summary?: string | null;
};

export type DonorAlignmentCardProps = {
  finance: ScorecardCampaignFinance | null | undefined;
  /** Optional “Money vs. Vote” callout. Auto-derived from top industry when omitted. */
  moneyVsVote?: MoneyVsVoteHighlight | null;
  className?: string;
};

type FundingSlice = {
  key: string;
  label: string;
  shortLabel: string;
  pct: number;
  colorClass: string;
  barClass: string;
};

function toPct(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

export function formatUsd(amount: number | null | undefined): string {
  if (amount == null || Number.isNaN(Number(amount))) return "—";
  const n = Number(amount);
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: n >= 1000 ? 0 : 2,
    }).format(n);
  } catch {
    return `$${Math.round(n).toLocaleString("en-US")}`;
  }
}

function normalizeSlices(finance: ScorecardCampaignFinance | null | undefined): FundingSlice[] {
  const small = toPct(finance?.smallDonorPct);
  const large = toPct(finance?.largeDonorPct);
  const pac = toPct(finance?.pacPct);
  const self = toPct(finance?.selfFundingPct);
  const raw = [
    {
      key: "small",
      label: "Small Donors (<$200)",
      shortLabel: "Small",
      pct: small,
      colorClass: "text-emerald-700 dark:text-emerald-300",
      barClass: "bg-emerald-500",
    },
    {
      key: "large",
      label: "Large Donors",
      shortLabel: "Large",
      pct: large,
      colorClass: "text-sky-700 dark:text-sky-300",
      barClass: "bg-sky-500",
    },
    {
      key: "pac",
      label: "PACs",
      shortLabel: "PACs",
      pct: pac,
      colorClass: "text-amber-700 dark:text-amber-300",
      barClass: "bg-amber-500",
    },
    {
      key: "self",
      label: "Self-Funding",
      shortLabel: "Self",
      pct: self,
      colorClass: "text-violet-700 dark:text-violet-300",
      barClass: "bg-violet-500",
    },
  ];

  const sum = raw.reduce((acc, slice) => acc + slice.pct, 0);
  if (sum <= 0) return raw.map((slice) => ({ ...slice, pct: 0 }));
  // Keep relative proportions if source data doesn't sum to 100.
  if (Math.abs(sum - 100) > 0.6) {
    return raw.map((slice) => ({
      ...slice,
      pct: Math.round((slice.pct / sum) * 1000) / 10,
    }));
  }
  return raw;
}

function topIndustries(list: DonorIndustry[] | undefined): DonorIndustry[] {
  return [...(list || [])]
    .map((item) => ({
      name: String(item?.name || "").trim() || "Unknown",
      amount: Number(item?.amount) || 0,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

function defaultMoneyVsVote(
  industries: DonorIndustry[],
  finance: ScorecardCampaignFinance | null | undefined
): MoneyVsVoteHighlight | null {
  const top = industries[0];
  if (!top) return null;
  const pac = toPct(finance?.pacPct);
  const small = toPct(finance?.smallDonorPct);
  const lean =
    pac >= small
      ? "PAC-heavy funding may pull votes toward industry priorities."
      : "Small-donor strength can conflict with top industry pressure.";
  return {
    industry: top.name,
    amount: top.amount,
    voteLabel: "Related roll calls",
    votePosition: pac >= 35 ? "Watch PAC-aligned votes" : "Compare donor pressure",
    summary: `${top.name} leads this cycle’s industry list. ${lean}`,
  };
}

/**
 * Campaign finance breakdown: stacked sources, top industries, Money vs. Vote.
 */
export function DonorAlignmentCard({
  finance,
  moneyVsVote = null,
  className = "",
}: DonorAlignmentCardProps) {
  const slices = useMemo(() => normalizeSlices(finance), [finance]);
  const industries = useMemo(
    () => topIndustries(finance?.topIndustries),
    [finance]
  );
  const callout = moneyVsVote ?? defaultMoneyVsVote(industries, finance ?? null);
  const hasFunding = slices.some((slice) => slice.pct > 0);

  return (
    <section
      className={`donor-alignment-card rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 sm:p-5 ${className}`.trim()}
      aria-label="Donor alignment"
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
            Donor Alignment
          </p>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Where the money comes from
          </h3>
        </div>
        {finance?.totalRaised != null ? (
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {formatUsd(finance.totalRaised)}
            {finance.cycle ? (
              <span className="font-medium text-slate-400 dark:text-slate-500">
                {" "}
                · {finance.cycle}
              </span>
            ) : null}
          </p>
        ) : null}
      </header>

      <div className="mb-3">
        <div
          className="flex h-3.5 overflow-hidden rounded-full bg-slate-100 ring-1 ring-inset ring-slate-200/80 dark:bg-slate-800 dark:ring-slate-700"
          role="img"
          aria-label={
            hasFunding
              ? `Funding mix: ${slices
                  .map((slice) => `${slice.shortLabel} ${slice.pct}%`)
                  .join(", ")}`
              : "Funding mix unavailable"
          }
        >
          {hasFunding ? (
            slices.map((slice) =>
              slice.pct > 0 ? (
                <span
                  key={slice.key}
                  className={`${slice.barClass} h-full`}
                  style={{ width: `${slice.pct}%` }}
                  title={`${slice.label}: ${slice.pct}%`}
                />
              ) : null
            )
          ) : (
            <span className="h-full w-full bg-slate-200 dark:bg-slate-700" />
          )}
        </div>
      </div>

      <ul className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {slices.map((slice) => (
          <li
            key={slice.key}
            className="rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/70"
          >
            <div className="flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${slice.barClass}`}
                aria-hidden="true"
              />
              <span className="text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {slice.shortLabel}
              </span>
            </div>
            <p className={`mt-1 text-lg font-bold tabular-nums ${slice.colorClass}`}>
              {hasFunding ? `${slice.pct}%` : "—"}
            </p>
            <p className="text-[0.7rem] leading-snug text-slate-500 dark:text-slate-400">
              {slice.label}
            </p>
          </li>
        ))}
      </ul>

      <div className="mb-4">
        <h4 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">
          Top 5 industry contributors
        </h4>
        {industries.length ? (
          <ol className="divide-y divide-slate-200/80 overflow-hidden rounded-xl border border-slate-200/80 dark:divide-slate-700 dark:border-slate-700">
            {industries.map((industry, index) => (
              <li
                key={`${industry.name}-${index}`}
                className="flex items-center justify-between gap-3 bg-white px-3 py-2.5 dark:bg-slate-900"
              >
                <div className="min-w-0">
                  <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[0.65rem] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {industry.name}
                  </span>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-slate-700 dark:text-slate-200">
                  {formatUsd(industry.amount)}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
            Industry contributor data is not available yet for this member.
          </p>
        )}
      </div>

      {callout ? (
        <aside className="rounded-xl border border-amber-400/35 bg-amber-50/90 p-3 dark:border-amber-300/25 dark:bg-amber-400/10">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-amber-800 ring-1 ring-inset ring-amber-500/30 dark:text-amber-200 dark:ring-amber-300/30">
              Money vs. Vote
            </span>
            {callout.votePosition ? (
              <span className="text-xs font-semibold text-amber-900/80 dark:text-amber-100/80">
                {callout.votePosition}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-50">
            {callout.industry}
            {callout.amount != null ? (
              <span className="font-bold"> · {formatUsd(callout.amount)}</span>
            ) : null}
            {callout.voteLabel ? (
              <span className="font-medium text-amber-900/70 dark:text-amber-100/70">
                {" "}
                · {callout.voteLabel}
              </span>
            ) : null}
          </p>
          {callout.summary ? (
            <p className="mt-1 text-sm leading-relaxed text-amber-950/80 dark:text-amber-50/80">
              {callout.summary}
            </p>
          ) : null}
        </aside>
      ) : null}
    </section>
  );
}

export default DonorAlignmentCard;
