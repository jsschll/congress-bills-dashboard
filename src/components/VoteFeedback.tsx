import React, { useEffect, useState } from "react";
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

/** Smooth Red (0%) → Yellow (50%) → Green (100%) from Pass %. */
export function passPctToColor(passPct: number) {
  const t = Math.max(0, Math.min(100, Number(passPct) || 0)) / 100;
  const hue = t * 120;
  const sat = 95;
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

export type VoteSideGaugeProps = {
  passPct: number;
  animate?: boolean;
  className?: string;
};

/** Glass thermometer Pass% gauge along the card inner right edge. */
export function VoteSideGauge({
  passPct,
  animate = true,
  className = "",
}: VoteSideGaugeProps) {
  const pct = clampPct(passPct);
  const killPct = 100 - pct;
  const color = passPctToColor(pct);
  const [ready, setReady] = useState(!animate);
  const [hasMounted, setHasMounted] = useState(!animate);

  useEffect(() => {
    if (!animate) {
      setReady(true);
      setHasMounted(true);
      return;
    }
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
        "vote-side-gauge",
        ready ? "is-ready" : "",
        animate ? "" : "is-settled",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="img"
      aria-label={`${pct}% Pass, ${killPct}% Kill`}
      data-pass-pct={pct}
      style={
        {
          ["--thermo-pct" as string]: `${fillPct}%`,
          ["--thermo-color" as string]: color,
        } as React.CSSProperties
      }
    >
      <div className="vote-side-gauge__tube">
        <span className="vote-side-gauge__ticks" aria-hidden="true" />
        <div className="vote-side-gauge__track">
          <span
            className="vote-side-gauge__fill"
            style={{ height: `${fillPct}%`, backgroundColor: color }}
          />
        </div>
        <span className="vote-side-gauge__shine" aria-hidden="true" />
      </div>
      <div className="vote-side-gauge__bulb" aria-hidden="true">
        <span
          className="vote-side-gauge__bulb-fluid"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/**
 * Bottom Pass%/Kill%/Change results bar removed — Pass % lives on the glass thermometer.
 * Kept as a no-op export so older call sites do not break.
 */
export function VoteFeedback(_props: VoteFeedbackProps) {
  return null;
}

export type VoteStampOverlayProps = {
  stance: VoteFeedbackStance | null;
};

/** Brief PASS IT / KILLED stamp overlay for the photo frame. */
export function VoteStampOverlay({ stance }: VoteStampOverlayProps) {
  if (!stance) return null;
  const isPass = stance === "pass";
  return (
    <div
      className={[
        "vote-feedback-stamp pointer-events-none absolute inset-0 z-20 grid place-items-center",
        "animate-[vote-stamp-in_0.38s_cubic-bezier(0.22,1.55,0.36,1)_both]",
      ].join(" ")}
      aria-hidden
    >
      <span
        className={[
          "inline-flex rotate-[-8deg] items-center justify-center rounded border-[3px] px-4 py-2",
          "font-['Fraunces',Georgia,serif] text-lg font-bold uppercase tracking-[0.08em] shadow-lg sm:text-xl",
          isPass
            ? "border-emerald-300 bg-emerald-900/90 text-emerald-50"
            : "border-rose-300 bg-rose-950/90 text-rose-50",
        ].join(" ")}
      >
        {isPass ? "PASS IT" : "KILLED"}
      </span>
    </div>
  );
}

export default VoteFeedback;
