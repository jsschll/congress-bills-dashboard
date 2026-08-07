import React from "react";

/** Agree / Pass accent used for retained or aligned clauses. */
export const VERSUS_AGREE = "#059669";
/** Oppose accent used for changed, struck, or conflicting clauses. */
export const VERSUS_OPPOSE = "#e11d48";

export type VersusClauseTone = "agree" | "oppose" | "neutral";

export type VersusClause = {
  id: string;
  label: string;
  left: string;
  right: string;
  /** How the right-hand version differs from the left. */
  tone?: VersusClauseTone;
};

export type VersusThemeProps = {
  billId: string;
  title: string;
  category: string;
  keyImpacts?: string[];
  summary?: string;
  /** Left column heading — Bill A / Original. */
  leftLabel?: string;
  /** Right column heading — Bill B / Amendment. */
  rightLabel?: string;
  clauses?: VersusClause[];
  children?: React.ReactNode;
  className?: string;
};

const DEFAULT_CLAUSES: VersusClause[] = [
  {
    id: "scope",
    label: "Scope",
    left: "Applies to new federal contracts over $25M.",
    right: "Applies to new and renewed contracts over $10M.",
    tone: "oppose",
  },
  {
    id: "timeline",
    label: "Timeline",
    left: "Phase-in over three fiscal years.",
    right: "Phase-in over three fiscal years.",
    tone: "agree",
  },
  {
    id: "oversight",
    label: "Oversight",
    left: "Annual GAO report to Congress.",
    right: "Semiannual inspector-general audits plus GAO report.",
    tone: "oppose",
  },
  {
    id: "funding",
    label: "Funding",
    left: "No new discretionary outlays authorized.",
    right: "Authorizes $180M for implementation grants.",
    tone: "oppose",
  },
];

function toneColor(tone: VersusClauseTone = "neutral"): string {
  if (tone === "agree") return VERSUS_AGREE;
  if (tone === "oppose") return VERSUS_OPPOSE;
  return "#64748b";
}

function toneLabel(tone: VersusClauseTone = "neutral"): string {
  if (tone === "agree") return "Agree";
  if (tone === "oppose") return "Oppose";
  return "Note";
}

/**
 * Theme #6 — Versus Comparison
 * Vertical split comparing Bill A vs Bill B (or original vs amendment)
 * with Agree/Oppose color coding on clause diffs. ReactionDock stays on ArticleCard.
 */
export function VersusTheme({
  billId,
  title,
  category,
  keyImpacts = [],
  summary,
  leftLabel = "Bill A · Original",
  rightLabel = "Bill B · Amendment",
  clauses,
  children,
  className = "",
}: VersusThemeProps) {
  const rows = clauses && clauses.length > 0 ? clauses : DEFAULT_CLAUSES;
  const blurb = (summary || title).trim();
  const impacts = keyImpacts.slice(0, 2);

  return (
    <div
      className={[
        "versus-theme",
        "relative isolate overflow-hidden rounded-2xl",
        "border border-slate-200 bg-slate-50 text-slate-900",
        "px-4 pb-28 pt-5 sm:px-5 sm:pt-6 md:px-6",
        "font-['IBM_Plex_Sans','Source_Sans_3','Segoe_UI',sans-serif]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-theme="versus"
      data-a1-theme="versus"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden
        style={{
          background:
            "linear-gradient(90deg, rgba(5,150,105,0.04) 0%, transparent 42%, transparent 58%, rgba(225,29,72,0.05) 100%)",
        }}
      />

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-slate-900 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-50">
            {category || "Comparison"}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
            Versus
          </span>
        </div>
        <span className="font-['IBM_Plex_Mono','ui-monospace',monospace] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-700">
          {billId}
        </span>
      </header>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-800">
            {leftLabel}
          </p>
        </div>
        <div className="rounded-lg border border-rose-200 bg-rose-50/70 px-3 py-2 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-800">
            {rightLabel}
          </p>
        </div>
      </div>

      <section
        className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]"
        aria-label="Clause comparison"
      >
        <ul className="divide-y divide-slate-100">
          {rows.map((clause) => {
            const tone = clause.tone || "neutral";
            const color = toneColor(tone);
            return (
              <li key={clause.id} className="relative">
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2 sm:px-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                    {clause.label}
                  </p>
                  <span
                    className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
                    style={{
                      color,
                      borderColor: `${color}55`,
                      backgroundColor: `${color}12`,
                    }}
                  >
                    {toneLabel(tone)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  <div className="border-b border-slate-100 px-3 py-3 sm:border-b-0 sm:border-r sm:px-4">
                    <p className="text-sm font-medium leading-relaxed text-slate-700">
                      {clause.left}
                    </p>
                  </div>
                  <div
                    className="px-3 py-3 sm:px-4"
                    style={{
                      boxShadow:
                        tone === "oppose"
                          ? `inset 3px 0 0 ${VERSUS_OPPOSE}`
                          : tone === "agree"
                            ? `inset 3px 0 0 ${VERSUS_AGREE}`
                            : undefined,
                    }}
                  >
                    <p
                      className="text-sm font-semibold leading-relaxed"
                      style={{
                        color:
                          tone === "oppose"
                            ? "#9f1239"
                            : tone === "agree"
                              ? "#065f46"
                              : "#334155",
                      }}
                    >
                      {clause.right}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          What changed
        </p>
        <h3 className="text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">
          {blurb}
        </h3>
        {impacts.length > 0 ? (
          <ul className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
            {impacts.map((impact) => (
              <li
                key={impact}
                className="relative pl-3 text-sm font-medium text-slate-600 before:absolute before:left-0 before:top-[0.45rem] before:h-1.5 before:w-1.5 before:rounded-full before:bg-slate-900"
              >
                {impact}
              </li>
            ))}
          </ul>
        ) : null}
        {children}
      </section>
    </div>
  );
}

export default VersusTheme;
