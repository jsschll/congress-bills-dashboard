import React, { useEffect, useMemo, useState } from "react";
import type { ReactionId, VoteCounts } from "./types";

export type VoteFeedbackStance = "pass" | "kill";

export type VoteFeedbackProps = {
  /** User's committed vote. */
  stance: VoteFeedbackStance;
  /** Live community counts (pass/kill). */
  voteCounts?: Pick<VoteCounts, "pass" | "kill">;
  /** Animate bar fill from 0 → target on mount. */
  animate?: boolean;
  /** Optional change handler; hides Change when omitted. */
  onChange?: () => void;
  className?: string;
};

const STORAGE_KEY = "a1.feedVotes.v1";

function clampPct(value: number) {
  if (!Number.isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Smooth Red → Orange → Yellow → Green from Pass % (0–100). */
export function passPctToColor(passPct: number) {
  const t = Math.max(0, Math.min(100, Number(passPct) || 0)) / 100;
  const hue = t * 120;
  const sat = 92;
  const light = 48 + t * 4;
  return `hsl(${hue.toFixed(1)} ${sat}% ${light.toFixed(1)}%)`;
}

export function splitFromCounts(
  voteCounts?: Pick<VoteCounts, "pass" | "kill">,
  stance?: VoteFeedbackStance | null
) {
  const pass = Number(voteCounts?.pass) || 0;
  const kill = Number(voteCounts?.kill) || 0;
  const total = pass + kill;
  if (total <= 0) {
    const passPct = stance === "kill" ? 38 : 62;
    return { passPct, killPct: 100 - passPct, total: 1 };
  }
  const passPct = clampPct((pass / total) * 100);
  return { passPct, killPct: 100 - passPct, total };
}

export function readLocalFeedVote(billId: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const store = JSON.parse(raw) as Record<
      string,
      { stance?: string; passPct?: number; killPct?: number; total?: number }
    >;
    const entry = store?.[billId];
    if (!entry) return null;
    const stance =
      entry.stance === "oppose" || entry.stance === "kill"
        ? ("kill" as const)
        : entry.stance === "support" || entry.stance === "pass"
          ? ("pass" as const)
          : null;
    if (!stance) return null;
    return {
      stance,
      passPct: clampPct(Number(entry.passPct) || 50),
      killPct: clampPct(Number(entry.killPct) || 50),
      total: Number(entry.total) || 0,
    };
  } catch {
    return null;
  }
}

export function writeLocalFeedVote(
  billId: string,
  payload: {
    stance: VoteFeedbackStance;
    passPct: number;
    killPct: number;
    total?: number;
  }
) {
  if (!billId) return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const store = raw ? JSON.parse(raw) : {};
    store[billId] = {
      stance: payload.stance === "kill" ? "oppose" : "support",
      passPct: clampPct(payload.passPct),
      killPct: clampPct(payload.killPct),
      total: Number(payload.total) || 0,
      at: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

export function reactionIdToFeedbackStance(
  id: ReactionId | null | undefined
): VoteFeedbackStance | null {
  if (id === "pass") return "pass";
  if (id === "kill") return "kill";
  return null;
}

export type VoteThermoGaugeProps = {
  passPct: number;
  animate?: boolean;
  className?: string;
};

/** Slim vertical Pass% thermometer along the card inner edge. */
export function VoteThermoGauge({
  passPct,
  animate = true,
  className = "",
}: VoteThermoGaugeProps) {
  const pct = clampPct(passPct);
  const color = passPctToColor(pct);
  const [ready, setReady] = useState(!animate);
  const [hasMounted, setHasMounted] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      setReady(true);
      setHasMounted(true);
      return;
    }
    // First reveal grows from empty; later pct changes interpolate in place.
    if (!hasMounted) {
      setReady(false);
      const id = requestAnimationFrame(() => {
        setReady(true);
        setHasMounted(true);
      });
      return () => cancelAnimationFrame(id);
    }
    setReady(true);
  }, [animate, pct, color, hasMounted]);

  const fillPct = ready ? pct : 0;

  return (
    <div
      className={[
        "vote-thermo-gauge",
        ready ? "is-ready" : "",
        animate ? "" : "is-settled",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={`${pct}% Pass`}
      data-pass-pct={pct}
      style={
        {
          ["--thermo-pct" as string]: `${fillPct}%`,
          ["--thermo-color" as string]: color,
        } as React.CSSProperties
      }
    >
      <div className="vote-thermo-gauge__track">
        <span
          className="vote-thermo-gauge__fill"
          style={{ height: `${fillPct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/**
 * Post-vote choice row (no horizontal percentage track — thermo handles that).
 * Pair with card-level motion classes (`vote-motion--pass|kill`) from CSS.
 */
export function VoteFeedback({
  stance,
  voteCounts,
  animate = true,
  onChange,
  className = "",
}: VoteFeedbackProps) {
  const split = useMemo(
    () => splitFromCounts(voteCounts, stance),
    [voteCounts, stance]
  );

  const isPass = stance === "pass";

  return (
    <div
      className={[
        "vote-feedback-bar",
        "vote-feedback-bar--compact",
        "is-filled",
        animate ? "is-animating" : "is-settled",
        "w-full rounded-2xl border border-[#D4B896]/70 bg-[#FFFCF7] px-3 py-2.5 shadow-[0_8px_20px_rgba(28,20,16,0.06)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-user-stance={isPass ? "support" : "oppose"}
      role="status"
      aria-live="polite"
    >
      <div className="vote-feedback-bar__meta mt-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className={[
            "vote-feedback-bar__choice inline-flex items-center gap-1.5 text-sm font-bold",
            isPass ? "text-emerald-700" : "text-rose-700",
          ].join(" ")}
        >
          <span
            className={[
              "inline-grid h-4 w-4 place-items-center rounded-full text-[10px] text-white",
              isPass ? "bg-emerald-600" : "bg-rose-600",
            ].join(" ")}
            aria-hidden
          >
            ✓
          </span>
          {isPass ? "Pass It" : "Kill It"}
          <strong>{isPass ? split.passPct : split.killPct}%</strong>
        </span>
        <span className="text-xs text-stone-500">
          {isPass ? `${split.killPct}% Kill` : `${split.passPct}% Pass`}
        </span>
        {onChange ? (
          <button
            type="button"
            onClick={onChange}
            className="ml-auto rounded-full border border-stone-300/80 bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-stone-600 hover:border-stone-400 hover:text-stone-900"
          >
            Change
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type VoteStampOverlayProps = {
  stance: VoteFeedbackStance | null;
};

/** Brief PASS / KILLED stamp overlay for the photo frame. */
export function VoteStampOverlay({ stance }: VoteStampOverlayProps) {
  if (!stance) return null;
  const isPass = stance === "pass";
  return (
    <div
      className={[
        "vote-feedback-stamp pointer-events-none absolute inset-0 z-20 grid place-items-center",
        isPass ? "vote-feedback-stamp--pass" : "vote-feedback-stamp--kill",
      ].join(" ")}
      aria-hidden
    >
      <span
        className={[
          "vote-feedback-stamp__badge inline-flex items-center justify-center rounded border-[3px] px-4 py-2",
          "font-['Fraunces',Georgia,serif] text-lg font-bold uppercase tracking-[0.08em] sm:text-xl",
          isPass
            ? "border-emerald-300 bg-emerald-900/90 text-emerald-50"
            : "border-rose-300 bg-rose-950/90 text-rose-50",
        ].join(" ")}
      >
        {isPass ? "PASS" : "KILLED"}
      </span>
    </div>
  );
}

export default VoteFeedback;
