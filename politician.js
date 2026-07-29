const statusEl = document.getElementById("politician-status");
const overviewEl = document.getElementById("politician-overview");
const matchSection = document.getElementById("politician-match");
const matchBody = document.getElementById("politician-match-body");
const matchLede = document.getElementById("politician-match-lede");
const activitySection = document.getElementById("politician-activity");
const activityLede = document.getElementById("politician-activity-lede");
const recentVotesEl = document.getElementById("politician-recent-votes");
const sponsoredBillsEl = document.getElementById("politician-sponsored-bills");
const statementsBodyEl = document.getElementById("politician-statements-body");
const notesModal = document.getElementById("politician-notes-modal");
const notesStatusEl = document.getElementById("politician-notes-status");
const notesEditorEl = document.getElementById("politician-notes-editor");
const noteBodyInput = document.getElementById("politician-note-body");
const noteSaveBtn = document.getElementById("politician-note-save");
const noteClearBtn = document.getElementById("politician-note-clear");

/** @type {{ id?: string, name?: string, external_key?: string } | null} */
let activePerson = null;
/** @type {{ id?: string, body?: string, updated_at?: string, action_date?: string } | null} */
let politicianNote = null;
/** @type {Element | null} */
let notesModalLastFocus = null;
let notePopoverHideTimer = 0;
/** @type {string} */
let activeActivityTab = "votes";
/** @type {Record<string, unknown> | null} */
let activeCongress = null;
/** @type {Set<string>} */
let followedPoliticianIds = new Set();
/** @type {{ id?: string } | null} */
let followUser = null;

const CATEGORY_RULES = [
  { key: "Immigration", re: /\b(immigra|border|asylum|visa|deport|refugee|customs)\b/i },
  { key: "Taxes", re: /\b(tax|irs|tariff|revenue|duty|excise)\b/i },
  { key: "Family", re: /\b(family|child|parent|marriage|adoption|foster)\b/i },
  { key: "Healthcare", re: /\b(health|medicare|medicaid|hospital|drug|pharma|aca|insurance)\b/i },
  { key: "Housing", re: /\b(hous(e|ing)|rent|mortgage|homeless|zoning)\b/i },
  { key: "Education", re: /\b(school|educat|student|university|college|title ix)\b/i },
  { key: "Defense", re: /\b(defense|military|veteran|armed forces|national security)\b/i },
  { key: "Environment", re: /\b(climat|environment|energy|epa|clean air|water)\b/i },
];

function setStatus(message, type = "loading") {
  if (!statusEl) return;
  statusEl.hidden = !message;
  statusEl.textContent = message || "";
  statusEl.dataset.type = type;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function queryParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    id: params.get("id") || "",
    bioguide: (params.get("bioguide") || params.get("bioguideId") || "")
      .trim()
      .toUpperCase(),
    key: params.get("key") || params.get("external_key") || "",
  };
}

function categorizeBill(bill = {}) {
  const haystack = [
    bill.title,
    bill.bill_number,
    bill.billNumber,
    ...(bill.tags || []),
    bill.policyArea,
    bill.short_pitch,
  ]
    .filter(Boolean)
    .join(" ");
  for (const rule of CATEGORY_RULES) {
    if (rule.re.test(haystack)) return rule.key;
  }
  return "Other";
}

function pickEmails(person = {}) {
  const fromMeta = person?.metadata?.emails || person?.emails || [];
  const list = Array.isArray(fromMeta) ? fromMeta.slice() : [];
  const contactEmail = person?.metadata?.contact?.email;
  if (contactEmail) list.push(contactEmail);
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

function pickSocial(person = {}, congressSocial = []) {
  const fromMeta = [
    ...(typeof mapPoliticianSocialLinks === "function"
      ? mapPoliticianSocialLinks(person)
      : []),
    ...congressSocial,
  ];
  const seen = new Set();
  return fromMeta.filter((link) => {
    if (!link?.url || seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function formatRole(person) {
  if (person.role_label) return person.role_label;
  if (typeof formatPoliticianRoleLabel === "function") {
    return formatPoliticianRoleLabel(person);
  }
  const office =
    person.office_title ||
    person.metadata?.office_title ||
    (typeof chamberLabel === "function"
      ? chamberLabel(person.chamber, person)
      : person.chamber) ||
    "";
  const district =
    typeof formatDistrictMeta === "function"
      ? formatDistrictMeta(person.district, person)
      : person.district;
  return [office, person.state, district].filter(Boolean).join(" · ");
}

async function loadNationalOfficial({ id, key }) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client) return null;

  let nationalId = "";
  const keyMatch = String(key || "").match(/^national:(.+)$/i);
  if (keyMatch) nationalId = keyMatch[1];
  else if (id) nationalId = id;

  if (!nationalId) return null;

  const { data, error } = await client
    .from("national_officials")
    .select("*")
    .eq("id", nationalId)
    .maybeSingle();
  if (error) {
    console.warn(error);
    return null;
  }
  if (!data) return null;
  if (typeof mapNationalOfficial === "function") {
    return mapNationalOfficial(data);
  }
  return {
    external_key: `national:${data.id}`,
    name: data.full_name || data.name,
    office_title: data.title,
    party: data.party,
    photo_url: data.photo_url,
    level: "federal",
    chamber: "executive",
    source: "national_officials",
    metadata: {
      office_title: data.title,
      national_official_id: data.id,
      department: data.department,
      category: data.category,
    },
  };
}

async function loadStoredPolitician({ id, bioguide, key }) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client) return null;

  if (id) {
    const { data, error } = await client
      .from("politicians")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) console.warn(error);
    if (data) return data;
  }

  if (bioguide) {
    const { data, error } = await client
      .from("politicians")
      .select("*")
      .ilike("bioguide_id", bioguide)
      .limit(1)
      .maybeSingle();
    if (error) console.warn(error);
    if (data) return data;
  }

  if (key) {
    const { data, error } = await client
      .from("politicians")
      .select("*")
      .eq("external_key", key)
      .maybeSingle();
    if (error) console.warn(error);
    if (data) return data;
  }

  // President / cabinet / EOP rows often live only in national_officials
  // (or were linked via key=national:<uuid>).
  const national = await loadNationalOfficial({ id, key });
  if (national) return national;

  return null;
}

