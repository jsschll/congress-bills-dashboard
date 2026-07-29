const statusEl = document.getElementById("politician-status");
const overviewEl = document.getElementById("politician-overview");
const matchSection = document.getElementById("politician-match");
const matchBody = document.getElementById("politician-match-body");
const activitySection = document.getElementById("politician-activity");
const recentActionsEl = document.getElementById("politician-recent-actions");
const keyBillsEl = document.getElementById("politician-key-bills");
const notesModal = document.getElementById("politician-notes-modal");
const notesStatusEl = document.getElementById("politician-notes-status");
const notesSigninEl = document.getElementById("politician-notes-signin");
const notesEditorEl = document.getElementById("politician-notes-editor");
const notesAuthLink = document.getElementById("politician-notes-auth-link");
const notesListEl = document.getElementById("politician-notes-list");
const noteForm = document.getElementById("politician-note-form");
const noteTitleInput = document.getElementById("politician-note-title");
const noteBodyInput = document.getElementById("politician-note-body");
const noteDateInput = document.getElementById("politician-note-date");

/** @type {{ id?: string, name?: string, external_key?: string } | null} */
let activePerson = null;
/** @type {Array<Record<string, unknown>>} */
let politicianNotes = [];
/** @type {Element | null} */
let notesModalLastFocus = null;

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
  contactBits.push(
    `<button type="button" id="politician-note-open" class="politician-profile-note-btn" aria-haspopup="dialog">
      <span class="politician-profile-note-btn__icon" aria-hidden="true">📝</span>
      <span class="politician-profile-note-btn__label">Add private note</span>
    </button>`
  );

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
      <div class="politician-profile-contact" aria-label="Contact and notes">
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

  updateNoteButtonLabel();
  document.title = `${person.name || "Politician"} · Congress Bills`;
}

