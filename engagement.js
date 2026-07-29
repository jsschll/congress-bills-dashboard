/**
 * Policy card engagement: Support/Oppose, community split, Take Action modal.
 * Depends on shared.js (getSupabase/getUser) and config.js.
 * Optional: profiles.home_address + /api/lookup-representatives for geo/reps.
 */
(function (global) {
  const LOOKUP_PATH = "/api/lookup-representatives";
  const LOOKUP_FALLBACK =
    "https://congress-bills-dashboard.vercel.app/api/lookup-representatives";
  const VOTE_MATCH_PATH = "/api/bill-vote-match";

  const state = {
    ready: false,
    userId: null,
    stances: new Map(),
    alignment: null,
    matchScores: null,
    geo: null,
    reps: [],
    homeAddress: "",
  };

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function billItemsLevel(level) {
    const value = String(level || "Federal");
    if (["Federal", "State", "City", "District"].includes(value)) return value;
    if (value === "County") return "City";
    return "Federal";
  }

  function redirectToAuth() {
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`
    );
    window.location.href = `auth.html?next=${next}`;
  }

  async function fetchLookup(query) {
    const q = String(query || "").trim();
    if (!q) return null;
    const endpoints = [LOOKUP_PATH];
    if (
      typeof location !== "undefined" &&
      location.origin &&
      !location.origin.includes("vercel.app")
    ) {
      endpoints.push(LOOKUP_FALLBACK);
    }
    for (const endpoint of endpoints) {
      try {
        const response = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
        const data = await response.json().catch(() => ({}));
        if (response.ok) return data;
      } catch (error) {
        console.warn(error);
      }
    }
    return null;
  }

  function pickEmails(person) {
    const fromMeta = person?.metadata?.emails || person?.emails || [];
    const list = Array.isArray(fromMeta) ? fromMeta : [];
    return list.map((item) => String(item || "").trim()).filter(Boolean);
  }

  function isHouseRep(person) {
    const chamber = String(person?.chamber || "").toLowerCase();
    const title = String(
      person?.office_title || person?.metadata?.office_title || ""
    ).toLowerCase();
    const level = String(person?.level || "").toLowerCase();
    if (chamber === "house" || chamber === "us house") return true;
    if (title.includes("representative") && !title.includes("state")) return true;
    if (level === "federal" && /rep\.|representative/.test(title)) return true;
    return false;
  }

  function isSenator(person) {
    const chamber = String(person?.chamber || "").toLowerCase();
    const title = String(
      person?.office_title || person?.metadata?.office_title || ""
    ).toLowerCase();
    return chamber === "senate" || title.includes("senator");
  }

  function districtKeyFromPeople(people, stateCode) {
    const house = (people || []).find(isHouseRep);
    const district = String(house?.district || "").trim();
    if (stateCode && district) {
      return `CD:${String(stateCode).toUpperCase()}-${district}`;
    }
    return "";
  }

  function preferActionRep(people, item) {
    const list = people || [];
    const level = String(item?.level || "Federal");
    if (level === "Federal") {
      return list.find(isHouseRep) || list.find(isSenator) || list[0] || null;
    }
    if (level === "State") {
      return (
        list.find((person) =>
          /state/.test(String(person.chamber || person.office_title || "").toLowerCase())
        ) ||
        list.find(isHouseRep) ||
        list[0] ||
        null
      );
    }
    return list[0] || null;
  }

  async function upsertBillItem(client, item) {
    const currentStep =
      item.status || item.allSteps?.find((step) => step.isCurrent) || {};
    const payload = {
      id: item.id,
      bill_number: item.billNumber || item.bill_number || "Bill",
      title: item.title || "Untitled",
      level: billItemsLevel(item.level),
      jurisdiction: item.jurisdiction || "U.S. Congress",
      primary_sponsor_name: item.primarySponsor?.name || null,
      primary_sponsor_title: item.primarySponsor?.title || null,
      last_updated: item.lastUpdated || new Date().toISOString(),
      status_step_number: currentStep.stepNumber || 1,
      status_total_steps: currentStep.totalSteps || 4,
      status_step_name: currentStep.stepName || "Introduced",
      short_pitch: item.shortPitch || null,
      delta_summary: item.deltaSummary || { added: [], changed: [], removed: [] },
      official_url: item.officialUrl || null,
      tags: item.tags || [],
      all_steps: item.allSteps || [],
      metadata: {
        ...(item.metadata || {}),
        primary_sponsor_bioguide:
          item.primarySponsor?.bioguideId ||
          item.primarySponsor?.bioguide_id ||
          null,
      },
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from("bill_items").upsert(payload, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  async function loadHomeAddress(client, user) {
    const { data, error } = await client
      .from("profiles")
      .select("home_address")
      .eq("id", user.id)
      .maybeSingle();
    if (error) console.warn(error);
    return String(data?.home_address || "").trim();
  }

  async function refreshGeoAndReps() {
    if (!state.homeAddress) {
      state.geo = null;
      state.reps = [];
      return;
    }
    const data = await fetchLookup(state.homeAddress);
    if (!data) return;
    const people = data.politicians || data.officials || [];
    const stateCode = String(data.geography?.state || "").toUpperCase();
    state.reps = people;
    state.geo = {
      state: stateCode,
      city: String(data.geography?.city || "").trim(),
      county: String(data.geography?.county || "").trim(),
      districtKey: districtKeyFromPeople(people, stateCode),
      label: data.formattedAddress || state.homeAddress,
    };
  }

  async function loadUserStances(client, user) {
    const { data, error } = await client
      .from("bill_stances")
      .select("bill_id, stance")
      .eq("user_id", user.id);
    if (error) throw error;
    state.stances = new Map(
      (data || []).map((row) => [row.bill_id, row.stance])
    );
  }

  async function loadAlignment(client) {
    const { data, error } = await client.rpc("get_user_alignment_score");
    if (error) {
      console.warn(error);
      state.alignment = null;
      return;
    }
    state.alignment = data;
  }

  async function loadMatchScores(client) {
    const { data, error } = await client.rpc("get_user_rep_match_scores");
    if (error) {
      // Migration may not be applied yet.
      console.warn(error);
      state.matchScores = { politicians: [], levels: [] };
      return;
    }
    state.matchScores = data || { politicians: [], levels: [] };
  }

  function houseRepBioguides() {
    return (state.reps || [])
      .filter(isHouseRep)
      .map((person) => person.bioguide_id || person.bioguideId)
      .filter(Boolean)
      .map((id) => String(id).toUpperCase());
  }

  async function fetchVoteMatch(item, stance) {
    const params = new URLSearchParams();
    params.set("billId", item.id);
    if (stance) params.set("stance", stance);
    if (item.rollCallNumber) {
      params.set("rollCallNumber", String(item.rollCallNumber));
    }
    if (item.sessionNumber) {
      params.set("sessionNumber", String(item.sessionNumber));
    }
    if (item.congress) {
      params.set("congress", String(item.congress));
    }
    const bios = houseRepBioguides();
    if (bios.length) params.set("bioguides", bios.join(","));
    if (typeof API_KEY === "string" && API_KEY.trim()) {
      params.set("api_key", API_KEY.trim());
    }
    try {
      const response = await fetch(`${VOTE_MATCH_PATH}?${params.toString()}`);
      return await response.json();
    } catch (error) {
      console.warn(error);
      return null;
    }
  }

  async function persistVoteMatches(client, user, item, stance, payload) {
    if (!payload?.hasRollCall || !Array.isArray(payload.members)) return;
    for (const member of payload.members) {
      if (!member.bioguideId) continue;
      const rep = (state.reps || []).find(
        (person) =>
          String(person.bioguide_id || "").toUpperCase() ===
          String(member.bioguideId).toUpperCase()
      );
      const { error } = await client.from("stance_vote_matches").upsert(
        {
          user_id: user.id,
          bill_id: item.id,
          bioguide_id: String(member.bioguideId).toUpperCase(),
          politician_name:
            member.name || rep?.full_name || rep?.name || member.bioguideId,
          politician_level: "federal",
          user_stance: stance,
          member_vote: member.voteCast || null,
          matched: member.matched,
          roll_call_number: payload.rollCallNumber || null,
          congress: payload.congress || null,
          session_number: payload.sessionNumber || null,
          vote_result: payload.result || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,bill_id,bioguide_id" }
      );
      if (error) console.warn(error);
    }
    await loadMatchScores(client);
  }

  function renderWhoVotedHtml(stance, payload) {
    if (!stance) {
      return `<p class="policy-engage__vote-empty">Tap Support or Oppose to compare with House roll call votes.</p>`;
    }
    if (!payload?.hasRollCall) {
      return `<p class="policy-engage__vote-empty">${escapeHtml(
        payload?.message ||
          "No House roll call yet. Your stance is saved — we’ll compare when Congress votes."
      )}</p>`;
    }
    const tallies = payload.tallies || {};
    const members = (payload.members || []).filter((row) => row.voteCast);
    const lines = members
      .map((row) => {
        const matchLabel =
          row.matched === true
            ? "matched you"
            : row.matched === false
              ? "voted differently"
              : "no comparable vote";
        return `<li><a class="politician-name-link" href="politician.html?bioguide=${encodeURIComponent(
          String(row.bioguideId || "").toUpperCase()
        )}"><strong>${escapeHtml(
          row.name || row.bioguideId
        )}</strong></a> voted <em>${escapeHtml(
          row.voteCast
        )}</em> — ${escapeHtml(matchLabel)}</li>`;
      })
      .join("");
    return `
      <p class="policy-engage__vote-summary">
        House roll call #${escapeHtml(String(payload.rollCallNumber))} ·
        Yea ${escapeHtml(String(tallies.yea || 0))} / Nay ${escapeHtml(
          String(tallies.nay || 0)
        )}
        ${payload.result ? ` · ${escapeHtml(payload.result)}` : ""}
      </p>
      ${
        lines
          ? `<ul class="policy-engage__vote-list">${lines}</ul>`
          : `<p class="policy-engage__vote-empty">Add your address on Profile to compare with your House representative.</p>`
      }
    `;
  }

  async function init() {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    state.userId = user?.id || null;
    if (!client || !user) {
      state.ready = true;
      return state;
    }
    try {
      state.homeAddress = await loadHomeAddress(client, user);
      await Promise.all([
        loadUserStances(client, user),
        loadAlignment(client),
        loadMatchScores(client),
        refreshGeoAndReps(),
      ]);
    } catch (error) {
      console.warn(error);
    }
    state.ready = true;
    return state;
  }

  async function fetchCommunity(billId) {
    const client = getSupabase();
    if (!client || !billId) {
      return { support: 0, oppose: 0, total: 0, scope: "national" };
    }
    const { data, error } = await client.rpc("get_bill_community_stances", {
      p_bill_id: billId,
      p_state_code: state.geo?.state || null,
      p_district_key: state.geo?.districtKey || null,
    });
    if (error) {
      console.warn(error);
      return { support: 0, oppose: 0, total: 0, scope: "national" };
    }
    return data || { support: 0, oppose: 0, total: 0, scope: "national" };
  }

  function scopeLabel(scope) {
    if (scope === "district") return "your district";
    if (scope === "state") return "your state";
    return "all users";
  }

  function renderCommunityHtml(stats) {
    const total = Number(stats.total || 0);
    const support = Number(stats.support || 0);
    const oppose = Number(stats.oppose || 0);
    const supportPct = total ? Math.round((support / total) * 100) : 0;
    const opposePct = total ? 100 - supportPct : 0;
    if (!total) {
      return `<p class="policy-engage__community-empty">No community stances yet in ${escapeHtml(
        scopeLabel(stats.scope)
      )}. Be the first to Support or Oppose.</p>`;
    }
    return `
      <p class="policy-engage__community-summary">
        <strong>${supportPct}% Support</strong> · <strong>${opposePct}% Oppose</strong>
        <span>(${total} stance${total === 1 ? "" : "s"} in ${escapeHtml(
          scopeLabel(stats.scope)
        )})</span>
      </p>
      <div class="policy-engage__bar" role="img" aria-label="${supportPct}% support, ${opposePct}% oppose">
        <span class="policy-engage__bar-support" style="width:${supportPct}%"></span>
        <span class="policy-engage__bar-oppose" style="width:${opposePct}%"></span>
      </div>
    `;
  }

  function alignmentChipHtml() {
    const score = state.alignment?.score;
    if (score == null) return "";
    return `<span class="policy-engage__alignment" title="Share of your stances that match the majority in your district or state">Alignment ${escapeHtml(
      String(score)
    )}%</span>`;
  }

  function buildTemplate(item, rep, stance) {
    const stanceWord =
      stance === "oppose" ? "oppose" : stance === "support" ? "support" : "am writing about";
    const stanceLine =
      stance === "oppose"
        ? `I urge you to oppose ${item.billNumber}.`
        : stance === "support"
          ? `I urge you to support ${item.billNumber}.`
          : `I am writing about ${item.billNumber}.`;
    const repName = rep?.full_name || rep?.name || "Representative";
    const userPlace = state.geo?.label || state.homeAddress || "our district";
    return {
      subject: `${item.billNumber}: constituent message regarding ${item.title}`.slice(
        0,
        120
      ),
      body: `Dear ${repName},