async function loadCongressProfile(bioguide) {
  if (!bioguide) return null;
  const params = new URLSearchParams({ bioguide });
  if (typeof API_KEY === "string" && API_KEY.trim()) {
    params.set("api_key", API_KEY.trim());
  }
  try {
    const response = await fetch(`/api/politician-profile?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Profile lookup failed");
    return data;
  } catch (error) {
    console.warn(error);
    return null;
  }
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
  return { user, rows: data || [] };
}

function enrichExecutiveDefaults(person = {}) {
  if (!person || typeof person !== "object") return person;
  const title = String(
    person.office_title || person.metadata?.office_title || ""
  ).toLowerCase();
  const name = String(person.name || "").toLowerCase();
  const isPresident =
    /\bpresident of the united states\b/.test(title) ||
    (title === "president" && /trump/.test(name));
  const isVice =
    /\bvice president\b/.test(title) ||
    (/vance/.test(name) && /vice/.test(title));

  const next = { ...person, metadata: { ...(person.metadata || {}) } };
  if (!next.website_url) {
    if (isPresident) next.website_url = "https://www.whitehouse.gov/";
    else if (isVice) next.website_url = "https://www.whitehouse.gov/administration/jd-vance/";
    else if (
      person.source === "national_officials" ||
      person.chamber === "white_house" ||
      person.chamber === "executive" ||
      person.chamber === "cabinet"
    ) {
      next.website_url = "https://www.whitehouse.gov/";
    }
  }
  if (!next.tenure) {
    if (isPresident) {
      next.tenure = {
        electedYear: 2025,
        yearsActive: Math.max(0, new Date().getFullYear() - 2025),
        label: "Elected 2024 · Inaugurated 2025",
      };
      next.role_label = next.role_label || "President of the United States";
    } else if (isVice) {
      next.tenure = {
        electedYear: 2025,
        yearsActive: Math.max(0, new Date().getFullYear() - 2025),
        label: "Elected 2024 · Inaugurated 2025",
      };
      next.role_label = next.role_label || "Vice President of the United States";
    } else if (person.source === "national_officials") {
      next.tenure = { label: "Current administration" };
    }
  }
  if (!next.role_label) {
    next.role_label = formatRole(next);
  }
  return next;
}

function mergePerson(stored, congress) {
  const overview = congress?.overview || {};
  const base = enrichExecutiveDefaults({ ...(stored || {}), ...overview });
  if (stored?.name) base.name = stored.name;
  if (stored?.party) base.party = stored.party;
  if (stored?.photo_url) base.photo_url = stored.photo_url || overview.photo_url;
  if (!base.photo_url) base.photo_url = overview.photo_url;
  if (stored?.website_url && !base.website_url) {
    base.website_url = stored.website_url;
  }
  if (stored?.phone && !base.phone) base.phone = stored.phone;
  if (stored?.metadata) {
    base.metadata = {
      ...(overview.metadata || {}),
      ...stored.metadata,
    };
  }
  if (!base.role_label) base.role_label = formatRole(base);
  if (!base.tenure && overview.tenure) base.tenure = overview.tenure;
  if (!base.tenure && stored) {
    const selection = String(stored.metadata?.selection_method || "").toLowerCase();
    base.tenure = {
      label:
        selection === "appointed"
          ? stored.metadata?.appointed_by
            ? `Appointed by ${stored.metadata.appointed_by}`
            : "Appointed"
          : selection === "elected"
            ? "Elected"
            : "Status unavailable",
    };
  }
  return enrichExecutiveDefaults(base);
}

function renderOverview(person, congress) {
  overviewEl.hidden = false;
  const emails = pickEmails(person);
  const social = pickSocial(person, congress?.contact?.social || []);
  const phone = person.phone || congress?.contact?.phone || "";
  const website = person.website_url || congress?.contact?.website || "";
  const party = person.party || "Independent/Other";
  const tenureLabel = person.tenure?.label || "Status unavailable";
  const photoUrl =
    typeof resolvePoliticianPhotoUrl === "function"
      ? resolvePoliticianPhotoUrl(person)
      : person.photo_url || "";
  const fallback =
    typeof generatedPortraitDataUrl === "function"
      ? generatedPortraitDataUrl(person.name || "Official")
      : "";

  const contactBits = [];
  if (emails[0]) {
    contactBits.push(
      `<a class="politician-profile-contact__link" href="mailto:${escapeHtml(
        emails[0]
      )}">Email</a>`
    );
  }
  if (phone) {
    contactBits.push(
      `<a class="politician-profile-contact__link" href="tel:${escapeHtml(
        phone.replace(/[^\d+]/g, "")
      )}">Phone</a>`
    );
  }
  if (website) {
    contactBits.push(
      `<a class="politician-profile-contact__link" href="${escapeHtml(
        website
      )}" target="_blank" rel="noopener noreferrer">Official Website</a>`
    );
  }
  for (const link of social.slice(0, 4)) {
    contactBits.push(
      `<a class="politician-profile-contact__link" href="${escapeHtml(
        link.url
      )}" target="_blank" rel="noopener noreferrer">${escapeHtml(
        link.label
      )}</a>`
    );
  }

  overviewEl.innerHTML = `
    <div class="politician-profile-card__media">
      <img
        class="politician-profile-card__photo"
        src="${escapeHtml(photoUrl)}"
        alt="${escapeHtml(
          person.name ? `Portrait of ${person.name}` : "Official portrait"
        )}"
        width="160"
        height="160"
      />
    </div>
    <div class="politician-profile-card__body">
      <div class="politician-profile-card__badges">
        <span class="politician-badge">${escapeHtml(
          person.office_title ||
            (typeof chamberLabel === "function"
              ? chamberLabel(person.chamber, person)
              : person.chamber) ||
            "Official"
        )}</span>
        <span class="politician-badge politician-badge--level">${escapeHtml(
          typeof levelLabel === "function"
            ? levelLabel(person.level || "federal")
            : person.level || "Federal"
        )}</span>
        <span class="politician-card__party ${
          typeof partyClass === "function" ? partyClass(party) : "party--other"
        }">${escapeHtml(party)}</span>
      </div>
      <h1 id="politician-name" class="politician-profile-card__name">${escapeHtml(
        person.name || "Politician"
      )}</h1>
      <p class="politician-profile-card__role">${escapeHtml(
        formatRole(person)
      )}</p>
      <p class="politician-profile-card__tenure">${escapeHtml(tenureLabel)}</p>
      <div class="politician-profile-actions">
        <div class="politician-profile-actions__row">
          <button
            type="button"
            id="politician-follow-btn"
            class="politician-profile-follow-btn"
            aria-pressed="false"
          >
            <span class="politician-profile-follow-btn__icon" aria-hidden="true">+</span>
            <span class="politician-profile-follow-btn__label">Follow</span>
          </button>
          <div class="politician-profile-note-wrap" id="politician-note-wrap">
            <button
              type="button"
              id="politician-note-open"
              class="politician-profile-note-btn"
              aria-haspopup="true"
              aria-expanded="false"
              aria-controls="politician-note-popover"
            >
              <span class="politician-profile-note-btn__icon" aria-hidden="true">📝</span>
              <span class="politician-profile-note-btn__label">Private note</span>
            </button>
            <div
              id="politician-note-popover"
              class="politician-profile-note-popover"
              role="dialog"
              aria-label="Private note preview"
              hidden
            >
              <p class="politician-profile-note-popover__kicker">Your private note</p>
              <div
                id="politician-note-preview"
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
          contactBits.length
            ? contactBits.join("")
            : `<span class="politician-profile-contact__empty">No public contact links on file.</span>`
        }
      </div>
    </div>
  `;

  const img = overviewEl.querySelector("img");
  if (img && fallback) {
    img.addEventListener("error", () => {
      if (img.getAttribute("src") !== fallback) img.src = fallback;
    });
  }

  bindFollowButton(person);
  bindNotePopover();
  refreshNoteUi();
  document.title = `${person.name || "Politician"} · Congress Bills`;
}

