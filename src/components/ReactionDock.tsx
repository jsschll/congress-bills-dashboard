import React, { useState } from "react";
import {
  DEFAULT_REACTIONS,
  type ReactionId,
  type ReactionOption,
} from "./types";

export type ReactionDockProps = {
  /** Currently selected reaction, if any. */
  selectedReaction?: ReactionId | null;
  /** Disable further taps after a vote is locked in. */
  disabled?: boolean;
  /** Optional override of the reaction set. */
  options?: readonly ReactionOption[];
  /**
   * Fires when the user taps a reaction.
   * Parent should update universal vote state; dock handles local press feedback.
   */
  onReact: (reactionId: ReactionId) => void;
  /** Optional theme token for matched chrome (editorial, bento, …). */
  theme?: string;
  className?: string;
};

/**
 * Anchored reaction action bar — sits below the theme body (not a floating overlay).
 * Vote totals and lock state live in ArticleCard.
 */
export function ReactionDock({
  selectedReaction = null,
  disabled = false,
  options = DEFAULT_REACTIONS,
  onReact,
  theme = "default",
  className = "",
}: ReactionDockProps) {
  const [pulseId, setPulseId] = useState<ReactionId | null>(null);

  const handleTap = (id: ReactionId) => {
    if (disabled) return;
    setPulseId(id);
    onReact(id);
    window.setTimeout(() => {
      setPulseId((current) => (current === id ? null : current));
    }, 280);
  };

  const isEditorial = theme === "editorial-collage";
  const isBento = theme === "bento-grid";

  return (
    <div
      className={[
        "a1-reaction-dock",
        "a1-reaction-dock--anchored",
        "relative z-10 mt-4 flex w-full items-center gap-2",
        "rounded-2xl px-2 py-2 sm:px-3",
        isBento
          ? "border border-slate-800 bg-slate-950 shadow-inner"
          : isEditorial
            ? "border border-[#E8D9C6] bg-[#FFFCF7] shadow-[0_6px_18px_rgba(28,20,16,0.06)]"
            : "border border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="toolbar"
      aria-label="Bill reactions"
      data-a1-shell="reaction-dock"
      data-theme={theme}
    >
      {options.map((option) => {
        const isSelected = selectedReaction === option.id;
        const isPulsing = pulseId === option.id;
        const isPass = option.id === "pass";
        const isKill = option.id === "kill";

        const bentoTone = isPass
          ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200 shadow-[0_0_14px_rgba(16,185,129,0.35)]"
          : isKill
            ? "border-rose-400/60 bg-rose-500/20 text-rose-200 shadow-[0_0_14px_rgba(244,63,94,0.35)]"
            : "border-slate-600 bg-slate-800 text-slate-200";

        const editorialTone =
          "border-[#D4B896] bg-[#F7EDE0] text-[#1C1410] font-['Fraunces',Georgia,serif]";

        const defaultTone = isSelected
          ? "border-slate-300 bg-slate-100 text-slate-900"
          : "border-slate-200 bg-slate-50 text-slate-800";

        return (
          <button
            key={option.id}
            type="button"
            disabled={disabled && !isSelected}
            aria-pressed={isSelected}
            aria-label={option.label}
            onClick={() => handleTap(option.id)}
            className={[
              "a1-reaction-btn",
              "group flex flex-1 flex-col items-center justify-center",
              "min-w-0 rounded-full px-2.5 py-2",
              "text-center transition-all duration-200 ease-out",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              isBento ? bentoTone : isEditorial ? editorialTone : defaultTone,
              isSelected ? "scale-105" : "",
              isPulsing ? "a1-reaction-btn--pulse scale-110" : "",
              disabled && !isSelected ? "opacity-50 cursor-not-allowed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="text-lg leading-none sm:text-xl" aria-hidden>
              {option.emoji}
            </span>
            <span
              className={[
                "mt-1 text-[10px] font-semibold tracking-wide sm:text-xs",
                isBento ? "text-inherit" : isEditorial ? "text-[#1C1410]/90" : "text-slate-700",
              ].join(" ")}
            >
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ReactionDock;
