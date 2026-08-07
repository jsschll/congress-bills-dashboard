import React from "react";
import type { BillMetric } from "../types";

export type BentoGridThemeProps = {
  billId: string;
  title: string;
  category: string;
  keyImpacts: string[];
  /**
   * Bold high-level financial / structural impact summary for the main cell.
   * Falls back to `title` when omitted.
   */
  financialSummary?: string;
  /** Core figures for dedicated metric bento cells. */
  metrics?: BillMetric[];
  children?: React.ReactNode;
  className?: string;
};

const METRIC_TONE: Record<
  NonNullable<BillMetric["tone"]>,
  { cell: string; value: string; label: string }
> = {
  neutral: {
    cell: "border-slate-200 bg-white",
    value: "text-slate-900",
    label: "text-slate-500",
  },
  positive: {
    cell: "border-emerald-200 bg-emerald-50/80",
    value: "text-emerald-800",
    label: "text-emerald-700/70",
  },
  negative: {
    cell: "border-rose-200 bg-rose-50/80",
    value: "text-rose-800",
    label: "text-rose-700/70",
  },
  warning: {
    cell: "border-amber-200 bg-amber-50/80",
    value: "text-amber-900",
    label: "text-amber-800/70",
  },
  info: {
    cell: "border-sky-200 bg-sky-50/80",
    value: "text-sky-900",
    label: "text-sky-800/70",
  },
};

const CELL =
  "rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5";

/**
 * Theme #2 — Bento Grid
 * Crisp, data-dense layout for finance, federal budgets, and structured policy.
 * Presentation only — vote / reaction state stays in ArticleCard.
 */
export function BentoGridTheme({
  billId,
  title,
  category,
  keyImpacts,
  financialSummary,
  metrics = [],
  children,
  className = "",
}: BentoGridThemeProps) {
  const summary = (financialSummary ?? title).trim();
  const impacts = keyImpacts.slice(0, 4);
  const categoryParts = category
    .split(/[|/]/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <div
      className={[
        "bento-grid-theme",
        "relative isolate overflow-hidden rounded-2xl",
        "border border-slate-200 bg-slate-50 text-slate-900",
        "px-4 pb-28 pt-5 sm:px-5 sm:pt-6 md:px-6",
        "font-['IBM_Plex_Sans','Source_Sans_3','Segoe_UI',sans-serif]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-theme="bento-grid"
      data-a1-theme="bento-grid"
    >
      {/* Sharp header banner */}
      <header
        className={[
          "bento-grid-theme__header",
          "mb-4 flex flex-wrap items-center justify-between gap-3",
          "rounded-xl border border-slate-200 bg-white px-4 py-3",
          "sm:mb-5 sm:px-5",
        ].join(" ")}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {categoryParts.map((part) => (
            <span
              key={part}
              className={[
                "inline-flex items-center rounded-md",
                "border border-slate-900 bg-slate-900",
                "px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em]",
                "text-slate-50",
              ].join(" ")}
            >
              {part}
            </span>
          ))}
          {categoryParts.length === 0 ? (
            <span className="inline-flex items-center rounded-md border border-slate-900 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-50">
              Policy
            </span>
          ) : null}
        </div>
        <span
          className={[
            "font-['IBM_Plex_Mono','ui-monospace',monospace]",
            "rounded-md border border-slate-300 bg-slate-50",
            "px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-700",
          ].join(" ")}
        >
          {billId}
        </span>
      </header>

      {/* Bento layout */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Main cell — financial / structural summary */}
        <section
          className={[
            CELL,
            "bento-grid-theme__main",
            "md:col-span-2 md:row-span-2",
            "flex flex-col justify-between gap-6",
            "bg-slate-950 text-slate-100 border-slate-900",
          ].join(" ")}
          aria-label="Bill impact summary"
        >
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Impact summary
            </p>
            <h2
              className={[
                "text-[1.35rem] font-bold leading-[1.2] tracking-tight",
                "sm:text-[1.65rem] md:text-[1.85rem]",
                "text-slate-50",
              ].join(" ")}
            >
              {summary}
            </h2>
          </div>
          <p
            className={[
              "font-['IBM_Plex_Mono','ui-monospace',monospace]",
              "text-[11px] uppercase tracking-[0.14em] text-slate-500",
            ].join(" ")}
          >
            Structured brief · {billId}
          </p>
        </section>

        {/* Metric cells */}
        {metrics.length > 0 ? (
          metrics.slice(0, 4).map((metric) => {
            const tone = METRIC_TONE[metric.tone ?? "neutral"];
            return (
              <section
                key={metric.id}
                className={[CELL, tone.cell, "bento-grid-theme__metric"].join(
                  " "
                )}
                aria-label={metric.label}
              >
                <p
                  className={[
                    "mb-2 text-[10px] font-bold uppercase tracking-[0.14em]",
                    tone.label,
                  ].join(" ")}
                >
                  {metric.label}
                </p>
                <p
                  className={[
                    "font-['IBM_Plex_Mono','ui-monospace',monospace]",
                    "text-2xl font-bold tabular-nums tracking-tight sm:text-3xl",
                    tone.value,
                  ].join(" ")}
                >
                  {metric.value}
                </p>
              </section>
            );
          })
        ) : (
          <section className={[CELL, "bento-grid-theme__metric"].join(" ")}>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
              Metrics
            </p>
            <p className="font-['IBM_Plex_Mono','ui-monospace',monospace] text-sm text-slate-400">
              Awaiting figures
            </p>
          </section>
        )}

        {/* Key impacts cell */}
        <section
          className={[
            CELL,
            "bento-grid-theme__impacts",
            "md:col-span-3",
          ].join(" ")}
          aria-label="Key impacts"
        >
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Key Impacts
          </h3>
          {impacts.length > 0 ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {impacts.map((impact, index) => (
                <li
                  key={`${billId}-bento-impact-${index}`}
                  className={[
                    "flex gap-3 rounded-lg border border-slate-100",
                    "bg-slate-50/80 px-3 py-2.5",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "font-['IBM_Plex_Mono','ui-monospace',monospace]",
                      "mt-0.5 shrink-0 text-[11px] font-bold text-slate-400",
                    ].join(" ")}
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="text-sm font-medium leading-snug text-slate-800">
                    {impact}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No key impacts listed.</p>
          )}
        </section>

        {children ? (
          <div className="bento-grid-theme__slot md:col-span-3">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

export default BentoGridTheme;
