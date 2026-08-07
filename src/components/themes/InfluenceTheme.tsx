import React from "react";

/** Support green derived from product AGREE / Pass accent (#059669). */
export const INFLUENCE_SUPPORT = "#059669";
/** Opposition red derived from product OPPOSE accent (#e11d48). */
export const INFLUENCE_OPPOSE = "#e11d48";

export type StakeholderStance = "support" | "oppose";

export type InfluenceStakeholder = {
  id: string;
  name: string;
  /** Lobbying influence / spend weight — drives node size. */
  weight: number;
  stance: StakeholderStance;
  /** Optional spend label shown under the name. */
  spendLabel?: string;
};

export type InfluenceThemeProps = {
  billId: string;
  title: string;
  category: string;
  keyImpacts?: string[];
  /** Plain-English summary under the network map. */
  summary?: string;
  stakeholders?: InfluenceStakeholder[];
  children?: React.ReactNode;
  className?: string;
};

const DEFAULT_STAKEHOLDERS: InfluenceStakeholder[] = [
  {
    id: "support-1",
    name: "Industry Alliance",
    weight: 0.92,
    stance: "support",
    spendLabel: "$4.2M",
  },
  {
    id: "support-2",
    name: "Trade Council",
    weight: 0.64,
    stance: "support",
    spendLabel: "$1.8M",
  },
  {
    id: "support-3",
    name: "Local Employers",
    weight: 0.38,
    stance: "support",
    spendLabel: "$420K",
  },
  {
    id: "oppose-1",
    name: "Public Interest",
    weight: 0.78,
    stance: "oppose",
    spendLabel: "$2.6M",
  },
  {
    id: "oppose-2",
    name: "Labor Coalition",
    weight: 0.55,
    stance: "oppose",
    spendLabel: "$980K",
  },
  {
    id: "oppose-3",
    name: "Civic Watch",
    weight: 0.32,
    stance: "oppose",
    spendLabel: "$210K",
  },
];

function clampWeight(weight: number): number {
  if (!Number.isFinite(weight)) return 0.35;
  return Math.min(1, Math.max(0.18, weight));
}

function nodeSizePx(weight: number): number {
  const w = clampWeight(weight);
  return Math.round(44 + w * 36);
}

type PositionedNode = InfluenceStakeholder & {
  x: number;
  y: number;
  size: number;
};

function layoutStakeholders(
  stakeholders: InfluenceStakeholder[]
): PositionedNode[] {
  const support = stakeholders
    .filter((s) => s.stance === "support")
    .sort((a, b) => b.weight - a.weight);
  const oppose = stakeholders
    .filter((s) => s.stance === "oppose")
    .sort((a, b) => b.weight - a.weight);

  const place = (
    list: InfluenceStakeholder[],
    side: "left" | "right"
  ): PositionedNode[] => {
    const count = Math.max(list.length, 1);
    return list.map((stakeholder, index) => {
      const t = count === 1 ? 0.5 : index / (count - 1);
      const y = 18 + t * 64;
      const xBase = side === "right" ? 78 : 22;
      const xJitter = side === "right" ? -4 + t * 2 : 4 - t * 2;
      return {
        ...stakeholder,
        x: xBase + xJitter,
        y,
        size: nodeSizePx(stakeholder.weight),
      };
    });
  };

  return [...place(oppose, "left"), ...place(support, "right")];
}

/**
 * Theme #4 — Influence Network
 * Stakeholder power map: bill at center, oppose left / support right,
 * node size scaled by lobbying weight. ReactionDock stays on ArticleCard.
 */
