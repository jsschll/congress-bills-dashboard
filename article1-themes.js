/**
 * Article 1 theme engine for the live vanilla feed.
 * Mirrors ThemeWrapper routing + Themes 1–6 visuals so production cards
 * show Editorial / Bento / Pipeline / Influence / Local / Versus layouts.
 */
(function (global) {
  const FINANCE_RE =
    /\b(finance|financial|budget|budgets|economy|economic|fiscal|trade|appropriations?|treasury|tax|taxes|revenue|deficit|debt|commerce|banking|securities)\b/i;
  const PROCEDURAL_RE =
    /\b(procedural|authorization|tracker|tracking|floor\s*debate|floor\s*action|chamber\s*vote|final\s*(action|passage)|cloture|pipeline|conference\s*report|veto\s*override)\b/i;
  const INFLUENCE_RE =
    /\b(regulatory|regulation|lobbying|lobbyist|stakeholder(\s+map)?|influence(\s+network)?|donor|pac)\b/i;
  const LOCAL_RE =
    /\b(local|district[-\s]?specific|infrastructure|district\s+impact|regional\s+impact|katy|tx[-\s]?22)\b/i;
  const VERSUS_RE =
    /\b(comparison|amendment|versus|vs\.?|side[-\s]?by[-\s]?side|original\s+text)\b/i;

  const SUPPORT = "#059669";
  const OPPOSE = "#e11d48";

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function asList(value) {
    if (Array.isArray(value)) return value.map((v) => String(v || "").trim()).filter(Boolean);
    const single = String(value || "").trim();
    return single ? [single] : [];
  }

  function collectSignals(item = {}) {
    return [
      item.primaryCategory,
      item.primary_category,
      item.category,
      item.subjectCategory,
      item.policyArea,
      item.policy_area,
      item.statusLabel,
      item.status_label,
      item.voteKind,
      item.vote_kind,
      item.voteQuestion,
      item.vote_question,
      item.status?.stepName,
      item.title,
      item.short_title,
      item.shortTitle,
      item.summary,
      item.plain_summary,
      ...asList(item.tags),
      ...asList(item.subject),
      ...asList(item.subjects),
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(" ");
  }

  function resolveTheme(item = {}) {
    const explicit = String(
      item.themeVariant || item.theme_variant || item.themeRoute || ""
    ).trim();
    if (explicit === "versus") return "versus";
    if (explicit === "local") return "local";
    if (explicit === "influence") return "influence";
    if (explicit === "pipeline" || explicit === "urgent") return "pipeline";
    if (explicit === "bento-grid" || explicit === "fiscal") return "bento-grid";
    if (explicit === "editorial-collage") return "editorial-collage";

    if (
      (Array.isArray(item.versusClauses) && item.versusClauses.length) ||
      (Array.isArray(item.versus_clauses) && item.versus_clauses.length)
    ) {
      return "versus";
    }
    if (Array.isArray(item.districts) && item.districts.length) {
      return "local";
    }
    if (Array.isArray(item.stakeholders) && item.stakeholders.length) {
      return "influence";
    }

    const signals = collectSignals(item);
    if (VERSUS_RE.test(signals)) return "versus";
    if (LOCAL_RE.test(signals)) return "local";
    if (INFLUENCE_RE.test(signals)) return "influence";
    if (PROCEDURAL_RE.test(signals)) return "pipeline";
    if (FINANCE_RE.test(signals)) return "bento-grid";
    return "editorial-collage";
  }

  function themeLabel(theme) {
    if (theme === "bento-grid") return "Bento Grid";
    if (theme === "pipeline") return "Procedural Pipeline";
    if (theme === "influence") return "Influence Network";
    if (theme === "local") return "Local Impact";
    if (theme === "versus") return "Versus Comparison";
    return "Editorial Collage";
  }

  /** When false, theme detail HTML omits bookmark/share + Pass/Kill dock (drawer mode). */
  let includeChrome = true;

  function withChrome(enabled, fn) {
    const prev = includeChrome;
    includeChrome = enabled !== false;
    try {
      return fn();
    } finally {
      includeChrome = prev;
    }
  }

  function keyImpacts(item = {}, impacts = {}) {
    const fromItem = asList(
      item.key_impacts || item.keyImpacts || item.key_points || item.keyPoints
    );
    if (fromItem.length) return fromItem.slice(0, 4);
    const chips = Array.isArray(impacts.chips)
      ? impacts.chips.map((c) => c.label).filter(Boolean)
      : [];
    if (chips.length) return chips.slice(0, 4);
    const what = String(impacts.what || "").trim();
    return what ? [what] : [];
  }

  function normalizeCopyLine(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Drop exact duplicate lines so summary + bullets never repeat the same text. */
  function dedupeCopyLines(lines = [], exclude = []) {
    const seen = new Set(
      exclude.map((line) => normalizeCopyLine(line).toLowerCase()).filter(Boolean)
    );
    const out = [];
    for (const raw of lines) {
      const line = normalizeCopyLine(raw);
      if (!line) continue;
      const key = line.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(line);
    }
    return out;
  }

  function resolveCardCopy(item = {}, opts = {}) {
    const impacts = opts.impacts || {};
    const title = normalizeCopyLine(
      opts.title || item.short_title || item.shortTitle || item.title || "Legislation"
    );
    const rawImpacts = keyImpacts(item, impacts);
    const altSummaries = [
      opts.summary,
      item.whatItDoes,
      item.what_it_does,
      item.plain_summary,
      item.plainSummary,
      item.shortPitch,
      item.short_pitch,
      impacts.what,
      title,
    ].map(normalizeCopyLine).filter(Boolean);

    // Prefer a summary that is not just a repeat of the first key impact.
    let summary =
      altSummaries.find(
        (line) =>
          !rawImpacts.some((impact) => impact.toLowerCase() === line.toLowerCase())
      ) || altSummaries[0] || title;

    const impactsList = dedupeCopyLines(rawImpacts, [summary, title]).slice(0, 2);
    return { title, summary, impactsList };
  }

  function reactionDockHtml() {
    if (!includeChrome) return "";
    return `
      <div class="a1-reaction-dock a1-reaction-dock--anchored" role="toolbar" aria-label="Bill reactions">
        <div class="engagement-mount-point" aria-label="Your stance"></div>
      </div>
    `;
  }

  function microActionsHtml() {
    if (!includeChrome) return "";
    return `
      <div class="a1-micro-actions" aria-label="Card actions">
        <button type="button" class="feed-card-icon-btn feed-card-bookmark" aria-label="Bookmark this bill" aria-pressed="false" title="Bookmark">🔖</button>
        <button type="button" class="feed-card-icon-btn feed-card-share" aria-label="Share" title="Share">📤</button>
      </div>
    `;
  }

  function resolveHeroImage(item = {}, { title = "", category = "", summary = "", impactsList = [] } = {}) {
    const mapper =
      typeof globalThis !== "undefined" && globalThis.BillImageMapper
        ? globalThis.BillImageMapper
        : typeof window !== "undefined" && window.BillImageMapper
          ? window.BillImageMapper
          : null;
    const resolvedImage =
      mapper && typeof mapper.resolveBillImage === "function"
        ? mapper.resolveBillImage({
            ...item,
            title,
            category,
            tags: item.tags,
            summary: summary || item.summary,
            keyImpacts: impactsList,
            key_impacts: impactsList,
          })
        : null;
    const defaultStockUrl =
      (mapper && mapper.DEFAULT_STOCK && mapper.DEFAULT_STOCK.url) ||
      "https://images.unsplash.com/photo-1555848962-6e79363ec58f?auto=format&fit=crop&w=1400&q=80";
    const imageSrc = String(
      item.imageSrc ||
        item.image_src ||
        item.imageUrl ||
        item.image_url ||
        item.photoUrl ||
        item.photo_url ||
        (resolvedImage && resolvedImage.url) ||
        defaultStockUrl
    ).trim();
    const imageAlt = String(
      item.imageAlt ||
        item.image_alt ||
        (resolvedImage && resolvedImage.alt) ||
        title ||
        "Legislation"
    ).trim();
    return { imageSrc, imageAlt, defaultStockUrl };
  }

  function punchLine({ summary = "", impactsList = [], title = "" } = {}) {
    const firstImpact = normalizeCopyLine(impactsList[0] || "");
    const line = normalizeCopyLine(firstImpact || summary || title);
    if (line.length <= 110) return line;
    return `${line.slice(0, 107).replace(/\s+\S*$/, "").trim()}…`;
  }

  function renderThemeDetail(theme, payload) {
    return withChrome(false, () => {
      if (theme === "versus") return renderVersus(payload);
      if (theme === "local") return renderLocal(payload);
      if (theme === "bento-grid") return renderBento(payload);
      if (theme === "pipeline") return renderPipeline(payload);
      if (theme === "influence") return renderInfluence(payload);
      return renderEditorial(payload);
    });
  }

  /** Pass % → mercury color: Red (0°) → Yellow (60°) → Green (120°). */
  function passPctToThermoColor(passPct) {
    const t = Math.max(0, Math.min(100, Number(passPct) || 0)) / 100;
    return `hsl(${(t * 120).toFixed(1)} 90% 50%)`;
  }

  function clampThermoPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 50;
    return Math.max(0, Math.min(100, Math.round(n)));
  }

  /**
   * Glass thermometer markup for the story card’s right inner edge.
   * Fill is driven by --thermo-pct / --thermo-color (synced after votes).
   */
  function glassThermometerHtml(passPct = null) {
    const hasPct = passPct != null && Number.isFinite(Number(passPct));
    const pct = hasPct ? clampThermoPct(passPct) : 0;
    const color = hasPct
      ? passPctToThermoColor(pct)
      : "rgba(248, 250, 252, 0.35)";
    const ticks = [0, 25, 50, 75, 100]
      .map(
        (tick) => `
          <span
            class="a1-glass-thermo__tick${tick % 50 === 0 ? " is-major" : ""}"
            style="bottom:${tick}%"
            aria-hidden="true"
          ></span>`
      )
      .join("");

    return `
      <div
        class="a1-glass-thermo${hasPct ? " is-ready is-settled" : ""}"
        role="img"
        aria-label="${hasPct ? `${pct}% Pass` : "Pass percentage"}"
        data-pass-pct="${hasPct ? pct : ""}"
        style="--thermo-pct:${pct}%; --thermo-color:${color};"
      >
        <div class="a1-glass-thermo__tube">
          <div class="a1-glass-thermo__ticks">${ticks}</div>
          <span class="a1-glass-thermo__mercury" style="height:${pct}%; background-color:${color};"></span>
        </div>
        <span class="a1-glass-thermo__bulb" style="background-color:${color};" aria-hidden="true"></span>
      </div>
    `;
  }

  function applyGlassThermoFill(gauge, passPct, { animate = true } = {}) {
    if (!gauge) return;
    const pct = clampThermoPct(passPct);
    const color = passPctToThermoColor(pct);
    const mercury = gauge.querySelector(".a1-glass-thermo__mercury");
    const bulb = gauge.querySelector(".a1-glass-thermo__bulb");

    gauge.setAttribute("aria-label", `${pct}% Pass`);
    gauge.dataset.passPct = String(pct);

    const paint = () => {
      gauge.style.setProperty("--thermo-pct", `${pct}%`);
      gauge.style.setProperty("--thermo-color", color);
      if (mercury) {
        mercury.style.height = `${pct}%`;
        mercury.style.backgroundColor = color;
      }
      if (bulb) bulb.style.backgroundColor = color;
      gauge.classList.add("is-ready");
    };

    if (!animate) {
      paint();
      gauge.classList.add("is-settled");
      return;
    }

    if (!gauge.classList.contains("is-ready")) {
      gauge.classList.remove("is-ready");
      gauge.style.setProperty("--thermo-pct", "0%");
      if (mercury) mercury.style.height = "0%";
      void gauge.offsetWidth;
      requestAnimationFrame(paint);
      return;
    }

    requestAnimationFrame(paint);
  }

  function findStoryCardRoot(fromEl) {
    if (!fromEl) return null;
    return (
      fromEl.closest?.(".a1-themed-card") ||
      fromEl.closest?.(".feed-story-card") ||
      fromEl.closest?.(".feed-social-card") ||
      fromEl.closest?.(".a1-story-card") ||
      fromEl
    );
  }

  function readPassPctFromCard(card) {
    if (!card) return null;
    const root = findStoryCardRoot(card) || card;
    const local =
      global.VoteFeedback?.getLocalVote?.(root) ||
      global.VoteFeedback?.getLocalVote?.(
        root.getAttribute?.("data-bill-id") ||
          root.getAttribute?.("data-id") ||
          root.id ||
          ""
      );
    if (local && local.passPct != null) return clampThermoPct(local.passPct);

    const track = root.querySelector?.(".vote-feedback-bar__track[aria-label]");
    const label = track?.getAttribute("aria-label") || "";
    const match = label.match(/(\d+)\s*%\s*Pass/i);
    if (match) return clampThermoPct(match[1]);

    const passFill = root.querySelector?.(
      ".vote-feedback-bar__fill--pass"
    );
    if (passFill) {
      const width = String(
        passFill.style.getPropertyValue("--target-width") || ""
      )
        .replace("%", "")
        .trim();
      if (width) return clampThermoPct(width);
    }
    return null;
  }

  function syncGlassThermoOnCard(card, { animate = true } = {}) {
    if (!card) return;
    const root = findStoryCardRoot(card) || card;
    const host =
      root.querySelector?.(".a1-story-card") ||
      root.querySelector?.(".a1-card-shell--story") ||
      root;
    const gauge = host.querySelector?.(".a1-glass-thermo");
    if (!gauge) return;
    const pct = readPassPctFromCard(root);
    if (pct == null) return;
    applyGlassThermoFill(gauge, pct, { animate });
  }

  let thermoObserverStarted = false;
  function ensureGlassThermoObserver() {
    if (thermoObserverStarted || typeof document === "undefined") return;
    thermoObserverStarted = true;

    const refresh = (root) => {
      const cards = (root || document).querySelectorAll?.(
        ".a1-story-card, .a1-themed-card, .feed-story-card"
      );
      cards?.forEach((card) => {
        const host = card.classList?.contains("a1-story-card")
          ? card
          : card.querySelector?.(".a1-story-card") || card;
        syncGlassThermoOnCard(host.closest?.(".a1-themed-card") || host, {
          animate: true,
        });
      });
    };

    document.addEventListener(
      "click",
      (event) => {
        const btn = event.target?.closest?.(
          ".policy-engage__stance, .policy-engage__change, .vote-feedback-bar__change"
        );
        if (!btn) return;
        const card =
          btn.closest(".a1-themed-card") ||
          btn.closest(".feed-social-card") ||
          btn.closest(".a1-story-card");
        if (!card) return;
        window.setTimeout(() => syncGlassThermoOnCard(card, { animate: true }), 40);
        window.setTimeout(() => syncGlassThermoOnCard(card, { animate: true }), 320);
      },
      true
    );

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const node = mutation.target;
        if (!(node instanceof Element)) continue;
        if (
          node.classList?.contains("vote-feedback-bar") ||
          node.classList?.contains("vote-feedback-panel") ||
          node.querySelector?.(".vote-feedback-bar, .a1-glass-thermo")
        ) {
          const card =
            node.closest(".a1-themed-card") ||
            node.closest(".feed-social-card") ||
            node.closest(".a1-story-card");
          if (card) syncGlassThermoOnCard(card, { animate: true });
        }
      }
    });

    const start = () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "aria-label", "hidden"],
      });
      refresh(document);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
      start();
    }
  }

  /**
   * Instagram/TikTok-style story peek: fixed-height hero + overlay type + vote dock.
   * Dense theme layouts live in the breakdown drawer template.
   */
  function renderStoryPeek(payload, theme, label) {
    const { billId, title, category, impactsList, summary, item } = payload;
    const { imageSrc, imageAlt, defaultStockUrl } = resolveHeroImage(item, {
      title,
      category,
      summary,
      impactsList,
    });
    const punch = punchLine({ summary, impactsList, title });
    const second =
      impactsList[1] && normalizeCopyLine(impactsList[1]) !== punch
        ? normalizeCopyLine(impactsList[1])
        : "";

    // Theme name badge intentionally omitted — category + bill id only.
    void label;
    ensureGlassThermoObserver();

    return `
      <div class="a1-story-card" data-theme="${escapeHtml(theme)}">
        <div class="a1-story-card__media a1-story-card__frame">
          <img
            class="a1-story-card__photo"
            src="${escapeHtml(imageSrc)}"
            alt="${escapeHtml(imageAlt)}"
            loading="lazy"
            decoding="async"
            data-fallback-src="${escapeHtml(defaultStockUrl)}"
            onerror="(function(img){var fb=img.getAttribute('data-fallback-src');if(fb&&img.src!==fb&&!img.dataset.triedFallback){img.dataset.triedFallback='1';img.src=fb;return;}img.classList.add('is-broken');img.removeAttribute('src');})(this);"
          />
          <div class="a1-story-card__scrim" aria-hidden="true"></div>
          <div class="a1-story-card__top">
            <div class="a1-story-card__pills">
              <span class="a1-story-card__pill a1-story-card__pill--cat">${escapeHtml(
                category || "Congress"
              )}</span>
              <span class="a1-story-card__pill a1-story-card__pill--id">${escapeHtml(
                billId
              )}</span>
            </div>
            ${microActionsHtml()}
          </div>
          <div class="a1-story-card__copy">
            <h3 class="a1-story-card__title">${escapeHtml(title)}</h3>
            <p class="a1-story-card__punch">${escapeHtml(punch)}</p>
            ${
              second
                ? `<p class="a1-story-card__punch a1-story-card__punch--secondary">${escapeHtml(
                    second
                  )}</p>`
                : ""
            }
          </div>
          ${glassThermometerHtml(null)}
        </div>
        <div class="a1-story-card__footer">
          <button type="button" class="a1-story-card__breakdown" data-feed-breakdown="1">
            <span aria-hidden="true">↕</span>
            Tap for Full Breakdown / AI Summary
          </button>
          ${reactionDockHtml()}
        </div>
      </div>
    `;
  }

  function renderEditorial({ billId, title, category, impactsList, summary, item }) {
    const bullets = impactsList
      .map(
        (impact) => `
        <li class="a1-editorial__impact">
          <span class="a1-editorial__bullet" aria-hidden="true"></span>
          <span>${escapeHtml(impact)}</span>
        </li>`
      )
      .join("");

    const { imageSrc, imageAlt, defaultStockUrl } = resolveHeroImage(item, {
      title,
      category,
      summary,
      impactsList,
    });

    const artInner = `<img
            class="a1-editorial__photo"
            src="${escapeHtml(imageSrc)}"
            alt="${escapeHtml(imageAlt)}"
            loading="lazy"
            decoding="async"
            data-fallback-src="${escapeHtml(defaultStockUrl)}"
            onerror="(function(img){var fb=img.getAttribute('data-fallback-src');if(fb&&img.src!==fb&&!img.dataset.triedFallback){img.dataset.triedFallback='1';img.src=fb;return;}img.classList.add('is-broken');img.removeAttribute('src');})(this);"
          />
          <div class="a1-editorial__frame-wash a1-editorial__frame-wash--fallback" aria-hidden="true"></div>`;

    return `
      <div class="a1-theme a1-theme--editorial">
        <header class="a1-editorial__header">
          <div class="a1-editorial__header-main">
            <p class="a1-kicker">${escapeHtml(category)}</p>
            <h3 class="a1-editorial__hook">${escapeHtml(title)}</h3>
          </div>
          <div class="a1-editorial__stamp" aria-label="Bill ${escapeHtml(billId)}">
            <span>${escapeHtml(billId)}</span>
          </div>
          ${microActionsHtml()}
        </header>
        <div class="a1-editorial__layout">
          <div class="a1-editorial__art">
            <div class="a1-editorial__frame" data-has-photo="${
              imageSrc ? "true" : "false"
            }">
              ${artInner}
            </div>
          </div>
          <div class="a1-editorial__copy">
            <div class="a1-editorial__sticker">
              <p class="a1-section-label">Key Impacts</p>
              <ul class="a1-editorial__impacts">${
                bullets ||
                `<li class="a1-editorial__impact"><span>${escapeHtml(
                  summary || title
                )}</span></li>`
              }</ul>
              <p class="a1-editorial__prompt">Should Congress pass this ${escapeHtml(
                (category || "bill").toLowerCase()
              )}?</p>
            </div>
            <footer class="a1-editorial__footer">
              ${reactionDockHtml()}
            </footer>
          </div>
        </div>
      </div>
    `;
  }

  function renderBento({ billId, title, category, impactsList, summary, costLabel, metrics }) {
    const metricHtml = (metrics || [])
      .map(
        (m) => `
        <section class="a1-bento__metric">
          <p class="a1-section-label">${escapeHtml(m.label)}</p>
          <p class="a1-bento__metric-value">${escapeHtml(m.value)}</p>
        </section>`
      )
      .join("");

    const impactHtml = impactsList
      .map(
        (impact, index) => `
        <li class="a1-bento__impact">
          <span class="a1-bento__impact-num">${String(index + 1).padStart(2, "0")}</span>
          <span>${escapeHtml(impact)}</span>
        </li>`
      )
      .join("");

    return `
      <div class="a1-theme a1-theme--bento">
        <header class="a1-bento__header">
          <div class="a1-bento__badges">
            <span class="a1-badge a1-badge--dark">${escapeHtml(category || "Policy")}</span>
            ${costLabel ? `<span class="a1-badge a1-badge--soft">${escapeHtml(costLabel)}</span>` : ""}
          </div>
          <span class="a1-mono-pill">${escapeHtml(billId)}</span>
          ${microActionsHtml()}
        </header>
        <div class="a1-bento__grid">
          <section class="a1-bento__main">
            <p class="a1-section-label">Impact summary</p>
            <h3>${escapeHtml(summary || title)}</h3>
            <p class="a1-bento__main-meta">Structured brief · ${escapeHtml(billId)}</p>
          </section>
          ${metricHtml}
          <section class="a1-bento__impacts">
            <p class="a1-section-label">Key Impacts</p>
            <ul>${impactHtml || `<li class="a1-bento__impact"><span>${escapeHtml(title)}</span></li>`}</ul>
          </section>
        </div>
        ${reactionDockHtml()}
      </div>
    `;
  }

  function pipelineSteps(item = {}) {
    const label = String(
      item.status?.stepName || item.statusLabel || item.voteKind || ""
    ).toLowerCase();
    let current = "committee";
    if (/final|passage|signed|enact|veto/.test(label)) current = "final";
    else if (/floor|debate|chamber|vote|cloture/.test(label)) current = "floor";

    const steps = [
      { id: "committee", label: "In Committee", icon: "⚖️", desc: "Markup & hearings" },
      { id: "floor", label: "Floor Debate", icon: "🎙️", desc: "Chamber consideration" },
      { id: "final", label: "Final Action", icon: "🗳️", desc: "Passage or veto" },
    ];
    const order = ["committee", "floor", "final"];
    const currentIdx = order.indexOf(current);
    return steps.map((step, index) => ({
      ...step,
      status:
        index < currentIdx ? "complete" : index === currentIdx ? "current" : "upcoming",
    }));
  }

  function renderPipeline({ billId, title, category, impactsList, summary, item }) {
    const steps = pipelineSteps(item);
    const stepHtml = steps
      .map(
        (step) => `
        <li class="a1-pipeline__step is-${step.status}">
          <div class="a1-pipeline__icon" aria-hidden="true">${
            step.status === "complete" ? "✓" : step.icon
          }</div>
          <div>
            <p class="a1-pipeline__step-label">${escapeHtml(step.label)}</p>
            <p class="a1-pipeline__step-desc">${escapeHtml(step.desc)}</p>
            <span class="a1-pipeline__status">${
              step.status === "complete"
                ? "Complete"
                : step.status === "current"
                  ? "In progress"
                  : "Upcoming"
            }</span>
          </div>
        </li>`
      )
      .join("");

    const impactHtml = impactsList
      .map((impact) => `<li>${escapeHtml(impact)}</li>`)
      .join("");

    return `
      <div class="a1-theme a1-theme--pipeline">
        <header class="a1-pipeline__header">
          <div class="a1-bento__badges">
            <span class="a1-badge a1-badge--dark">${escapeHtml(category || "Procedural")}</span>
            <span class="a1-badge a1-badge--sky">Tracking</span>
          </div>
          <span class="a1-mono-pill">${escapeHtml(billId)}</span>
          ${microActionsHtml()}
        </header>
        <section class="a1-pipeline__summary">
          <p class="a1-section-label">What the bill does</p>
          <h3>${escapeHtml(summary || title)}</h3>
          ${
            impactHtml
              ? `<ul class="a1-pipeline__impacts">${impactHtml}</ul>`
              : ""
          }
        </section>
        <section class="a1-pipeline__tracker" aria-label="Legislative pipeline">
          <p class="a1-section-label">Procedural pipeline</p>
          <p class="a1-pipeline__track-line">In Committee → Floor Debate → Final Action</p>
          <ol class="a1-pipeline__steps">${stepHtml}</ol>
        </section>
        ${reactionDockHtml()}
      </div>
    `;
  }

  function defaultStakeholders() {
    return [
      { id: "s1", name: "Industry Alliance", weight: 0.9, stance: "support", spendLabel: "$4.2M" },
      { id: "s2", name: "Trade Council", weight: 0.6, stance: "support", spendLabel: "$1.8M" },
      { id: "o1", name: "Public Interest", weight: 0.75, stance: "oppose", spendLabel: "$2.6M" },
      { id: "o2", name: "Labor Coalition", weight: 0.5, stance: "oppose", spendLabel: "$980K" },
    ];
  }

  function renderInfluence({ billId, title, category, impactsList, summary, item }) {
    const stakeholders =
      Array.isArray(item.stakeholders) && item.stakeholders.length
        ? item.stakeholders
        : defaultStakeholders();
    const support = stakeholders.filter((s) => String(s.stance).toLowerCase() !== "oppose");
    const oppose = stakeholders.filter((s) => String(s.stance).toLowerCase() === "oppose");

    const node = (s, side) => {
      const weight = Math.min(1, Math.max(0.25, Number(s.weight) || 0.5));
      const size = Math.round(52 + weight * 34);
      const color = side === "support" ? SUPPORT : OPPOSE;
      return `
        <div class="a1-influence__node a1-influence__node--${side}" style="width:${size}px;height:${size}px;border-color:${color};box-shadow:0 0 0 3px ${
          side === "support" ? "rgba(5,150,105,0.12)" : "rgba(225,29,72,0.12)"
        }">
          <span class="a1-influence__node-name">${escapeHtml(s.name || "Stakeholder")}</span>
          ${
            s.spendLabel
              ? `<span class="a1-influence__node-spend" style="color:${color}">${escapeHtml(
                  s.spendLabel
                )}</span>`
              : ""
          }
        </div>`;
    };

    const impactHtml = impactsList
      .map((impact) => `<li>${escapeHtml(impact)}</li>`)
      .join("");

    return `
      <div class="a1-theme a1-theme--influence">
        <header class="a1-influence__header">
          <div class="a1-bento__badges">
            <span class="a1-badge a1-badge--dark">${escapeHtml(category || "Lobbying")}</span>
            <span class="a1-badge a1-badge--soft">Stakeholder map</span>
          </div>
          <span class="a1-mono-pill">${escapeHtml(billId)}</span>
          ${microActionsHtml()}
        </header>
        <section class="a1-influence__map" aria-label="Influence network">
          <div class="a1-influence__col a1-influence__col--oppose">
            <span class="a1-influence__side-label" style="color:${OPPOSE}">Oppose</span>
            ${oppose.map((s) => node(s, "oppose")).join("")}
          </div>
          <div class="a1-influence__center">
            <div class="a1-influence__bill">
              <span class="a1-section-label">Bill</span>
              <strong>${escapeHtml(billId)}</strong>
            </div>
          </div>
          <div class="a1-influence__col a1-influence__col--support">
            <span class="a1-influence__side-label" style="color:${SUPPORT}">Agree</span>
            ${support.map((s) => node(s, "support")).join("")}
          </div>
        </section>
        <section class="a1-influence__summary">
          <p class="a1-section-label">Who is pushing — and who is fighting</p>
          <h3>${escapeHtml(summary || title)}</h3>
          ${impactHtml ? `<ul>${impactHtml}</ul>` : ""}
        </section>
        ${reactionDockHtml()}
      </div>
    `;
  }

  function defaultDistricts() {
    return [
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
  }

  function renderLocal({ billId, title, category, impactsList, summary, item }) {
    const districts =
      Array.isArray(item.districts) && item.districts.length
        ? item.districts
        : defaultDistricts();
    const focus =
      item.focusDistrict ||
      item.focus_district ||
      "TX-22 · Katy area";
    const funding =
      item.fundingLabel ||
      item.funding_label ||
      item.fundingAllocation ||
      item.funding_allocation ||
      "$352M regional";
    const regional =
      item.regionalImpact || item.regional_impact || "High";

    const districtHtml = districts
      .map((row) => {
        const emphasis = Boolean(row.emphasis);
        return `
        <li class="a1-local__district ${emphasis ? "is-emphasis" : ""}">
          <div>
            <p class="a1-local__district-label">${escapeHtml(row.label || "District")}</p>
            <p class="a1-local__district-detail">${escapeHtml(
              row.detail || "District impact"
            )}</p>
          </div>
          ${
            row.amount
              ? `<span class="a1-local__district-amount">${escapeHtml(
                  row.amount
                )}</span>`
              : ""
          }
        </li>`;
      })
      .join("");

    const impactHtml = impactsList
      .map((impact) => `<li>${escapeHtml(impact)}</li>`)
      .join("");

    return `
      <div class="a1-theme a1-theme--local">
        <header class="a1-local__header">
          <div class="a1-bento__badges">
            <span class="a1-badge a1-badge--dark">${escapeHtml(
              category || "Local"
            )}</span>
            <span class="a1-badge a1-badge--soft">District impact</span>
          </div>
          <span class="a1-mono-pill">${escapeHtml(billId)}</span>
          ${microActionsHtml()}
        </header>
        <div class="a1-local__grid">
          <section class="a1-local__panel" aria-label="District breakdown">
            <p class="a1-section-label">District breakdown</p>
            <ul class="a1-local__districts">${districtHtml}</ul>
          </section>
          <section class="a1-local__map" aria-label="Regional map">
            <p class="a1-section-label">Regional map</p>
            <div class="a1-local__map-canvas" aria-hidden="true">
              <span class="a1-local__map-block a1-local__map-block--a">TX-07</span>
              <span class="a1-local__map-block a1-local__map-block--focus">TX-22 ★</span>
              <span class="a1-local__map-block a1-local__map-block--c">TX-09</span>
            </div>
            <p class="a1-local__map-caption">${escapeHtml(focus)}</p>
          </section>
        </div>
        <section class="a1-local__metrics" aria-label="Localized metrics">
          <div class="a1-local__metric">
            <p class="a1-section-label">Funding allocation</p>
            <p class="a1-local__metric-value">${escapeHtml(funding)}</p>
          </div>
          <div class="a1-local__metric">
            <p class="a1-section-label">Focus district</p>
            <p class="a1-local__metric-value">${escapeHtml(focus)}</p>
          </div>
          <div class="a1-local__metric">
            <p class="a1-section-label">Regional impact</p>
            <p class="a1-local__metric-value a1-local__metric-value--good">${escapeHtml(
              regional
            )}</p>
          </div>
        </section>
        <section class="a1-local__summary">
          <p class="a1-section-label">Localized impact</p>
          <h3>${escapeHtml(summary || title)}</h3>
          ${impactHtml ? `<ul>${impactHtml}</ul>` : ""}
        </section>
        ${reactionDockHtml()}
      </div>
    `;
  }

  function defaultVersusClauses() {
    return [
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
  }

  function renderVersus({ billId, title, category, impactsList, summary, item }) {
    const clauses =
      (Array.isArray(item.versusClauses) && item.versusClauses.length
        ? item.versusClauses
        : null) ||
      (Array.isArray(item.versus_clauses) && item.versus_clauses.length
        ? item.versus_clauses
        : null) ||
      defaultVersusClauses();
    const leftLabel =
      item.versusLeftLabel || item.versus_left_label || "Bill A · Original";
    const rightLabel =
      item.versusRightLabel || item.versus_right_label || "Bill B · Amendment";

    const clauseHtml = clauses
      .map((clause) => {
        const tone = String(clause.tone || "neutral").toLowerCase();
        const color =
          tone === "agree" ? SUPPORT : tone === "oppose" ? OPPOSE : "#64748b";
        const toneText =
          tone === "agree" ? "Agree" : tone === "oppose" ? "Oppose" : "Note";
        return `
        <li class="a1-versus__clause is-${escapeHtml(tone)}">
          <div class="a1-versus__clause-head">
            <p class="a1-section-label">${escapeHtml(clause.label || "Clause")}</p>
            <span class="a1-versus__tone" style="color:${color};border-color:${color}55;background:${color}12">${toneText}</span>
          </div>
          <div class="a1-versus__cols">
            <div class="a1-versus__col a1-versus__col--left">
              <p>${escapeHtml(clause.left || "—")}</p>
            </div>
            <div class="a1-versus__col a1-versus__col--right" style="box-shadow: inset 3px 0 0 ${color}">
              <p>${escapeHtml(clause.right || "—")}</p>
            </div>
          </div>
        </li>`;
      })
      .join("");

    const impactHtml = impactsList
      .map((impact) => `<li>${escapeHtml(impact)}</li>`)
      .join("");

    return `
      <div class="a1-theme a1-theme--versus">
        <header class="a1-versus__header">
          <div class="a1-bento__badges">
            <span class="a1-badge a1-badge--dark">${escapeHtml(
              category || "Comparison"
            )}</span>
            <span class="a1-badge a1-badge--soft">Versus</span>
          </div>
          <span class="a1-mono-pill">${escapeHtml(billId)}</span>
          ${microActionsHtml()}
        </header>
        <div class="a1-versus__labels">
          <div class="a1-versus__label a1-versus__label--left">${escapeHtml(
            leftLabel
          )}</div>
          <div class="a1-versus__label a1-versus__label--right">${escapeHtml(
            rightLabel
          )}</div>
        </div>
        <section class="a1-versus__compare" aria-label="Clause comparison">
          <ul>${clauseHtml}</ul>
        </section>
        <section class="a1-versus__summary">
          <p class="a1-section-label">What changed</p>
          <h3>${escapeHtml(summary || title)}</h3>
          ${impactHtml ? `<ul>${impactHtml}</ul>` : ""}
        </section>
        ${reactionDockHtml()}
      </div>
    `;
  }

  function buildMetrics(item = {}, impacts = {}) {

    const metrics = [];
    const cost = impacts?.costPill?.label;
    if (cost) metrics.push({ label: "Net Cost", value: cost });
    if (item.fiscalYear || item.fiscal_year) {
      metrics.push({
        label: "Fiscal Year",
        value: String(item.fiscalYear || item.fiscal_year),
      });
    }
    if (item.daysLeft || item.days_left) {
      metrics.push({
        label: "Days Left",
        value: String(item.daysLeft || item.days_left),
      });
    }
    if (!metrics.length && item.result) {
      metrics.push({ label: "Result", value: String(item.result) });
    }
    if (!metrics.length) {
      metrics.push({ label: "Vote Totals", value: "—" });
    }
    return metrics.slice(0, 3);
  }

  /**
   * Story-first feed card: punchy peek surface + theme detail for the drawer.
   */
  function renderThemedCardHtml(item, opts = {}) {
    const theme = resolveTheme(item);
    const label = themeLabel(theme);
    const categoryLabel =
      typeof opts.category === "string"
        ? opts.category
        : opts.category?.label || item.primaryCategory || item.category || "Congress";
    const billId = opts.billId || item.billNumber || item.id || "Bill";
    const impacts = opts.impacts || {};
    const { title, summary, impactsList } = resolveCardCopy(item, opts);
    const payload = {
      billId,
      title,
      category: categoryLabel,
      impactsList,
      summary,
      costLabel: impacts?.costPill?.label || "",
      metrics: buildMetrics(item, impacts),
      item,
    };

    const peek = withChrome(true, () => renderStoryPeek(payload, theme, label));
    const detail = renderThemeDetail(theme, payload);

    return {
      theme,
      themeLabel: label,
      html: `
        <div class="a1-card-shell a1-card-shell--story" data-a1-theme="${escapeHtml(
          theme
        )}">
          ${peek}
          <template class="a1-story-detail-template">
            <div class="a1-story-detail" data-a1-theme="${escapeHtml(theme)}">
              <div class="a1-story-detail__intro">
                <p class="a1-story-detail__eyebrow">${escapeHtml(label)} · Full breakdown</p>
                <h3 class="a1-story-detail__title">${escapeHtml(title)}</h3>
                <p class="a1-story-detail__bill">${escapeHtml(billId)} · ${escapeHtml(
                  categoryLabel
                )}</p>
              </div>
              ${detail}
              <div class="a1-story-detail__ai">
                <button type="button" class="details-toggle-btn a1-ask-ai-btn a1-story-detail__ask">
                  ✨ Ask AI about this bill
                </button>
              </div>
            </div>
          </template>
        </div>
      `,
    };
  }

  global.Article1Themes = {
    resolveTheme,
    themeLabel,
    renderThemedCardHtml,
    syncGlassThermoOnCard,
    passPctToThermoColor,
    SUPPORT,
    OPPOSE,
  };

  ensureGlassThermoObserver();
})(typeof window !== "undefined" ? window : globalThis);
