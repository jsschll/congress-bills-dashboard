/**
 * Voter Pulse onboarding quiz — initialize Action Match stances.
 */
(function () {
  const QUIZ_SIZE = 7;
  const KEY_VOTE_SELECT =
    "roll_call_id, bill_id, title, short_title, card_summary, plain_summary, takeaway, onboarding_question, yea_impact, nay_impact, what_it_does, primary_category, bill_number, bill_type, legislation_number, congress, session_number, roll_call_number, chamber, vote_date, is_key_vote, official_url, vote_kind";

  const els = {
    status: document.getElementById("voter-pulse-status"),
    step: document.getElementById("voter-pulse-step"),
    card: document.getElementById("voter-pulse-card"),
    category: document.getElementById("voter-pulse-category"),
    bill: document.getElementById("voter-pulse-bill"),
    question: document.getElementById("voter-pulse-question"),
    progressFill: document.getElementById("voter-pulse-progress-fill"),
    empty: document.getElementById("voter-pulse-empty"),
    back: document.getElementById("voter-pulse-back"),
    finish: document.getElementById("voter-pulse-finish"),
  };

  const state = {
    questions: [],
    index: 0,
    answers: new Map(), // billId -> support | oppose | skip
    saving: false,
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, tone) {
    if (!els.status) return;
    if (!message) {
      els.status.hidden = true;
      els.status.textContent = "";
      els.status.className = "status voter-pulse__status";
      return;
    }
    els.status.hidden = false;
    els.status.textContent = message;
    els.status.className = `status voter-pulse__status${
      tone ? ` is-${tone}` : ""
    }`;
  }

  function authHref() {
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`
    );
    return `auth.html?next=${next}`;
  }

  function scorecardHref() {
    return "representatives.html?pulse=1";
  }

  function collapsePulseWs(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  /** Reject mid-truncated / ungrammatical stubs like "which cancels D?" */
  function looksBrokenQuestion(text) {
    const q = collapsePulseWs(text);
    if (!q) return true;
    if (q.length < 24) return true;
    if (/\b[A-Z]\?$/.test(q)) return true;
    if (/\b(of|the|a|an|and|or|for|to|with|by|in|on|which|that|who)\?$/i.test(q)) {
      return true;
    }
    if (/\bwhich\b/i.test(q) && /\b(H\.?R\.?|S\.?J\.?Res\.?|bill)\b/i.test(q)) {
      return true;
    }
    if (
      /\b(addressing|regarding|including|requiring|providing)\s+\w{1,4}\?$/i.test(
        q
      )
    ) {
      return true;
    }
    const words = q.replace(/\?+$/, "").split(/\s+/).filter(Boolean);
    if (words.length < 5 || words.length > 28) return true;
    return false;
  }

  function ensureQuestionMark(text) {
    const q = collapsePulseWs(text).replace(/[.!]+$/, "");
    if (!q) return "";
    return /\?$/.test(q) ? q : `${q}?`;
  }

  /**
   * Prefer Claude's dedicated onboarding_question. Fall back to takeaway or a
   * complete standalone question — never stitch "Do you support [ID], which…".
   */
  function buildQuestionText(row) {
    const dedicated = collapsePulseWs(row.onboarding_question || "");
    if (dedicated && !looksBrokenQuestion(ensureQuestionMark(dedicated))) {
      return ensureQuestionMark(dedicated);
    }

    const takeaway = collapsePulseWs(row.takeaway || "");
    if (takeaway) {
      if (/\?$/.test(takeaway) && !looksBrokenQuestion(takeaway)) {
        return takeaway;
      }
      // Headline → complete question without bill-number stitching.
      const topic = takeaway
        .replace(/[.!?]+$/, "")
        .replace(/^(a|an|the)\s+/i, "");
      const fromTakeaway = ensureQuestionMark(
        `Do you support ${topic.charAt(0).toLowerCase()}${topic.slice(1)}`
      );
      if (!looksBrokenQuestion(fromTakeaway)) return fromTakeaway;
    }

    const topic = collapsePulseWs(row.short_title || "").replace(/[.!?]+$/, "");
    if (topic && topic.length >= 8) {
      const fromTitle = ensureQuestionMark(`Do you support the measure on ${topic}`);
      if (!looksBrokenQuestion(fromTitle)) return fromTitle;
    }

    return "Do you support this congressional measure?";
  }

  function rowToQuestion(row) {
    const id = String(row.roll_call_id || row.bill_id || "").trim();
    if (!id) return null;
    const categoryRaw =
      row.primary_category ||
      (typeof inferMatchCategory === "function"
        ? inferMatchCategory(row, row, row)
        : "Economy & Taxes");
    const category =
      typeof normalizePolicyCategory === "function"
        ? normalizePolicyCategory(categoryRaw, `${row.title || ""} ${row.card_summary || ""}`)
        : categoryRaw;
    const badge =
      typeof formatPolicyCategoryBadge === "function"
        ? formatPolicyCategoryBadge(category)
        : String(category || "POLICY").toUpperCase();
    const billNumber = String(row.bill_number || "").trim();
    const title = String(row.short_title || row.title || billNumber || "Key vote").trim();
    return {
      id,
      billNumber,
      title,
      category,
      badge,
      question: buildQuestionText(row),
      congress: Number(row.congress || 119),
      sessionNumber: Number(row.session_number || 1) || null,
      rollCallNumber: Number(row.roll_call_number || 0) || null,
      legislationType: String(row.bill_type || "").trim() || null,
      legislationNumber: String(row.legislation_number || "").replace(/\D/g, "") || null,
      chamber: String(row.chamber || "house").toLowerCase(),
      officialUrl: String(row.official_url || "").trim() || null,
      shortPitch: String(
        row.card_summary || row.plain_summary || row.takeaway || ""
      ).trim(),
      voteDate: row.vote_date || null,
      isKeyVote: row.is_key_vote === true,
    };
  }

  function diversifyQuestions(rows, limit = QUIZ_SIZE) {
    const mapped = (rows || []).map(rowToQuestion).filter(Boolean);
    const withCopy = mapped.filter((q) => q.question && q.shortPitch);
    const pool = withCopy.length >= Math.min(4, limit) ? withCopy : mapped;
    const byCat = new Map();
    for (const q of pool) {
      const key = q.category || "Other";
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(q);
    }
    const categories = [...byCat.keys()].sort(
      (a, b) => byCat.get(b).length - byCat.get(a).length
    );
    const picked = [];
    const used = new Set();
    let guard = 0;
    while (picked.length < limit && guard < limit * categories.length + 20) {
      guard += 1;
      for (const cat of categories) {
        if (picked.length >= limit) break;
        const list = byCat.get(cat) || [];
        const next = list.find((q) => !used.has(q.id));
        if (!next) continue;
        used.add(next.id);
        picked.push(next);
      }
      if (picked.length === used.size && used.size >= pool.length) break;
    }
    if (picked.length < limit) {
      for (const q of pool) {
        if (picked.length >= limit) break;
        if (used.has(q.id)) continue;
        used.add(q.id);
        picked.push(q);
      }
    }
    return picked.slice(0, limit);
  }

  async function selectVoteRows(client, { keyOnly = false, limit = 64 } = {}) {
    const attempts = [
      KEY_VOTE_SELECT,
      KEY_VOTE_SELECT.replace(", onboarding_question", ""),
      "roll_call_id, bill_id, title, short_title, card_summary, plain_summary, takeaway, summary, primary_category, bill_number, bill_type, legislation_number, congress, session_number, roll_call_number, chamber, vote_date, is_key_vote, official_url, vote_kind",
      "roll_call_id, bill_id, title, summary, bill_number, bill_type, legislation_number, congress, session_number, roll_call_number, chamber, vote_date, official_url, vote_kind",
    ];
    let lastError = null;
    for (const select of attempts) {
      let query = client
        .from("processed_votes")
        .select(select)
        .order("vote_date", { ascending: false })
        .limit(limit);
      if (keyOnly && /\bis_key_vote\b/.test(select)) {
        query = query.eq("is_key_vote", true);
      }
      const { data, error } = await query;
      if (!error) return data || [];
      lastError = error;
      console.warn(error);
    }
    if (lastError) throw lastError;
    return [];
  }

  async function loadQuestions(client) {
    let rows = await selectVoteRows(client, { keyOnly: true, limit: 64 });

    if (rows.length < QUIZ_SIZE) {
      const recent = await selectVoteRows(client, { keyOnly: false, limit: 80 });
      const seen = new Set(rows.map((r) => r.roll_call_id));
      for (const row of recent) {
        if (seen.has(row.roll_call_id)) continue;
        const kind = String(row.vote_kind || "").toLowerCase();
        const hasCopy = Boolean(
          row.onboarding_question ||
            row.card_summary ||
            row.plain_summary ||
            row.takeaway ||
            row.yea_impact ||
            row.summary
        );
        if (!hasCopy && kind !== "final_passage" && kind !== "amendment") {
          continue;
        }
        rows.push(row);
        seen.add(row.roll_call_id);
      }
    }

    // Prefer rows that already have a dedicated quiz question.
    rows.sort((a, b) => {
      const aq = String(a.onboarding_question || "").trim() ? 1 : 0;
      const bq = String(b.onboarding_question || "").trim() ? 1 : 0;
      return bq - aq;
    });

    return diversifyQuestions(rows, QUIZ_SIZE);
  }

  async function upsertBillItem(client, question) {
    const payload = {
      id: question.id,
      bill_number: question.billNumber || "Roll call",
      title: question.title || "Untitled",
      level: "Federal",
      jurisdiction:
        question.chamber === "senate" ? "U.S. Senate" : "U.S. House",
      primary_sponsor_name: null,
      primary_sponsor_title: null,
      last_updated: new Date().toISOString(),
      status_step_number: 4,
      status_total_steps: 4,
      status_step_name: "Voted",
      short_pitch: question.shortPitch || null,
      delta_summary: { added: [], changed: [], removed: [] },
      official_url: question.officialUrl || null,
      tags: question.category ? [question.category] : [],
      all_steps: [],
      metadata: {
        source: "voter-pulse-onboarding",
        congress: question.congress || null,
        sessionNumber: question.sessionNumber || null,
        rollCallNumber: question.rollCallNumber || null,
        legislationType: question.legislationType || null,
        legislationNumber: question.legislationNumber || null,
      },
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from("bill_items").upsert(payload, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  async function saveStance(client, user, question, stance) {
    await upsertBillItem(client, question);
    const { error } = await client.from("bill_stances").upsert(
      {
        user_id: user.id,
        bill_id: question.id,
        stance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,bill_id" }
    );
    if (error) throw error;
  }

  function renderCard() {
    const total = state.questions.length;
    const current = state.questions[state.index];
    if (!current || !els.card) return;

    const pct = total ? ((state.index + 1) / total) * 100 : 0;
    if (els.progressFill) {
      els.progressFill.style.width = `${pct}%`;
    }
    if (els.step) {
      els.step.textContent = `Question ${state.index + 1} of ${total}`;
    }

    els.card.hidden = false;
    els.card.classList.remove("is-enter");
    void els.card.offsetWidth;
    els.card.classList.add("is-enter");

    if (els.category) els.category.textContent = current.badge;
    if (els.bill) {
      els.bill.textContent = current.billNumber
        ? `${current.billNumber}${current.title && current.title !== current.billNumber ? ` · ${current.title}` : ""}`
        : current.title;
    }
    if (els.question) els.question.textContent = current.question;

    const prior = state.answers.get(current.id);
    els.card.querySelectorAll("[data-pulse-stance]").forEach((btn) => {
      const active = prior && btn.dataset.pulseStance === prior;
      btn.classList.toggle("is-active", Boolean(active));
      btn.setAttribute("aria-pressed", String(Boolean(active)));
      btn.disabled = state.saving;
    });

    if (els.back) els.back.hidden = state.index === 0;
    if (els.finish) {
      els.finish.textContent =
        state.index >= total - 1 ? "See my matches" : "Skip to scorecard";
    }
  }

  async function goNext() {
    if (state.index < state.questions.length - 1) {
      state.index += 1;
      renderCard();
      return;
    }
    await finishQuiz();
  }

  async function finishQuiz() {
    if (state.saving) return;
    state.saving = true;
    setStatus("Saving your stances…", "loading");
    try {
      const client = getSupabase();
      const user = await getUser();
      if (!client || !user) {
        window.location.href = authHref();
        return;
      }

      let saved = 0;
      for (const question of state.questions) {
        const stance = state.answers.get(question.id);
        if (stance !== "support" && stance !== "oppose") continue;
        await saveStance(client, user, question, stance);
        saved += 1;
      }

      if (typeof markVoterPulseComplete === "function") {
        markVoterPulseComplete({ savedCount: saved });
      }
      setStatus(
        saved
          ? `Saved ${saved} stance${saved === 1 ? "" : "s"}. Opening your scorecard…`
          : "Opening your scorecard…",
        "success"
      );
      window.location.href = scorecardHref();
    } catch (error) {
      console.error(error);
      state.saving = false;
      setStatus(error.message || "Could not save your stances.", "error");
      renderCard();
    }
  }

  async function handleStance(stance) {
    if (state.saving) return;
    const current = state.questions[state.index];
    if (!current) return;

    state.answers.set(current.id, stance);
    els.card?.querySelectorAll("[data-pulse-stance]").forEach((btn) => {
      const active = btn.dataset.pulseStance === stance;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    // Brief feedback before advancing.
    await new Promise((r) => setTimeout(r, 180));
    await goNext();
  }

  function bindActions() {
    els.card?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-pulse-stance]");
      if (!btn) return;
      handleStance(btn.dataset.pulseStance);
    });
    els.back?.addEventListener("click", () => {
      if (state.index <= 0 || state.saving) return;
      state.index -= 1;
      renderCard();
    });
    els.finish?.addEventListener("click", () => {
      finishQuiz();
    });
  }

  async function boot() {
    bindActions();
    await bootNav("profile");

    if (!isSupabaseConfigured()) {
      setStatus(
        "Supabase is not configured. Add keys to config.js to save stances.",
        "error"
      );
      return;
    }

  const user = await requireUser({ forceRedirect: true, next: "onboarding.html" });
  if (!user) return;

    setStatus("Loading key votes…", "loading");
    try {
      const client = getSupabase();
      state.questions = await loadQuestions(client);
      setStatus("");
      if (!state.questions.length) {
        els.card.hidden = true;
        if (els.empty) els.empty.hidden = false;
        if (els.step) els.step.textContent = "";
        return;
      }
      // Prefill prior stances so retakes show current answers.
      const { data: existing } = await client
        .from("bill_stances")
        .select("bill_id, stance")
        .eq("user_id", user.id)
        .in(
          "bill_id",
          state.questions.map((q) => q.id)
        );
      for (const row of existing || []) {
        if (row.stance === "support" || row.stance === "oppose") {
          state.answers.set(row.bill_id, row.stance);
        }
      }
      renderCard();
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not load the quiz.", "error");
      if (els.empty) els.empty.hidden = false;
    }
  }

  boot();
})();