export function InfluenceTheme({
  billId,
  title,
  category,
  keyImpacts = [],
  summary,
  stakeholders,
  children,
  className = "",
}: InfluenceThemeProps) {
  const nodes = layoutStakeholders(
    stakeholders && stakeholders.length > 0
      ? stakeholders
      : DEFAULT_STAKEHOLDERS
  );
  const blurb = (summary || title).trim();
  const impacts = keyImpacts.slice(0, 2);
  const center = { x: 50, y: 50 };

  return (
    <div
      className={[
        "influence-theme",
        "relative isolate overflow-hidden rounded-2xl",
        "border border-slate-200 bg-slate-50 text-slate-900",
        "px-4 pb-28 pt-5 sm:px-5 sm:pt-6 md:px-6",
        "font-['IBM_Plex_Sans','Source_Sans_3','Segoe_UI',sans-serif]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-theme="influence"
      data-a1-theme="influence"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-80"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 40%, rgba(15,23,42,0.06), transparent 60%), radial-gradient(ellipse 40% 35% at 18% 30%, rgba(225,29,72,0.06), transparent 55%), radial-gradient(ellipse 40% 35% at 82% 30%, rgba(5,150,105,0.07), transparent 55%)",
        }}
      />

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-slate-900 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-50">
            {category || "Lobbying"}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
            Stakeholder map
          </span>
        </div>
        <span className="font-['IBM_Plex_Mono','ui-monospace',monospace] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-700">
          {billId}
        </span>
      </header>

      <section
        className={[
          "influence-theme__map",
          "relative mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white",
          "shadow-[0_1px_0_rgba(15,23,42,0.04)]",
          "aspect-[16/11] sm:aspect-[16/10]",
        ].join(" ")}
        aria-label="Influence network"
      >
        <div className="absolute left-3 top-3 z-10 flex flex-col gap-1.5 sm:left-4 sm:top-4">
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              borderColor: "rgba(225,29,72,0.35)",
              background: "rgba(225,29,72,0.08)",
              color: INFLUENCE_OPPOSE,
            }}
          >
            Oppose
          </span>
        </div>
        <div className="absolute right-3 top-3 z-10 flex flex-col gap-1.5 sm:right-4 sm:top-4">
          <span
            className="inline-flex w-fit items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{
              borderColor: "rgba(5,150,105,0.35)",
              background: "rgba(5,150,105,0.08)",
              color: INFLUENCE_SUPPORT,
            }}
          >
            Agree
          </span>
        </div>

        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          {nodes.map((node) => {
            const color =
              node.stance === "support" ? INFLUENCE_SUPPORT : INFLUENCE_OPPOSE;
            return (
              <line
                key={`edge-${node.id}`}
                x1={center.x}
                y1={center.y}
                x2={node.x}
                y2={node.y}
                stroke={color}
                strokeOpacity="0.35"
                strokeWidth="0.35"
              />
            );
          })}
        </svg>

        {/* Central bill node */}
        <div
          className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-[3px] border-slate-900 bg-slate-950 text-center shadow-[0_8px_24px_rgba(15,23,42,0.18)]"
          style={{
            left: "50%",
            top: "50%",
            width: "5.5rem",
            height: "5.5rem",
          }}
        >
          <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">
            Bill
          </span>
          <span className="mt-0.5 max-w-[4.5rem] px-1 font-['IBM_Plex_Mono','ui-monospace',monospace] text-[11px] font-bold leading-tight text-slate-50">
            {billId}
          </span>
        </div>

        {nodes.map((node) => {
          const isSupport = node.stance === "support";
          const accent = isSupport ? INFLUENCE_SUPPORT : INFLUENCE_OPPOSE;
          return (
            <div
              key={node.id}
              className="absolute z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border-2 bg-white text-center shadow-[0_4px_14px_rgba(15,23,42,0.10)]"
              style={{
                left: `${node.x}%`,
                top: `${node.y}%`,
                width: node.size,
                height: node.size,
                borderColor: accent,
                boxShadow: `0 0 0 3px ${
                  isSupport
                    ? "rgba(5,150,105,0.12)"
                    : "rgba(225,29,72,0.12)"
                }, 0 4px 14px rgba(15,23,42,0.10)`,
              }}
              title={`${node.name}${node.spendLabel ? ` · ${node.spendLabel}` : ""}`}
            >
              <span
                className="max-w-[90%] px-1 text-[10px] font-bold leading-tight text-slate-900 sm:text-[11px]"
                style={{ color: "#0f172a" }}
              >
                {node.name}
              </span>
              {node.spendLabel ? (
                <span
                  className="mt-0.5 font-['IBM_Plex_Mono','ui-monospace',monospace] text-[9px] font-semibold"
                  style={{ color: accent }}
                >
                  {node.spendLabel}
                </span>
              ) : null}
            </div>
          );
        })}
      </section>

      <section
        className={[
          "influence-theme__summary",
          "rounded-xl border border-slate-200 bg-white",
          "p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5",
        ].join(" ")}
      >
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
          Who is pushing — and who is fighting
        </p>
        <h2 className="text-[1.2rem] font-bold leading-snug tracking-tight text-slate-950 sm:text-[1.4rem]">
          {blurb}
        </h2>
        {impacts.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4">
            {impacts.map((impact, index) => (
              <li
                key={`${billId}-influence-impact-${index}`}
                className="flex gap-2.5 text-sm leading-snug text-slate-700"
              >
                <span
                  className="mt-[0.4em] h-1.5 w-1.5 shrink-0 rounded-full bg-slate-900"
                  aria-hidden
                />
                <span className="font-medium">{impact}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {children ? (
        <div className="influence-theme__slot mt-4">{children}</div>
      ) : null}
    </div>
  );
}

export default InfluenceTheme;
