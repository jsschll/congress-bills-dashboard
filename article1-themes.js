/**
 * Article 1 theme engine for the live vanilla feed.
 * Mirrors ThemeWrapper routing + Themes 1–4 visuals so production cards
 * actually show Editorial / Bento / Pipeline / Influence layouts.
 */
(function (global) {
  const FINANCE_RE =
    /\b(finance|financial|budget|budgets|economy|economic|fiscal|trade|appropriations?|treasury|tax|taxes|revenue|deficit|debt|commerce|banking|securities)\b/i;
  const PROCEDURAL_RE =
    /\b(procedural|authorization|tracker|tracking|floor\s*debate|floor\s*action|chamber\s*vote|final\s*(action|passage)|cloture|pipeline|conference\s*report|veto\s*override)\b/i;
  const INFLUENCE_RE =
    /\b(regulatory|regulation|lobbying|lobbyist|stakeholder(\s+map)?|influence(\s+network)?|donor|pac)\b/i;

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
    const explicit = String(item.themeVariant || item.theme_variant || "").trim();
    if (explicit === "influence") return "influence";
    if (explicit === "pipeline" || explicit === "urgent") return "pipeline";
    if (explicit === "bento-grid" || explicit === "fiscal") return "bento-grid";
    if (explicit === "editorial-collage") return "editorial-collage";

    if (Array.isArray(item.stakeholders) && item.stakeholders.length) {
      return "influence";
    }

    const signals = collectSignals(item);
    if (INFLUENCE_RE.test(signals)) return "influence";
    if (PROCEDURAL_RE.test(signals)) return "pipeline";
    if (FINANCE_RE.test(signals)) return "bento-grid";
    return "editorial-collage";
  }

  function themeLabel(theme) {
    if (theme === "bento-grid") return "Bento Grid";
    if (theme === "pipeline") return "Procedural Pipeline";
    if (theme === "influence") return "Influence Network";
    return "Editorial Collage";
  }

  function keyImpacts(item = {}, impacts = {}) {
    const fromItem = asList(
      item.key_impacts || item.keyImpacts || item.key_points || item.keyPoints
    );
    if (fromItem.length) return fromItem.slice(0, 2);
    const chips = Array.isArray(impacts.chips)
      ? impacts.chips.map((c) => c.label).filter(Boolean)
      : [];
    if (chips.length) return chips.slice(0, 2);
    const what = String(impacts.what || "").trim();
    return what ? [what] : [];
  }

  function reactionDockHtml() {
    return `
      <div class="a1-reaction-dock" role="toolbar" aria-label="Bill reactions">
        <div class="engagement-mount-point" aria-label="Your stance"></div>
        <button type="button" class="details-toggle-btn a1-ask-ai-btn">✨ Ask AI</button>
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

  function renderEditorial({ billId, title, category, impactsList, summary }) {
    const bullets = impactsList
      .map(
        (impact) => `
        <li class="a1-editorial__impact">
          <span class="a1-editorial__bullet" aria-hidden="true"></span>
          <span>${escapeHtml(impact)}</span>
        </li>`
      )
      .join("");

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
        <div class="a1-editorial__frame" aria-hidden="true">
          <div class="a1-editorial__frame-wash"></div>
          <span class="a1-editorial__frame-label">Editorial frame</span>
        </div>
        <div class="a1-editorial__sticker">
          <p class="a1-section-label">Key Impacts</p>
          <ul class="a1-editorial__impacts">${bullets || `<li class="a1-editorial__impact"><span>${escapeHtml(summary || title)}</span></li>`}</ul>
          <p class="a1-editorial__prompt">Should Congress pass this ${escapeHtml(
            (category || "bill").toLowerCase()
          )}?</p>
        </div>
        ${reactionDockHtml()}
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
    const title = opts.title || item.short_title || item.title || "Legislation";
    const billId = opts.billId || item.billNumber || item.id || "Bill";
    const impacts = opts.impacts || {};
    const impactsList = keyImpacts(item, impacts);
    const summary =
      opts.summary ||
      impacts.what ||
      item.plain_summary ||
      item.shortPitch ||
      title;
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
    if (theme === "bento-grid") body = renderBento(payload);
    else if (theme === "pipeline") body = renderPipeline(payload);
    else if (theme === "influence") body = renderInfluence(payload);
    else body = renderEditorial(payload);

    return {
      theme,
      themeLabel: themeLabel(theme),
      html: `
        <div class="a1-theme-badge" data-theme="${escapeHtml(theme)}">
          Theme · ${escapeHtml(themeLabel(theme))}
        </div>
        ${body}
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