I am a constituent in ${userPlace}. I ${stanceWord} ${item.billNumber} — ${item.title}.

${stanceLine}

Here is why this matters to me:
[Add a personal sentence or two.]

Thank you for your time and consideration.

Sincerely,
[Your name]
[Your city, state ZIP]`,
    };
  }

  function ensureModal() {
    let modal = document.getElementById("policy-action-modal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "policy-action-modal";
    modal.className = "policy-action-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="policy-action-modal__backdrop" data-close="1"></div>
      <div class="policy-action-modal__panel" role="dialog" aria-modal="true" aria-labelledby="policy-action-title">
        <header class="policy-action-modal__header">
          <div>
            <p class="eyebrow">Take action</p>
            <h2 id="policy-action-title">Email your representative</h2>
          </div>
          <button type="button" class="refresh-btn" data-close="1">Close</button>
        </header>
        <p class="policy-action-modal__rep" id="policy-action-rep"></p>
        <label class="search-bar__label" for="policy-action-subject">Subject</label>
        <input id="policy-action-subject" class="search-bar__input" type="text" />
        <label class="search-bar__label" for="policy-action-body">Message</label>
        <textarea id="policy-action-body" class="policy-action-modal__body" rows="12"></textarea>
        <div class="policy-action-modal__actions">
          <button type="button" class="refresh-btn" id="policy-action-copy">Copy message</button>
          <a class="refresh-btn policy-action-modal__send" id="policy-action-send" href="#">Open email app</a>
        </div>
        <p class="policy-action-modal__hint" id="policy-action-hint"></p>
      </div>
    `;
    document.body.append(modal);
    modal.addEventListener("click", (event) => {
      if (event.target?.dataset?.close) closeModal();
    });
    document.getElementById("policy-action-copy").addEventListener("click", async () => {
      const body = document.getElementById("policy-action-body").value;
      const subject = document.getElementById("policy-action-subject").value;
      try {
        await navigator.clipboard.writeText(`${subject}\n\n${body}`);
        document.getElementById("policy-action-hint").textContent =
          "Copied. Paste into your email app if mailto is unavailable.";
      } catch {
        document.getElementById("policy-action-hint").textContent =
          "Could not copy automatically — select the message and copy it.";
      }
    });
    return modal;
  }

  function closeModal() {
    const modal = document.getElementById("policy-action-modal");
    if (modal) modal.hidden = true;
  }

  async function logContactAction(item, rep, body) {
    const client = getSupabase();
    const user = await getUser();
    if (!client || !user) return;
    try {
      await client.from("civic_actions").insert({
        user_id: user.id,
        kind: "contact",
        title: `Contacted about ${item.billNumber}`,
        body,
        bill_id: item.id,
        bill_label: `${item.billNumber} — ${item.title}`.slice(0, 180),
        politician_name: rep?.full_name || rep?.name || null,
        contact_method: "email",
        action_date: new Date().toISOString().slice(0, 10),
      });
    } catch (error) {
      console.warn(error);
    }
  }

  async function openTakeAction(item) {
    const user = await getUser();
    if (!user) {
      redirectToAuth();
      return;
    }
    if (!state.homeAddress) {
      window.location.href = "profile.html";
      return;
    }
    if (!state.reps.length) await refreshGeoAndReps();

    const rep = preferActionRep(state.reps, item);
    const modal = ensureModal();
    const stance = state.stances.get(item.id) || null;
    const template = buildTemplate(item, rep, stance);
    const emails = pickEmails(rep);
    const repLabel = rep
      ? `${rep.full_name || rep.name} · ${
          rep.office_title || rep.metadata?.office_title || "Representative"
        }`
      : "No district representative found yet";

    document.getElementById("policy-action-rep").textContent = rep
      ? `To: ${repLabel}`
      : "Add a street address or ZIP on your Profile so we can target your district representative.";
    document.getElementById("policy-action-subject").value = template.subject;
    document.getElementById("policy-action-body").value = template.body;

    const send = document.getElementById("policy-action-send");
    const hint = document.getElementById("policy-action-hint");
    if (emails[0]) {
      send.hidden = false;
      send.textContent = "Open email app";
      send.href = `mailto:${encodeURIComponent(emails[0])}?subject=${encodeURIComponent(
        template.subject
      )}&body=${encodeURIComponent(template.body)}`;
      hint.textContent = `Ready to email ${emails[0]}. Edit the message first if you like.`;
      send.onclick = async () => {
        await logContactAction(item, rep, document.getElementById("policy-action-body").value);
      };
    } else if (rep?.website_url) {
      send.hidden = false;
      send.textContent = "Open official contact page";
      send.href = rep.website_url;
      send.target = "_blank";
      send.rel = "noopener noreferrer";
      hint.textContent =
        "No public email on file — copy the message, then use their official contact form.";
      send.onclick = async () => {
        await logContactAction(item, rep, document.getElementById("policy-action-body").value);
      };
    } else {
      send.hidden = true;
      hint.textContent =
        "No email or contact page found. Copy the message and send it from your representative’s website.";
    }

    // Keep mailto in sync when editing
    const syncMailto = () => {
      if (!emails[0]) return;
      const subject = document.getElementById("policy-action-subject").value;
      const body = document.getElementById("policy-action-body").value;
      send.href = `mailto:${encodeURIComponent(emails[0])}?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(body)}`;
    };
    document.getElementById("policy-action-subject").oninput = syncMailto;
    document.getElementById("policy-action-body").oninput = syncMailto;

    modal.hidden = false;
  }

  async function setStance(item, nextStance, roots) {
    const client = getSupabase();
    const user = await getUser();
    if (!client || !user) {
      redirectToAuth();
      return;
    }
    if (!item?.id) return;

    await upsertBillItem(client, item);
    if (!state.geo && state.homeAddress) await refreshGeoAndReps();

    const current = state.stances.get(item.id);
    let activeStance = null;
    if (current === nextStance) {
      const { error } = await client
        .from("bill_stances")
        .delete()
        .eq("user_id", user.id)
        .eq("bill_id", item.id);
      if (error) throw error;
      state.stances.delete(item.id);
      await client
        .from("stance_vote_matches")
        .delete()
        .eq("user_id", user.id)
        .eq("bill_id", item.id);
      activeStance = null;
    } else {
      const { error } = await client.from("bill_stances").upsert(
        {
          user_id: user.id,
          bill_id: item.id,
          stance: nextStance,
          state_code: state.geo?.state || null,
          district_key: state.geo?.districtKey || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,bill_id" }
      );
      if (error) throw error;
      state.stances.set(item.id, nextStance);
      activeStance = nextStance;
    }

    await loadAlignment(client);
    let votePayload = null;
    if (activeStance && String(item.level || "").toLowerCase() === "federal") {
      if (roots.voteBody) {
        roots.voteBody.innerHTML =
          `<p class="policy-engage__vote-empty">Checking House roll call…</p>`;
      }
      votePayload = await fetchVoteMatch(item, activeStance);
      await persistVoteMatches(client, user, item, activeStance, votePayload);
    } else {
      await loadMatchScores(client);
    }
    await refreshMountedCard(item, roots, votePayload);
  }

  async function refreshMountedCard(item, roots, votePayload = null) {
    const supportBtn = roots.supportBtn;
    const opposeBtn = roots.opposeBtn;
    const communityBody = roots.communityBody;
    const alignmentEl = roots.alignmentEl;
    const mine = state.stances.get(item.id);
    supportBtn.classList.toggle("is-active", mine === "support");
    opposeBtn.classList.toggle("is-active", mine === "oppose");
    supportBtn.setAttribute("aria-pressed", String(mine === "support"));
    opposeBtn.setAttribute("aria-pressed", String(mine === "oppose"));
    const stats = await fetchCommunity(item.id);
    communityBody.innerHTML = renderCommunityHtml(stats);
    if (alignmentEl) {
      alignmentEl.outerHTML =
        alignmentChipHtml() ||
        `<span class="policy-engage__alignment is-empty"></span>`;
      roots.alignmentEl = roots.root.querySelector(".policy-engage__alignment");
    }
    if (roots.voteBody) {
      if (votePayload) {
        roots.voteBody.innerHTML = renderWhoVotedHtml(mine, votePayload);
      } else if (mine) {
        roots.voteBody.innerHTML = `<p class="policy-engage__vote-empty">Loading roll-call comparison…</p>`;
        const payload = await fetchVoteMatch(item, mine);
        roots.voteBody.innerHTML = renderWhoVotedHtml(mine, payload);
      } else {
        roots.voteBody.innerHTML = renderWhoVotedHtml(null, null);
      }
    }
  }

  function mount(card, item, options = {}) {
    if (!card || !item?.id) return;
    if (card.querySelector(".policy-engage")) return;

    const supportLabel = options.supportLabel || "Support 👍";
    const opposeLabel = options.opposeLabel || "Oppose 👎";
    const prompt = options.prompt || "";
    const showTakeAction = options.showTakeAction !== false;
    const whoVotedHint =
      options.whoVotedHint ||
      "Tap Support or Oppose to compare with House roll call votes.";

    const wrap = document.createElement("section");
    wrap.className = "policy-engage";
    wrap.innerHTML = `
      ${
        prompt
          ? `<p class="policy-engage__prompt">${escapeHtml(prompt)}</p>`
          : ""
      }
      <div class="policy-engage__actions">
        <div class="policy-engage__stances" role="group" aria-label="Your stance">
          <button type="button" class="policy-engage__stance policy-engage__stance--support" data-stance="support" aria-pressed="false">${escapeHtml(
            supportLabel
          )}</button>
          <button type="button" class="policy-engage__stance policy-engage__stance--oppose" data-stance="oppose" aria-pressed="false">${escapeHtml(
            opposeLabel
          )}</button>
        </div>
        ${
          showTakeAction
            ? `<button type="button" class="refresh-btn policy-engage__take-action">Take Action</button>`
            : ""
        }
        ${alignmentChipHtml() || '<span class="policy-engage__alignment is-empty" hidden></span>'}
      </div>
      <details class="policy-engage__votes" open>
        <summary>Who Voted With Me?</summary>
        <div class="policy-engage__vote-body">
          <p class="policy-engage__vote-empty">${escapeHtml(whoVotedHint)}</p>
        </div>
      </details>
      <details class="policy-engage__community">
        <summary>Community Stances</summary>
        <div class="policy-engage__community-body">
          <p class="policy-engage__community-empty">Loading community split…</p>
        </div>
      </details>
    `;

    // Keep engagement actions at the bottom of the card.
    card.append(wrap);

    const roots = {
      root: wrap,
      supportBtn: wrap.querySelector('[data-stance="support"]'),
      opposeBtn: wrap.querySelector('[data-stance="oppose"]'),
      communityBody: wrap.querySelector(".policy-engage__community-body"),
      voteBody: wrap.querySelector(".policy-engage__vote-body"),
      alignmentEl: wrap.querySelector(".policy-engage__alignment"),
    };

    const mine = state.stances.get(item.id);
    roots.supportBtn.classList.toggle("is-active", mine === "support");
    roots.opposeBtn.classList.toggle("is-active", mine === "oppose");
    roots.supportBtn.setAttribute("aria-pressed", String(mine === "support"));
    roots.opposeBtn.setAttribute("aria-pressed", String(mine === "oppose"));

    roots.supportBtn.addEventListener("click", async () => {
      try {
        await setStance(item, "support", roots);
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not save stance.");
      }
    });
    roots.opposeBtn.addEventListener("click", async () => {
      try {
        await setStance(item, "oppose", roots);
      } catch (error) {
        console.error(error);
        alert(error.message || "Could not save stance.");
      }
    });
    wrap
      .querySelector(".policy-engage__take-action")
      ?.addEventListener("click", () => {
        openTakeAction(item).catch((error) => {
          console.error(error);
          alert(error.message || "Could not open Take Action.");
        });
      });

    const details = wrap.querySelector(".policy-engage__community");
    let loaded = false;
    details.addEventListener("toggle", async () => {
      if (!details.open || loaded) return;
      loaded = true;
      const stats = await fetchCommunity(item.id);
      roots.communityBody.innerHTML = renderCommunityHtml(stats);
    });

    if (mine) {
      fetchVoteMatch(item, mine).then((payload) => {
        roots.voteBody.innerHTML = renderWhoVotedHtml(mine, payload);
      });
    }
  }

  function mountVote(card, item) {
    return mount(card, item, {
      supportLabel: "Yea",
      opposeLabel: "Nay",
      prompt: "How would you vote?",
      showTakeAction: false,
      whoVotedHint: "Tap Yea or Nay to compare with House members.",
    });
  }

  function renderHeaderScore(target) {
    if (!target) return;
    let el = document.getElementById("policy-alignment-score");
    if (!el) {
      el = document.createElement("p");
      el.id = "policy-alignment-score";
      el.className = "policy-alignment-score";
      target.append(el);
    }
    const score = state.alignment?.score;
    if (score == null) {
      el.textContent =
        state.alignment?.label ||
        "Support or oppose bills to build your Representative Alignment Score.";
      return;
    }
    el.innerHTML = `<strong>Representative Alignment Score: ${escapeHtml(
      String(score)
    )}%</strong> <span>based on ${escapeHtml(
      String(state.alignment.compared || 0)
    )} stance${state.alignment.compared === 1 ? "" : "s"} vs your area’s majority</span>`;
  }

  global.PolicyEngagement = {
    init,
    mount,
    mountVote,
    renderHeaderScore,
    openTakeAction,
    getState: () => state,
    getMatchScoreForBioguide(bioguideId) {
      const id = String(bioguideId || "").toUpperCase();
      const rows = state.matchScores?.politicians || [];
      const row = rows.find(
        (entry) => String(entry.bioguide_id || "").toUpperCase() === id
      );
      return row?.score ?? null;
    },
    getMatchScores: () => state.matchScores,
  };
})(window);