function syncFollowButton() {
  const button = document.getElementById("politician-follow-btn");
  if (!button) return;
  const following = Boolean(
    activePerson?.id && followedPoliticianIds.has(String(activePerson.id))
  );
  const label = button.querySelector(".politician-profile-follow-btn__label");
  const icon = button.querySelector(".politician-profile-follow-btn__icon");
  if (label) label.textContent = following ? "Following" : "Follow";
  else button.textContent = following ? "Following" : "Follow";
  if (icon) icon.textContent = following ? "✓" : "+";
  button.classList.toggle("is-following", following);
  button.setAttribute("aria-pressed", following ? "true" : "false");
  button.title = following
    ? "Unfollow this official"
    : "Follow this official to see their actions in My Feed";
}

function bindFollowButton(person) {
  const button = document.getElementById("politician-follow-btn");
  if (!button || button.dataset.bound === "1") return;
  button.dataset.bound = "1";
  activePerson = person;
  syncFollowButton();

  button.addEventListener("click", async () => {
    if (!followUser) {
      window.location.href = `auth.html?next=${encodeURIComponent(
        `${window.location.pathname}${window.location.search}`
      )}`;
      return;
    }
    button.disabled = true;
    try {
      let record = activePerson || person;
      if (!record.id) {
        const savedId =
          typeof ensurePoliticianId === "function"
            ? await ensurePoliticianId(record)
            : null;
        if (!savedId && typeof upsertPoliticianRecord === "function") {
          const saved = await upsertPoliticianRecord(record);
          if (saved?.id) {
            record = { ...record, id: saved.id };
          }
        } else if (savedId) {
          record = { ...record, id: savedId };
        }
        activePerson = record;
        if (person) person.id = record.id;
      }
      if (!record?.id) {
        throw new Error(
          "Could not save this official to follow. Try again in a moment."
        );
      }

      const id = String(record.id);
      if (followedPoliticianIds.has(id)) {
        await unfollowPolitician(followUser.id, id);
        followedPoliticianIds.delete(id);
      } else {
        await followPolitician(followUser.id, id);
        followedPoliticianIds.add(id);
      }
      syncFollowButton();
      setStatus("", "loading");
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not update follow.", "error");
    } finally {
      button.disabled = false;
    }
  });
}

async function setupFollowState(person) {
  activePerson = person;
  followUser = typeof getUser === "function" ? await getUser() : null;
  followedPoliticianIds = new Set();
  if (followUser && typeof loadFollowedPoliticianIds === "function") {
    followedPoliticianIds = await loadFollowedPoliticianIds(followUser.id);
  }
  // Resolve id for national officials already upserted earlier.
  if (
    person &&
    !person.id &&
    typeof resolveExistingPoliticianId === "function"
  ) {
    await resolveExistingPoliticianId(person);
  }
  syncFollowButton();
}

