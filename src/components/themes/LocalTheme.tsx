import React from "react";

export type LocalDistrictRow = {
  id: string;
  label: string;
  detail: string;
  /** Optional funding / impact figure shown beside the district. */
  amount?: string;
  /** Highlight the primary focus district (e.g. TX-22). */
  emphasis?: boolean;
};

export type LocalThemeProps = {
  billId: string;
  title: string;
  category: string;
  keyImpacts?: string[];
  /** Plain-English localized impact summary. */
  summary?: string;
  /** Focus district label — defaults to TX-22 / Katy area. */
  focusDistrict?: string;
  /** Estimated regional impact level. */
  regionalImpact?: string;
  /** Funding allocation callout. */
  fundingLabel?: string;
  districts?: LocalDistrictRow[];
  children?: React.ReactNode;
  className?: string;
};

const DEFAULT_DISTRICTS: LocalDistrictRow[] = [
  {
    id: "tx-22",
    label: "TX-22",
    detail: "Katy / Fort Bend corridor",
    amount: "$184M",
    emphasis: true,
  },
  {
    id: "tx-07",
    label: "TX-07",
    detail: "West Houston suburbs",
    amount: "$96M",
  },
  {
    id: "tx-09",
    label: "TX-09",
    detail: "Southeast metro",
    amount: "$72M",
  },
];

/**
 * Theme #5 — Local Impact
 * Geo-spatial / district-specific layout: district breakdown panel +
 * regional map representation. ReactionDock stays on ArticleCard.
 */
export function LocalTheme({
  billId,
  title,
  category,
  keyImpacts = [],
  summary,
  focusDistrict = "TX-22 · Katy area",
  regionalImpact = "High",
  fundingLabel = "$352M regional",
  districts,
  children,
  className = "",
}: LocalThemeProps) {
  const rows =
    districts && districts.length > 0 ? districts : DEFAULT_DISTRICTS;
  const blurb = (summary || title).trim();
  const impacts = keyImpacts.slice(0, 2);

  return (
    <div
      className={[
        "local-theme",
        "relative isolate overflow-hidden rounded-2xl",
        "border border-slate-200 bg-slate-50 text-slate-900",
        "px-4 pb-5 pt-5 sm:px-5 sm:pt-6 md:px-6",
        "font-['IBM_Plex_Sans','Source_Sans_3','Segoe_UI',sans-serif]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-theme="local"
      data-a1-theme="local"
    >
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 78% 28%, rgba(15,23,42,0.07), transparent 58%), linear-gradient(180deg, rgba(248,250,252,0.2), transparent 40%)",
        }}
      />

      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-md border border-slate-900 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-50">
            {category || "Local"}
          </span>
          <span className="inline-flex items-center rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
            District impact
          </span>
        </div>
        <span className="font-['IBM_Plex_Mono','ui-monospace',monospace] rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold tracking-wide text-slate-700">
          {billId}
        </span>
      </header>

      <div className="mb-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <section
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5"
          aria-label="District breakdown"
        >
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            District breakdown
          </p>
          <ul className="space-y-2.5">
            {rows.map((row) => (
              <li
                key={row.id}
                className={[
                  "flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5",
                  row.emphasis
                    ? "border-slate-900 bg-slate-900 text-slate-50"
                    : "border-slate-200 bg-slate-50 text-slate-800",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <p
                    className={[
                      "font-['IBM_Plex_Mono','ui-monospace',monospace] text-sm font-bold tracking-wide",
                      row.emphasis ? "text-white" : "text-slate-900",
                    ].join(" ")}
                  >
                    {row.label}
                  </p>
                  <p
                    className={[
                      "mt-0.5 text-xs font-medium",
                      row.emphasis ? "text-slate-300" : "text-slate-500",
                    ].join(" ")}
                  >
                    {row.detail}
                  </p>
                </div>
                {row.amount ? (
                  <span
                    className={[
                      "shrink-0 font-['IBM_Plex_Mono','ui-monospace',monospace] text-sm font-bold",
                      row.emphasis ? "text-emerald-300" : "text-slate-700",
                    ].join(" ")}
                  >
                    {row.amount}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        <section
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5"
          aria-label="Regional map"
        >
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Regional map
          </p>
          <div className="relative mx-auto aspect-[4/3] w-full max-w-sm">
            <svg
              viewBox="0 0 320 240"
              className="h-full w-full"
              role="img"
              aria-label={`Map highlighting ${focusDistrict}`}
            >
              <defs>
                <linearGradient id="localMapWash" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#f8fafc" />
                </linearGradient>
              </defs>
              <rect
                x="8"
                y="12"
                width="304"
                height="216"
                rx="18"
                fill="url(#localMapWash)"
                stroke="#cbd5e1"
              />
              {/* Stylized regional districts */}
              <path
                d="M36 48h96v72H36z"
                fill="#f1f5f9"
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
              <path
                d="M140 40h120v88H140z"
                fill="#0f172a"
                stroke="#0f172a"
                strokeWidth="1.5"
              />
              <path
                d="M48 132h200v68H48z"
                fill="#e2e8f0"
                stroke="#94a3b8"
                strokeWidth="1.5"
              />
              <circle cx="198" cy="86" r="10" fill="#059669" />
              <text
                x="198"
                y="90"
                textAnchor="middle"
                fill="#fff"
                fontSize="9"
                fontFamily="IBM Plex Mono, ui-monospace, monospace"
                fontWeight="700"
              >
                ★
              </text>
              <text
                x="200"
                y="68"
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="11"
                fontFamily="IBM Plex Sans, sans-serif"
                fontWeight="700"
              >
                TX-22
              </text>
              <text
                x="200"
                y="112"
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="9"
                fontFamily="IBM Plex Sans, sans-serif"
              >
                Katy focus
              </text>
              <text
                x="84"
                y="88"
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
                fontFamily="IBM Plex Sans, sans-serif"
                fontWeight="600"
              >
                TX-07
              </text>
              <text
                x="148"
                y="172"
                textAnchor="middle"
                fill="#64748b"
                fontSize="10"
                fontFamily="IBM Plex Sans, sans-serif"
                fontWeight="600"
              >
                TX-09
              </text>
            </svg>
          </div>
          <p className="mt-3 text-center font-['IBM_Plex_Mono','ui-monospace',monospace] text-xs font-semibold tracking-wide text-slate-600">
            {focusDistrict}
          </p>
        </section>
      </div>

      <section className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Funding allocation
          </p>
          <p className="mt-1 font-['IBM_Plex_Mono','ui-monospace',monospace] text-lg font-bold text-slate-900">
            {fundingLabel}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Focus district
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">{focusDistrict}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Regional impact
          </p>
          <p className="mt-1 text-lg font-bold text-emerald-700">{regionalImpact}</p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.04)] sm:p-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Localized impact
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

export default LocalTheme;
