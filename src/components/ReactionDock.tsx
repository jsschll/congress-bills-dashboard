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
  className?: string;
};

/**
 * Universal floating glass reaction bar.
 * Frosted chrome only — vote totals and lock state live in ArticleCard.
 */
export function ReactionDock({
  selectedReaction = null,
  disabled = false,
  options = DEFAULT_REACTIONS,
  onReact,
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

  return (
    <div
      className={[
        "a1-reaction-dock",
        "fixed bottom-6 left-1/2 z-40 -translate-x-1/2",
        "flex items-center gap-1 sm:gap-2",
        "rounded-full px-2 py-2 sm:px-3",
        "backdrop-blur-xl bg-white/10 border border-white/10",
        "shadow-lg shadow-black/20",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      role="toolbar"
      aria-label="Bill reactions"
      data-a1-shell="reaction-dock"
    >
      {options.map((option) => {
        const isSelected = selectedReaction === option.id;
        const isPulsing = pulseId === option.id;

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
              "group flex flex-col items-center justify-center",
              "min-w-[3.25rem] sm:min-w-[4rem] rounded-full px-2.5 py-2",
              "text-center transition-all duration-200 ease-out",
              "hover:bg-white/15 focus-visible:outline focus-visible:outline-2",
              "focus-visible:outline-offset-2 focus-visible:outline-white/60",
              isSelected ? "bg-white/20 scale-105" : "bg-transparent",
              isPulsing ? "a1-reaction-btn--pulse scale-110" : "",
              disabled && !isSelected ? "opacity-50 cursor-not-allowed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="text-lg leading-none sm:text-xl" aria-hidden>
              {option.emoji}
            </span>
            <span className="mt-1 text-[10px] font-semibold tracking-wide text-white/90 sm:text-xs">
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default ReactionDock;