function officialRoleKind(person = {}) {
  const chamber = String(person.chamber || "").toLowerCase();
  const group = String(person.metadata?.national_group || "").toLowerCase();
  const source = String(person.source || "").toLowerCase();
  const title = String(
    person.office_title || person.metadata?.office_title || person.role_label || ""
  ).toLowerCase();
  const hasBioguide = Boolean(person.bioguide_id || person.bioguideId);

  if (chamber === "senate") return "senate";
  if (chamber === "house") return "house";
  if (hasBioguide) return "house";

  if (
    chamber === "supreme_court" ||
    group === "supreme_court" ||
    /\b(justice|judge|supreme court)\b/.test(title)
  ) {
    return "judiciary";
  }

  if (
    ["executive", "cabinet", "white_house", "agency_director"].includes(chamber) ||
    ["executive", "cabinet", "white_house", "agency_director"].includes(group) ||
    source === "national_officials" ||
    /\b(secretary|director|advisor|administrator|ambassador|counsel|chief of staff|ostp|cabinet|white house|president|vice president)\b/.test(
      title
    )
  ) {
    return "executive";
  }

  return "non_legislative";
}

function isLegislativeOfficial(person) {
  const kind = officialRoleKind(person);
  return kind === "house" || kind === "senate";
}

function nonVotingEmptyCopy(person) {
  const name = person?.name || "This official";
  const kind = officialRoleKind(person);
  if (kind === "executive") {
    return {
      matchLede: "Action Match tracks congressional roll-call votes.",
      matchBody: `${name} holds an executive appointment and does not participate in congressional roll-call votes or sponsor legislation.`,
      activityLede: "Legislative activity applies to members of Congress.",
      activityBody: `${name} holds an executive appointment and does not participate in congressional roll-call votes or sponsor legislation.`,
      votesEmpty: `${name} does not cast congressional roll-call votes.`,
      sponsoredEmpty: `${name} does not sponsor congressional legislation.`,
      statementsEmpty:
        "Official statements and news for executive appointees aren’t listed here yet.",
    };
  }
  if (kind === "judiciary") {
    return {
      matchLede: "Action Match tracks congressional roll-call votes.",
      matchBody: `${name} serves in the judiciary and does not cast congressional roll-call votes or sponsor legislation.`,
      activityLede: "Legislative activity applies to members of Congress.",
      activityBody: `${name} serves in the judiciary and does not cast congressional roll-call votes or sponsor legislation.`,
      votesEmpty: `${name} does not cast congressional roll-call votes.`,
      sponsoredEmpty: `${name} does not sponsor congressional legislation.`,
      statementsEmpty:
        "Court opinions and related news aren’t listed in this activity feed yet.",
    };
  }
  return {
    matchLede: "Action Match tracks congressional roll-call votes.",
    matchBody: `${name} does not cast congressional roll-call votes, so Support / Oppose comparisons aren’t available here.`,
    activityLede: "Legislative activity applies to members of Congress.",
    activityBody: `${name} is not a voting member of Congress, so roll-call votes and sponsored legislation aren’t available here.`,
    votesEmpty: `${name} does not cast congressional roll-call votes.`,
    sponsoredEmpty: `${name} does not sponsor congressional legislation.`,
    statementsEmpty:
      "Statements and news for this official aren’t listed here yet.",
  };
}

