import React from "react";

export type PipelineStepStatus = "complete" | "current" | "upcoming";

export type PipelineStep = {
  id: string;
  label: string;
  description?: string;
  status: PipelineStepStatus;
  /** Simple icon key used by the tracker. */
  icon?: "gavel" | "mic" | "ballot" | "default";
};

export type PipelineThemeProps = {
  billId: string;
  title: string;
  category: string;
  keyImpacts?: string[];
  /**
   * High-visibility "What the bill does" copy.
   * Falls back to title when omitted.
   */
  whatItDoes?: string;
  /** Optional procedural tracker steps (defaults to Committee → Floor → Final). */
  pipelineSteps?: PipelineStep[];
  children?: React.ReactNode;
  className?: string;
};

const DEFAULT_STEPS: PipelineStep[] = [
  {
    id: "committee",
    label: "In Committee",
    description: "Markup & hearings",
    status: "current",
    icon: "gavel",
  },
  {
    id: "floor",
    label: "Floor Debate",
    description: "Chamber consideration",
    status: "upcoming",
    icon: "mic",
  },
  {
    id: "final",
    label: "Final Action",
    description: "Passage or veto",
    status: "upcoming",
    icon: "ballot",
  },
];

function StepIcon({
  icon = "default",
  active,
}: {
  icon?: PipelineStep["icon"];
  active: boolean;
}) {
  const stroke = active ? "#0F172A" : "#64748B";
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-hidden": true as const,
  };

  if (icon === "gavel") {
    return (
      <svg {...common}>
        <path
          d="M14.5 4.5l5 5M4 20l6.5-6.5M13 6l5 5M8.5 15.5L3 21"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <path
          d="M12.5 7.5l4 4"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "mic") {
    return (
      <svg {...common}>
        <rect
          x="9"
          y="3"
          width="6"
          height="11"
          rx="3"
          stroke={stroke}
          strokeWidth="1.8"
        />
        <path
          d="M6.5 11a5.5 5.5 0 0011 0M12 16.5V21M9 21h6"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (icon === "ballot") {
    return (
      <svg {...common}>
        <rect
          x="4"
          y="3"
          width="16"
          height="18"
          rx="2.5"
          stroke={stroke}
          strokeWidth="1.8"
        />
        <path
          d="M8 9h8M8 13h8M8 17h5"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="7" stroke={stroke} strokeWidth="1.8" />
    </svg>
  );
}

/**
 * Theme #3 — Procedural Pipeline
 * Legislative tracking layout: clear "what it does" summary + three-step journey.
 * Presentation only — ReactionDock / vote state stay in ArticleCard.
 */
export function PipelineTheme({
  billId,
  title,
  category,
  keyImpacts = [],
  whatItDoes,
  pipelineSteps,
  children,
  className = "",
}: PipelineThemeProps) {
  const summary = (whatItDoes || title).trim();
  const steps =
    pipelineSteps && pipelineSteps.length > 0 ? pipelineSteps : DEFAULT_STEPS;
  const impacts = keyImpacts.slice(0, 2);
  const currentIndex = Math.max(
    0,
    steps.findIndex((step) => step.status === "current")
  );

  return (
    <div
      className={[
        "pipeline-theme",
        "relative isolate overflow-hidden rounded-2xl",
        "border border-slate-200 bg-slate-50 text-slate-900",
        "px-4 pb-5 pt-5 sm:px-5 sm:pt-6 md:px-6",
        "font-['IBM_Plex_Sans','Source_Sans_3','Segoe_UI',sans-serif]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-theme="pipeline"
      data-a1-theme="pipeline"
    >
      {/* Soft procedural wash — aligns with Bento elevation, not cream collage */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 0% 0%, rgba(14,165,233,0.10), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 10%, rgba(15,23,42,0.06), transparent 50%)",
        }}
      />

      {/* Header */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-slate-900 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-50">
            {category || "Procedural"}
          </span>
          <span className="inline-flex items-center rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-800">
            Tracking
          </span>
        </div>
        <span className="font-['IBM_Plex_Mono','ui-monospace',monospace] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-700">
          {billId}
        </span>
      </header>

      {/* Top: What the bill does */}
      <section
        className={[
          "pipeline-theme__summary",
          "mb-5 rounded-xl border border-slate-200 bg-white",
          "p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5",
        ].join(" ")}
        aria-label="What the bill does"
      >
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          What the bill does
        </p>
        <h2 className="text-[1.35rem] font-bold leading-[1.2] tracking-tight text-slate-950 sm:text-[1.65rem]">
          {summary}
        </h2>
        {impacts.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
            {impacts.map((impact, index) => (
              <li
                key={`${billId}-pipeline-impact-${index}`}
                className="flex gap-2.5 text-sm leading-snug text-slate-700"
              >
                <span
                  className="mt-[0.4em] h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500"
                  aria-hidden
                />
                <span className="font-medium">{impact}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Bottom: three-step procedural tracker */}
      <section
        className={[
          "pipeline-theme__tracker",
          "rounded-xl border border-slate-200 bg-white",
          "p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5",
        ].join(" ")}
        aria-label="Legislative pipeline"
      >
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Procedural pipeline
            </p>
            <p className="mt-1 text-sm font-medium uppercase tracking-[0.06em] text-slate-700">
              In Committee → Floor Debate → Final Action
            </p>
          </div>
          <p className="font-['IBM_Plex_Mono','ui-monospace',monospace] text-[11px] uppercase tracking-[0.12em] text-slate-400">
            Step {currentIndex + 1} of {steps.length}
          </p>
        </div>

        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-0">
          {steps.map((step, index) => {
            const isComplete = step.status === "complete";
            const isCurrent = step.status === "current";
            const isUpcoming = step.status === "upcoming";

            return (
              <li
                key={step.id}
                className="relative flex sm:flex-col sm:items-center sm:text-center"
              >
                {index < steps.length - 1 ? (
                  <span
                    className={[
                      "pointer-events-none absolute hidden sm:block",
                      "left-[calc(50%+1.4rem)] right-[calc(-50%+1.4rem)] top-[1.35rem]",
                      "h-[2px]",
                      isComplete || isCurrent ? "bg-slate-900" : "bg-slate-200",
                    ].join(" ")}
                    aria-hidden
                  />
                ) : null}

                <div className="flex items-start gap-3 sm:flex-col sm:items-center sm:gap-3">
                  <div
                    className={[
                      "relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2",
                      isComplete
                        ? "border-slate-900 bg-slate-900 text-white"
                        : isCurrent
                          ? "border-slate-900 bg-sky-100 text-slate-900 shadow-[0_0_0_4px_rgba(14,165,233,0.15)]"
                          : "border-slate-200 bg-slate-50 text-slate-500",
                    ].join(" ")}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {isComplete ? (
                      <span className="text-sm font-bold text-white" aria-hidden>
                        ✓
                      </span>
                    ) : (
                      <StepIcon icon={step.icon} active={isCurrent} />
                    )}
                  </div>

                  <div className="min-w-0 sm:px-2">
                    <p
                      className={[
                        "text-sm font-bold tracking-tight",
                        isUpcoming ? "text-slate-400" : "text-slate-900",
                      ].join(" ")}
                    >
                      {step.label}
                    </p>
                    {step.description ? (
                      <p
                        className={[
                          "mt-0.5 text-xs leading-snug",
                          isUpcoming ? "text-slate-400" : "text-slate-500",
                        ].join(" ")}
                      >
                        {step.description}
                      </p>
                    ) : null}
                    <p
                      className={[
                        "mt-1.5 inline-flex rounded-md px-1.5 py-0.5",
                        "text-[10px] font-bold uppercase tracking-[0.1em]",
                        isComplete
                          ? "bg-emerald-50 text-emerald-700"
                          : isCurrent
                            ? "bg-sky-50 text-sky-800"
                            : "bg-slate-100 text-slate-400",
                      ].join(" ")}
                    >
                      {isComplete
                        ? "Complete"
                        : isCurrent
                          ? "In progress"
                          : "Upcoming"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {children ? (
        <div className="pipeline-theme__slot mt-4">{children}</div>
      ) : null}
    </div>
  );
}

export default PipelineTheme;
