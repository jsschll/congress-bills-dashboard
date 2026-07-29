/**
 * Pocketbook / impact calculator for money-related policy cards.
 * Only shows a dollar estimate when the bill’s audience and the user’s
 * saved pocketbook / role info are enough to support it.
 */
(function (global) {
  const MONEY_RE =
    /\b(tax|taxes|taxation|tariff|fee|fees|levy|bond|bonds|millage|property tax|income tax|sales tax|utility|utilities|rate hike|rates|housing|rent|mortgage|assessment|surcharge|toll|premium|budget|appropriat|funding|stimulus|rebate|credit|deduction|irs|revenue|grant|stipend|loan|forgiveness)\b/i;

  const ROLE_OPTIONS = [
    { id: "teacher", label: "Teacher / educator" },
    { id: "student", label: "Student" },
    { id: "parent", label: "Parent / guardian" },
    { id: "homeowner", label: "Homeowner" },
    { id: "renter", label: "Renter" },
    { id: "veteran", label: "Veteran / military" },
    { id: "farmer", label: "Farmer / rancher" },
    { id: "small_business", label: "Small-business owner" },
    { id: "healthcare", label: "Healthcare worker" },
    { id: "retiree", label: "Retiree" },
  ];

  const AUDIENCE_RULES = [
    {
      id: "teacher",
      label: "teachers and educators",
      re: /\b(teacher|teachers|educator|educators|classroom|seed act|school staff|faculty)\b/i,
    },
    {
      id: "student",
      label: "students",
      re: /\b(student loan|pell grant|student aid|college student|tuition)\b/i,
    },
    {
      id: "veteran",
      label: "veterans and service members",
      re: /\b(veteran|veterans|va benefits|service member|gi bill)\b/i,
    },
    {
      id: "farmer",
      label: "farmers and ranchers",
      re: /\b(farmer|farmers|rancher|ranchers|agriculture|farm bill|crop insurance)\b/i,
    },
    {
      id: "small_business",
      label: "small-business owners",
      re: /\b(small business|sba |entrepreneur|self-employed)\b/i,
    },
    {
      id: "healthcare",
      label: "healthcare workers",
      re: /\b(nurse|nurses|physician|healthcare worker|medical resident)\b/i,
    },
    {
      id: "homeowner",
      label: "homeowners",
      re: /\b(homeowner|property tax|millage|mortgage interest|housing fee)\b/i,
    },
    {
      id: "renter",
      label: "renters",
      re: /\b(renter|rent control|tenant|eviction|rent relief)\b/i,
    },
    {
      id: "retiree",
      label: "retirees",
      re: /\b(retiree|social security|medicare advantage|pension)\b/i,
    },
    {
      id: "parent",
      label: "parents and guardians",
      re: /\b(child tax credit|dependent care|parental leave|childcare)\b/i,
    },
  ];

  const DEFAULTS = {
    propertyValue: 350000,
    income: 75000,
    filingStatus: "single",
    vehicleCount: 1,
  };

  const state = {
    baselines: emptyBaselines(),
    loaded: false,
    signedIn: false,
  };

  function emptyBaselines() {
    return {
      propertyValue: null,
      income: null,
      filingStatus: null,
      vehicleCount: null,
      roles: [],
      hasProperty: false,
      hasIncome: false,
      hasFilingStatus: false,
      hasVehicles: false,
      hasRoles: false,
    };
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function billText(item = {}) {
    return [
      item.title,
      item.shortPitch,
      item.statusLabel,
      item.billNumber,
      ...(item.tags || []),
      item.jurisdiction,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function moneyRelated(item = {}) {
    return MONEY_RE.test(billText(item));
  }

  function detectAudiences(item = {}) {
    const text = billText(item);
    const found = [];
    for (const rule of AUDIENCE_RULES) {
      if (rule.re.test(text)) found.push(rule);
    }
    return found;
  }

  function detectKind(item = {}) {
    const text = billText(item).toLowerCase();
    if (/property tax|millage|assessment|housing fee|homeowner/.test(text)) {
      return "property";
    }
    if (/income tax|payroll|withholding|earned income|filing status/.test(text)) {
      return "income";
    }
    if (/utility|electric|water rate|gas rate|broadband/.test(text)) {
      return "utility";
    }
    if (/bond|bond measure|general obligation/.test(text)) {
      return "bond";
    }
    if (/vehicle|registration|dmv|car fee|toll/.test(text)) {
      return "vehicle";
    }
    if (/teacher|educator|student loan|veteran|farmer|grant|stipend|scholarship|seed act/.test(text)) {
      return "targeted_benefit";
    }
    if (/fee|surcharge|permit|license/.test(text)) {
      return "fee";
    }
    if (/funding|appropriat|budget|stimulus|rebate|credit|deduction/.test(text)) {
      return "program_funding";
    }
    return "general";
  }

  function estimateMonthly(kind, baselines, sliderValue) {
    const property = Number(
      kind === "income" || kind === "vehicle" || kind === "targeted_benefit"
        ? baselines.propertyValue || DEFAULTS.propertyValue
        : sliderValue || baselines.propertyValue || DEFAULTS.propertyValue
    );
    const income = Number(
      kind === "income" || kind === "targeted_benefit" || kind === "program_funding"
        ? sliderValue || baselines.income || DEFAULTS.income
        : baselines.income || DEFAULTS.income
    );
    const vehicles = Number(
      kind === "vehicle"
        ? sliderValue ?? baselines.vehicleCount ?? DEFAULTS.vehicleCount
        : baselines.vehicleCount || DEFAULTS.vehicleCount
    );

    switch (kind) {
      case "property":
        return (property * 0.00035) / 12;
      case "income": {
        const rate = baselines.filingStatus === "married_joint" ? 0.004 : 0.005;
        return (income * rate) / 12;
      }
      case "utility":
        return 8 + Math.min(40, property / 50000);
      case "bond":
        return (property * 0.00018) / 12;
      case "vehicle":
        return vehicles * 4.5;
      case "fee":
        return 3.5 + vehicles * 1.25;
      case "targeted_benefit":
        // Modest stipend-style benefit for matching occupations only.
        return Math.min(250, Math.max(25, income * 0.004)) / 12;
      case "program_funding":
        // Broad appropriations rarely hit a household checkbook directly.
        return 0;
      default:
        return (income * 0.001 + property * 0.00005) / 12;
    }
  }

  function formatMoney(value) {
    const abs = Math.abs(value);
    const formatted =
      abs >= 100
        ? abs.toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          })
        : abs.toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
    if (value > 0.049) return `+${formatted}/mo`;
    if (value < -0.049) return `−${formatted.replace("-", "")}/mo`;
    return `${formatted}/mo`;
  }

  function profileHref(hash = "pocketbook") {
    return `profile.html#${hash}`;
  }

  function assessEstimate(item, baselines) {
    const kind = detectKind(item);
    const audiences = detectAudiences(item);
    const roleIds = new Set(baselines.roles || []);

    if (!state.signedIn) {
      return {
        ok: false,
        kind,
        audiences,
        title: "Sign in to estimate your impact",
        detail:
          "We need a few pocketbook details from your profile before showing a personal dollar estimate.",
        ctaLabel: "Sign in",
        ctaHref: `auth.html?next=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}`,
      };
    }

    if (audiences.length) {
      const matched = audiences.filter((audience) => roleIds.has(audience.id));
      if (!matched.length) {
        const labels = audiences.map((audience) => audience.label);
        const uniqueLabels = [...new Set(labels)];
        const focus =
          uniqueLabels.length === 1
            ? uniqueLabels[0]
            : uniqueLabels.slice(0, -1).join(", ") +
              " or " +
              uniqueLabels[uniqueLabels.length - 1];
        return {
          ok: false,
          kind,
          audiences,
          title: "Not enough profile info for this bill",
          detail: `This measure mainly affects ${focus}. Add matching roles on your Profile pocketbook settings so we don’t guess an impact that doesn’t apply to you.`,
          ctaLabel: "Update pocketbook & roles",
          ctaHref: profileHref("pocketbook"),
        };
      }
    }

    const missing = [];
    if (
      (kind === "property" || kind === "bond" || kind === "utility") &&
      !baselines.hasProperty
    ) {
      missing.push("estimated property value");
    }
    if (
      (kind === "income" ||
        kind === "targeted_benefit" ||
        kind === "general" ||
        kind === "program_funding") &&
      !baselines.hasIncome
    ) {
      missing.push("estimated household income");
    }
    if (kind === "income" && !baselines.hasFilingStatus) {
      missing.push("filing status");
    }
    if ((kind === "vehicle" || kind === "fee") && !baselines.hasVehicles) {
      missing.push("vehicle count");
    }
    if (audiences.length && !baselines.hasRoles) {
      missing.push("who this applies to (your roles)");
    }

    if (missing.length) {
      return {
        ok: false,
        kind,
        audiences,
        title: "Add a few details to estimate impact",
        detail: `To estimate this bill for you, save your ${missing.join(
          ", "
        )} on Profile.`,
        ctaLabel: "Update pocketbook baselines",
        ctaHref: profileHref("pocketbook"),
      };
    }

    if (kind === "program_funding" && !audiences.length) {
      return {
        ok: false,
        kind,
        audiences,
        title: "No direct household estimate yet",
        detail:
          "This looks like broad program funding rather than a tax, fee, or benefit tied to your saved roles. Add roles on Profile if you are in a group this bill targets, or check the official summary for who qualifies.",
        ctaLabel: "Review pocketbook & roles",
        ctaHref: profileHref("pocketbook"),
      };
    }

    return { ok: true, kind, audiences };
  }

  async function loadBaselines() {
    state.loaded = true;
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    state.signedIn = Boolean(user);
    if (!client || !user) {
      state.baselines = emptyBaselines();
      return state.baselines;
    }

    const { data, error } = await client
      .from("profiles")
      .select(
        "estimated_property_value, estimated_income, filing_status, vehicle_count, impact_roles"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      // Older DBs may not have impact_roles yet.
      const fallback = await client
        .from("profiles")
        .select(
          "estimated_property_value, estimated_income, filing_status, vehicle_count"
        )
        .eq("id", user.id)
        .maybeSingle();
      if (fallback.error) {
        console.warn(error);
        state.baselines = emptyBaselines();
        return state.baselines;
      }
      return applyProfileRow(fallback.data || {});
    }

    return applyProfileRow(data || {});
  }

  function applyProfileRow(data) {
    const roles = Array.isArray(data.impact_roles)
      ? data.impact_roles.map((role) => String(role || "").toLowerCase())
      : [];
    state.baselines = {
      propertyValue:
        data.estimated_property_value == null
          ? null
          : Number(data.estimated_property_value),
      income:
        data.estimated_income == null ? null : Number(data.estimated_income),
      filingStatus: data.filing_status || null,
      vehicleCount:
        data.vehicle_count == null ? null : Number(data.vehicle_count),
      roles,
      hasProperty: data.estimated_property_value != null,
      hasIncome: data.estimated_income != null,
      hasFilingStatus: Boolean(data.filing_status),
      hasVehicles: data.vehicle_count != null,
      hasRoles: roles.length > 0,
    };
    return state.baselines;
  }

  function sliderConfig(kind, baselines) {
    if (kind === "income" || kind === "targeted_benefit") {
      return {
        label: "Household income",
        min: 25000,
        max: 250000,
        step: 1000,
        value: baselines.income || DEFAULTS.income,
        format: (n) =>
          Number(n).toLocaleString(undefined, {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }),
      };
    }
    if (kind === "vehicle") {
      return {
        label: "Vehicles",
        min: 0,
        max: 6,
        step: 1,
        value: baselines.vehicleCount ?? DEFAULTS.vehicleCount,
        format: (n) => String(n),
      };
    }
    return {
      label: "Property value",
      min: 100000,
      max: 1500000,
      step: 5000,
      value: baselines.propertyValue || DEFAULTS.propertyValue,
      format: (n) =>
        Number(n).toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }),
    };
  }

  function renderIncomplete(wrap, assessment) {
    const body = wrap.querySelector(".policy-impact__body");
    if (!body) return;
    body.innerHTML = `
      <div class="policy-impact__incomplete">
        <p class="policy-impact__incomplete-title">${escapeHtml(
          assessment.title
        )}</p>
        <p class="policy-impact__note">${escapeHtml(assessment.detail)}</p>
        <p class="policy-impact__hint">
          <a class="bill-card__link" href="${escapeHtml(assessment.ctaHref)}">${escapeHtml(
            assessment.ctaLabel
          )}</a>
        </p>
      </div>
    `;
  }

  function renderCalculator(wrap, item, assessment) {
    const body = wrap.querySelector(".policy-impact__body");
    if (!body) return;
    const kind = assessment.kind;
    const audienceNote = assessment.audiences?.length
      ? `Matched to your saved role${
          assessment.audiences.length > 1 ? "s" : ""
        }: ${assessment.audiences
          .filter((audience) => (state.baselines.roles || []).includes(audience.id))
          .map((audience) => audience.label)
          .join(", ") || "saved profile roles"}.`
      : "Based on your saved pocketbook baselines.";

    body.innerHTML = `
      <p class="policy-impact__note">Heuristic estimate — not an official fiscal note. ${escapeHtml(
        audienceNote
      )}</p>
      <label class="policy-impact__label">
        <span class="policy-impact__label-text"></span>
        <span class="policy-impact__value"></span>
      </label>
      <input class="policy-impact__slider" type="range" />
      <p class="policy-impact__result">Estimated Impact: <strong></strong></p>
      <p class="policy-impact__hint"><a class="bill-card__link" href="${profileHref(
        "pocketbook"
      )}">Update baselines on Profile</a></p>
    `;

    const labelText = wrap.querySelector(".policy-impact__label-text");
    const valueEl = wrap.querySelector(".policy-impact__value");
    const slider = wrap.querySelector(".policy-impact__slider");
    const resultStrong = wrap.querySelector(".policy-impact__result strong");

    const refresh = () => {
      const baselines = state.baselines;
      const config = sliderConfig(kind, baselines);
      labelText.textContent = config.label;
      slider.min = String(config.min);
      slider.max = String(config.max);
      slider.step = String(config.step);
      if (!slider.dataset.ready) {
        slider.value = String(config.value);
        slider.dataset.ready = "1";
      }
      const current = Number(slider.value);
      valueEl.textContent = config.format(current);
      const monthly = estimateMonthly(kind, baselines, current);
      resultStrong.textContent = formatMoney(monthly);
    };

    slider.addEventListener("input", refresh);
    refresh();
  }

  function mount(card, item) {
    if (!card || !item || card.querySelector(".policy-impact")) return;
    if (!moneyRelated(item)) return;

    const wrap = document.createElement("details");
    wrap.className = "policy-impact";
    wrap.innerHTML = `
      <summary>Estimate Impact on You</summary>
      <div class="policy-impact__body">
        <p class="policy-impact__note">Loading your pocketbook details…</p>
      </div>
    `;

    const summarySection = card.querySelector(
      ".policy-bill-card__summary, .search-result-card__pitch"
    );
    if (summarySection) summarySection.after(wrap);
    else card.append(wrap);

    wrap.addEventListener("toggle", async () => {
      if (!wrap.open) return;
      if (!state.loaded) await loadBaselines();
      const assessment = assessEstimate(item, state.baselines);
      if (!assessment.ok) {
        renderIncomplete(wrap, assessment);
        return;
      }
      renderCalculator(wrap, item, assessment);
    });
  }

  global.PolicyImpact = {
    loadBaselines,
    mount,
    moneyRelated,
    getBaselines: () => state.baselines,
    ROLE_OPTIONS,
  };
})(window);