function renderMatchScorecard({ user, rows }, person) {
  matchSection.hidden = false;
  const legislative = isLegislativeOfficial(person);
  const roleKind = officialRoleKind(person);

  if (!legislative) {
    const copy = nonVotingEmptyCopy(person);
    if (matchLede) matchLede.textContent = copy.matchLede;
    matchBody.innerHTML = `
      <div class="politician-match-hero politician-match-hero--empty">
        <div class="politician-match-hero__score">
          <span class="politician-match-hero__value">—</span>
          <span class="politician-match-hero__label">Action Match Score</span>
        </div>
        <p class="politician-match-hero__meta">${escapeHtml(copy.matchBody)}</p>
      </div>`;
    return;
  }

  if (matchLede) {
    matchLede.textContent =
      roleKind === "senate"
        ? "Your Support / Oppose stances compared to this senator’s recorded votes when available."
        : "Your Support / Oppose stances compared to this official’s House roll-call votes.";
  }

  if (!user) {
    matchBody.innerHTML = `
      <p class="politician-profile-empty">
        <a href="auth.html?next=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}">Sign in</a>
        and Support or Oppose bills on Feed/Search to build your Action Match Score with ${escapeHtml(
          person.name || "this official"
        )}.
      </p>
      <p class="politician-quick-match">
        <a class="refresh-btn" href="bills-policies.html?tab=votes&amp;quiz=1">Take a 2-Minute Match Quiz</a>
      </p>`;
    return;
  }

  const compared = rows.filter((row) => row.matched != null);
  const matched = compared.filter((row) => row.matched === true);
  const score =
    compared.length === 0
      ? null
      : Math.round((matched.length / compared.length) * 100);

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
    const title = bill.title || bill.bill_number || row.bill_id;
    const number = bill.bill_number || "";
    const href = bill.official_url || "#";
    return `<li>
      <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(number)}</strong>
        ${escapeHtml(title)}
      </a>
      <span>You ${escapeHtml(row.user_stance)} · They voted ${escapeHtml(
        row.member_vote || "—"
      )}</span>
    </li>`;
  };

  const needsQuickMatch = compared.length < 5;
  const quickMatchCta = needsQuickMatch
    ? `<p class="politician-quick-match">
        <a class="refresh-btn" href="bills-policies.html?tab=votes&amp;quiz=1">Take a 2-Minute Match Quiz</a>
        <span class="politician-quick-match__hint">${
          compared.length === 0
            ? "Answer 5–10 recent key votes to populate your Action Match Score."
            : `You’ve compared ${compared.length} vote${
                compared.length === 1 ? "" : "s"
              }. A few more key votes will firm up this score.`
        }</span>
      </p>`
    : "";

  matchBody.innerHTML = `
    <div class="politician-match-hero">
      <div class="politician-match-hero__score ${
        score == null
          ? ""
          : score >= 70
            ? "is-high"
            : score >= 40
              ? "is-mid"
              : "is-low"
      }">
        <span class="politician-match-hero__value">${
          score == null ? "—" : `${score}%`
        }</span>
        <span class="politician-match-hero__label">Action Match Score</span>
      </div>
      <p class="politician-match-hero__meta">
        ${
          compared.length
            ? `${matched.length} of ${compared.length} comparable House roll calls match your stance.`
            : roleKind === "senate"
              ? "No comparable House roll calls for this senator yet. Action Match currently uses House floor votes linked to bills you Support or Oppose."
              : "No comparable roll calls yet. Support or Oppose federal bills that have House votes — or take the Quick Match quiz."
        }
      </p>
    </div>

    ${quickMatchCta}

    <div class="politician-match-categories" aria-label="Category breakdown">
      ${
        categories.length
          ? categories
              .map((row) => {
                const pct = Math.round((row.matched / row.compared) * 100);
                return `<div class="politician-match-categories__row">
                  <span>${escapeHtml(row.key)}</span>
                  <div class="politician-match-categories__track"><i style="width:${pct}%"></i></div>
                  <strong>${pct}%</strong>
                </div>`;
              })
              .join("")
          : `<p class="politician-profile-empty">Category breakdown appears after you compare votes.</p>`
      }
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
}

function voteCastClass(voteCast) {
  const value = String(voteCast || "").toLowerCase();
  if (value === "yea" || value === "yes" || value === "aye") return "is-yea";
  if (value === "nay" || value === "no") return "is-nay";
  if (value.includes("present")) return "is-present";
  if (value.includes("not voting") || value === "nv") return "is-absent";
  return "is-other";
}

function setActivityTab(tab) {
  activeActivityTab = tab;
  document.querySelectorAll("[data-activity-tab]").forEach((button) => {
    const selected = button.dataset.activityTab === tab;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
  });
  document.querySelectorAll("[data-activity-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.activityPanel !== tab;
  });
}

function voteKindLabel(kind, item = {}) {
  if (kind === "final_passage") return "Final passage";
  if (kind === "amendment") return "Amendment";
  const chamber = String(item.chamber || item.jurisdiction || "").toLowerCase();
  if (chamber.includes("senate")) return "Senate vote";
  if (chamber.includes("house")) return "House vote";
  return "Floor vote";
}

function formatVoteMeta(item) {
  const parts = [];
  if (item.result) parts.push(item.result);
  if (item.date) {
    parts.push(
      typeof formatShortDate === "function"
        ? formatShortDate(item.date)
        : item.date
    );
  }
  if (item.rollCallNumber != null) parts.push(`Roll Call ${item.rollCallNumber}`);
  return parts.join(" · ");
}

function voteCardCopy(item = {}) {
  if (typeof resolveVoteCardCopy === "function") {
    return resolveVoteCardCopy(item);
  }
  return {
    summary:
      String(item.shortPitch || "").trim() ||
      "This is a recent congressional vote on the linked bill.",
    yeaMeans:
      String(item.yeaMeans || "").trim() ||
      "A Yea vote supports advancing this bill as written on this vote.",
    nayMeans:
      String(item.nayMeans || "").trim() ||
      "A Nay vote supports rejecting this bill on this vote.",
    yeaLabel: "Support Measure",
    nayLabel: "Oppose Measure",
    meansAreGeneric: true,
  };
}

function renderVotesList(target, votes, emptyMessage, person) {
  if (!target) return;
  target.replaceChildren();
  if (!votes?.length) {
    const empty = document.createElement("p");
    empty.className = "politician-profile-empty";
    empty.textContent = emptyMessage;
    target.append(empty);
    return;
  }

  const bioguide = String(person?.bioguide_id || "").toUpperCase();
  const personName = person?.name || "this official";

  for (const item of votes) {
    const card = document.createElement("article");
    card.className = "politician-vote-card";
    const cast = item.voteCast || "—";
    const subject = item.subjectCategory || item.policyArea || "";
    const kind = voteKindLabel(item.voteKind, item);
    const copy = voteCardCopy(item);
    const titleFallback =
      String(item.jurisdiction || item.chamber || "")
        .toLowerCase()
        .includes("senate")
        ? "Senate roll-call vote"
        : "House roll-call vote";
    card.innerHTML = `
      <header class="politician-vote-card__header">
        <span class="politician-vote-cast ${voteCastClass(cast)}" title="${escapeHtml(
          personName
        )}’s recorded vote">${escapeHtml(cast)}</span>
        <div class="politician-vote-card__heading">
          <div class="politician-vote-card__badges">
            <span class="politician-vote-card__kind">${escapeHtml(kind)}</span>
            <span class="politician-vote-card__bill">${escapeHtml(
              item.billNumber || `Roll Call ${item.rollCallNumber || ""}`
            )}</span>
            ${
              subject && subject !== "Other"
                ? `<span class="politician-vote-card__subject">${escapeHtml(
                    subject
                  )}</span>`
                : ""
            }
          </div>
          <h3 class="politician-vote-card__title">${escapeHtml(
            item.title || item.voteQuestion || titleFallback
          )}</h3>
          <p class="politician-vote-card__meta">${escapeHtml(
            formatVoteMeta(item)
          )}</p>
        </div>
      </header>
      <section class="politician-vote-card__summary" aria-label="What was proposed">
        <h4>What’s proposed</h4>
        <p>${escapeHtml(copy.summary)}</p>
      </section>
      <div class="politician-vote-card__meanings" aria-label="What Yea and Nay mean">
        <div class="politician-vote-card__meaning is-yea">
          <strong>Yea means</strong>
          <p>${escapeHtml(copy.yeaMeans)}</p>
        </div>
        <div class="politician-vote-card__meaning is-nay">
          <strong>Nay means</strong>
          <p>${escapeHtml(copy.nayMeans)}</p>
        </div>
      </div>
      <a class="bill-card__link" href="${escapeHtml(
        item.clerkUrl || item.officialUrl || "#"
      )}" target="_blank" rel="noopener noreferrer">Open roll call</a>
    `;

    if (window.PolicyEngagement?.mountVote) {
      window.PolicyEngagement.mountVote(card, item, {
        supportLabel: copy.yeaLabel,
        opposeLabel: copy.nayLabel,
        compareBioguides: bioguide ? [bioguide] : [],
        whoVotedHint: `Tap ${copy.yeaLabel} or ${copy.nayLabel} to compare with ${personName}.`,
        onStanceChange: async () => {
          if (!bioguide) return;
          const payload = await loadMatchRows(bioguide);
          renderMatchScorecard(payload, person);
        },
      });
    }

    target.append(card);
  }
}

function renderSponsoredList(target, bills, emptyMessage) {
  if (!target) return;
  target.replaceChildren();
  if (!bills?.length) {
    const li = document.createElement("li");
    li.className = "politician-profile-empty";
    li.textContent = emptyMessage;
    target.append(li);
    return;
  }
  for (const item of bills) {
    const li = document.createElement("li");
    const date =
      item.introducedDate || item.latestAction?.actionDate || item.date || "";
    const action = item.latestAction?.text
      ? String(item.latestAction.text).slice(0, 120)
      : "Sponsored";
    li.innerHTML = `
      <a href="${escapeHtml(
        item.officialUrl || "#"
      )}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(item.billNumber || "")}</strong>
        ${escapeHtml(item.title || "")}
      </a>
      <span>${escapeHtml(action)}${date ? ` · ${escapeHtml(date)}` : ""}${
        item.policyArea ? ` · ${escapeHtml(item.policyArea)}` : ""
      }</span>
    `;
    target.append(li);
  }
}

function renderStatementsPanel(person, emptyMessage) {
  if (!statementsBodyEl) return;
  const website = person?.website_url || "";
  statementsBodyEl.innerHTML = `
    <div class="politician-empty-state">
      <p>${escapeHtml(emptyMessage)}</p>
      ${
        website
          ? `<a class="politician-profile-contact__link" href="${escapeHtml(
              website
            )}" target="_blank" rel="noopener noreferrer">Official website</a>`
          : ""
      }
    </div>
  `;
}

function renderActivity(congress, person) {
  activitySection.hidden = false;
  activeCongress = congress || null;
  activePerson = person || activePerson;
  const legislative = isLegislativeOfficial(person);
  const roleKind = officialRoleKind(person);
  const copy = nonVotingEmptyCopy(person);

  if (!legislative) {
    if (activityLede) activityLede.textContent = copy.activityLede;
    if (recentVotesEl) {
      recentVotesEl.innerHTML = `<p class="politician-profile-empty">${escapeHtml(
        copy.votesEmpty
      )}</p>`;
    }
    if (sponsoredBillsEl) {
      sponsoredBillsEl.innerHTML = `<li class="politician-profile-empty">${escapeHtml(
        copy.sponsoredEmpty
      )}</li>`;
    }
    renderStatementsPanel(person, copy.statementsEmpty);
    setActivityTab(activeActivityTab || "votes");
    return;
  }

  if (activityLede) {
    activityLede.textContent =
      roleKind === "senate"
        ? "Browse recent Senate votes below — read the plain-English summary, then cast Yea or Nay to build your Action Match Score."
        : "Browse recent House votes below — read the plain-English summary, then cast Yea or Nay to build your Action Match Score.";
  }

  const votesIntro = document.querySelector(".politician-votes-intro");
  if (votesIntro) {
    votesIntro.textContent =
      roleKind === "senate"
        ? "Recent Senate roll calls for this member — what was proposed, what Yea / Nay mean, and how you’d vote (feeds Action Match)."
        : "Recent House roll calls for this member — what was proposed, what Yea / Nay mean, and how you’d vote (feeds Action Match).";
  }

  const votes = congress?.recentVotes || [];
  const sponsored =
    congress?.sponsored ||
    congress?.keyLegislation ||
    (congress?.recentActions || []).filter((row) => row.kind === "sponsored") ||
    [];

  let votesEmpty =
    "No recent roll-call votes found yet.";
  if (!congress) {
    votesEmpty =
      "Vote history loads for federal legislators with a bioguide ID.";
  } else if (roleKind === "senate" && !votes.length) {
    votesEmpty =
      "No recent Yea / Nay Senate votes found yet for this member.";
  } else if (roleKind === "house" && !votes.length) {
    votesEmpty = "No recent Yea / Nay / Present House votes found yet.";
  }

  renderVotesList(recentVotesEl, votes, votesEmpty, person);
  renderSponsoredList(
    sponsoredBillsEl,
    sponsored,
    congress
      ? "No sponsored legislation found yet."
      : "Sponsored bills load for federal legislators with a bioguide ID."
  );
  renderStatementsPanel(
    person,
    "Statements and news aren’t collected here yet. Check the official website for press releases and remarks."
  );
  setActivityTab(activeActivityTab || "votes");
}

document
  .querySelector(".politician-activity-tabs")
  ?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-activity-tab]");
    if (!button) return;
    setActivityTab(button.dataset.activityTab);
  });

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function setNotesStatus(message, type = "loading") {
  if (!notesStatusEl) return;
  notesStatusEl.hidden = !message;
  notesStatusEl.textContent = message || "";
  notesStatusEl.dataset.type = type;
}

function authNextHref() {
  const next = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`
  );
  return `auth.html?next=${next}`;
}

