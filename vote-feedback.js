/**
 * Pass It / Kill It vote motion + glass thermometer Pass% gauge.
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
      card.querySelector(".a1-story-card__frame") ||
      card.querySelector(".a1-story-card__media") ||
      card.querySelector(".a1-editorial__frame") ||
      card.querySelector(".a1-theme") ||
      card.querySelector(".a1-card-shell") ||
      card
    );
  }

  function findSideGaugeHost(card) {
    if (!card) return null;
    return (
      card.querySelector(".a1-story-card") ||
      card.querySelector(".a1-card-shell") ||
      card.querySelector(".a1-article-card") ||
      card
    );
  }

  /**
   * Smooth Red (0%) → Yellow (50%) → Green (100%) from Pass %.
   * Hue walks 0° (red) → 120° (green) in HSL.
   */
  function passPctToColor(passPct) {
    const t = Math.max(0, Math.min(100, Number(passPct) || 0)) / 100;
    const hue = t * 120;
    const sat = 95;
    const light = 48 + t * 4;
    return `hsl(${hue.toFixed(1)} ${sat}% ${light.toFixed(1)}%)`;
  }

  function applySideGaugeFill(gauge, pct, { animate = true, fromZero = false } = {}) {
    if (!gauge) return;
    const fill = gauge.querySelector(".vote-side-gauge__fill");
    const bulb = gauge.querySelector(".vote-side-gauge__bulb-fluid");
    const color = passPctToColor(pct);
    const kill = 100 - pct;
    gauge.setAttribute("aria-label", `${pct}% Pass, ${kill}% Kill`);
    gauge.dataset.passPct = String(pct);
    gauge.classList.remove("is-settled");

    const applyTarget = () => {
      gauge.style.setProperty("--thermo-pct", `${pct}%`);
      gauge.style.setProperty("--thermo-color", color);
      if (fill) {
        fill.style.height = `${pct}%`;
        fill.style.backgroundColor = color;
      }
      if (bulb) bulb.style.backgroundColor = color;
      gauge.classList.add("is-ready");
    };

    if (!animate) {
      applyTarget();
      gauge.classList.add("is-settled");
      return;
    }

    if (fromZero || !gauge.classList.contains("is-ready")) {
      gauge.classList.remove("is-ready");
      gauge.style.setProperty("--thermo-pct", "0%");
      if (fill) fill.style.height = "0%";
      void gauge.offsetWidth;
      requestAnimationFrame(applyTarget);
      return;
    }

    requestAnimationFrame(applyTarget);
  }

  function buildSideGaugeHtml(passPct = 0) {
    const pct = clampPct(passPct);
    const kill = 100 - pct;
    const color = passPctToColor(pct);
    return `
      <div
        class="vote-side-gauge"
        role="img"
        aria-label="${pct}% Pass, ${kill}% Kill"
        data-pass-pct="${pct}"
        style="--thermo-pct:${pct}%; --thermo-color:${color};"
      >
        <div class="vote-side-gauge__tube">
          <span class="vote-side-gauge__ticks" aria-hidden="true"></span>
          <div class="vote-side-gauge__track">
            <span
              class="vote-side-gauge__fill"
              style="height:${pct}%; background-color:${color};"
            ></span>
          </div>
          <span class="vote-side-gauge__shine" aria-hidden="true"></span>
        </div>
        <div class="vote-side-gauge__bulb" aria-hidden="true">
          <span
            class="vote-side-gauge__bulb-fluid"
            style="background-color:${color};"
          ></span>
        </div>
      </div>
    `;
  }

  function mountOrUpdateSideGauge(cardOrEl, passPct, { animate = true } = {}) {
    const card = findCardRoot(cardOrEl);
    const host = findSideGaugeHost(card);
    if (!host) return null;
    const pct = clampPct(passPct);
    let gauge = host.querySelector(":scope > .vote-side-gauge");
    if (!gauge) gauge = host.querySelector(".vote-side-gauge");
    const isNew = !gauge;
    if (!gauge) {
      host.insertAdjacentHTML(
        "beforeend",
        buildSideGaugeHtml(animate ? 0 : pct)
      );
      gauge = host.querySelector(".vote-side-gauge");
      const prior = host.style.position;
      if (!prior || prior === "static") host.style.position = "relative";
    } else if (!gauge.querySelector(".vote-side-gauge__tube")) {
      // Upgrade legacy slim-bar markup in place.
      const next = document.createElement("div");
      next.innerHTML = buildSideGaugeHtml(animate ? 0 : pct);
      const upgraded = next.firstElementChild;
      if (upgraded) {
        gauge.replaceWith(upgraded);
        gauge = upgraded;
      }
    }
    if (!gauge) return null;

    applySideGaugeFill(gauge, pct, {
      animate,
      fromZero: isNew && animate,
    });
    return gauge;
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

  /**
   * Bottom Pass%/Kill%/Change results bar removed — thermometer owns Pass %.
   * Kept as a no-op HTML builder for older call sites.
   */
  function buildPostVoteBarHtml() {
    return "";
  }

  function mountPostVoteBar(container, options = {}) {
    if (container) {
      container.hidden = true;
      container.classList.remove("vote-feedback-panel", "is-support", "is-oppose");
      container.innerHTML = "";
    }
    const card = findCardRoot(container);
    if (card) {
      mountOrUpdateSideGauge(card, options.passPct, {
        animate: options.animate !== false,
      });
    }
    return null;
  }

  /**
   * Apply post-vote UI: keep Pass/Kill buttons clean, drive the glass thermometer.
   * Horizontal percentage results bar is intentionally omitted.
   */
  function applyPostVoteState(roots, item, stance, split, { animate = true } = {}) {
    if (!roots) return;

    const passPct = split?.passPct ?? 62;
    const killPct = split?.killPct ?? 38;
    setLocalVote(item, {
      stance,
      passPct,
      killPct,
      total: split?.total || 0,
    });

    const stances = roots.stancesEl;
    const panel = roots.loggedPanel;
    const supportBtn = roots.supportBtn;
    const opposeBtn = roots.opposeBtn;

    // Keep the Pass/Kill row visible and free of percentage overlays.
    if (stances) stances.hidden = false;
    if (panel) {
      panel.hidden = true;
      panel.classList.remove("vote-feedback-panel", "is-support", "is-oppose");
      panel.innerHTML = "";
    }

    if (supportBtn) {
      supportBtn.textContent =
        supportBtn.dataset.liveLabel || roots.supportLabel || "👍 PASS IT";
      supportBtn.classList.toggle("is-active", stance === "support");
      supportBtn.classList.remove("is-logged", "is-dimmed");
      supportBtn.setAttribute("aria-pressed", String(stance === "support"));
    }
    if (opposeBtn) {
      opposeBtn.textContent =
        opposeBtn.dataset.liveLabel || roots.opposeLabel || "👎 KILL IT";
      opposeBtn.classList.toggle("is-active", stance === "oppose");
      opposeBtn.classList.remove("is-logged", "is-dimmed");
      opposeBtn.setAttribute("aria-pressed", String(stance === "oppose"));
    }

    const card = roots.root || roots.card || findCardRoot(stances || panel);
    mountOrUpdateSideGauge(card, passPct, { animate });
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
    passPctToColor,
    buildSideGaugeHtml,
    mountOrUpdateSideGauge,
  };
});
