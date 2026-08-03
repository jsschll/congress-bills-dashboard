/**
 * Vanilla Representative Scorecard dashboard.
 * Page 1 layout + Page 2 hero badges / actions / Action Match Scorecard.
 */

(function (global) {
  const SESSION_KEY = "article1.scorecardSession";
  const PENDING_FOLLOW_KEY = "article1.pendingFollow";
  const ENDPOINT = "/api/representatives/lookup";

  const CATEGORY_RULES = [
    {
      key: "Immigration",
      re: /\b(immigra|border|asylum|visa|deport|refugee|customs)\b/i,
    },
    { key: "Taxes", re: /\b(tax|irs|tariff|revenue|duty|excise)\b/i },
    {
      key: "Family",
      re: /\b(family|child|parent|marriage|adoption|foster)\b/i,
    },
    {
      key: "Healthcare",
      re: /\b(health|medicare|medicaid|hospital|drug|pharma|aca|insurance)\b/i,
    },
    { key: "Housing", re: /\b(hous(e|ing)|rent|mortgage|homeless|zoning)\b/i },
    {
      key: "Education",
      re: /\b(school|educat|student|university|college|title ix)\b/i,
    },
    {
      key: "Defense",
      re: /\b(defense|military|veteran|armed forces|national security)\b/i,
    },
    {
      key: "Environment",
      re: /\b(climat|environment|energy|epa|clean air|water)\b/i,
    },
  ];

  /** @type {Map<string, object>} */
  const enrichCache = new Map();
  /** @type {Set<string>} */
  let followedPoliticianIds = new Set();
  /** @type {{ id?: string } | null} */
  let followUser = null;
  /** @type {object | null} */
  let activeRosterPerson = null;
  /** @type {{ id?: string, body?: string } | null} */
  let politicianNote = null;
  /** @type {Element | null} */
  let notesModalLastFocus = null;
  let notePopoverHideTimer = 0;
  let notesBound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUsd(amount) {
    if (amount == null || Number.isNaN(Number(amount))) return "—";
    const n = Number(amount);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n >= 1000 ? 0 : 2,
      }).format(n);
    } catch {
      return `$${Math.round(n).toLocaleString("en-US")}`;
    }
  }

  function formatPct(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return `${Math.round(Number(value) * 10) / 10}%`;
  }

  function partyKind(party) {
    const value = String(party || "").toLowerCase();
    if (value.startsWith("dem")) return "democrat";
    if (value.startsWith("rep") || value.includes("gop")) return "republican";
    if (value.startsWith("ind")) return "independent";
    return "other";
  }

  function partyLabel(kind, raw) {
    if (kind === "democrat") return "Democrat";
    if (kind === "republican") return "Republican";
    if (kind === "independent") return "Independent";
    return String(raw || "Nonpartisan");
  }

  function partyClassName(party) {
    if (typeof partyClass === "function") return partyClass(party);
    const kind = partyKind(party);
    if (kind === "democrat") return "party--dem";
    if (kind === "republican") return "party--rep";
    return "party--other";
  }

  function authNextHref() {
    const next = encodeURIComponent(
      `${global.location.pathname}${global.location.search}`
    );
    return `auth.html?next=${next}`;
  }

  function readQuery() {
    const params = new URLSearchParams(global.location.search);
    return {
      id: (params.get("id") || "").trim() || null,
      bioguideId:
        (params.get("bioguideId") || params.get("bioguide") || "")
          .trim()
          .toUpperCase() || null,
      politicianId:
        (params.get("politicianId") || params.get("rosterId") || "").trim() ||
        null,
      zipCode:
        (params.get("zipCode") || params.get("zip") || "").trim() || null,
      address:
        (params.get("address") || params.get("q") || "").trim() || null,
    };
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeSession(payload) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }

  function setStatus(message, type = "loading") {
    const el = $("scorecard-status");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.dataset.type = type;
    if (message && (type === "success" || type === "error")) {
      global.clearTimeout(setStatus._hideTimer);
      setStatus._hideTimer = global.setTimeout(() => {
        if (el.dataset.type === type && el.textContent === message) {
          el.hidden = true;
          el.textContent = "";
        }
      }, type === "success" ? 4200 : 7000);
    }
  }

  function readPendingFollow() {
    try {
      const raw = sessionStorage.getItem(PENDING_FOLLOW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writePendingFollow(payload) {
    try {
      if (!payload) sessionStorage.removeItem(PENDING_FOLLOW_KEY);
      else sessionStorage.setItem(PENDING_FOLLOW_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function pendingFollowMatches(person) {
    const pending = readPendingFollow();
    if (!pending || !person) return null;
    const pendingBio = String(pending.bioguideId || "")
      .trim()
      .toUpperCase();
    const personBio = String(person.bioguide_id || person.bioguideId || "")
      .trim()
      .toUpperCase();
    if (pendingBio && personBio && pendingBio === personBio) return pending;
    if (pending.id && person.id && String(pending.id) === String(person.id)) {
      return pending;
    }
    if (
      pending.name &&
      person.name &&
      String(pending.name).toLowerCase() === String(person.name).toLowerCase()
    ) {
      return pending;
    }
    return null;
  }

  function districtLabel(profile) {
    const state = String(profile.state || "").toUpperCase();
    if (profile.chamber === "Senate") {
      return [state, "U.S. Senate"].filter(Boolean).join(" · ");
    }
    const district = String(profile.district || "").replace(/^0+/, "");
    if (!state) return profile.chamber || "Federal office";
    return district ? `${state}-${district}` : `${state} · At-Large`;
  }

  function officeBadgeLabel(profile, overview) {
    if (overview?.office_title) return String(overview.office_title);
    if (profile.chamber === "Senate") return "U.S. Senator";
    if (profile.chamber === "House") {
      const state = String(profile.state || "").toUpperCase();
      const district = String(profile.district || "").replace(/^0+/, "");
      if (state && district) return `House - ${state}-${district}`;
      return "U.S. Representative";
    }
    return profile.chamber || "Official";
  }

  function tenureLabel(profile, overview) {
    if (overview?.tenure?.label) return String(overview.tenure.label);
    const elected = overview?.tenure?.electedYear;
    const years = overview?.tenure?.yearsActive;
    if (elected != null && years != null) {
      return `Elected ${elected} · ${years} Year${years === 1 ? "" : "s"} Active`;
    }
    if (profile.nextElectionYear) {
      return `Next election ${profile.nextElectionYear}`;
    }
    return "";
  }

  function tabLabel(rep, senateIndex) {
    if (rep.profile.chamber === "Senate") return `Senate ${senateIndex}`;
    if (rep.profile.chamber === "House") {
      const district = String(rep.profile.district || "").replace(/^0+/, "");
      const state = String(rep.profile.state || "").toUpperCase();
      return district ? `House · ${state}-${district}` : "House Representative";
    }
    return rep.profile.name;
  }

  function voteTone(position) {
    const raw = String(position || "").toUpperCase();
    if (raw === "YES" || raw === "YEA" || raw === "AYE") return "yes";
    if (raw === "NO" || raw === "NAY") return "no";
    return "neutral";
  }

  function normalizeBillNumber(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(
      /^(h\.?\s*r\.?|s\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*con\.?\s*res\.?)\s*(\d+)/i
    );
    if (!match) return raw;
    const kind = match[1].toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    const number = match[2];
    if (kind === "hr") return `H.R. ${number}`;
    if (kind === "s") return `S. ${number}`;
    if (kind === "sjres") return `S.J.Res. ${number}`;
    if (kind === "hjres") return `H.J.Res. ${number}`;
    if (kind === "sconres") return `S.Con.Res. ${number}`;
    if (kind === "hconres") return `H.Con.Res. ${number}`;
    return raw;
  }

  function formatVoteTitle(vote) {
    const number = normalizeBillNumber(vote?.billNumber);
    let title = String(vote?.title || "")
      .replace(/^(seed|placeholder)\s*:\s*/i, "")
      .trim();
    if (!title) return number || "Congressional roll call";
    if (number) {
      const bare = number.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
      const titleBare = title.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
      if (titleBare.startsWith(bare)) {
        if (/^[^:]+:\s*/.test(title)) return title.replace(/^[^:]+/, number);
        return `${number}: ${title}`;
      }
      return `${number}: ${title}`;
    }
    return title;
  }

  function sentenceClamp(text, maxSentences = 2) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return "";
    const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
    return parts
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, maxSentences)
      .join(" ");
  }

  function buildPlainEnglishSummary(vote) {
    const fromSummary = sentenceClamp(vote?.plainEnglishSummary || "", 2);
    if (fromSummary) return fromSummary;
    const impacts = [
      vote?.impacts?.wallet,
      vote?.impacts?.community,
      vote?.impacts?.rights,
    ]
      .map((text) => String(text || "").trim())
      .filter(Boolean);
    if (impacts.length) return sentenceClamp(impacts.slice(0, 2).join(" "), 2);
    return "";
  }

  function categorizeBill(bill = {}) {
    const haystack = [
      bill.title,
      bill.bill_number,
      bill.billNumber,
      ...(bill.tags || []),
      bill.policyArea,
      bill.short_pitch,
      bill.category,
      bill.plainEnglishSummary,
    ]
      .filter(Boolean)
      .join(" ");
    for (const rule of CATEGORY_RULES) {
      if (rule.re.test(haystack)) return rule.key;
    }
    return bill.category || "Other";
  }

  function siteHref(website) {
    const site = String(website || "").trim();
    if (!site) return "";
    return /^https?:\/\//i.test(site) ? site : `https://${site}`;
  }

  function buildContactPills(profile, enrich) {
    const overview = enrich?.overview || {};
    const roster = enrich?.roster || {};
    const phone =
      profile.phone || overview.phone || enrich?.contact?.phone || "";
    const website =
      profile.website ||
      overview.website_url ||
      enrich?.contact?.website ||
      "";
    const siteUrl = siteHref(website);
    const social =
      typeof mapPoliticianSocialLinks === "function"
        ? mapPoliticianSocialLinks(roster)
        : [];
    const fromCongress = Array.isArray(enrich?.contact?.social)
      ? enrich.contact.social
      : [];

    const pills = [];
    if (phone) {
      pills.push({
        label: "Phone",
        href: `tel:${String(phone).replace(/[^\d+]/g, "")}`,
      });
    }
    if (siteUrl) {
      pills.push({
        label: "Official Website",
        href: siteUrl,
        external: true,
      });
    }

    const seen = new Set(pills.map((p) => p.label));
    for (const link of [...social, ...fromCongress]) {
      const label = String(link.label || "").trim();
      const url = String(link.url || "").trim();
      if (!label || !url || seen.has(label)) continue;
      seen.add(label);
      pills.push({ label, href: url, external: true });
    }
    return pills;
  }

  async function loadEnrichment(profile) {
    const bioguide = String(profile?.bioguideId || "")
      .trim()
      .toUpperCase();
    const cacheKey = bioguide || profile?.id || profile?.name || "";
    if (cacheKey && enrichCache.has(cacheKey)) {
      return enrichCache.get(cacheKey);
    }

    const result = {
      overview: null,
      contact: null,
      roster: null,
      recentVotes: [],
    };

    const client = typeof getSupabase === "function" ? getSupabase() : null;
    if (client) {
      let query = client
        .from("politicians")
        .select(
          "id,name,party,bioguide_id,external_key,level,chamber,state,district,office_title,photo_url,website_url,phone,metadata"
        );
      if (profile.rosterPoliticianId) {
        query = query.eq("id", profile.rosterPoliticianId);
      } else if (bioguide) {
        query = query.ilike("bioguide_id", bioguide);
      } else {
        query = null;
      }
      if (query) {
        const { data } = await query.limit(1).maybeSingle();
        if (data) result.roster = data;
      }
    }

    if (bioguide) {
      try {
        const params = new URLSearchParams({ bioguide });
        if (typeof API_KEY === "string" && API_KEY.trim()) {
          params.set("api_key", API_KEY.trim());
        }
        const response = await fetch(
          `/api/politician-profile?${params.toString()}`
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          result.overview = data.overview || null;
          result.contact = data.contact || null;
          result.recentVotes = Array.isArray(data.recentVotes)
            ? data.recentVotes
            : [];
        }
      } catch (error) {
        console.warn("Scorecard profile enrich failed:", error);
      }
    }

    if (cacheKey) enrichCache.set(cacheKey, result);
    return result;
  }

  function mapProfileVotesToScorecard(votes) {
    return (votes || [])
      .map((vote) => {
        const cast = String(vote.voteCast || vote.vote_cast || "").toLowerCase();
        let votePosition = "NOT_VOTING";
        if (cast === "yea" || cast === "aye" || cast === "yes") votePosition = "YES";
        else if (cast === "nay" || cast === "no") votePosition = "NO";
        else if (cast.includes("present")) votePosition = "ABSTAIN";
        const billNumber = vote.billNumber || vote.bill_number || null;
        const normalizedNumber =
          typeof normalizeBillNumber === "function"
            ? normalizeBillNumber(billNumber)
            : billNumber;
        const rawTitle = String(
          vote.title || vote.voteQuestion || "Congressional roll call"
        )
          .replace(/^(seed|placeholder)\s*:\s*/i, "")
          .trim();
        const title =
          normalizedNumber &&
          !String(rawTitle)
            .replace(/\./g, "")
            .replace(/\s+/g, "")
            .toLowerCase()
            .startsWith(
              String(normalizedNumber)
                .replace(/\./g, "")
                .replace(/\s+/g, "")
                .toLowerCase()
            )
            ? `${normalizedNumber}: ${rawTitle}`
            : rawTitle;
        return {
          votePosition,
          billId: String(vote.billId || vote.id || title),
          billNumber: normalizedNumber,
          title,
          plainEnglishSummary:
            vote.shortPitch ||
            vote.officialSummary ||
            vote.voteQuestion ||
            null,
          category: vote.subjectCategory || vote.policyArea || categorizeBill(vote),
          voteDate: vote.date || (vote.lastUpdated || "").slice(0, 10) || null,
          impacts: {
            wallet: null,
            community: null,
            rights: null,
          },
        };
      })
      .filter((vote) => {
        const title = String(vote.title || "");
        return !/^seed\s*:/i.test(title) && !/^placeholder\s*:/i.test(title);
      });
  }

  function hasUsableVotes(votes) {
    return (votes || []).some((vote) => {
      const title = String(vote?.title || "");
      const number = String(vote?.billNumber || "");
      if (/^seed\s*:/i.test(title) || /^placeholder\s*:/i.test(title)) return false;
      if (/-seed-/i.test(number) || /-ph-/i.test(number)) return false;
      return Boolean(title || number);
    });
  }

  async function loadMatchRows(bioguide) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user || !bioguide) return { user: null, rows: [] };

    const { data, error } = await client
      .from("stance_vote_matches")
      .select(
        "bill_id, user_stance, member_vote, matched, roll_call_number, congress, vote_result, bill:bill_id(id, bill_number, title, tags, official_url, short_pitch, level)"
      )
      .eq("user_id", user.id)
      .ilike("bioguide_id", bioguide)
      .not("member_vote", "is", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn(error);
      return { user, rows: [] };
    }
    const rows =
      typeof enrichActionMatchRows === "function"
        ? await enrichActionMatchRows(client, data || [])
        : data || [];
    return { user, rows };
  }

  function toRosterPerson(profile, enrich) {
    const roster = enrich?.roster || {};
    const overview = enrich?.overview || {};
    const bioguide = String(
      profile.bioguideId || roster.bioguide_id || overview.bioguide_id || ""
    )
      .trim()
      .toUpperCase();
    return {
      id:
        profile.rosterPoliticianId ||
        roster.id ||
        null,
      name: profile.name || roster.name || overview.name,
      party: profile.party || roster.party || overview.party,
      bioguide_id: bioguide || null,
      bioguideId: bioguide || null,
      external_key:
        roster.external_key || (bioguide ? `federal:${bioguide}` : null),
      level: roster.level || overview.level || "federal",
      chamber:
        roster.chamber ||
        (profile.chamber === "Senate"
          ? "senate"
          : profile.chamber === "House"
            ? "house"
            : profile.chamber),
      state: profile.state || roster.state || overview.state,
      district: profile.district || roster.district || overview.district,
      office_title:
        overview.office_title ||
        roster.office_title ||
        officeBadgeLabel(profile, overview),
      photo_url: profile.photoUrl || roster.photo_url || overview.photo_url,
      website_url: profile.website || roster.website_url || overview.website_url,
      phone: profile.phone || roster.phone || overview.phone,
      metadata: roster.metadata || {},
      tenure: overview.tenure || null,
    };
  }

  async function ensureFollowState() {
    followUser = typeof getUser === "function" ? await getUser() : null;
    followedPoliticianIds = new Set();
    if (followUser && typeof loadFollowedPoliticianIds === "function") {
      followedPoliticianIds = await loadFollowedPoliticianIds(followUser.id);
    }
  }

  async function resolveFollowTargetId(person) {
    if (!person) return null;
    let id = person.id || null;
    if (!id && typeof resolveRosterId === "function") {
      id = await resolveRosterId(person);
    }
    if (!id && typeof upsertPoliticianRecord === "function") {
      const record = await upsertPoliticianRecord(person);
      id = record?.id || null;
      if (id) person.id = id;
    }
    return id ? String(id) : null;
  }

  async function toggleFollowForPerson(person, { announce = true } = {}) {
    if (!person) throw new Error("No official selected.");
    const user = typeof getUser === "function" ? await getUser() : null;
    followUser = user;
    if (!user) {
      writePendingFollow({
        id: person.id || null,
        bioguideId: person.bioguide_id || person.bioguideId || null,
        name: person.name || null,
        createdAt: Date.now(),
      });
      global.location.href = authNextHref();
      return { redirected: true };
    }

    const id = await resolveFollowTargetId(person);
    if (!id) {
      throw new Error("Could not resolve this official to follow.");
    }
    person.id = id;

    if (!followedPoliticianIds.size && typeof loadFollowedPoliticianIds === "function") {
      followedPoliticianIds = await loadFollowedPoliticianIds(user.id);
    }

    let following = false;
    if (followedPoliticianIds.has(id)) {
      await unfollowPolitician(user.id, id);
      followedPoliticianIds.delete(id);
      following = false;
      if (announce) {
        setStatus(
          `Unfollowed ${person.name || "this official"}.`,
          "success"
        );
      }
    } else {
      await followPolitician(user.id, id);
      followedPoliticianIds.add(id);
      following = true;
      if (announce) {
        setStatus(
          `Following ${person.name || "this official"} — their actions will show in My Feed.`,
          "success"
        );
      }
    }
    syncFollowButton();
    return { following, id };
  }

  async function completePendingFollowIfNeeded(person) {
    const pending = pendingFollowMatches(person);
    if (!pending || !followUser || !person) return;
    writePendingFollow(null);
    try {
      const id = await resolveFollowTargetId(person);
      if (!id) return;
      person.id = id;
      if (followedPoliticianIds.has(id)) {
        syncFollowButton();
        setStatus(
          `You’re already following ${person.name || "this official"}.`,
          "success"
        );
        return;
      }
      await followPolitician(followUser.id, id);
      followedPoliticianIds.add(id);
      syncFollowButton();
      setStatus(
        `Following ${person.name || "this official"} — their actions will show in My Feed.`,
        "success"
      );
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not complete follow after sign-in.", "error");
    }
  }

  function syncFollowButton() {
    const button = $("scorecard-follow-btn");
    if (!button) return;
    const id = activeRosterPerson?.id
      ? String(activeRosterPerson.id)
      : "";
    const following = Boolean(id && followedPoliticianIds.has(id));
    button.classList.toggle("is-following", following);
    button.setAttribute("aria-pressed", following ? "true" : "false");
    button.setAttribute(
      "aria-label",
      following
        ? `Following ${activeRosterPerson?.name || "this official"}. Activate to unfollow.`
        : `Follow ${activeRosterPerson?.name || "this official"}`
    );
    button.title = following
      ? "Following — hover to unfollow"
      : "Follow this official to see their actions in My Feed";
  }

  function bindFollowButton() {
    const button = $("scorecard-follow-btn");
    if (!button || button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    syncFollowButton();

    button.addEventListener("click", async () => {
      if (!activeRosterPerson) return;
      button.disabled = true;
      try {
        const result = await toggleFollowForPerson(activeRosterPerson);
        if (result?.redirected) return;
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Could not update follow.", "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  function noteHasContent() {
    return Boolean(String(politicianNote?.body || "").trim());
  }

  function setNotesStatus(message, type = "loading") {
    const el = $("scorecard-notes-status");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.dataset.type = type;
  }

  function refreshNoteUi() {
    const button = $("scorecard-note-open");
    const label = button?.querySelector(".politician-profile-note-btn__label");
    const preview = $("scorecard-note-preview");
    const editBtn = document.querySelector(
      "#scorecard-note-popover [data-note-action='edit']"
    );
    const clearBtn = $("scorecard-note-clear");
    const text = noteHasContent() ? "Your note" : "Private note";
    if (label) label.textContent = text;
    if (button) {
      button.setAttribute(
        "aria-label",
        noteHasContent()
          ? `Your private note for ${activeRosterPerson?.name || "this official"}`
          : `Private note for ${activeRosterPerson?.name || "this official"}`
      );
    }
    if (preview) {
      if (noteHasContent()) {
        preview.textContent = String(politicianNote.body);
        preview.classList.remove("is-empty");
      } else {
        preview.textContent =
          "No note yet. Add a private note for this official.";
        preview.classList.add("is-empty");
      }
    }
    if (editBtn) {
      editBtn.textContent = noteHasContent() ? "Edit note" : "Add note";
    }
    const bodyInput = $("scorecard-note-body");
    const modal = $("scorecard-notes-modal");
    if (bodyInput && modal && !modal.hidden) {
      bodyInput.value = String(politicianNote?.body || "");
    }
    if (clearBtn) clearBtn.hidden = !noteHasContent();
  }

  function getNoteWrap() {
    return $("scorecard-note-wrap");
  }

  function getNotePopover() {
    return $("scorecard-note-popover");
  }

  function showNotePopover() {
    const wrap = getNoteWrap();
    const popover = getNotePopover();
    const button = $("scorecard-note-open");
    if (!wrap || !popover) return;
    global.clearTimeout(notePopoverHideTimer);
    popover.hidden = false;
    wrap.classList.add("is-open");
    button?.setAttribute("aria-expanded", "true");
  }

  function hideNotePopover({ immediate = false } = {}) {
    const run = () => {
      const wrap = getNoteWrap();
      const popover = getNotePopover();
      const button = $("scorecard-note-open");
      if (!popover) return;
      popover.hidden = true;
      wrap?.classList.remove("is-open");
      button?.setAttribute("aria-expanded", "false");
    };
    global.clearTimeout(notePopoverHideTimer);
    if (immediate) run();
    else notePopoverHideTimer = global.setTimeout(run, 140);
  }

  function bindNotePopover() {
    const wrap = getNoteWrap();
    if (!wrap || wrap.dataset.bound === "1") return;
    wrap.dataset.bound = "1";
    wrap.addEventListener("mouseenter", () => showNotePopover());
    wrap.addEventListener("mouseleave", () => hideNotePopover());
    wrap.addEventListener("focusin", () => showNotePopover());
    wrap.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) hideNotePopover();
    });
  }

  function openNotesModal() {
    const modal = $("scorecard-notes-modal");
    if (!modal) return;
    hideNotePopover({ immediate: true });
    notesModalLastFocus = document.activeElement;
    const bodyInput = $("scorecard-note-body");
    if (bodyInput) bodyInput.value = String(politicianNote?.body || "");
    const clearBtn = $("scorecard-note-clear");
    if (clearBtn) clearBtn.hidden = !noteHasContent();
    modal.hidden = false;
    document.body.classList.add("politician-notes-modal-open");
    bodyInput?.focus?.();
  }

  function closeNotesModal() {
    const modal = $("scorecard-notes-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("politician-notes-modal-open");
    setNotesStatus("", "loading");
    if (notesModalLastFocus && typeof notesModalLastFocus.focus === "function") {
      notesModalLastFocus.focus();
    } else {
      $("scorecard-note-open")?.focus();
    }
  }

  async function resolveRosterId(person) {
    if (person?.id && /^[0-9a-f-]{36}$/i.test(String(person.id))) {
      return String(person.id);
    }
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    if (!client || !person) return null;
    const bioguide = String(person.bioguide_id || person.bioguideId || "").trim();
    if (bioguide) {
      const { data } = await client
        .from("politicians")
        .select("id")
        .ilike("bioguide_id", bioguide)
        .limit(1)
        .maybeSingle();
      if (data?.id) {
        person.id = data.id;
        return String(data.id);
      }
    }
    if (typeof upsertPoliticianRecord === "function" && person.name) {
      try {
        const record = await upsertPoliticianRecord(person);
        if (record?.id) {
          person.id = record.id;
          return String(record.id);
        }
      } catch (error) {
        console.warn(error);
      }
    }
    return null;
  }

  async function loadNoteForPerson(person, user) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    if (!client || !user || !person) {
      politicianNote = null;
      refreshNoteUi();
      return;
    }
    const politicianId = await resolveRosterId(person);
    const name = String(person.name || "").trim();
    const byId = new Map();
    const selectCols =
      "id, kind, title, body, politician_id, politician_name, action_date, created_at, updated_at";

    if (politicianId) {
      const { data, error } = await client
        .from("civic_actions")
        .select(selectCols)
        .eq("user_id", user.id)
        .eq("kind", "note")
        .eq("politician_id", politicianId);
      if (error) console.warn(error);
      for (const row of data || []) byId.set(row.id, row);
    }
    if (name) {
      const { data, error } = await client
        .from("civic_actions")
        .select(selectCols)
        .eq("user_id", user.id)
        .eq("kind", "note")
        .eq("politician_name", name);
      if (error) console.warn(error);
      for (const row of data || []) byId.set(row.id, row);
    }

    const rows = [...byId.values()].sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || "")
      )
    );
    politicianNote = rows[0] || null;
    refreshNoteUi();
  }

  async function saveNote() {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user) {
      global.location.href = authNextHref();
      return;
    }
    const bodyInput = $("scorecard-note-body");
    const body = String(bodyInput?.value || "").trim();
    if (!body) {
      setNotesStatus("Write something before saving.", "error");
      return;
    }
    const politicianId = await resolveRosterId(activeRosterPerson);
    const politicianName =
      String(activeRosterPerson?.name || "").trim() || null;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    try {
      if (politicianNote?.id) {
        const { error } = await client
          .from("civic_actions")
          .update({
            body,
            title: null,
            politician_id: politicianId || politicianNote.politician_id || null,
            politician_name: politicianName,
            action_date: today,
            updated_at: now,
          })
          .eq("id", politicianNote.id)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { data, error } = await client
          .from("civic_actions")
          .insert({
            user_id: user.id,
            kind: "note",
            title: null,
            body,
            politician_id: politicianId,
            politician_name: politicianName,
            action_date: today,
            contact_method: null,
          })
          .select(
            "id, kind, title, body, politician_id, politician_name, action_date, created_at, updated_at"
          )
          .maybeSingle();
        if (error) throw error;
        politicianNote = data;
      }
      await loadNoteForPerson(activeRosterPerson, user);
      setNotesStatus("Note saved.", "success");
    } catch (error) {
      console.error(error);
      setNotesStatus(error.message || "Could not save note.", "error");
    }
  }

  async function clearNote() {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user || !politicianNote?.id) return;
    try {
      const { error } = await client
        .from("civic_actions")
        .delete()
        .eq("id", politicianNote.id)
        .eq("user_id", user.id);
      if (error) throw error;
      politicianNote = null;
      const bodyInput = $("scorecard-note-body");
      if (bodyInput) bodyInput.value = "";
      refreshNoteUi();
      setNotesStatus("Note cleared.", "success");
    } catch (error) {
      console.error(error);
      setNotesStatus(error.message || "Could not clear note.", "error");
    }
  }

  function ensureNotesHandlers() {
    if (notesBound) return;
    notesBound = true;
    const modal = $("scorecard-notes-modal");
    modal?.addEventListener("click", (event) => {
      if (event.target?.dataset?.closeNotes) closeNotesModal();
    });
    $("scorecard-note-save")?.addEventListener("click", () => {
      saveNote();
    });
    $("scorecard-note-clear")?.addEventListener("click", () => {
      clearNote();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNotesModal();
    });
  }

  function bindHeroActions() {
    ensureNotesHandlers();
    bindFollowButton();
    bindNotePopover();
    syncFollowButton();
    refreshNoteUi();

    const hero = $("scorecard-hero");
    if (!hero || hero.dataset.noteClicks === "1") return;
    hero.dataset.noteClicks = "1";
    hero.addEventListener("click", (event) => {
      const openBtn = event.target.closest("#scorecard-note-open");
      const action = event.target.closest("[data-note-action]");
      if (action) {
        const kind = action.dataset.noteAction;
        if (kind === "open" || kind === "edit") openNotesModal();
        return;
      }
      if (openBtn) {
        if (global.matchMedia("(hover: none)").matches) openNotesModal();
        else showNotePopover();
      }
    });
  }

  function summarizeMatch(matchPayload) {
    const { user, rows } = matchPayload || { user: null, rows: [] };
    const compared = (rows || []).filter((row) => row.matched != null);
    const matched = compared.filter((row) => row.matched === true);
    const score =
      !user || compared.length === 0
        ? null
        : Math.round((matched.length / compared.length) * 100);
    return {
      user: user || null,
      compared: compared.length,
      matched: matched.length,
      score,
      rows: rows || [],
    };
  }

  function matchScoreToneClass(score) {
    if (score == null) return "";
    if (score >= 70) return "is-high";
    if (score >= 40) return "is-mid";
    return "is-low";
  }

  function renderHeroMatchBadge(summary) {
    const score = summary?.score;
    const tone = matchScoreToneClass(score);
    const value = score == null ? "—" : `${score}%`;
    const aria =
      score == null
        ? "Action Match Score unavailable"
        : `Action Match Score ${score} percent`;
    return `
      <div class="scorecard-hero__match" aria-label="${escapeHtml(aria)}">
        <div class="politician-match-hero__score ${tone}">
          <span class="politician-match-hero__value">${escapeHtml(value)}</span>
          <span class="politician-match-hero__label">Action Match Score</span>
        </div>
      </div>
    `;
  }

  function renderHero(el, profile, enrich, matchSummary) {
    if (!el || !profile) return;
    const overview = enrich?.overview || {};
    const kind = partyKind(profile.party || overview.party);
    const partyText = partyLabel(kind, profile.party || overview.party);
    const photoUrl =
      profile.photoUrl || overview.photo_url || enrich?.roster?.photo_url || "";
    const photo = photoUrl
      ? `<img class="scorecard-hero__photo" src="${escapeHtml(
          photoUrl
        )}" alt="" />`
      : `<div class="scorecard-hero__photo scorecard-hero__photo--fallback" aria-hidden="true">${escapeHtml(
          String(profile.name || "")
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0] || "")
            .join("")
        )}</div>`;
    const tenure = tenureLabel(profile, overview);
    const role = districtLabel(profile);
    const pills = buildContactPills(profile, enrich);

    el.innerHTML = `
      <div class="scorecard-hero__media">${photo}</div>
      <div class="scorecard-hero__body">
        <div class="scorecard-hero__badges">
          <span class="scorecard-hero__badge">${escapeHtml(
            officeBadgeLabel(profile, overview)
          )}</span>
          <span class="scorecard-hero__badge scorecard-hero__badge--level">Federal</span>
          <span class="politician-card__party ${partyClassName(
            profile.party || overview.party
          )}">${escapeHtml(partyText)}</span>
        </div>
        <h2 class="scorecard-hero__name">${escapeHtml(profile.name)}</h2>
        <p class="scorecard-hero__role">${escapeHtml(role)}</p>
        ${
          tenure
            ? `<p class="scorecard-hero__tenure">${escapeHtml(tenure)}</p>`
            : ""
        }
        <div class="politician-profile-actions">
          <div class="politician-profile-actions__row">
            <button
              type="button"
              id="scorecard-follow-btn"
              class="politician-profile-follow-btn"
              aria-pressed="false"
            >
              <span class="politician-profile-follow-btn__icon" aria-hidden="true">
                <span class="politician-profile-follow-btn__icon-plus">+</span>
                <span class="politician-profile-follow-btn__icon-check">✓</span>
              </span>
              <span class="politician-profile-follow-btn__label">
                <span class="politician-profile-follow-btn__label-follow">Follow</span>
                <span class="politician-profile-follow-btn__label-following">Following</span>
                <span class="politician-profile-follow-btn__label-unfollow">Unfollow</span>
              </span>
            </button>
            <div class="politician-profile-note-wrap" id="scorecard-note-wrap">
              <button
                type="button"
                id="scorecard-note-open"
                class="politician-profile-note-btn"
                aria-haspopup="true"
                aria-expanded="false"
                aria-controls="scorecard-note-popover"
              >
                <span class="politician-profile-note-btn__icon" aria-hidden="true">📝</span>
                <span class="politician-profile-note-btn__label">Private note</span>
              </button>
              <div
                id="scorecard-note-popover"
                class="politician-profile-note-popover"
                role="dialog"
                aria-label="Private note preview"
                hidden
              >
                <p class="politician-profile-note-popover__kicker">Your private note</p>
                <div
                  id="scorecard-note-preview"
                  class="politician-profile-note-popover__body"
                ></div>
                <div class="politician-profile-note-popover__actions">
                  <button type="button" class="refresh-btn" data-note-action="open">
                    Open
                  </button>
                  <button
                    type="button"
                    class="politician-profile-note-popover__secondary"
                    data-note-action="edit"
                  >
                    Add note
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p class="politician-profile-follow__hint">
            Follow for My Feed updates · Notes stay private to you
          </p>
        </div>
        <div class="politician-profile-contact" aria-label="Contact links">
          ${
            pills.length
              ? pills
                  .map((pill) => {
                    const extra = pill.external
                      ? ' target="_blank" rel="noopener noreferrer"'
                      : "";
                    return `<a class="politician-profile-contact__link" href="${escapeHtml(
                      pill.href
                    )}"${extra}>${escapeHtml(pill.label)}</a>`;
                  })
                  .join("")
              : `<span class="politician-profile-contact__empty">No public contact links on file.</span>`
          }
        </div>
      </div>
      ${renderHeroMatchBadge(matchSummary)}
    `;

    bindHeroActions();
  }

  function renderMatch(section, bodyEl, ledeEl, profile, matchPayload) {
    if (!section || !bodyEl) return;
    section.hidden = false;
    const chamberLabel =
      profile.chamber === "Senate" ? "Senate" : "House";
    const personName = profile.name || "this official";
    const summary = summarizeMatch(matchPayload);
    const { user, rows } = matchPayload || { user: null, rows: [] };

    if (ledeEl) {
      ledeEl.textContent =
        profile.chamber === "Senate"
          ? "Your Support / Oppose stances compared to this senator’s Senate roll-call votes."
          : "Your Support / Oppose stances compared to this official’s House roll-call votes.";
    }

    if (!user) {
      bodyEl.innerHTML = `
        <p class="politician-profile-empty">
          <a href="${escapeHtml(authNextHref())}">Sign in</a>
          and Support or Oppose bills to build your Action Match Score with ${escapeHtml(
            personName
          )}.
        </p>
        <p class="politician-quick-match">
          <button type="button" class="refresh-btn" data-open-match-quiz="1">🎯 Match My Votes</button>
          <a class="scorecard-match__quiz-link" href="bills-policies.html?tab=votes&amp;quiz=1">Or take the full 2-minute quiz</a>
        </p>`;
      return summary;
    }

    const compared = (rows || []).filter((row) => row.matched != null);
    const matched = compared.filter((row) => row.matched === true);
    const score = summary.score;
    const agree = compared.filter((row) => row.matched === true);
    const differ = compared.filter((row) => row.matched === false);

    const categoryMap = new Map();
    for (const row of compared) {
      const bill = row.bill || {};
      const category = categorizeBill(bill);
      const entry = categoryMap.get(category) || {
        key: category,
        compared: 0,
        matched: 0,
      };
      entry.compared += 1;
      if (row.matched === true) entry.matched += 1;
      categoryMap.set(category, entry);
    }
    const categories = [...categoryMap.values()].sort(
      (a, b) => b.compared - a.compared
    );

    const billLink = (row) => {
      const bill = row.bill || {};
      const number = bill.bill_number || "";
      const displayTitle =
        row.displayTitle ||
        (typeof humanizeActionMatchTitle === "function"
          ? humanizeActionMatchTitle(bill, row.voteCopy)
          : bill.title || number || row.bill_id);
      const means =
        row.voteMeans ||
        (typeof buildActionMatchVoteMeans === "function"
          ? buildActionMatchVoteMeans(bill, row.voteCopy)
          : { yea: "", nay: "" });
      const summary =
        row.detailSummary ||
        bill.short_pitch ||
        bill.title ||
        "";
      const detailHref =
        row.detailHref ||
        bill.official_url ||
        `bills-policies.html?tab=votes&bill=${encodeURIComponent(
          row.bill_id || bill.id || ""
        )}`;
      const detailPayload = encodeURIComponent(
        JSON.stringify({
          title: displayTitle,
          number,
          summary,
          yea: means.yea || "",
          nay: means.nay || "",
          href: detailHref,
          rawTitle: bill.title || "",
          stance: row.user_stance || "",
          memberVote: row.member_vote || "",
        })
      );

      return `<li class="scorecard-match-item">
        <div class="scorecard-match-item__top">
          <button
            type="button"
            class="scorecard-match-item__title"
            data-open-match-detail="${detailPayload}"
          >
            ${
              number
                ? `<span class="scorecard-match-item__bill">${escapeHtml(
                    number
                  )}</span>`
                : ""
            }
            <span class="scorecard-match-item__name">${escapeHtml(
              displayTitle
            )}</span>
          </button>
          <button
            type="button"
            class="scorecard-match-item__info"
            data-toggle-match-means="1"
            aria-expanded="false"
            aria-label="What Yea and Nay mean"
            title="What Yea and Nay mean"
          >ⓘ</button>
        </div>
        <p class="scorecard-match-item__stance">
          You ${escapeHtml(row.user_stance)} · They voted ${escapeHtml(
            row.member_vote || "—"
          )}
        </p>
        <div class="scorecard-match-item__means" hidden>
          <p><strong>Yea:</strong> ${escapeHtml(means.yea || "—")}</p>
          <p><strong>Nay:</strong> ${escapeHtml(means.nay || "—")}</p>
        </div>
      </li>`;
    };

    if (compared.length === 0) {
      bodyEl.innerHTML = `
        <p class="politician-match-hero__meta">
          Support or Oppose recent roll calls to calculate your Action Match Score with ${escapeHtml(
            personName
          )}. Your score appears in the profile card above.
        </p>
        <p class="politician-quick-match">
          <button type="button" class="refresh-btn" data-open-match-quiz="1">🎯 Match My Votes</button>
          <a class="scorecard-match__quiz-link" href="bills-policies.html?tab=votes&amp;quiz=1">Or take the full 2-minute quiz</a>
        </p>`;
      return summary;
    }

    const topicPills = categories
      .slice(0, 6)
      .map((row) => {
        const pct = Math.round((row.matched / row.compared) * 100);
        return `<span class="scorecard-match-pill">${escapeHtml(
          row.key
        )} · ${pct}%</span>`;
      })
      .join("");

    bodyEl.innerHTML = `
      <p class="scorecard-match__summary">
        ${matched.length} of ${compared.length} comparable ${escapeHtml(
          chamberLabel
        )} roll calls match your stance${
          score == null ? "" : ` · <strong>${score}% Action Match</strong>`
        }.
      </p>

      ${
        topicPills
          ? `<div class="scorecard-match-pills" aria-label="Topic breakdown">${topicPills}</div>`
          : ""
      }

      <div class="politician-match-categories" aria-label="Category breakdown">
        ${categories
          .map((row) => {
            const pct = Math.round((row.matched / row.compared) * 100);
            return `<div class="politician-match-categories__row">
              <span>${escapeHtml(row.key)}</span>
              <div class="politician-match-categories__track"><i style="width:${pct}%"></i></div>
              <strong>${pct}%</strong>
            </div>`;
          })
          .join("")}
      </div>

      <div class="politician-match-split">
        <div>
          <h3>Where You Agree</h3>
          <ul class="politician-profile-list">
            ${
              agree.length
                ? agree.slice(0, 12).map(billLink).join("")
                : `<li class="politician-profile-empty">No matching votes yet.</li>`
            }
          </ul>
        </div>
        <div>
          <h3>Where You Differ</h3>
          <ul class="politician-profile-list">
            ${
              differ.length
                ? differ.slice(0, 12).map(billLink).join("")
                : `<li class="politician-profile-empty">No diverging votes yet.</li>`
            }
          </ul>
        </div>
      </div>
    `;
    bindMatchListInteractions(bodyEl);
    return summary;
  }

  function openMatchBillDetail(payload) {
    const modal = $("scorecard-match-detail-modal");
    if (!modal || !payload) return;
    const titleEl = $("scorecard-match-detail-title");
    const billEl = $("scorecard-match-detail-bill");
    const summaryEl = $("scorecard-match-detail-summary");
    const yeaEl = $("scorecard-match-detail-yea");
    const nayEl = $("scorecard-match-detail-nay");
    const linkEl = $("scorecard-match-detail-link");
    const stanceEl = $("scorecard-match-detail-stance");

    if (titleEl) titleEl.textContent = payload.title || "Roll-call detail";
    if (billEl) {
      billEl.textContent = payload.number || payload.rawTitle || "";
      billEl.hidden = !billEl.textContent;
    }
    if (summaryEl) {
      summaryEl.textContent =
        payload.summary ||
        "No plain-English summary is available for this roll call yet.";
    }
    if (yeaEl) yeaEl.textContent = payload.yea || "—";
    if (nayEl) nayEl.textContent = payload.nay || "—";
    if (stanceEl) {
      const stance = payload.stance ? `You ${payload.stance}` : "";
      const member = payload.memberVote
        ? `They voted ${payload.memberVote}`
        : "";
      stanceEl.textContent = [stance, member].filter(Boolean).join(" · ");
      stanceEl.hidden = !stanceEl.textContent;
    }
    if (linkEl) {
      linkEl.href = payload.href || "bills-policies.html?tab=votes";
      linkEl.hidden = !linkEl.href;
    }
    modal.hidden = false;
    document.body.classList.add("scorecard-match-detail-open");
    modal.querySelector(".scorecard-match-detail__close")?.focus();
  }

  function closeMatchBillDetail() {
    const modal = $("scorecard-match-detail-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("scorecard-match-detail-open");
  }

  function bindMatchListInteractions(root) {
    if (!root) return;
    root.querySelectorAll("[data-toggle-match-means]").forEach((button) => {
      button.addEventListener("click", () => {
        const item = button.closest(".scorecard-match-item");
        const panel = item?.querySelector(".scorecard-match-item__means");
        if (!panel) return;
        const open = panel.hasAttribute("hidden");
        if (open) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
        button.setAttribute("aria-expanded", open ? "true" : "false");
      });
    });
    root.querySelectorAll("[data-open-match-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const payload = JSON.parse(
            decodeURIComponent(button.getAttribute("data-open-match-detail") || "")
          );
          openMatchBillDetail(payload);
        } catch (error) {
          console.warn(error);
        }
      });
    });
  }

  function bindMatchDetailModalChrome() {
    const modal = $("scorecard-match-detail-modal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-match-detail]")) {
        closeMatchBillDetail();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeMatchBillDetail();
    });
  }

  function renderDonor(el, finance) {
    if (!el) return;
    if (!finance) {
      el.innerHTML =
        '<p class="scorecard-empty">Campaign finance data is not available yet.</p>';
      return;
    }
    const slices = [
      {
        key: "small",
        label: "Small Donors (<$200)",
        pct: Number(finance.smallDonorPct) || 0,
      },
      {
        key: "large",
        label: "Large Donors",
        pct: Number(finance.largeDonorPct) || 0,
      },
      { key: "pac", label: "PACs", pct: Number(finance.pacPct) || 0 },
      {
        key: "self",
        label: "Self-Funding",
        pct: Number(finance.selfFundingPct) || 0,
      },
    ];
    const industries = Array.isArray(finance.topIndustries)
      ? finance.topIndustries.slice(0, 5)
      : [];
    const top = industries[0];

    el.innerHTML = `
      <p class="scorecard-card__eyebrow">Donor Alignment</p>
      <h3 class="scorecard-card__title">Where the money comes from</h3>
      <p class="scorecard-card__meta">
        ${
          finance.totalRaised != null
            ? `${escapeHtml(formatUsd(finance.totalRaised))}${
                finance.cycle ? ` · ${escapeHtml(finance.cycle)}` : ""
              }`
            : "Cycle totals unavailable"
        }
      </p>
      <div class="scorecard-bar" role="img" aria-label="Funding mix">
        ${slices
          .map((slice) =>
            slice.pct > 0
              ? `<span class="is-${slice.key}" style="width:${slice.pct}%"></span>`
              : ""
          )
          .join("")}
      </div>
      <ul class="scorecard-legend">
        ${slices
          .map(
            (slice) => `<li>
              <span class="swatch is-${slice.key}"></span>
              <span>${escapeHtml(slice.label)}</span>
              <strong>${escapeHtml(formatPct(slice.pct))}</strong>
            </li>`
          )
          .join("")}
      </ul>
      <h4 class="scorecard-subtitle">Top 5 industry contributors</h4>
      ${
        industries.length
          ? `<ol class="scorecard-industries">
              ${industries
                .map(
                  (item, index) => `<li>
                    <span>${index + 1}. ${escapeHtml(item.name)}</span>
                    <strong>${escapeHtml(formatUsd(item.amount))}</strong>
                  </li>`
                )
                .join("")}
            </ol>`
          : `<p class="scorecard-empty">No industry contributor rows yet.</p>`
      }
      ${
        top
          ? `<aside class="scorecard-callout">
              <span class="scorecard-callout__badge">Money vs. Vote</span>
              <p><strong>${escapeHtml(top.name)}</strong> · ${escapeHtml(
                formatUsd(top.amount)
              )}</p>
              <p>Compare this industry’s funding with related roll-call votes in the feed.</p>
            </aside>`
          : ""
      }
    `;
  }

  function renderAttendance(el, attendance) {
    if (!el) return;
    if (!attendance) {
      el.innerHTML =
        '<p class="scorecard-empty">Attendance stats are not available yet.</p>';
      return;
    }
    const missedPct =
      attendance.missedVotePct != null
        ? Number(attendance.missedVotePct)
        : attendance.totalVotes
          ? Math.round(
              (attendance.missedVotes / attendance.totalVotes) * 1000
            ) / 10
          : null;
    const attendancePct =
      missedPct == null ? null : Math.round((100 - missedPct) * 10) / 10;
    const avg = { missed: 2.8, attendance: 97.2, sponsored: 18, bipartisan: 24 };
    const rows = [
      {
        label: "Missed votes",
        member:
          attendance.missedVotes == null
            ? "—"
            : `${attendance.missedVotes}${
                missedPct == null ? "" : ` (${formatPct(missedPct)})`
              }`,
        average: formatPct(avg.missed),
      },
      {
        label: "Attendance rate",
        member: formatPct(attendancePct),
        average: formatPct(avg.attendance),
      },
      {
        label: "Bills sponsored",
        member:
          attendance.sponsoredBillsCount == null
            ? "—"
            : String(attendance.sponsoredBillsCount),
        average: String(avg.sponsored),
      },
      {
        label: "Bipartisan cosponsorship",
        member: formatPct(attendance.bipartisanCosponsorPct),
        average: formatPct(avg.bipartisan),
      },
    ];

    el.innerHTML = `
      <p class="scorecard-card__eyebrow">Attendance & Activity</p>
      <h3 class="scorecard-card__title">How often they show up</h3>
      <div class="scorecard-table">
        <div class="scorecard-table__head">
          <span>Metric</span><span>Member</span><span>Congress avg</span>
        </div>
        ${rows
          .map(
            (row) => `<div class="scorecard-table__row">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.member)}</strong>
              <span>${escapeHtml(row.average)}</span>
            </div>`
          )
          .join("")}
      </div>
    `;
  }

  function positionToMemberVote(position) {
    const raw = String(position || "").toUpperCase();
    if (raw === "YES" || raw === "YEA" || raw === "AYE") return "Yea";
    if (raw === "NO" || raw === "NAY") return "Nay";
    if (raw === "ABSTAIN" || raw === "PRESENT") return "Present";
    if (raw === "NOT_VOTING" || raw === "NOT VOTING" || raw === "NV") {
      return "Not Voting";
    }
    return null;
  }

  function stanceMatchesPosition(stance, votePosition) {
    const memberVote = positionToMemberVote(votePosition);
    if (!memberVote || memberVote === "Present" || memberVote === "Not Voting") {
      return null;
    }
    if (stance === "support") return memberVote === "Yea";
    if (stance === "oppose") return memberVote === "Nay";
    return null;
  }

  function parseRollMetaFromBillId(billId) {
    const id = String(billId || "").toLowerCase();
    let match = id.match(/^(?:house|senate)-vote-(\d+)-(\d+)-(\d+)$/);
    if (match) {
      return {
        congress: Number(match[1]),
        sessionNumber: Number(match[2]),
        rollCallNumber: Number(match[3]),
      };
    }
    match = id.match(/^federal-(?:bill-)?(\d+)-([a-z]+)-(\d+)$/);
    if (match) {
      return {
        congress: Number(match[1]),
        legislationType: match[2],
        legislationNumber: match[3],
      };
    }
    return {};
  }

  function quizBillItemFromVote(vote, profile) {
    const billId = String(vote.billId || "").trim();
    if (!billId) return null;
    const meta = parseRollMetaFromBillId(billId);
    const billNumber =
      normalizeBillNumber(vote.billNumber) || vote.billNumber || "Roll call";
    return {
      id: billId,
      billNumber,
      title: formatVoteTitle(vote),
      level: "Federal",
      jurisdiction:
        profile?.chamber === "Senate" ? "U.S. Senate" : "U.S. House",
      shortPitch: buildPlainEnglishSummary(vote) || vote.plainEnglishSummary || "",
      category: vote.category || null,
      votePosition: vote.votePosition,
      officialUrl: null,
      tags: vote.category ? [vote.category] : [],
      congress: meta.congress || null,
      sessionNumber: meta.sessionNumber || null,
      rollCallNumber: meta.rollCallNumber || null,
      legislationType: meta.legislationType || null,
      legislationNumber: meta.legislationNumber || null,
    };
  }

  async function upsertQuizBillItem(client, item) {
    const payload = {
      id: item.id,
      bill_number: item.billNumber || "Bill",
      title: item.title || "Untitled",
      level: "Federal",
      jurisdiction: item.jurisdiction || "U.S. Congress",
      primary_sponsor_name: null,
      primary_sponsor_title: null,
      last_updated: new Date().toISOString(),
      status_step_number: 4,
      status_total_steps: 4,
      status_step_name: "Voted",
      short_pitch: item.shortPitch || null,
      delta_summary: { added: [], changed: [], removed: [] },
      official_url: item.officialUrl || null,
      tags: item.tags || [],
      all_steps: [],
      metadata: {
        source: "scorecard-match-quiz",
        congress: item.congress || null,
        sessionNumber: item.sessionNumber || null,
        rollCallNumber: item.rollCallNumber || null,
      },
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from("bill_items").upsert(payload, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  function setMatchQuizStatus(message, tone) {
    const el = $("scorecard-match-quiz-status");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.className = "status";
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = `status${tone ? ` is-${tone}` : ""}`;
  }

  function focusActionMatchSection() {
    const section = $("scorecard-match");
    if (!section) return;
    section.hidden = false;
    section.classList.remove("is-match-focus");
    // Retrigger animation.
    void section.offsetWidth;
    section.classList.add("is-match-focus");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    global.setTimeout(() => section.classList.remove("is-match-focus"), 1800);
  }

  function closeMatchQuizModal() {
    const modal = $("scorecard-match-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("scorecard-match-modal-open");
    setMatchQuizStatus("");
  }

  function renderMatchQuizBody(bodyEl, votes, profile, stancesMap) {
    if (!bodyEl) return;
    const items = (votes || [])
      .map((vote) => quizBillItemFromVote(vote, profile))
      .filter(Boolean)
      .slice(0, 8);

    if (!items.length) {
      bodyEl.innerHTML = `
        <div class="scorecard-empty scorecard-empty--card" role="status">
          <p>No recent roll-call votes recorded for this representative.</p>
        </div>`;
      return;
    }

    bodyEl.innerHTML = `
      <ol class="scorecard-match-quiz__list">
        ${items
          .map((item, index) => {
            const mine = stancesMap.get(item.id) || null;
            const summary = String(item.shortPitch || "").trim();
            return `<li class="scorecard-match-quiz__card" data-bill-id="${escapeHtml(
              item.id
            )}">
              <div class="scorecard-match-quiz__card-top">
                <span class="scorecard-match-quiz__index">${index + 1}</span>
                ${
                  item.billNumber
                    ? `<span class="scorecard-bill">${escapeHtml(
                        item.billNumber
                      )}</span>`
                    : ""
                }
                ${
                  item.category
                    ? `<span class="scorecard-vote__category">${escapeHtml(
                        item.category
                      )}</span>`
                    : ""
                }
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              ${
                summary
                  ? `<p class="scorecard-match-quiz__summary">${escapeHtml(
                      summary
                    )}</p>`
                  : ""
              }
              <div class="scorecard-match-quiz__actions" role="group" aria-label="Your stance">
                <button
                  type="button"
                  class="scorecard-match-quiz__btn is-support${
                    mine === "support" ? " is-active" : ""
                  }"
                  data-match-stance="support"
                  data-bill-id="${escapeHtml(item.id)}"
                  aria-pressed="${mine === "support"}"
                >Support</button>
                <button
                  type="button"
                  class="scorecard-match-quiz__btn is-oppose${
                    mine === "oppose" ? " is-active" : ""
                  }"
                  data-match-stance="oppose"
                  data-bill-id="${escapeHtml(item.id)}"
                  aria-pressed="${mine === "oppose"}"
                >Oppose</button>
              </div>
              <p class="scorecard-match-quiz__result" data-match-result="${escapeHtml(
                item.id
              )}" ${mine ? "" : "hidden"}>
                ${
                  mine
                    ? mine === "support"
                      ? "You supported this"
                      : "You opposed this"
                    : ""
                }
              </p>
            </li>`;
          })
          .join("")}
      </ol>`;
  }

  async function loadStanceMapForBills(billIds) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    const map = new Map();
    if (!client || !user || !billIds.length) return { user, client, map };
    const { data, error } = await client
      .from("bill_stances")
      .select("bill_id, stance")
      .eq("user_id", user.id)
      .in("bill_id", billIds);
    if (error) console.warn(error);
    for (const row of data || []) {
      map.set(row.bill_id, row.stance);
    }
    return { user, client, map };
  }

  async function saveMatchQuizStance({
    item,
    stance,
    profile,
    onScoreRefresh,
  }) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user) {
      global.location.href = authNextHref();
      return null;
    }
    await upsertQuizBillItem(client, item);

    const bioguide = String(profile.bioguideId || "").toUpperCase();
    const memberVote = positionToMemberVote(item.votePosition);
    const matched = stanceMatchesPosition(stance, item.votePosition);

    const { error } = await client.from("bill_stances").upsert(
      {
        user_id: user.id,
        bill_id: item.id,
        stance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,bill_id" }
    );
    if (error) throw error;

    if (bioguide && memberVote) {
      const { error: matchError } = await client
        .from("stance_vote_matches")
        .upsert(
          {
            user_id: user.id,
            bill_id: item.id,
            bioguide_id: bioguide,
            politician_name: profile.name || bioguide,
            politician_level: "federal",
            user_stance: stance,
            member_vote: memberVote,
            matched,
            roll_call_number: item.rollCallNumber || null,
            congress: item.congress || null,
            session_number: item.sessionNumber || null,
            vote_result: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,bill_id,bioguide_id" }
        );
      if (matchError) console.warn(matchError);
    }

    if (typeof onScoreRefresh === "function") {
      await onScoreRefresh();
    }
    return { stance, matched, memberVote };
  }

  let matchQuizContext = {
    votes: [],
    profile: null,
    onScoreRefresh: null,
  };

  function bindMatchQuizActions(bodyEl) {
    if (!bodyEl || bodyEl.dataset.boundMatchQuiz === "1") return;
    bodyEl.dataset.boundMatchQuiz = "1";
    bodyEl.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-match-stance]");
      if (!button) return;
      const stance = button.dataset.matchStance;
      const billId = button.dataset.billId;
      const { votes, profile, onScoreRefresh } = matchQuizContext;
      const vote = (votes || []).find(
        (row) => String(row.billId || "") === String(billId || "")
      );
      const item = quizBillItemFromVote(vote, profile);
      if (!item || !stance || !profile) return;

      button.disabled = true;
      setMatchQuizStatus("Saving your stance…", "loading");
      try {
        const result = await saveMatchQuizStance({
          item,
          stance,
          profile,
          onScoreRefresh,
        });
        if (!result) return;
        const card = button.closest(".scorecard-match-quiz__card");
        card
          ?.querySelectorAll("[data-match-stance]")
          .forEach((btn) => {
            const active = btn.dataset.matchStance === stance;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", String(active));
          });
        const resultEl = card?.querySelector("[data-match-result]");
        if (resultEl) {
          resultEl.hidden = false;
          const align =
            result.matched === true
              ? " · matches their roll call"
              : result.matched === false
                ? " · differs from their roll call"
                : "";
          resultEl.textContent = `${
            stance === "support" ? "You supported this" : "You opposed this"
          }${align}`;
        }
        setMatchQuizStatus("Action Match updated.", "success");
      } catch (error) {
        console.warn(error);
        setMatchQuizStatus(
          error?.message || "Could not save that stance.",
          "error"
        );
      } finally {
        button.disabled = false;
      }
    });
  }

  async function openMatchQuizModal({
    votes,
    profile,
    onScoreRefresh,
  }) {
    const modal = $("scorecard-match-modal");
    const bodyEl = $("scorecard-match-quiz-body");
    const ledeEl = $("scorecard-match-quiz-lede");
    if (!modal || !bodyEl) {
      focusActionMatchSection();
      return;
    }

    matchQuizContext = {
      votes: votes || [],
      profile: profile || null,
      onScoreRefresh: onScoreRefresh || null,
    };

    focusActionMatchSection();
    modal.hidden = false;
    document.body.classList.add("scorecard-match-modal-open");
    if (ledeEl) {
      ledeEl.textContent = `Support or Oppose recent ${
        profile?.chamber === "Senate" ? "Senate" : "House"
      } roll calls to recalculate your Action Match with ${
        profile?.name || "this representative"
      }.`;
    }

    const items = (votes || [])
      .map((vote) => quizBillItemFromVote(vote, profile))
      .filter(Boolean)
      .slice(0, 8);
    const { map } = await loadStanceMapForBills(items.map((item) => item.id));
    renderMatchQuizBody(bodyEl, votes, profile, map);
    bindMatchQuizActions(bodyEl);
    setMatchQuizStatus(
      items.length
        ? ""
        : "No recent roll-call votes recorded for this representative.",
      items.length ? "" : "error"
    );
    modal.querySelector(".scorecard-match-modal__close")?.focus();
  }

  function bindMatchQuizModalChrome(getContext) {
    const modal = $("scorecard-match-modal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-match-quiz]")) {
        closeMatchQuizModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeMatchQuizModal();
    });
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest(
        "[data-open-match-quiz], #scorecard-match-cta"
      );
      if (!trigger) return;
      event.preventDefault();
      const ctx = typeof getContext === "function" ? getContext() : null;
      if (!ctx) return;
      openMatchQuizModal(ctx);
    });
  }

  function renderVotes(el, votes, query) {
    if (!el) return;
    const q = String(query || "").trim().toLowerCase();
    const sourceVotes = (votes || []).filter((vote) => {
      const title = String(vote.title || "");
      const number = String(vote.billNumber || "");
      const summary = String(vote.plainEnglishSummary || "");
      if (/^seed\s*:/i.test(title) || /^placeholder\s*:/i.test(title)) return false;
      if (/-seed-/i.test(number) || /-ph-/i.test(number)) return false;
      if (/seeded placeholder|placeholder vote data/i.test(summary)) return false;
      return true;
    });
    const filtered = sourceVotes.filter((vote) => {
      if (!q) return true;
      const haystack = [
        vote.billNumber,
        vote.title,
        vote.plainEnglishSummary,
        vote.category,
        vote.impacts?.wallet,
        vote.impacts?.community,
        vote.impacts?.rights,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const topics = [
      ...new Set(
        sourceVotes
          .map((vote) => String(vote.category || "").trim())
          .filter(Boolean)
      ),
    ];

    const impactMeta = {
      wallet: { icon: "💳", label: "Wallet Impact", className: "is-wallet" },
      community: {
        icon: "🏙️",
        label: "Community Impact",
        className: "is-community",
      },
      rights: { icon: "⚖️", label: "Rights Impact", className: "is-rights" },
    };

    el.innerHTML = `
      <div class="scorecard-votes__header">
        <div class="scorecard-votes__heading">
          <p class="scorecard-card__eyebrow">Truth in Voting</p>
          <h3 class="scorecard-card__title">Recent roll calls</h3>
        </div>
        <div class="scorecard-votes__tools">
          <button
            type="button"
            id="scorecard-match-cta"
            class="scorecard-match-cta"
            data-open-match-quiz="1"
          >
            <span aria-hidden="true">🎯</span>
            Match My Votes
          </button>
          <label class="scorecard-topic">
            <span>Topic</span>
            <select id="scorecard-topic-filter">
              <option value="all">All topics</option>
              ${topics
                .map(
                  (topic) =>
                    `<option value="${escapeHtml(topic)}">${escapeHtml(
                      topic
                    )}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>
      </div>
      ${
        filtered.length
          ? `<ul class="scorecard-vote-list">
              ${filtered
                .map((vote) => {
                  const tone = voteTone(vote.votePosition);
                  const positionLabel = String(vote.votePosition || "—")
                    .toUpperCase()
                    .replace(/_/g, " ");
                  const billNumber = normalizeBillNumber(vote.billNumber);
                  const displayTitle = formatVoteTitle(vote);
                  const summary = buildPlainEnglishSummary(vote);
                  const impacts = [
                    ["wallet", vote.impacts?.wallet],
                    ["community", vote.impacts?.community],
                    ["rights", vote.impacts?.rights],
                  ].filter(([, text]) => text);
                  return `<li class="scorecard-vote">
                    <div class="scorecard-vote__top">
                      <div class="scorecard-vote__meta">
                        ${
                          billNumber
                            ? `<span class="scorecard-bill">${escapeHtml(
                                billNumber
                              )}</span>`
                            : ""
                        }
                        ${
                          vote.category
                            ? `<span class="scorecard-vote__category">${escapeHtml(
                                vote.category
                              )}</span>`
                            : ""
                        }
                        <h4>${escapeHtml(displayTitle)}</h4>
                      </div>
                      <span class="scorecard-vote-pill is-${tone}" aria-label="Voted ${escapeHtml(
                        positionLabel
                      )}">${escapeHtml(positionLabel)}</span>
                    </div>
                    ${
                      impacts.length
                        ? `<div class="scorecard-impacts">
                            ${impacts
                              .map(([kind, text]) => {
                                const meta = impactMeta[kind] || {
                                  icon: "",
                                  label: kind,
                                  className: "",
                                };
                                return `<span class="scorecard-impact-pill ${
                                  meta.className
                                }" title="${escapeHtml(text)}">
                                  <span class="scorecard-impact-pill__icon" aria-hidden="true">${
                                    meta.icon
                                  }</span>
                                  <span class="scorecard-impact-pill__label">${escapeHtml(
                                    meta.label
                                  )}</span>
                                </span>`;
                              })
                              .join("")}
                          </div>`
                        : ""
                    }
                    ${
                      summary
                        ? `<details class="scorecard-vote__summary">
                            <summary>What this means</summary>
                            <p>${escapeHtml(summary)}</p>
                          </details>`
                        : ""
                    }
                  </li>`;
                })
                .join("")}
            </ul>`
          : `<div class="scorecard-empty scorecard-empty--card" role="status">
              <p>${
                sourceVotes.length
                  ? "No roll calls match this filter."
                  : "No recent roll-call votes recorded for this representative."
              }</p>
            </div>`
      }
    `;

    const topicSelect = $("scorecard-topic-filter");
    if (topicSelect) {
      topicSelect.addEventListener("change", () => {
        const topic = topicSelect.value;
        const next =
          topic === "all"
            ? sourceVotes
            : sourceVotes.filter(
                (vote) =>
                  String(vote.category || "").toLowerCase() ===
                  topic.toLowerCase()
              );
        renderVotes(el, next, query);
      });
    }
  }

  function renderTabs(tabsEl, representatives, activeId, onSelect) {
    if (!tabsEl) return;
    let senateIndex = 0;
    tabsEl.hidden = representatives.length === 0;
    tabsEl.innerHTML = representatives
      .map((rep) => {
        if (rep.profile.chamber === "Senate") senateIndex += 1;
        const selected = rep.profile.id === activeId;
        return `<button type="button" class="scorecard-tab${
          selected ? " is-active" : ""
        }" role="tab" aria-selected="${selected}" data-id="${escapeHtml(
          rep.profile.id
        )}">
          <span class="scorecard-tab__label">${escapeHtml(
            tabLabel(rep, senateIndex)
          )}</span>
          <span class="scorecard-tab__name">${escapeHtml(
            rep.profile.name
          )}</span>
        </button>`;
      })
      .join("");

    tabsEl.querySelectorAll(".scorecard-tab").forEach((button) => {
      button.addEventListener("click", () => onSelect(button.dataset.id));
    });
  }

  async function fetchBundle({ id, bioguideId, politicianId, zipCode, address }) {
    const params = new URLSearchParams();
    if (id) params.set("id", id);
    if (bioguideId) params.set("bioguideId", bioguideId);
    if (politicianId) params.set("politicianId", politicianId);
    if (zipCode) params.set("zipCode", zipCode);
    if (address) params.set("address", address);
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Lookup failed (${response.status})`);
    }
    return payload;
  }

  function bindViewToggle() {
    const toggle = $("scorecard-view-toggle");
    const main = document.querySelector(".page--scorecard");
    const details = $("scorecard-directory-details");
    if (!toggle || toggle.dataset.bound === "1") return;
    toggle.dataset.bound = "1";

    toggle.addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      const view = button.dataset.view;
      toggle.querySelectorAll("[data-view]").forEach((btn) => {
        const selected = btn.dataset.view === view;
        btn.classList.toggle("is-active", selected);
        btn.setAttribute("aria-selected", selected ? "true" : "false");
      });
      if (main) main.dataset.activeView = view;

      if (view === "directory") {
        if (details) details.open = true;
        $("scorecard-directory")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } else {
        $("scorecard-primary")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }

  function mountOfficialsDirectory(lookupQuery) {
    const section = $("scorecard-directory");
    const toggle = $("scorecard-view-toggle");
    const query = String(lookupQuery || "").trim();

    if (!query) {
      if (section) section.hidden = true;
      if (toggle) toggle.hidden = true;
      return;
    }

    if (section) section.hidden = false;
    if (toggle) toggle.hidden = false;
    bindViewToggle();

    if (typeof mountAddressResultsPage !== "function") {
      const status = $("directory-status");
      if (status) {
        status.hidden = false;
        status.dataset.type = "error";
        status.textContent =
          "Officials directory is unavailable on this page build.";
      }
      return;
    }

    mountAddressResultsPage({
      statusId: "directory-status",
      resultsId: "address-results",
      queryLabelId: null,
      redirectIfMissing: false,
      queryOverride: query,
    });
  }

  function mountRepresentativesScorecard() {
    const query = readQuery();
    const session = readSession();
    const heading = $("scorecard-heading");
    const lede = $("scorecard-lede");
    const tabs = $("scorecard-tabs");
    const panel = $("scorecard-panel");
    const search = $("scorecard-vote-search");

    let state = {
      data: null,
      activeId: query.id || session?.activeId || null,
      voteQuery: "",
      paintToken: 0,
      lastEnrich: null,
    };

    async function refreshActionMatchScore() {
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active?.profile) return;
      const matchPayload = await loadMatchRows(active.profile.bioguideId);
      const matchSummary = summarizeMatch(matchPayload);
      renderMatch(
        $("scorecard-match"),
        $("scorecard-match-body"),
        $("scorecard-match-lede"),
        active.profile,
        matchPayload
      );
      renderHero(
        $("scorecard-hero"),
        active.profile,
        state.lastEnrich,
        matchSummary
      );
    }

    bindMatchQuizModalChrome(() => {
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active) return null;
      return {
        votes: active.recentVotes || [],
        profile: active.profile,
        onScoreRefresh: refreshActionMatchScore,
      };
    });
    bindMatchDetailModalChrome();

    async function paint() {
      const token = ++state.paintToken;
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active) {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;
      state.activeId = active.profile.id;
      renderTabs(tabs, reps, state.activeId, (id) => {
        state.activeId = id;
        const url = new URL(global.location.href);
        url.searchParams.set("id", id);
        global.history.replaceState({}, "", url.toString());
        writeSession({
          ...(state.data || {}),
          activeId: id,
          query: state.data?.query || query,
        });
        paint();
      });

      // Immediate paint with profile we already have.
      const pendingMatch = { user: followUser, rows: [] };
      renderHero(
        $("scorecard-hero"),
        active.profile,
        null,
        summarizeMatch(pendingMatch)
      );
      renderDonor($("scorecard-donor"), active.campaignFinance);
      renderAttendance($("scorecard-attendance"), active.attendance);
      if (!hasUsableVotes(active.recentVotes)) {
        const votesEl = $("scorecard-votes");
        if (votesEl) {
          votesEl.innerHTML = `
            <div class="scorecard-votes__header">
              <div class="scorecard-votes__heading">
                <p class="scorecard-card__eyebrow">Truth in Voting</p>
                <h3 class="scorecard-card__title">Recent roll calls</h3>
              </div>
              <div class="scorecard-votes__tools">
                <button
                  type="button"
                  id="scorecard-match-cta"
                  class="scorecard-match-cta"
                  data-open-match-quiz="1"
                >
                  <span aria-hidden="true">🎯</span>
                  Match My Votes
                </button>
              </div>
            </div>
            <div class="scorecard-empty scorecard-empty--card" role="status">
              <p>Loading recent roll-call votes…</p>
            </div>`;
        }
      } else {
        renderVotes($("scorecard-votes"), active.recentVotes, state.voteQuery);
      }
      renderMatch(
        $("scorecard-match"),
        $("scorecard-match-body"),
        $("scorecard-match-lede"),
        active.profile,
        pendingMatch
      );

      const [enrich, matchPayload] = await Promise.all([
        loadEnrichment(active.profile),
        loadMatchRows(active.profile.bioguideId),
      ]);
      if (token !== state.paintToken) return;

      if (!hasUsableVotes(active.recentVotes)) {
        const liveVotes = mapProfileVotesToScorecard(enrich?.recentVotes);
        active.recentVotes = liveVotes;
        renderVotes($("scorecard-votes"), liveVotes, state.voteQuery);
      }

      activeRosterPerson = toRosterPerson(active.profile, enrich);
      state.lastEnrich = enrich;
      const matchSummary = summarizeMatch(matchPayload);
      renderHero($("scorecard-hero"), active.profile, enrich, matchSummary);
      renderMatch(
        $("scorecard-match"),
        $("scorecard-match-body"),
        $("scorecard-match-lede"),
        active.profile,
        matchPayload
      );
      await resolveFollowTargetId(activeRosterPerson);
      await loadNoteForPerson(activeRosterPerson, followUser);
      if (token !== state.paintToken) return;
      refreshNoteUi();
      syncFollowButton();
      await completePendingFollowIfNeeded(activeRosterPerson);
      if (token !== state.paintToken) return;
      syncFollowButton();
    }

    if (search) {
      search.addEventListener("input", () => {
        state.voteQuery = search.value;
        const reps = state.data?.representatives || [];
        const active =
          reps.find((rep) => rep.profile.id === state.activeId) || reps[0];
        if (active) {
          renderVotes($("scorecard-votes"), active.recentVotes, state.voteQuery);
        }
      });
    }

    (async () => {
      setStatus("Loading scorecards…", "loading");
      panel.hidden = true;
      tabs.hidden = true;

      try {
        await ensureFollowState();

        let payload = null;
        const zipCode = query.zipCode || session?.query?.zipCode || null;
        const address = query.address || session?.query?.address || null;
        const id = query.id || null;
        const bioguideId = query.bioguideId || null;
        const politicianId = query.politicianId || null;
        const sessionActiveId = session?.activeId || null;
        const directoryQuery =
          address ||
          zipCode ||
          (typeof resolveAddressLookupQuery === "function"
            ? resolveAddressLookupQuery()
            : "") ||
          null;

        if (
          !id &&
          !bioguideId &&
          !politicianId &&
          !zipCode &&
          !address &&
          session?.representatives?.length
        ) {
          payload = session;
        } else if (
          !id &&
          !bioguideId &&
          !politicianId &&
          !zipCode &&
          !address
        ) {
          setStatus(
            "Start from the home page ZIP lookup, Politicians tab, or open with ?zipCode= / ?bioguideId= / ?id=.",
            "error"
          );
          return;
        } else {
          payload = await fetchBundle({
            id: id || (!bioguideId && !politicianId ? sessionActiveId : null),
            bioguideId,
            politicianId,
            zipCode,
            address,
          });
        }

        state.data = payload;
        state.activeId =
          id ||
          payload.activeId ||
          payload.representatives?.find(
            (rep) =>
              bioguideId &&
              String(rep.profile.bioguideId || "").toUpperCase() === bioguideId
          )?.profile?.id ||
          payload.representatives?.find(
            (rep) =>
              politicianId &&
              String(rep.profile.rosterPoliticianId || "") === politicianId
          )?.profile?.id ||
          payload.representatives?.[0]?.profile?.id ||
          null;

        writeSession({
          ...payload,
          activeId: state.activeId,
          query: {
            zipCode,
            address,
            bioguideId,
            politicianId,
          },
        });

        if (heading) {
          const singleName = payload.representative?.profile?.name;
          heading.textContent =
            payload.location?.formattedAddress ||
            payload.location?.state ||
            singleName ||
            "Your federal representatives";
        }
        if (lede) {
          if (payload.counts) {
            lede.textContent = `${payload.counts.total || 0} federal representative${
              payload.counts.total === 1 ? "" : "s"
            } — switch tabs for scorecards, or open Full Regional & State Representation below.`;
          } else if (payload.representatives?.length === 1) {
            lede.textContent =
              "Donor alignment, attendance, Action Match, and Truth in Voting for this member.";
          }
        }

        setStatus("", "loading");
        await paint();
        mountOfficialsDirectory(
          directoryQuery ||
            payload.location?.formattedAddress ||
            payload.location?.state ||
            null
        );
      } catch (error) {
        setStatus(error?.message || "Could not load scorecards.", "error");
      }
    })();
  }

  global.mountRepresentativesScorecard = mountRepresentativesScorecard;
  global.ARTICLE1_SCORECARD_SESSION_KEY = SESSION_KEY;
})(typeof window !== "undefined" ? window : globalThis);
