/**
 * Pocketbook / impact calculator for money-related policy cards.
 * Uses profile baselines when signed in.
 */
(function (global) {
  const MONEY_RE =
    /\b(tax|taxes|taxation|tariff|fee|fees|levy|bond|bonds|millage|property tax|income tax|sales tax|utility|utilities|rate hike|rates|housing|rent|mortgage|assessment|surcharge|toll|premium|budget|appropriat|funding|stimulus|rebate|credit|deduction|irs|revenue)\b/i;

  const DEFAULTS = {
    propertyValue: 350000,
    income: 75000,
    filingStatus: "single",
    vehicleCount: 1,
  };

  const state = {
    baselines: { ...DEFAULTS },
    loaded: false,
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function moneyRelated(item = {}) {
    const haystack = [
      item.title,
      item.shortPitch,
      item.billNumber,
      ...(item.tags || []),
      item.jurisdiction,
    ]
      .filter(Boolean)
      .join(" ");
    return MONEY_RE.test(haystack);
  }

  function detectKind(item = {}) {
    const text = [
      item.title,
      item.shortPitch,
      ...(item.tags || []),
    ]
      .join(" ")
      .toLowerCase();
    if (/property tax|millage|assessment|housing fee|homeowner/.test(text)) {
      return "property";
    }
    if (/income tax|payroll|withholding|earned income|filing/.test(text)) {
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
    if (/fee|surcharge|permit|license/.test(text)) {
      return "fee";
    }
    return "general";
  }

  function estimateMonthly(kind, baselines, sliderValue) {
    const property =
      kind === "income" || kind === "vehicle"
        ? Number(baselines.propertyValue || DEFAULTS.propertyValue)
        : Number(sliderValue || baselines.propertyValue || DEFAULTS.propertyValue);
    const income =
      kind === "income"
        ? Number(sliderValue || baselines.income || DEFAULTS.income)
        : Number(baselines.income || DEFAULTS.income);
    const vehicles =
      kind === "vehicle"
        ? Number(sliderValue ?? baselines.vehicleCount ?? DEFAULTS.vehicleCount)
        : Number(baselines.vehicleCount || DEFAULTS.vehicleCount);

    // Transparent heuristic estimates — not official fiscal notes.
    switch (kind) {
      case "property":
        return (property * 0.00035) / 12; // ~0.035% annual effective change
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
      default:
        return (income * 0.0025 + property * 0.00008) / 12;
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

  async function loadBaselines() {
    state.loaded = true;
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user) {
      state.baselines = { ...DEFAULTS };
      return state.baselines;
    }
    const { data, error } = await client
      .from("profiles")
      .select(
        "estimated_property_value, estimated_income, filing_status, vehicle_count"
      )
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.warn(error);
      return state.baselines;
    }
    state.baselines = {
      propertyValue: Number(data?.estimated_property_value) || DEFAULTS.propertyValue,
      income: Number(data?.estimated_income) || DEFAULTS.income,
      filingStatus: data?.filing_status || DEFAULTS.filingStatus,
      vehicleCount: Number(data?.vehicle_count) || DEFAULTS.vehicleCount,
    };
    return state.baselines;
  }

  function sliderConfig(kind, baselines) {
    if (kind === "income") {
      return {
        label: "Household income",
        min: 25000,
        max: 250000,
        step: 1000,
        value: baselines.income,
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
        value: baselines.vehicleCount,
        format: (n) => String(n),
      };
    }
    return {
      label: "Property value",
      min: 100000,
      max: 1500000,
      step: 5000,
      value: baselines.propertyValue,
      format: (n) =>
        Number(n).toLocaleString(undefined, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }),
    };
  }

  function mount(card, item) {
    if (!card || !item || card.querySelector(".policy-impact")) return;
    if (!moneyRelated(item)) return;

    const kind = detectKind(item);
    const wrap = document.createElement("details");
    wrap.className = "policy-impact";
    wrap.innerHTML = `
      <summary>Estimate Impact on You</summary>
      <div class="policy-impact__body">
        <p class="policy-impact__note">Heuristic estimate from the bill’s topic — not an official fiscal note.</p>
        <label class="policy-impact__label">
          <span class="policy-impact__label-text"></span>
          <span class="policy-impact__value"></span>
        </label>
        <input class="policy-impact__slider" type="range" />
        <p class="policy-impact__result">Estimated Impact: <strong></strong></p>
        <p class="policy-impact__hint"><a class="bill-card__link" href="profile.html">Save baselines on Profile</a> to auto-fill next time.</p>
      </div>
    `;

    const summarySection = card.querySelector(
      ".policy-bill-card__summary, .search-result-card__pitch"
    );
    if (summarySection) summarySection.after(wrap);
    else card.append(wrap);

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

    wrap.addEventListener("toggle", async () => {
      if (!wrap.open) return;
      if (!state.loaded) await loadBaselines();
      refresh();
    });
    slider.addEventListener("input", refresh);
  }

  global.PolicyImpact = {
    loadBaselines,
    mount,
    moneyRelated,
    getBaselines: () => state.baselines,
  };
})(window);
