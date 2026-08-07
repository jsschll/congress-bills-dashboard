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

  function clampFaceLine(text, maxWords = 14) {
    const cleaned = normalizeCopyLine(text);
    if (!cleaned) return "";
    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) {
      return cleaned.replace(/[,:;–—-]+$/, "").replace(/\.$/, "");
    }
    return `${words
      .slice(0, maxWords)
      .join(" ")
      .replace(/[,:;–—-]+$/, "")}…`;
  }

  function reactionDockHtml() {
    return `
      <div class="a1-reaction-dock a1-reaction-dock--anchored" role="toolbar" aria-label="Bill reactions">
        <div class="engagement-mount-point" aria-label="Your stance"></div>
        <button type="button" class="details-toggle-btn a1-ask-ai-btn" title="Open deep dive">✨ Deep Dive</button>
      </div>
    `;
  }

  function microActionsHtml() {
    return `
      <div class="a1-micro-actions" aria-label="Card actions">
        <button type="button" class="feed-card-icon-btn feed-card-bookmark" aria-label="Bookmark this bill" aria-pressed="false" title="Bookmark">🔖</button>
        <button type="button" class="feed-card-icon-btn feed-card-share" aria-label="Share" title="Share">📤</button>
      </div>
    `;
  }

  /**
   * Shared compact face: headline + 1-line TL;DR (+ optional visual chip).
   * Deep details stay out of the face — Ask AI / Deep Dive owns them.
   */
  function compactFaceShell({
    themeClass,
    billId,
    category,
    headline,
    tldr,
    chipHtml = "",
    extraBadges = "",
  }) {
    return `
      <div class="a1-theme a1-theme--compact ${themeClass}">
        <header class="a1-face__header">
          <div class="a1-bento__badges">
            <span class="a1-badge a1-badge--dark">${escapeHtml(
              category || "Congress"
            )}</span>
            ${extraBadges}
          </div>
          <span class="a1-mono-pill">${escapeHtml(billId)}</span>
          ${microActionsHtml()}
        </header>
        <div class="a1-face">
          <h3 class="a1-face__headline">${escapeHtml(headline)}</h3>
          <p class="a1-face__tldr">${escapeHtml(tldr)}</p>
          ${chipHtml ? `<div class="a1-face__chips">${chipHtml}</div>` : ""}
        </div>
        <footer class="a1-face__footer">
          ${reactionDockHtml()}
        </footer>
      </div>
    `;
  }

  function renderEditorial({ billId, title, category, summary }) {
    return compactFaceShell({
      themeClass: "a1-theme--editorial a1-theme--editorial-copy-only",
      billId,
      category,
      headline: clampFaceLine(title, 12),
      tldr: clampFaceLine(summary || title, 16),
    });
  }

  function renderBento({ billId, title, category, summary, costLabel }) {
    const chip = costLabel
      ? `<span class="a1-face__chip a1-face__chip--fiscal">${escapeHtml(
          costLabel
        )}</span>`
      : "";
    return compactFaceShell({
      themeClass: "a1-theme--bento",
      billId,
      category: category || "Policy",
      headline: clampFaceLine(title, 12),
      tldr: clampFaceLine(summary || title, 16),
      chipHtml: chip,
    });
  }

  function pipelineSteps(item = {}) {
    const label = String(
      item.status?.stepName || item.statusLabel || item.voteKind || ""
    ).toLowerCase();
    let current = "committee";
    if (/final|passage|signed|enact|veto/.test(label)) current = "final";
    else if (/floor|debate|chamber|vote|cloture/.test(label)) current = "floor";

    const steps = [
      { id: "committee", label: "In Committee" },
      { id: "floor", label: "Floor Debate" },
      { id: "final", label: "Final Action" },
    ];
    const order = ["committee", "floor", "final"];
    const currentIdx = Math.max(0, order.indexOf(current));
    return {
      steps,
      currentIdx,
      currentLabel: steps[currentIdx].label,
      stepNumber: currentIdx + 1,
      totalSteps: steps.length,
    };
  }

  function renderPipeline({ billId, title, category, summary, item }) {
    const pipe = pipelineSteps(item);
    const chip = `
      <span class="a1-face__chip a1-face__chip--pipeline" aria-label="Legislative progress">
        ⏳ ${escapeHtml(pipe.currentLabel)} · Step ${pipe.stepNumber} of ${
      pipe.totalSteps
    }
      </span>`;
    return compactFaceShell({
      themeClass: "a1-theme--pipeline",
      billId,
      category: category || "Procedural",
      headline: clampFaceLine(title, 12),
      tldr: clampFaceLine(summary || title, 16),
      chipHtml: chip,
      extraBadges: `<span class="a1-badge a1-badge--sky">Tracking</span>`,
    });
  }

  function defaultStakeholders() {
    return [
      { id: "s1", name: "Industry Alliance", weight: 0.9, stance: "support", spendLabel: "$4.2M" },
      { id: "s2", name: "Trade Council", weight: 0.6, stance: "support", spendLabel: "$1.8M" },
      { id: "o1", name: "Public Interest", weight: 0.75, stance: "oppose", spendLabel: "$2.6M" },
      { id: "o2", name: "Labor Coalition", weight: 0.5, stance: "oppose", spendLabel: "$980K" },
    ];
  }

  function renderInfluence({ billId, title, category, summary, item }) {
    const stakeholders =
      Array.isArray(item.stakeholders) && item.stakeholders.length
        ? item.stakeholders
        : defaultStakeholders();
    const support = stakeholders.filter(
      (s) => String(s.stance).toLowerCase() !== "oppose"
    ).length;
    const oppose = stakeholders.filter(
      (s) => String(s.stance).toLowerCase() === "oppose"
    ).length;
    const chip = `
      <span class="a1-face__chip a1-face__chip--influence">
        <span style="color:${SUPPORT}">●</span> ${support} Agree
        <span class="a1-face__chip-sep">·</span>
        <span style="color:${OPPOSE}">●</span> ${oppose} Oppose
      </span>`;
    return compactFaceShell({
      themeClass: "a1-theme--influence",
      billId,
      category: category || "Lobbying",
      headline: clampFaceLine(title, 12),
      tldr: clampFaceLine(summary || title, 16),
      chipHtml: chip,
      extraBadges: `<span class="a1-badge a1-badge--soft">Stakeholder map</span>`,
    });
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

  function renderLocal({ billId, title, category, summary, impactsList, item }) {
    const districts =
      Array.isArray(item.districts) && item.districts.length
        ? item.districts
        : defaultDistricts();
    const focus =
      districts.find((d) => d.emphasis) ||
      districts[0] || {
        label: "TX-22",
        amount: "$184M",
        detail: "Flood projects",
      };
    const firstImpact = normalizeCopyLine(impactsList[0] || "");
    let chipLabel = "";
    if (firstImpact && /\$\d/.test(firstImpact) && /tx[-\s]?\d+/i.test(firstImpact)) {
      chipLabel = firstImpact;
    } else if (focus.amount && focus.label) {
      const projectHint = /flood/i.test(
        `${focus.detail || ""} ${firstImpact} ${summary || ""}`
      )
        ? "Flood Projects"
        : "Local Projects";
      chipLabel = `${focus.amount} to ${focus.label} ${projectHint}`;
    } else {
      chipLabel = firstImpact || summary || title;
    }
    const chip = `
      <span class="a1-face__chip a1-face__chip--local">
        📍 ${escapeHtml(clampFaceLine(chipLabel, 10))}
      </span>`;
    return compactFaceShell({
      themeClass: "a1-theme--local",
      billId,
      category: category || "Local",
      headline: clampFaceLine(title, 12),
      tldr: clampFaceLine(summary || title, 16),
      chipHtml: chip,
      extraBadges: `<span class="a1-badge a1-badge--soft">District impact</span>`,
    });
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

  function renderVersus({ billId, title, category, summary, item }) {
    const clauses =
      (Array.isArray(item.versusClauses) && item.versusClauses.length
        ? item.versusClauses
        : null) ||
      (Array.isArray(item.versus_clauses) && item.versus_clauses.length
        ? item.versus_clauses
        : null) ||
      defaultVersusClauses();
    const changed = clauses.filter(
      (c) => String(c.tone || "").toLowerCase() === "oppose"
    ).length;
    const chip = `
      <span class="a1-face__chip a1-face__chip--versus">
        ↔ Original vs Amendment · ${changed || clauses.length} key change${
      (changed || clauses.length) === 1 ? "" : "s"
    }
      </span>`;
    return compactFaceShell({
      themeClass: "a1-theme--versus",
      billId,
      category: category || "Comparison",
      headline: clampFaceLine(title, 12),
      tldr: clampFaceLine(summary || title, 16),
      chipHtml: chip,
      extraBadges: `<span class="a1-badge a1-badge--soft">Versus</span>`,
    });
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
   * Render a themed Article 1 card shell into `card`.
   * Expects helpers from bills-policies.js to wire Ask AI / bookmark / stance.
   */
  function renderThemedCardHtml(item, opts = {}) {
    const theme = resolveTheme(item);
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

    let body = "";
    if (theme === "versus") body = renderVersus(payload);
    else if (theme === "local") body = renderLocal(payload);
    else if (theme === "bento-grid") body = renderBento(payload);
    else if (theme === "pipeline") body = renderPipeline(payload);
    else if (theme === "influence") body = renderInfluence(payload);
    else body = renderEditorial(payload);

    return {
      theme,
      themeLabel: themeLabel(theme),
      html: `
        <div class="a1-card-shell" data-a1-theme="${escapeHtml(theme)}">
          ${body}
        </div>
      `,
    };
  }

  global.Article1Themes = {
    resolveTheme,
    themeLabel,
    renderThemedCardHtml,
    SUPPORT,
    OPPOSE,
  };
})(typeof window !== "undefined" ? window : globalThis);
