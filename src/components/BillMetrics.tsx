import React from "react";
import type { BillMetric } from "./types";

export type BillMetricsProps = {
  metrics: BillMetric[];
  className?: string;
};

const TONE_BADGE: Record<NonNullable<BillMetric["tone"]>, string> = {
  neutral: "bg-white/15 text-white border-white/20",
  positive: "bg-emerald-500/20 text-emerald-100 border-emerald-400/40",
  negative: "bg-rose-500/20 text-rose-100 border-rose-400/40",
  warning: "bg-amber-500/20 text-amber-100 border-amber-400/40",
  info: "bg-sky-500/20 text-sky-100 border-sky-400/40",
};

/**
 * Clean stat callouts — Net Cost, Vote Totals, Days Left, etc.
 * Bold value typography + high-contrast tone badges.
 */
export function BillMetrics({ metrics, className = "" }: BillMetricsProps) {
  if (!metrics.length) return null;

  return (
    <dl
      className={[
        "a1-bill-metrics",
        "grid grid-cols-2 gap-3 sm:grid-cols-3",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-a1-shell="bill-metrics"
    >
      {metrics.map((metric) => {
        const tone = metric.tone ?? "neutral";
        const badgeClass = TONE_BADGE[tone];

        return (
          <div
            key={metric.id}
            className="a1-bill-metric flex flex-col gap-1.5 min-w-0"
          >
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/55">
              {metric.label}
            </dt>
            <dd>
              <span
                className={[
                  "inline-flex max-w-full items-center truncate",
                  "rounded-md border px-2.5 py-1",
                  "text-sm font-bold tabular-nums tracking-tight sm:text-base",
                  badgeClass,
                ].join(" ")}
              >
                {metric.value}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export default BillMetrics;