function noteHasContent() {
  return Boolean(String(politicianNote?.body || "").trim());
}

function refreshNoteUi() {
  const button = document.getElementById("politician-note-open");
  const label = button?.querySelector(".politician-profile-note-btn__label");
  const preview = document.getElementById("politician-note-preview");
  const editBtn = document.querySelector(
    "#politician-note-popover [data-note-action='edit']"
  );
  const text = noteHasContent() ? "Your note" : "Private note";
  if (label) label.textContent = text;
  if (button) {
    button.setAttribute(
      "aria-label",
      noteHasContent()
        ? `Your private note for ${activePerson?.name || "this official"}`
        : `Private note for ${activePerson?.name || "this official"}`
    );
  }
  if (preview) {
    if (noteHasContent()) {
      preview.textContent = String(politicianNote.body);
      preview.classList.remove("is-empty");
    } else {
      preview.textContent = "No note yet. Add a private note for this official.";
      preview.classList.add("is-empty");
    }
  }
  if (editBtn) {
    editBtn.textContent = noteHasContent() ? "Edit note" : "Add note";
  }
  if (noteBodyInput && notesModal && !notesModal.hidden) {
    noteBodyInput.value = String(politicianNote?.body || "");
  }
  if (noteClearBtn) noteClearBtn.hidden = !noteHasContent();
}

