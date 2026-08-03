import React, { useMemo } from "react";
import type { ScorecardAttendance } from "../lib/services/scorecardService";

/** Optional congressional baseline for comparison rows. */
export type CongressionalAverages = {
  /** Typical missed-vote rate across Congress (0–100). */
  missedVotePct?: number | null;
  /** Typical attendance rate across Congress (0–100). */
  attendancePct?: number | null;
  /** Typical sponsored bill count for comparison. */
  sponsoredBillsCount?: number | null;
  /** Typical bipartisan cosponsorship rate (0–100). */
  bipartisanCosponsorPct?: number | null;
};

export type AttendanceStatsCardProps = {
  attendance: ScorecardAttendance | null | undefined;
  /** Defaults lean on recent Congress norms when omitted. */
  congressionalAverage?: CongressionalAverages | null;
  /** Cosponsored bills when available separately from sponsored count. */
  cosponsoredBillsCount?: number | null;
  className?: string;
};

const DEFAULT_AVERAGES: Required<
  Pick<
    CongressionalAverages,
    "missedVotePct" | "attendancePct" | "sponsoredBillsCount" | "bipartisanCosponsorPct"
  >
> = {
  missedVotePct: 2.8,
  attendancePct: 97.2,
  sponsoredBillsCount: 18,
  bipartisanCosponsorPct: 24,
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return `${round1(Number(value))}%`;
}

function formatCount(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return String(Math.round(Number(value)));
}

function deltaLabel(
  member: number | null,
  average: number | null,
  { higherIsBetter }: { higherIsBetter: boolean }
): { text: string; tone: string } | null {
  if (member == null || average == null) return null;
  const diff = round1(member - average);
  if (Math.abs(diff) < 0.05) {
    return {
      text: "At average",
      tone: "text-slate-500 dark:text-slate-400",
    };
  }
  const better = higherIsBetter ? diff > 0 : diff < 0;
  const sign = diff > 0 ? "+" : "";
  return {
    text: `${sign}${diff} vs avg`,
    tone: better
      ? "text-emerald-700 dark:text-emerald-300"
      : "text-rose-700 dark:text-rose-300",
  };
}

type StatRow = {
  id: string;
  label: string;
  member: string;
  average: string;
  hint?: string;
  delta: { text: string; tone: string } | null;
};

/**
 * Attendance & legislative activity compared with congressional averages.
 */
export function AttendanceStatsCard({
  attendance,
  congressionalAverage = null,
  cosponsoredBillsCount = null,
  className = "",
}: AttendanceStatsCardProps) {
  const averages = {
    ...DEFAULT_AVERAGES,
    ...(congressionalAverage || {}),
  };

  const derived = useMemo(() => {
    const totalVotes = attendance?.totalVotes ?? null;
    const missedVotes = attendance?.missedVotes ?? null;
    const missedVotePct =
      attendance?.missedVotePct != null
        ? Number(attendance.missedVotePct)
        : totalVotes && totalVotes > 0 && missedVotes != null
          ? round1((missedVotes / totalVotes) * 100)
          : null;
    const attendancePct =
      missedVotePct == null ? null : round1(100 - missedVotePct);

    return {
      totalVotes,
      missedVotes,
      missedVotePct,
      attendancePct,
      sponsored: attendance?.sponsoredBillsCount ?? null,
      bipartisan: attendance?.bipartisanCosponsorPct ?? null,
    };
  }, [attendance]);

  const rows: StatRow[] = [
    {
      id: "missed",
      label: "Missed votes",
      member:
        derived.missedVotes == null
          ? "—"
          : `${formatCount(derived.missedVotes)}${
              derived.missedVotePct == null
                ? ""
                : ` (${formatPct(derived.missedVotePct)})`
            }`,
      average: formatPct(averages.missedVotePct),
      hint: derived.totalVotes != null ? `${derived.totalVotes} total votes` : undefined,
      delta: deltaLabel(derived.missedVotePct, averages.missedVotePct ?? null, {
        higherIsBetter: false,
      }),
    },
    {
      id: "attendance",
      label: "Attendance rate",
      member: formatPct(derived.attendancePct),
      average: formatPct(averages.attendancePct),
      hint: "Present for recorded roll calls",
      delta: deltaLabel(derived.attendancePct, averages.attendancePct ?? null, {
        higherIsBetter: true,
      }),
    },
    {
      id: "sponsored",
      label: "Bills sponsored",
      member: formatCount(derived.sponsored),
      average: formatCount(averages.sponsoredBillsCount),
      hint:
        cosponsoredBillsCount != null
          ? `${formatCount(cosponsoredBillsCount)} cosponsored`
          : "Primary sponsorships this Congress",
      delta: deltaLabel(derived.sponsored, averages.sponsoredBillsCount ?? null, {
        higherIsBetter: true,
      }),
    },
    {
      id: "bipartisan",
      label: "Bipartisan cosponsorship",
      member: formatPct(derived.bipartisan),
      average: formatPct(averages.bipartisanCosponsorPct),
      hint: "Share of cosponsorships across the aisle",
      delta: deltaLabel(
        derived.bipartisan,
        averages.bipartisanCosponsorPct ?? null,
        { higherIsBetter: true }
      ),
    },
  ];

  return (
    <section
      className={`attendance-stats-card rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 sm:p-5 ${className}`.trim()}
      aria-label="Attendance and voting activity"
    >
      <header className="mb-4">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
          Attendance & Activity
        </p>
        <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900 dark:text-white">
          How often they show up — and work across the aisle
        </h3>
        {attendance?.congress ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {attendance.congress}th Congress
            {cosponsoredBillsCount != null
              ? ` · ${formatCount(cosponsoredBillsCount)} cosponsored bills`
              : ""}
          </p>
        ) : null}
      </header>

      <div className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700">
        <div className="hidden grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 bg-slate-50 px-3 py-2 text-[0.7rem] font-bold uppercase tracking-wide text-slate-500 dark:bg-slate-800/80 dark:text-slate-400 sm:grid">
          <span>Metric</span>
          <span className="text-right">Member</span>
          <span className="text-right">Congress avg</span>
          <span className="text-right">Delta</span>
        </div>

        <ul className="divide-y divide-slate-200/80 dark:divide-slate-700">
          {rows.map((row) => (
            <li
              key={row.id}
              className="grid grid-cols-1 gap-2 px-3 py-3 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center sm:gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {row.label}
                </p>
                {row.hint ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {row.hint}
                  </p>
                ) : null}
              </div>

              <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
                <span className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-400 sm:hidden">
                  Member
                </span>
                <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
                  {row.member}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
                <span className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-400 sm:hidden">
                  Congress avg
                </span>
                <span className="text-sm font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  {row.average}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3 sm:block sm:text-right">
                <span className="text-[0.7rem] font-bold uppercase tracking-wide text-slate-400 sm:hidden">
                  Delta
                </span>
                <span
                  className={`text-sm font-semibold ${
                    row.delta?.tone || "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {row.delta?.text || "—"}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default AttendanceStatsCard;
