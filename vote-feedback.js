/**
 * Pass It / Kill It vote motion + post-vote ratio bar (Phase 1 gamification).
 * Dual export: browser global `VoteFeedback` + CommonJS.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (typeof root === "object" && root !== null) {
    root.VoteFeedback = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const STORAGE_KEY = "a1.feedVotes.v1";
  const MOTION_MS = 720;
  const STAMP_MS = 900;

  function asString(value) {
    return String(value == null ? "" : value).trim();
  }

  function voteKey(itemOrId) {
    if (itemOrId && typeof itemOrId === "object") {
      return asString(
        itemOrId.id ||
          itemOrId.billId ||
          itemOrId.bill_id ||
          itemOrId.roll_call_id ||
          itemOrId.billNumber ||
          itemOrId.bill_number ||
          ""
      );
    }
    return asString(itemOrId);
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeStore(store) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* quota / private mode */
    }
  }

  function getLocalVote(itemOrId) {
    const key = voteKey(itemOrId);
    if (!key) return null;
    const entry = readStore()[key];
    if (!entry || (entry.stance !== "support" && entry.stance !== "oppose")) {
      return null;
    }
    return {
      stance: entry.stance,
      passPct: clampPct(entry.passPct),
      killPct: clampPct(entry.killPct),
      total: Number(entry.total) || 0,
      at: entry.at || null,
    };
  }

  function setLocalVote(itemOrId, payload = {}) {
    const key = voteKey(itemOrId);
    if (!key) return null;
    const stance = payload.stance === "oppose" ? "oppose" : "support";
    const passPct = clampPct(payload.passPct);
    const killPct =
      payload.killPct != null ? clampPct(payload.killPct) : 100 - passPct;
    const entry = {
      stance,
      passPct,
      killPct,
      total: Number(payload.total) || 0,
      at: new Date().toISOString(),
    };
    const store = readStore();
    store[key] = entry;
    writeStore(store);
    return entry;
  }

  function clearLocalVote(itemOrId) {
    const key = voteKey(itemOrId);
    if (!key) return;
    const store = readStore();
    if (store[key]) {
      delete store[key];
      writeStore(store);
    }
  }

  function clampPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  /**
   * Derive community split for the bar. Prefer live community stats, then
   * roll-call style results, then a seeded split that includes the user vote.
   */
  function resolveSplit(item = {}, community = null, userStance = null) {
    let total = 0;
    let support = 0;
    let hasData = false;

    if (community && Number(community.total) > 0) {
      total = Number(community.total) || 0;
      support = Number(community.support) || 0;
      hasData = total > 0;
    } else {
      const result = asString(
        item.result || item.statusLabel || item.vote_result || ""
      );
      const roll = result.match(/(\d{1,4})\s*[-–—to]+\s*(\d{1,4})/i);
      if (roll) {
        const yea = Number(roll[1]);
        const nay = Number(roll[2]);
        total = yea + nay;
        support = yea;
        hasData = total > 0;
      }
    }

    const local = getLocalVote(item);
    if (!hasData && local && local.total > 0) {
      total = local.total;
      support = Math.round((local.passPct / 100) * total);
      hasData = true;
    }

    if (!hasData || total <= 0) {
      // Soft placeholder split so the bar still animates after a first vote.
      const passPct =
        userStance === "oppose" ? 42 : userStance === "support" ? 58 : 50;
      return {
        passPct,
        killPct: 100 - passPct,
        total: 1,
        hasData: Boolean(userStance),
      };
    }

    // Include the user's vote in community totals when the RPC hasn't caught up.
    if (userStance === "support") {
      support += 1;
      total += 1;
    } else if (userStance === "oppose") {
      total += 1;
    }

    const passPct = clampPct((support / total) * 100);
    return {
      passPct,
      killPct: 100 - passPct,
      total,
      hasData: true,
    };
  }

  function findCardRoot(fromEl) {
    if (!fromEl) return null;
    return (
      fromEl.closest?.(".a1-themed-card") ||
      fromEl.closest?.(".feed-social-card") ||
      fromEl.closest?.(".policy-bill-card") ||
      fromEl.closest?.("article") ||
      fromEl
    );
  }

  function findStampHost(card) {
    if (!card) return null;
    return (
      card.querySelector(".a1-editorial__frame") ||
      card.querySelector(".a1-theme") ||
      card.querySelector(".a1-card-shell") ||
      card
    );
  }

  function clearMotionClasses(card) {
    if (!card) return;
    card.classList.remove(
      "vote-motion",
      "vote-motion--pass",
      "vote-motion--kill",
      "is-vote-burst"
    );
  }

  /**
   * Card ring burst + bounce/shake + stamp overlay on the photo/frame.
   */
  function playVoteMotion(cardOrEl, stance) {
    const card = findCardRoot(cardOrEl);
    if (!card) return;
    const isPass = stance === "support" || stance === "pass" || stance === "yea";
    const mode = isPass ? "pass" : "kill";

    clearMotionClasses(card);
    // Force reflow so re-triggering the same vote restarts animations.
    void card.offsetWidth;
    card.classList.add("vote-motion", `vote-motion--${mode}`, "is-vote-burst");

    const host = findStampHost(card);
    if (host) {
      host.querySelectorAll(".vote-feedback-stamp").forEach((node) => node.remove());
      const stamp = document.createElement("div");
      stamp.className = `vote-feedback-stamp vote-feedback-stamp--${mode}`;
      stamp.setAttribute("aria-hidden", "true");
      stamp.innerHTML = isPass
        ? `<span class="vote-feedback-stamp__badge">PASS IT</span>`
        : `<span class="vote-feedback-stamp__badge">KILLED</span>`;
      const prior = host.style.position;
      if (!prior || prior === "static") host.style.position = "relative";
      host.appendChild(stamp);
      window.setTimeout(() => {
        stamp.classList.add("is-leaving");
        window.setTimeout(() => stamp.remove(), 220);
      }, STAMP_MS);
    }

    window.setTimeout(() => {
      card.classList.remove("is-vote-burst");
    }, MOTION_MS);
  }

  function buildPostVoteBarHtml({
    stance,
    passPct,
    killPct,
    animate = true,
    showChange = true,
  } = {}) {
    const isPass = stance === "support" || stance === "pass";
    const pass = clampPct(passPct);
    const kill = clampPct(killPct != null ? killPct : 100 - pass);
    return `
      <div
        class="vote-feedback-bar ${animate ? "is-animating" : "is-settled"}"
        data-user-stance="${isPass ? "support" : "oppose"}"
        role="status"
        aria-live="polite"
      >
        <div
          class="vote-feedback-bar__track"
          role="img"
          aria-label="${pass}% Pass, ${kill}% Kill"
        >
          <span class="vote-feedback-bar__fill vote-feedback-bar__fill--pass" style="--target-width:${pass}%"></span>
          <span class="vote-feedback-bar__fill vote-feedback-bar__fill--kill" style="--target-width:${kill}%"></span>
        </div>
        <div class="vote-feedback-bar__meta">
          <span class="vote-feedback-bar__choice ${
            isPass ? "is-pass" : "is-kill"
          }">
            <span class="vote-feedback-bar__check" aria-hidden="true">✓</span>
            ${isPass ? "Pass It" : "Kill It"}
            <strong>${isPass ? pass : kill}%</strong>
          </span>
          <span class="vote-feedback-bar__other">
            ${isPass ? `${kill}% Kill` : `${pass}% Pass`}
          </span>
          ${
            showChange
              ? `<button type="button" class="policy-engage__change vote-feedback-bar__change">Change</button>`
              : ""
          }
        </div>
      </div>
    `;
  }

  function mountPostVoteBar(container, options = {}) {
    if (!container) return null;
    container.hidden = false;
    container.innerHTML = buildPostVoteBarHtml(options);
    const bar = container.querySelector(".vote-feedback-bar");
    if (bar && options.animate !== false) {
      requestAnimationFrame(() => {
        bar.classList.add("is-filled");
      });
    } else if (bar) {
      bar.classList.add("is-filled", "is-settled");
    }
    return bar;
  }

  /**
   * Apply post-vote UI into engagement roots (hides action buttons).
   */
  function applyPostVoteState(roots, item, stance, split, { animate = true } = {}) {
    if (!roots) return;
    const stances = roots.stancesEl;
    const panel = roots.loggedPanel;
    if (stances) stances.hidden = true;
    if (!panel) return;

    const passPct = split?.passPct ?? 62;
    const killPct = split?.killPct ?? 38;
    setLocalVote(item, {
      stance,
      passPct,
      killPct,
      total: split?.total || 0,
    });

    panel.hidden = false;
    panel.classList.toggle("is-support", stance === "support");
    panel.classList.toggle("is-oppose", stance === "oppose");
    panel.classList.add("vote-feedback-panel");
    mountPostVoteBar(panel, {
      stance,
      passPct,
      killPct,
      animate,
      showChange: true,
    });

    panel.querySelector(".policy-engage__change")?.addEventListener("click", () => {
      roots.changeMode = true;
      if (typeof roots.reapplyLoggedUI === "function") {
        roots.reapplyLoggedUI(stance);
      }
    });
  }

  return {
    STORAGE_KEY,
    getLocalVote,
    setLocalVote,
    clearLocalVote,
    resolveSplit,
    playVoteMotion,
    buildPostVoteBarHtml,
    mountPostVoteBar,
    applyPostVoteState,
    findCardRoot,
  };
});