function syncNotesModalViews() {
  if (notesEditorEl) notesEditorEl.hidden = false;
  if (noteBodyInput) noteBodyInput.value = String(politicianNote?.body || "");
  if (noteClearBtn) noteClearBtn.hidden = !noteHasContent();
}

function getNoteWrap() {
  return document.getElementById("politician-note-wrap");
}

function getNotePopover() {
  return document.getElementById("politician-note-popover");
}

function showNotePopover() {
  const wrap = getNoteWrap();
  const popover = getNotePopover();
  const button = document.getElementById("politician-note-open");
  if (!wrap || !popover) return;
  window.clearTimeout(notePopoverHideTimer);
  popover.hidden = false;
  wrap.classList.add("is-open");
  button?.setAttribute("aria-expanded", "true");
}

function hideNotePopover({ immediate = false } = {}) {
  const run = () => {
    const wrap = getNoteWrap();
    const popover = getNotePopover();
    const button = document.getElementById("politician-note-open");
    if (!popover) return;
    popover.hidden = true;
    wrap?.classList.remove("is-open");
    button?.setAttribute("aria-expanded", "false");
  };
  window.clearTimeout(notePopoverHideTimer);
  if (immediate) run();
  else notePopoverHideTimer = window.setTimeout(run, 140);
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
  if (!notesModal) return;
  hideNotePopover({ immediate: true });
  notesModalLastFocus = document.activeElement;
  syncNotesModalViews();
  notesModal.hidden = false;
  document.body.classList.add("politician-notes-modal-open");
  noteBodyInput?.focus?.();
}

function closeNotesModal() {
  if (!notesModal || notesModal.hidden) return;
  notesModal.hidden = true;
  document.body.classList.remove("politician-notes-modal-open");
  setNotesStatus("", "loading");
  if (notesModalLastFocus && typeof notesModalLastFocus.focus === "function") {
    notesModalLastFocus.focus();
  } else {
    document.getElementById("politician-note-open")?.focus();
  }
}

async function resolveExistingPoliticianId(person) {
  if (person?.id && /^[0-9a-f-]{36}$/i.test(String(person.id))) {
    return String(person.id);
  }
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client || !person) return null;

  if (person.external_key) {
    const { data, error } = await client
      .from("politicians")
      .select("id")
      .eq("external_key", person.external_key)
      .maybeSingle();
    if (!error && data?.id) {
      person.id = data.id;
      return String(data.id);
    }
  }

  const bioguide = String(person.bioguide_id || "").trim();
  if (bioguide) {
    const { data, error } = await client
      .from("politicians")
      .select("id")
      .ilike("bioguide_id", bioguide)
      .limit(1)
      .maybeSingle();
    if (!error && data?.id) {
      person.id = data.id;
      return String(data.id);
    }
  }

  return null;
}

async function ensurePoliticianId(person) {
  const existing = await resolveExistingPoliticianId(person);
  if (existing) return existing;
  if (typeof upsertPoliticianRecord !== "function") return null;

  const bioguide = String(person?.bioguide_id || person?.bioguideId || "")
    .trim()
    .toUpperCase();
  if (!person.external_key && bioguide) {
    person.external_key = `federal:${bioguide}`;
  }
  if (!person.level) person.level = bioguide ? "federal" : person.level || "federal";
  if (!person?.name) return null;

  try {
    const record = await upsertPoliticianRecord(person);
    if (record?.id) {
      person.id = record.id;
      return String(record.id);
    }
  } catch (error) {
    console.error(error);
    throw error;
  }
  return null;
}

function pickPrimaryNote(rows = []) {
  if (!rows.length) return null;
  return [...rows].sort((a, b) => {
    const updated = String(b.updated_at || b.created_at || "").localeCompare(
      String(a.updated_at || a.created_at || "")
    );
    if (updated) return updated;
    return String(b.action_date || "").localeCompare(String(a.action_date || ""));
  })[0];
}

