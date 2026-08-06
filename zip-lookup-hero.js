/**
 * Vanilla scorecard store + ZipLookupHero mount for the Article 1 landing page.
 * Mirrors components/scorecardStore.ts + ZipLookupHero.tsx behavior without React.
 */

(function (global) {
  const US_ZIP_RE = /^\d{5}(?:-\d{4})?$/;
  const HAS_LETTER_RE = /[A-Za-z]/;
  const HAS_DIGIT_RE = /\d/;

  const initialState = {
    status: "idle",
    query: "",
    data: null,
    error: null,
    representatives: [],
  };

  let state = { ...initialState };
  const listeners = new Set();

  function emit() {
    global.__article1Scorecard = state;
    global.dispatchEvent(
      new CustomEvent("article1:scorecard", { detail: state })
    );
    listeners.forEach((listener) => {
      try {
        listener(state);
      } catch (error) {
        console.warn("scorecard listener failed", error);
      }
    });
  }

  const scorecardStore = {
    getState() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(patch) {
      state = { ...state, ...patch };
      emit();
    },
    reset() {
      state = { ...initialState };
      emit();
    },
    setLoading(query) {
      this.setState({ status: "loading", query, error: null });
    },
    setSuccess(query, data) {
      this.setState({
        status: "success",
        query,
        data,
        error: null,
        representatives: data?.representatives || [],
      });
    },
    setError(query, error) {
      this.setState({
        status: "error",
        query,
        error,
        data: null,
        representatives: [],
      });
    },
  };

  function classifyLookupQuery(raw) {
    const value = String(raw || "").trim();
    if (!value) return "empty";
    const collapsed = value.replace(/\s+/g, "");
    if (US_ZIP_RE.test(collapsed)) return "zip";
    if (value.length < 5 || !HAS_LETTER_RE.test(value)) return "invalid";
    const hasStateHint = /,\s*[A-Za-z]{2}\b|\b[A-Za-z]{2}\s+\d{5}\b/.test(value);
    if (HAS_DIGIT_RE.test(value) || hasStateHint) return "address";
    if (value.split(/\s+/).filter(Boolean).length >= 2) return "address";
    return "invalid";
  }

  function validateLookupQuery(raw) {
    const kind = classifyLookupQuery(raw);
    const value = String(raw || "").trim();
    if (kind === "empty") {
      return {
        ok: false,
        kind,
        message: "Enter a US ZIP code or street address.",
      };
    }
    if (kind === "invalid") {
      return {
        ok: false,
        kind,
        message:
          "Enter a valid 5-digit ZIP (or ZIP+4), or a full US address with city and state.",
      };
    }
    if (kind === "zip") {
      return {
        ok: true,
        kind,
        message: "",
        zipCode: value.replace(/\s+/g, "").slice(0, 10),
      };
    }
    return { ok: true, kind, message: "", address: value };
  }

  async function fetchRepresentativesLookup(endpoint, parsed) {
    const params = new URLSearchParams();
    if (parsed.zipCode) params.set("zipCode", parsed.zipCode);
    if (parsed.address) params.set("address", parsed.address);
    const response = await fetch(`${endpoint}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(
        payload?.error || `Lookup failed (${response.status || "network"})`
      );
    }
    return payload;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderResults(listEl, representatives) {
    if (!listEl) return;
    if (!representatives?.length) {
      listEl.hidden = true;
      listEl.replaceChildren();
      return;
    }
    listEl.hidden = false;
    listEl.innerHTML = representatives
      .map((rep) => {
        const profile = rep.profile || {};
        const meta = [profile.chamber, profile.party].filter(Boolean).join(" · ");
        return `<li class="zip-lookup-hero__chip">
          <span class="zip-lookup-hero__chip-name">${escapeHtml(profile.name)}</span>
          ${meta ? `<span class="zip-lookup-hero__chip-meta"> · ${escapeHtml(meta)}</span>` : ""}
        </li>`;
      })
      .join("");
  }

  /**
   * Mount ZipLookupHero behavior onto existing landing markup.
   * @param {{
   *   formId?: string,
   *   inputId?: string,
   *   submitId?: string,
   *   hintId?: string,
   *   resultsId?: string,
   *   endpoint?: string,
   * }} [options]
   */
  function mountZipLookupHero(options = {}) {
    const form = document.getElementById(options.formId || "home-address-form");
    const input = document.getElementById(
      options.inputId || "home-address-input"
    );
    const submit =
      document.getElementById(options.submitId || "home-address-submit") ||
      form?.querySelector('button[type="submit"]');
    const hint = document.getElementById(
      options.hintId || "home-address-hint"
    );
    const results = document.getElementById(
      options.resultsId || "home-address-results"
    );
    const endpoint = options.endpoint || "/api/representatives/lookup";
    const defaultHint =
      hint?.dataset.defaultText ||
      hint?.textContent?.trim() ||
      "Instant access to voting records, campaign funding, and direct constituent outreach.";

    if (!form || !input) return null;

    form.classList.add("zip-lookup-hero__form");
    input.classList.add("zip-lookup-hero__input");
    if (submit) submit.classList.add("zip-lookup-hero__submit");
    if (hint) hint.classList.add("zip-lookup-hero__hint");
    form.setAttribute("novalidate", "novalidate");

    function setHint(message, tone = "default") {
      if (!hint) return;
      hint.textContent = message;
      hint.dataset.tone = tone;
      hint.setAttribute(
        "role",
        tone === "error" ? "alert" : "status"
      );
    }

    function setLoading(isLoading) {
      form.setAttribute("aria-busy", isLoading ? "true" : "false");
      input.disabled = isLoading;
      if (submit) {
        submit.disabled = isLoading;
        submit.dataset.loading = isLoading ? "true" : "false";
        submit.innerHTML = isLoading
          ? `<span class="zip-lookup-hero__spinner zip-lookup-hero__spinner--on-dark" aria-hidden="true"></span> Auditing…`
          : "Track Your Reps";
      }
      form.classList.toggle("is-loading", isLoading);
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const raw = input.value;
      const parsed = validateLookupQuery(raw);
      if (!parsed.ok) {
        setHint(parsed.message, "error");
        input.setAttribute("aria-invalid", "true");
        scorecardStore.setError(raw.trim(), parsed.message);
        return;
      }

      input.setAttribute("aria-invalid", "false");
      const query = parsed.zipCode || parsed.address || raw.trim();
      setLoading(true);
      setHint("Looking up your federal representatives…", "loading");
      scorecardStore.setLoading(query);
      renderResults(results, []);

      try {
        const data = await fetchRepresentativesLookup(endpoint, parsed);
        scorecardStore.setSuccess(query, data);
        const place =
          data.location?.formattedAddress ||
          data.location?.state ||
          "your area";
        const total = data.counts?.total ?? data.representatives?.length ?? 0;
        setHint(
          total
            ? `Found ${total} federal representative${total === 1 ? "" : "s"} for ${place}.`
            : `No federal scorecard profiles matched ${place} yet. We’re syncing from your ZIP — try again in a moment, or enter a full street address if your ZIP spans districts.`,
          total ? "success" : "default"
        );
        renderResults(results, data.representatives || []);
        if (total > 0) {
          try {
            sessionStorage.setItem(
              "article1.scorecardSession",
              JSON.stringify({
                ...data,
                activeId: data.representatives[0]?.profile?.id || null,
                query: {
                  zipCode: parsed.zipCode || null,
                  address: parsed.address || null,
                },
              })
            );
          } catch {
            /* ignore */
          }
          if (typeof saveGuestLocationContext === "function") {
            saveGuestLocationContext({
              zipCode: parsed.zipCode || null,
              address: parsed.address || null,
              query,
            });
          }
          const params = new URLSearchParams();
          if (parsed.zipCode) params.set("zipCode", parsed.zipCode);
          else if (parsed.address) params.set("address", parsed.address);
          const firstId = data.representatives[0]?.profile?.id;
          if (firstId) params.set("id", firstId);
          window.location.href = `representatives.html?${params.toString()}`;
          return;
        }
        const message =
          error?.message || "Could not look up representatives.";
        scorecardStore.setError(query, message);
        setHint(message, "error");
        renderResults(results, []);
      } finally {
        setLoading(false);
      }
    });

    input.addEventListener("input", () => {
      if (hint?.dataset.tone === "error") {
        setHint(defaultHint, "default");
        input.setAttribute("aria-invalid", "false");
      }
    });

    global.__article1Scorecard = scorecardStore.getState();
    return { form, input, store: scorecardStore };
  }

  global.scorecardStore = scorecardStore;
  global.validateLookupQuery = validateLookupQuery;
  global.mountZipLookupHero = mountZipLookupHero;
})(typeof window !== "undefined" ? window : globalThis);