function renderMatchScorecard({ user, rows }, person) {
  matchSection.hidden = false;
  const isLegislator = Boolean(
    person?.bioguide_id ||
      person?.bioguideId ||
      ["house", "senate"].includes(String(person?.chamber || "").toLowerCase())
  );
  if (!user) {
    matchBody.innerHTML = `
      <p class="politician-profile-empty">
        <a href="auth.html?next=${encodeURIComponent(
          window.location.pathname + window.location.search
        )}">Sign in</a>
        and Support or Oppose bills on Feed/Search to build your Action Match Score with ${escapeHtml(
          person.name || "this official"
        )}.
      </p>`;
    return;
  }

  if (!isLegislator) {
    matchBody.innerHTML = `
      <div class="politician-match-hero">
        <div class="politician-match-hero__score">
          <span class="politician-match-hero__value">—</span>
          <span class="politician-match-hero__label">Action Match Score</span>
        </div>
        <p class="politician-match-hero__meta">
          Roll-call match scores are available for U.S. House members.
          ${escapeHtml(person.name || "This official")} doesn’t cast House floor
          votes, so Support / Oppose comparisons aren’t tracked here yet.
        </p>
      </div>`;
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
            : "No comparable roll calls yet. Support or Oppose federal bills that have House votes."
        }
      </p>
    </div>

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

function renderActivityList(target, items, emptyMessage) {
  target.replaceChildren();
  if (!items?.length) {
    const li = document.createElement("li");
    li.className = "politician-profile-empty";
    li.textContent = emptyMessage;
    target.append(li);
    return;
  }
  for (const item of items) {
    const li = document.createElement("li");
    const date =
      item.date ||
      item.introducedDate ||
      item.latestAction?.actionDate ||
      "";
    const kind =
      item.kind === "vote"
        ? `Voted ${item.voteCast || ""}`
        : item.kind === "sponsored"
          ? "Sponsored"
          : "Action";
    li.innerHTML = `
      <a href="${escapeHtml(item.officialUrl || "#")}" target="_blank" rel="noopener noreferrer">
        <strong>${escapeHtml(item.billNumber || "")}</strong>
        ${escapeHtml(item.title || "")}
      </a>
      <span>${escapeHtml(kind)}${date ? ` · ${escapeHtml(date)}` : ""}${
        item.policyArea ? ` · ${escapeHtml(item.policyArea)}` : ""
      }</span>
    `;
    target.append(li);
  }
}

function renderActivity(congress) {
  activitySection.hidden = false;
  renderActivityList(
    recentActionsEl,
    congress?.recentActions || [],
    congress
      ? "No recent House votes or sponsored bills found yet."
      : "Activity feed is available for federal members with a bioguide ID."
  );
  renderActivityList(
    keyBillsEl,
    congress?.keyLegislation || congress?.sponsored?.slice(0, 6) || [],
    "No key sponsored legislation found."
  );
}

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

function noteButtonLabel() {
  return politicianNotes.length
    ? politicianNotes.length === 1
      ? "Edit note"
      : "Edit notes"
    : "Add private note";
}

function updateNoteButtonLabel() {
  const button = document.getElementById("politician-note-open");
  if (!button) return;
  const label = button.querySelector(".politician-profile-note-btn__label");
  const text = noteButtonLabel();
  if (label) label.textContent = text;
  else button.textContent = text;
  button.setAttribute(
    "aria-label",
    politicianNotes.length
      ? `${text} for ${activePerson?.name || "this official"}`
      : `Add a private note about ${activePerson?.name || "this official"}`
  );
}

function syncNotesModalViews(user) {
  if (notesAuthLink) notesAuthLink.href = authNextHref();
  if (!user) {
    if (notesSigninEl) notesSigninEl.hidden = false;
    if (notesEditorEl) notesEditorEl.hidden = true;
    return;
  }
  if (notesSigninEl) notesSigninEl.hidden = true;
  if (notesEditorEl) notesEditorEl.hidden = false;
  if (noteDateInput && !noteDateInput.value) {
    noteDateInput.value = todayInputValue();
  }
}

function openNotesModal() {
  if (!notesModal) return;
  notesModalLastFocus = document.activeElement;
  notesModal.hidden = false;
  document.body.classList.add("politician-notes-modal-open");
  const focusTarget =
    notesEditorEl && !notesEditorEl.hidden
      ? noteBodyInput || noteForm?.querySelector("button, input, textarea")
      : notesSigninEl?.querySelector("a") ||
        notesModal.querySelector("[data-close-notes]");
  focusTarget?.focus?.();
}

function closeNotesModal() {
  if (!notesModal || notesModal.hidden) return;
  notesModal.hidden = true;
  document.body.classList.remove("politician-notes-modal-open");
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
  if (!person?.external_key || !person?.name) return null;
  const record = await upsertPoliticianRecord(person);
  if (record?.id) {
    person.id = record.id;
    return String(record.id);
  }
  return null;
}

function renderPoliticianNotes() {
  if (!notesListEl) return;
  notesListEl.replaceChildren();
  if (!politicianNotes.length) {
    notesListEl.innerHTML =
      '<li class="profile-follow-list__empty">No notes saved for this official yet.</li>';
    updateNoteButtonLabel();
    return;
  }
  for (const item of politicianNotes) {
    const li = document.createElement("li");
    li.className = "profile-action-item profile-action-item--note";
    const meta = ["Note", item.action_date].filter(Boolean).join(" · ");
    li.innerHTML = `
      <div>
        <strong>${escapeHtml(item.title || "Note")}</strong>
        <span>${escapeHtml(meta)}</span>
        <p>${escapeHtml(item.body)}</p>
      </div>
      <button type="button" data-delete-note="${escapeHtml(item.id)}">Delete</button>
    `;
    notesListEl.append(li);
  }
  updateNoteButtonLabel();
}

async function loadPoliticianNotes(person, user) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client || !user || !person) {
    politicianNotes = [];
    renderPoliticianNotes();
    return;
  }

  const politicianId = await resolveExistingPoliticianId(person);
  const name = String(person.name || "").trim();
  const byId = new Map();

  const selectCols =
    "id, kind, title, body, politician_id, politician_name, action_date, created_at";

  if (politicianId) {
    const { data, error } = await client
      .from("civic_actions")
      .select(selectCols)
      .eq("user_id", user.id)
      .eq("kind", "note")
      .eq("politician_id", politicianId)
      .order("action_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }

  if (name) {
    const { data, error } = await client
      .from("civic_actions")
      .select(selectCols)
      .eq("user_id", user.id)
      .eq("kind", "note")
      .eq("politician_name", name)
      .order("action_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    for (const row of data || []) byId.set(row.id, row);
  }

  politicianNotes = [...byId.values()].sort((a, b) => {
    const dateCmp = String(b.action_date || "").localeCompare(
      String(a.action_date || "")
    );
    if (dateCmp) return dateCmp;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  });
  renderPoliticianNotes();
}

async function savePoliticianNote(person, user) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client || !user) {
    window.location.href = authNextHref();
    return;
  }
  const body = String(noteBodyInput?.value || "").trim();
  if (!body) {
    setNotesStatus("Write a note before saving.", "error");
    return;
  }
  const politicianId = await ensurePoliticianId(person);
  const politicianName = String(person?.name || "").trim() || null;
  const { error } = await client.from("civic_actions").insert({
    user_id: user.id,
    kind: "note",
    title: String(noteTitleInput?.value || "").trim() || null,
    body,
    bill_id: null,
    bill_label: null,
    politician_id: politicianId,
    politician_name: politicianName,
    contact_method: null,
    action_date: noteDateInput?.value || todayInputValue(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  noteForm?.reset();
  if (noteDateInput) noteDateInput.value = todayInputValue();
  await loadPoliticianNotes(person, user);
  setNotesStatus("Note saved.", "success");
}

async function deletePoliticianNote(noteId, person, user) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client || !user || !noteId) return;
  const { error } = await client.from("civic_actions").delete().eq("id", noteId);
  if (error) throw error;
  await loadPoliticianNotes(person, user);
  setNotesStatus("Note deleted.", "success");
}

async function setupNotes(person) {
  if (!person) return;
  activePerson = person;
  setNotesStatus("", "loading");

  const user = typeof getUser === "function" ? await getUser() : null;
  syncNotesModalViews(user);
  if (!user) {
    politicianNotes = [];
    updateNoteButtonLabel();
    return;
  }

  try {
    await loadPoliticianNotes(person, user);
  } catch (error) {
    console.error(error);
    setNotesStatus(error.message || "Could not load notes.", "error");
  }
}

overviewEl?.addEventListener("click", (event) => {
  if (!event.target.closest("#politician-note-open")) return;
  openNotesModal();
});

notesModal?.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-notes]")) {
    closeNotesModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && notesModal && !notesModal.hidden) {
    closeNotesModal();
  }
});

noteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
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

notesListEl?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-note]");
  if (!button || !activePerson) return;
  setNotesStatus("Deleting note…", "loading");
  try {
    const user = typeof getUser === "function" ? await getUser() : null;
    await deletePoliticianNote(button.dataset.deleteNote, activePerson, user);
  } catch (error) {
    console.error(error);
    setNotesStatus(error.message || "Could not delete note.", "error");
  }
});

async function boot() {
  if (typeof bootNav === "function") {
    await bootNav("politicians");
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

    renderOverview(person, congress);
    await setupNotes(person);
    renderMatchScorecard(matchPayload, person);
    renderActivity(congress);
    setStatus("", "loading");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Could not load politician profile.", "error");
  }
}

boot();