async function loadPoliticianNote(person, user) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client || !user || !person) {
    politicianNote = null;
    refreshNoteUi();
    return;
  }

  const politicianId = await resolveExistingPoliticianId(person);
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
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }

  if (name) {
    const { data, error } = await client
      .from("civic_actions")
      .select(selectCols)
      .eq("user_id", user.id)
      .eq("kind", "note")
      .eq("politician_name", name);
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }

  politicianNote = pickPrimaryNote([...byId.values()]);
  refreshNoteUi();
}

async function savePoliticianNote(person, user) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client || !user) {
    window.location.href = authNextHref();
    return;
  }
  const body = String(noteBodyInput?.value || "").trim();
  if (!body) {
    setNotesStatus("Write something before saving.", "error");
    return;
  }
  const politicianId = await ensurePoliticianId(person);
  const politicianName = String(person?.name || "").trim() || null;
  const now = new Date().toISOString();

  if (politicianNote?.id) {
    const { error } = await client
      .from("civic_actions")
      .update({
        body,
        title: null,
        politician_id: politicianId || politicianNote.politician_id || null,
        politician_name: politicianName,
        action_date: todayInputValue(),
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
        bill_id: null,
        bill_label: null,
        politician_id: politicianId,
        politician_name: politicianName,
        contact_method: null,
        action_date: todayInputValue(),
        updated_at: now,
      })
      .select(
        "id, kind, title, body, politician_id, politician_name, action_date, created_at, updated_at"
      )
      .maybeSingle();
    if (error) throw error;
    politicianNote = data;
  }

  await loadPoliticianNote(person, user);
  setNotesStatus("Note saved.", "success");
}

async function clearPoliticianNote(person, user) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client || !user || !politicianNote?.id) return;
  const { error } = await client
    .from("civic_actions")
    .delete()
    .eq("id", politicianNote.id)
    .eq("user_id", user.id);
  if (error) throw error;
  politicianNote = null;
  if (noteBodyInput) noteBodyInput.value = "";
  refreshNoteUi();
  setNotesStatus("Note cleared.", "success");
}

async function setupNotes(person) {
  if (!person) return;
  activePerson = person;
  setNotesStatus("", "loading");

  const user = typeof getUser === "function" ? await getUser() : null;
  if (!user) {
    politicianNote = null;
    refreshNoteUi();
    return;
  }

  try {
    await loadPoliticianNote(person, user);
  } catch (error) {
    console.error(error);
    setNotesStatus(error.message || "Could not load note.", "error");
  }
}

overviewEl?.addEventListener("click", (event) => {
  const actionBtn = event.target.closest("[data-note-action]");
  if (actionBtn) {
    event.preventDefault();
    openNotesModal();
    return;
  }
  const openBtn = event.target.closest("#politician-note-open");
  if (!openBtn) return;
  // Touch / click: toggle popover; hover already shows it on desktop.
  const popover = getNotePopover();
  if (popover?.hidden) showNotePopover();
  else if (window.matchMedia("(hover: none)").matches) openNotesModal();
  else showNotePopover();
});

notesModal?.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-notes]")) {
    closeNotesModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (notesModal && !notesModal.hidden) closeNotesModal();
    else hideNotePopover({ immediate: true });
  }
});

document.addEventListener("pointerdown", (event) => {
  const wrap = getNoteWrap();
  if (!wrap || wrap.contains(event.target)) return;
  hideNotePopover({ immediate: true });
});

noteSaveBtn?.addEventListener("click", async () => {
  if (!activePerson) return;
  setNotesStatus("Saving note…", "loading");
  try {
    const user = typeof getUser === "function" ? await getUser() : null;
    await savePoliticianNote(activePerson, user);
  } catch (error) {
    console.error(error);
    setNotesStatus(error.message || "Could not save note.", "error");
  }
});

noteClearBtn?.addEventListener("click", async () => {
  if (!activePerson || !politicianNote?.id) return;
  setNotesStatus("Clearing note…", "loading");
  try {
    const user = typeof getUser === "function" ? await getUser() : null;
    await clearPoliticianNote(activePerson, user);
  } catch (error) {
    console.error(error);
    setNotesStatus(error.message || "Could not clear note.", "error");
  }
});

async function boot() {
  if (typeof bootNav === "function") {
    await bootNav("politicians");
  }

  if (window.PolicyEngagement?.init) {
    try {
      await window.PolicyEngagement.init();
    } catch (error) {
      console.warn(error);
    }
  }

  const params = queryParams();
  if (!params.id && !params.bioguide && !params.key) {
    setStatus("Missing politician id. Open a profile from Politicians or a bill card.", "error");
    return;
  }

  setStatus("Loading politician profile…", "loading");

  try {
    const stored = await loadStoredPolitician(params);
    const bioguide = (
      params.bioguide ||
      stored?.bioguide_id ||
      ""
    )
      .toString()
      .toUpperCase();

    const [congress, matchPayload] = await Promise.all([
      bioguide ? loadCongressProfile(bioguide) : Promise.resolve(null),
      bioguide
        ? loadMatchRows(bioguide)
        : Promise.resolve({
            user: typeof getUser === "function" ? await getUser() : null,
            rows: [],
          }),
    ]);

    const person = mergePerson(stored, congress);
    if (!person?.name && !congress) {
      setStatus("Could not find that politician.", "error");
      return;
    }

    await setupFollowState(person);
    renderOverview(person, congress);
    await setupNotes(person);
    renderMatchScorecard(matchPayload, person);
    renderActivity(congress, person);
    setStatus("", "loading");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load politician profile.", "error");
  }
}

boot();
