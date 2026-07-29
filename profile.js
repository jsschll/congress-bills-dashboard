const profileStatus = document.getElementById("profile-status");
const profileHeading = document.getElementById("profile-heading");
const accountSummary = document.getElementById("profile-account-summary");
const accountForm = document.getElementById("profile-account-form");
const displayNameInput = document.getElementById("profile-display-name");
const avatarPreview = document.getElementById("profile-avatar-preview");
const headerAvatar = document.getElementById("profile-header-avatar");
const avatarLabel = document.getElementById("profile-avatar-label");
const avatarPresetList = document.getElementById("profile-avatar-preset-list");
const avatarFileInput = document.getElementById("profile-avatar-file");
const avatarClearBtn = document.getElementById("profile-avatar-clear");
const addressForm = document.getElementById("profile-address-form");
const addressInput = document.getElementById("profile-address-input");
const addressLabel = document.getElementById("profile-address-label");
const precisionNote = document.getElementById("profile-precision-note");
const addressSaved = document.getElementById("profile-address-saved");
const addressSavedValue = document.getElementById("profile-address-saved-value");
const addressSavedMeta = document.getElementById("profile-address-saved-meta");
const addressChangeBtn = document.getElementById("profile-address-change");
const addressCancelBtn = document.getElementById("profile-address-cancel");
const addressSummary = document.getElementById("profile-address-summary");
const impactSummary = document.getElementById("profile-impact-summary");
const pocketbookSummary = document.getElementById("profile-pocketbook-summary");
const alignmentSummary = document.getElementById("profile-alignment-summary");
const alignmentChart = document.getElementById("profile-alignment-chart");
const notifySummary = document.getElementById("profile-notify-summary");
const followsSummary = document.getElementById("profile-follows-summary");
const electionsSummary = document.getElementById("profile-elections-summary");
const impactForm = document.getElementById("profile-impact-form");
const pocketbookForm = document.getElementById("profile-pocketbook-form");
const propertyValueInput = document.getElementById("profile-property-value");
const incomeInput = document.getElementById("profile-income");
const filingStatusInput = document.getElementById("profile-filing-status");
const vehicleCountInput = document.getElementById("profile-vehicle-count");
const notifyForm = document.getElementById("profile-notify-form");
const notifyCritical = document.getElementById("notify-critical");
const notifyDigest = document.getElementById("notify-digest");
const notifyNeighborhood = document.getElementById("notify-neighborhood");
const repsContainer = document.getElementById("profile-reps");
const repsSubtitle = document.getElementById("profile-reps-subtitle");
const followedTopicsList = document.getElementById("profile-followed-topics");
const followedPoliticiansList = document.getElementById(
  "profile-followed-politicians"
);
const followedBillsList = document.getElementById("profile-followed-bills");
const noteForm = document.getElementById("profile-note-form");
const contactForm = document.getElementById("profile-contact-form");
const noteBillSelect = document.getElementById("note-bill-select");
const noteBillLabel = document.getElementById("note-bill-label");
const noteTitle = document.getElementById("note-title");
const noteBody = document.getElementById("note-body");
const noteDate = document.getElementById("note-date");
const contactPoliticianSelect = document.getElementById(
  "contact-politician-select"
);
const contactPoliticianName = document.getElementById(
  "contact-politician-name"
);
const contactBillSelect = document.getElementById("contact-bill-select");
const contactMethod = document.getElementById("contact-method");
const contactBody = document.getElementById("contact-body");
const contactDate = document.getElementById("contact-date");
const actionsLog = document.getElementById("profile-actions-log");
const electionsContainer = document.getElementById("profile-elections");
const registrationForm = document.getElementById("profile-registration-form");
const registrationSaved = document.getElementById("profile-registration-saved");
const registrationSavedValue = document.getElementById(
  "profile-registration-saved-value"
);
const registrationChangeBtn = document.getElementById(
  "profile-registration-change"
);
const registrationCancelBtn = document.getElementById(
  "profile-registration-cancel"
);
const ballotCuesList = document.getElementById("profile-ballot-cues");

const VOTER_INFO_PATH = "/api/voter-info";
const VOTER_INFO_FALLBACK =
  "https://congress-bills-dashboard.vercel.app/api/voter-info";
const ACCORDION_STORAGE_KEY = "profileAccordionState";

const PROFILE_SELECT =
  "username, email, display_name, avatar_url, home_address, location_precision, impact_scale, notify_critical, notify_digest, notify_neighborhood, voter_registration_status, estimated_property_value, estimated_income, filing_status, vehicle_count, impact_roles";

let currentUser = null;
let profile = {
  username: "",
  email: "",
  display_name: "",
  avatar_url: "",
  home_address: "",
  location_precision: "street",
  impact_scale: "state",
  notify_critical: true,
  notify_digest: "weekly",
  notify_neighborhood: false,
  voter_registration_status: "",
  estimated_property_value: 350000,
  estimated_income: 75000,
  filing_status: "single",
  vehicle_count: 1,
};
let pendingAvatarUrl = null;
let followedBillOptions = [];
let followedPoliticianOptions = [];
let civicActions = [];
let civicActionFilter = "all";
let editingAddress = false;
let editingRegistration = false;

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function setDefaultActionDates() {
  if (noteDate && !noteDate.value) noteDate.value = todayInputValue();
  if (contactDate && !contactDate.value) contactDate.value = todayInputValue();
}

function setProfileStatus(message, type = "loading") {
  profileStatus.hidden = !message;
  profileStatus.textContent = message || "";
  profileStatus.dataset.type = type;
}

function escapeProfileHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function requireAuthRedirect() {
  const next = encodeURIComponent(
    `${window.location.pathname}${window.location.search}`
  );
  window.location.href = `auth.html?next=${next}`;
}

function impactScaleLabel(value) {
  switch (value) {
    case "hyperlocal":
      return "Hyper-local first";
    case "national":
      return "National focus";
    default:
      return "State-level focus";
  }
}

function registrationStatusLabel(value) {
  switch (value) {
    case "registered":
      return "Registered at this address";
    case "not_registered":
      return "Not registered";
    case "unsure":
      return "Not sure — should double-check";
    default:
      return "";
  }
}

function precisionLabel(value) {
  return value === "zip" ? "ZIP code only" : "Exact street address";
}

function readAccordionState() {
  try {
    return JSON.parse(localStorage.getItem(ACCORDION_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeAccordionState(state) {
  try {
    localStorage.setItem(ACCORDION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures.
  }
}

function setAccordionOpen(panel, open) {
  const trigger = panel.querySelector(".profile-accordion__trigger");
  const body = panel.querySelector(".profile-accordion__body");
  if (!trigger || !body) return;
  panel.classList.toggle("is-collapsed", !open);
  trigger.setAttribute("aria-expanded", String(open));
  if (open) {
    body.removeAttribute("hidden");
  } else {
    body.setAttribute("hidden", "");
  }
}

function initAccordions() {
  const saved = readAccordionState();
  document.querySelectorAll("[data-accordion]").forEach((panel) => {
    const key = panel.dataset.accordionKey || "";
    const defaultOpen = true;
    const open =
      typeof saved[key] === "boolean" ? saved[key] : defaultOpen;
    setAccordionOpen(panel, open);

    const trigger = panel.querySelector(".profile-accordion__trigger");
    trigger?.addEventListener("click", () => {
      const nextOpen = trigger.getAttribute("aria-expanded") !== "true";
      setAccordionOpen(panel, nextOpen);
      if (key) {
        const state = readAccordionState();
        state[key] = nextOpen;
        writeAccordionState(state);
      }
    });
  });
}

function syncPrecisionUi() {
  const precision =
    addressForm?.querySelector('input[name="location_precision"]:checked')
      ?.value || "street";
  const isZip = precision === "zip";
  if (addressLabel) {
    addressLabel.textContent = isZip ? "ZIP code" : "Street address";
  }
  if (addressInput) {
    addressInput.placeholder = isZip
      ? "92101"
      : "123 Main St, City, ST";
    addressInput.autocomplete = isZip ? "postal-code" : "street-address";
  }
  if (precisionNote) {
    precisionNote.textContent = isZip
      ? "ZIP-only is more private, but city council district matches may be less precise."
      : "Street address gives the most accurate city council and district matches.";
  }
}

function syncAddressView() {
  const hasAddress = Boolean(String(profile.home_address || "").trim());
  const showForm = !hasAddress || editingAddress;

  if (addressForm) {
    addressForm.hidden = !showForm;
    addressForm.classList.toggle("is-hidden", !showForm);
  }
  if (addressSaved) {
    const showSaved = !showForm && hasAddress;
    addressSaved.hidden = !showSaved;
    addressSaved.classList.toggle("is-hidden", !showSaved);
  }
  if (addressCancelBtn) {
    addressCancelBtn.hidden = !editingAddress || !hasAddress;
  }

  if (addressSavedValue) {
    addressSavedValue.textContent = profile.home_address || "";
  }
  if (addressSavedMeta) {
    addressSavedMeta.textContent = hasAddress
      ? precisionLabel(profile.location_precision)
      : "";
  }
  if (addressSummary) {
    addressSummary.textContent = hasAddress
      ? profile.home_address
      : "Add an address or ZIP";
  }
}

function syncRegistrationView() {
  const status = profile.voter_registration_status || "";
  const hasStatus = Boolean(status);
  const showForm = !hasStatus || editingRegistration;

  if (registrationForm) {
    registrationForm.hidden = !showForm;
    registrationForm.classList.toggle("is-hidden", !showForm);
  }
  if (registrationSaved) {
    const showSaved = !showForm && hasStatus;
    registrationSaved.hidden = !showSaved;
    registrationSaved.classList.toggle("is-hidden", !showSaved);
  }
  if (registrationCancelBtn) {
    registrationCancelBtn.hidden = !editingRegistration || !hasStatus;
  }

  if (registrationSavedValue) {
    registrationSavedValue.textContent = registrationStatusLabel(status);
  }
  if (electionsSummary) {
    electionsSummary.textContent = hasStatus
      ? registrationStatusLabel(status)
      : "Elections, polling, and registration";
  }
}

function syncPreferenceSummaries() {
  if (accountSummary) {
    const name =
      typeof profileFirstName === "function"
        ? profileFirstName(profile, currentUser)
        : profile.display_name || profile.username || "Account";
    accountSummary.textContent = profile.avatar_url
      ? `${name} · avatar set`
      : `${name} · initials`;
  }
  if (impactSummary) {
    impactSummary.textContent = impactScaleLabel(profile.impact_scale);
  }
  if (notifySummary) {
    const parts = [];
    if (profile.notify_critical !== false) parts.push("Critical on");
    parts.push(`Digest ${profile.notify_digest || "weekly"}`);
    if (profile.notify_neighborhood) parts.push("Neighborhood on");
    notifySummary.textContent = parts.join(" · ");
  }
  if (pocketbookSummary) {
    const property = Number(profile.estimated_property_value) || 0;
    const income = Number(profile.estimated_income) || 0;
    pocketbookSummary.textContent = `Property $${Math.round(
      property / 1000
    )}k · Income $${Math.round(income / 1000)}k · ${
      profile.vehicle_count || 0
    } vehicles`;
  }
}

function renderAlignmentChart(payload) {
  if (!alignmentChart) return;
  const politicians = payload?.politicians || [];
  const levelMap = new Map(
    (payload?.levels || []).map((row) => [
      String(row.level || "federal").toLowerCase(),
      row,
    ])
  );
  const levels = ["local", "state", "federal"].map((level) => {
    const row = levelMap.get(level);
    return {
      level,
      score: row?.score ?? null,
      compared: row?.compared || 0,
      matched_count: row?.matched_count || 0,
    };
  });
  const hasData =
    politicians.length > 0 || levels.some((row) => row.compared > 0);
  if (!hasData) {
    alignmentChart.innerHTML =
      "<p class=\"profile-follow-list__empty\">Support or oppose federal bills on Feed/Search to build your match scores against House roll calls. Local and state match will expand as those roll calls are added.</p>";
    if (alignmentSummary) alignmentSummary.textContent = "No roll-call matches yet";
    return;
  }

  const levelBars = levels
    .map((row) => {
      const score = row.score == null ? 0 : Number(row.score);
      const label = String(row.level || "federal");
      const scoreLabel =
        row.compared === 0
          ? "—"
          : row.score == null
            ? "—"
            : `${score}%`;
      return `<div class="profile-alignment-chart__row">
        <div class="profile-alignment-chart__label">${escapeProfileHtml(
          label
        )}</div>
        <div class="profile-alignment-chart__track"><span style="width:${
          row.compared === 0 ? 0 : score
        }%"></span></div>
        <div class="profile-alignment-chart__score">${escapeProfileHtml(
          scoreLabel
        )}</div>
      </div>`;
    })
    .join("");

  const people = politicians
    .slice(0, 8)
    .map((row) => {
      const score = row.score == null ? "—" : `${row.score}%`;
      return `<li><a class="politician-name-link" href="politician.html?bioguide=${encodeURIComponent(
        String(row.bioguide_id || "").toUpperCase()
      )}"><strong>${escapeProfileHtml(
        row.politician_name || row.bioguide_id
      )}</strong></a> <span>${escapeProfileHtml(String(score))} · ${escapeProfileHtml(
        String(row.matched_count || 0)
      )}/${escapeProfileHtml(String(row.compared || 0))} votes</span></li>`;
    })
    .join("");

  alignmentChart.innerHTML = `
    <div class="profile-alignment-chart__levels">${levelBars || ""}</div>
    ${
      people
        ? `<ul class="profile-alignment-chart__people">${people}</ul>`
        : ""
    }
  `;
  const top =
    levels.find((row) => row.score != null) || politicians[0];
  if (alignmentSummary) {
    alignmentSummary.textContent = top?.score != null
      ? `Top match ${top.score}%`
      : "Building from your stances";
  }
}

async function loadAlignmentBreakdown() {
  const client = getSupabase();
  if (!client || !currentUser) return;
  const { data, error } = await client.rpc("get_user_rep_match_scores");
  if (error) {
    console.warn(error);
    if (alignmentChart) {
      alignmentChart.innerHTML =
        "<p class=\"profile-follow-list__empty\">Run migration-pocketbook-and-votes.sql in Supabase to enable alignment scoring.</p>";
    }
    return;
  }
  renderAlignmentChart(data);
}

function accountLabel() {
  return (
    profile.display_name ||
    profile.username ||
    profile.email ||
    currentUser?.email ||
    "You"
  );
}

function refreshAvatarUI() {
  const avatarUrl =
    pendingAvatarUrl !== null ? pendingAvatarUrl : profile.avatar_url || "";
  const label = accountLabel();
  if (typeof applyAvatarElement === "function") {
    applyAvatarElement(avatarPreview, { avatarUrl, label });
    applyAvatarElement(headerAvatar, { avatarUrl, label });
  }
  if (avatarLabel) {
    avatarLabel.textContent =
      typeof profileFirstName === "function"
        ? profileFirstName(
            { ...profile, display_name: displayNameInput?.value || profile.display_name },
            currentUser
          )
        : label;
  }
  if (avatarPresetList) {
    avatarPresetList.querySelectorAll("[data-preset]").forEach((btn) => {
      const active =
        typeof avatarPresetId === "function" &&
        avatarPresetId(avatarUrl) === btn.dataset.preset;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }
}

function renderAvatarPresets() {
  if (!avatarPresetList || typeof AVATAR_PRESETS === "undefined") return;
  avatarPresetList.replaceChildren();
  for (const preset of AVATAR_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "profile-avatar-presets__swatch";
    button.dataset.preset = preset.id;
    button.title = preset.label;
    button.setAttribute("aria-label", `${preset.label} avatar`);
    button.style.background = `linear-gradient(135deg, ${preset.from}, ${preset.to})`;
    button.textContent =
      typeof profileInitials === "function"
        ? profileInitials(accountLabel())
        : "?";
    button.addEventListener("click", () => {
      pendingAvatarUrl = `preset:${preset.id}`;
      refreshAvatarUI();
    });
    avatarPresetList.append(button);
  }
}

function fillFormsFromProfile() {
  if (profileHeading) {
    profileHeading.textContent = profile.username
      ? `${profile.username}'s profile`
      : "Profile";
  }
  if (displayNameInput) displayNameInput.value = profile.display_name || "";
  pendingAvatarUrl = null;
  renderAvatarPresets();
  refreshAvatarUI();

  if (addressInput) addressInput.value = profile.home_address || "";
  const precision = profile.location_precision === "zip" ? "zip" : "street";
  const precisionInput = addressForm?.querySelector(
    `input[name="location_precision"][value="${precision}"]`
  );
  if (precisionInput) precisionInput.checked = true;
  syncPrecisionUi();

  const impact = profile.impact_scale || "state";
  const impactInput = impactForm?.querySelector(
    `input[name="impact_scale"][value="${impact}"]`
  );
  if (impactInput) impactInput.checked = true;

  if (notifyCritical) notifyCritical.checked = profile.notify_critical !== false;
  if (notifyDigest) notifyDigest.value = profile.notify_digest || "weekly";
  if (notifyNeighborhood) {
    notifyNeighborhood.checked = Boolean(profile.notify_neighborhood);
  }

  if (propertyValueInput) {
    propertyValueInput.value = profile.estimated_property_value ?? 350000;
  }
  if (incomeInput) incomeInput.value = profile.estimated_income ?? 75000;
  if (filingStatusInput) {
    filingStatusInput.value = profile.filing_status || "single";
  }
  if (vehicleCountInput) {
    vehicleCountInput.value = profile.vehicle_count ?? 1;
  }

  const registration = profile.voter_registration_status || "";
  const registrationInput = registrationForm?.querySelector(
    `input[name="voter_registration_status"][value="${registration}"]`
  );
  if (registrationInput) registrationInput.checked = true;

  editingAddress = false;
  editingRegistration = false;
  syncAddressView();
  syncRegistrationView();
  syncPreferenceSummaries();
}

async function loadProfileRow(userId) {
  const client = getSupabase();
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Older DBs may not have preference/pocketbook columns yet — fall back to basics.
    const fallback = await client
      .from("profiles")
      .select("username, email, home_address")
      .eq("id", userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return {
      username: fallback.data?.username || "",
      email: fallback.data?.email || "",
      display_name: "",
      avatar_url: "",
      home_address: fallback.data?.home_address || "",
      location_precision: "street",
      impact_scale: "state",
      notify_critical: true,
      notify_digest: "weekly",
      notify_neighborhood: false,
      voter_registration_status: "",
      estimated_property_value: 350000,
      estimated_income: 75000,
      filing_status: "single",
      vehicle_count: 1,
    };
  }

  return {
    username: data?.username || "",
    email: data?.email || "",
    display_name: data?.display_name || "",
    avatar_url: data?.avatar_url || "",
    home_address: data?.home_address || "",
    location_precision: data?.location_precision || "street",
    impact_scale: data?.impact_scale || "state",
    notify_critical: data?.notify_critical !== false,
    notify_digest: data?.notify_digest || "weekly",
    notify_neighborhood: Boolean(data?.notify_neighborhood),
    voter_registration_status: data?.voter_registration_status || "",
    estimated_property_value:
      data?.estimated_property_value ?? 350000,
    estimated_income: data?.estimated_income ?? 75000,
    filing_status: data?.filing_status || "single",
    vehicle_count: data?.vehicle_count ?? 1,
  };
}

async function saveProfilePatch(patch) {
  const client = getSupabase();
  const { error } = await client
    .from("profiles")
    .update(patch)
    .eq("id", currentUser.id);
  if (error) throw error;
  profile = { ...profile, ...patch };
}

function emptyFollowMessage(listEl, message) {
  listEl.innerHTML = `<li class="profile-follow-list__empty">${escapeProfileHtml(
    message
  )}</li>`;
}

async function loadFollows() {
  const client = getSupabase();
  const [topicsRes, politiciansRes, billsRes] = await Promise.all([
    client
      .from("followed_topics")
      .select("id, kind, value")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false }),
    client
      .from("followed_politicians")
      .select(
        "id, politician:politician_id(id, name, party, state, chamber, office_title, level)"
      )
      .eq("user_id", currentUser.id),
    client
      .from("followed_bills")
      .select(
        "id, bill:bill_id(id, bill_number, title, level, jurisdiction)"
      )
      .eq("user_id", currentUser.id),
  ]);

  followedTopicsList.replaceChildren();
  const topics = topicsRes.data || [];
  if (!topics.length) {
    emptyFollowMessage(followedTopicsList, "No followed topics yet.");
  } else {
    for (const item of topics) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <strong>${escapeProfileHtml(item.value)}</strong>
          <span>${escapeProfileHtml(item.kind)}</span>
        </div>
        <button type="button" data-unfollow-topic="${escapeProfileHtml(
          item.id
        )}">Unfollow</button>
      `;
      followedTopicsList.append(li);
    }
  }

  followedPoliticiansList.replaceChildren();
  const politicians = (politiciansRes.data || [])
    .map((row) => ({ followId: row.id, ...(row.politician || {}) }))
    .filter((row) => row.id);
  if (!politicians.length) {
    emptyFollowMessage(
      followedPoliticiansList,
      "No followed politicians yet."
    );
  } else {
    for (const person of politicians) {
      const li = document.createElement("li");
      const photoUrl =
        typeof resolvePoliticianPhotoUrl === "function"
          ? resolvePoliticianPhotoUrl(person)
          : person.photo_url || "";
      const fallback =
        typeof generatedPortraitDataUrl === "function"
          ? generatedPortraitDataUrl(person.name || "Official")
          : "";
      li.className = "profile-follow-list__person";
      li.innerHTML = `
        <img class="profile-follow-list__photo" src="${escapeProfileHtml(
          photoUrl
        )}" alt="${escapeProfileHtml(
          person.name ? `Portrait of ${person.name}` : "Official portrait"
        )}" width="40" height="40" loading="lazy" />
        <div>
          ${
            typeof politicianProfileHref === "function" &&
            politicianProfileHref(person)
              ? `<strong><a class="politician-name-link" href="${escapeProfileHtml(
                  politicianProfileHref(person)
                )}">${escapeProfileHtml(person.name)}</a></strong>`
              : `<strong>${escapeProfileHtml(person.name)}</strong>`
          }
          <span>${escapeProfileHtml(
            [
              person.office_title || person.chamber,
              person.state,
              person.party,
            ]
              .filter(Boolean)
              .join(" · ")
          )}</span>
        </div>
        <button type="button" data-unfollow-politician="${escapeProfileHtml(
          person.followId
        )}">Unfollow</button>
      `;
      const img = li.querySelector("img");
      if (img && fallback) {
        img.addEventListener("error", () => {
          if (img.getAttribute("src") !== fallback) img.src = fallback;
        });
      }
      followedPoliticiansList.append(li);
    }
  }

  followedBillsList.replaceChildren();
  const bills = (billsRes.data || [])
    .map((row) => ({ followId: row.id, ...(row.bill || {}) }))
    .filter((row) => row.id);
  followedBillOptions = bills;
  fillBillSelects();
  if (!bills.length) {
    emptyFollowMessage(followedBillsList, "No followed bills yet.");
  } else {
    for (const bill of bills) {
      const li = document.createElement("li");
      li.innerHTML = `
        <div>
          <strong>${escapeProfileHtml(
            bill.bill_number || bill.id
          )}</strong>
          <span>${escapeProfileHtml(
            [bill.level, bill.jurisdiction, bill.title].filter(Boolean).join(" · ")
          )}</span>
        </div>
        <button type="button" data-unfollow-bill="${escapeProfileHtml(
          bill.followId
        )}">Unfollow</button>
      `;
      followedBillsList.append(li);
    }
  }

  // also capture politicians for contact dropdown
  followedPoliticianOptions = politicians;
  fillPoliticianSelect();

  if (followsSummary) {
    followsSummary.textContent = `${topics.length} topics · ${politicians.length} politicians · ${bills.length} bills`;
  }
}

function fillBillSelects() {
  for (const select of [noteBillSelect, contactBillSelect]) {
    if (!select) continue;
    const current = select.value;
    select.replaceChildren();
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "No bill selected";
    select.append(blank);
    for (const bill of followedBillOptions) {
      const option = document.createElement("option");
      option.value = bill.id;
      option.textContent = `${bill.bill_number || bill.id} — ${
        bill.title || "Untitled"
      }`.slice(0, 72);
      select.append(option);
    }
    if ([...select.options].some((opt) => opt.value === current)) {
      select.value = current;
    }
  }
}

function fillPoliticianSelect() {
  if (!contactPoliticianSelect) return;
  const current = contactPoliticianSelect.value;
  contactPoliticianSelect.replaceChildren();
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = "Choose from followed…";
  contactPoliticianSelect.append(blank);
  for (const person of followedPoliticianOptions) {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = [
      person.name,
      person.office_title || person.chamber,
      person.state,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 72);
    contactPoliticianSelect.append(option);
  }
  if ([...contactPoliticianSelect.options].some((opt) => opt.value === current)) {
    contactPoliticianSelect.value = current;
  }
}

function selectedBillMeta(selectEl) {
  const id = String(selectEl?.value || "");
  if (!id) return { bill_id: null, bill_label: null };
  const bill = followedBillOptions.find((item) => item.id === id);
  return {
    bill_id: id,
    bill_label: bill
      ? `${bill.bill_number || id}${bill.title ? ` — ${bill.title}` : ""}`
      : id,
  };
}

function contactMethodLabel(value) {
  switch (value) {
    case "email":
      return "Email";
    case "call":
      return "Phone call";
    case "meeting":
      return "Meeting";
    default:
      return "Other";
  }
}

function renderCivicActions() {
  if (!actionsLog) return;
  actionsLog.replaceChildren();
  const items = civicActions.filter(
    (item) => civicActionFilter === "all" || item.kind === civicActionFilter
  );
  if (!items.length) {
    actionsLog.innerHTML = `<li class="profile-follow-list__empty">No ${
      civicActionFilter === "all" ? "actions" : civicActionFilter + "s"
    } yet.</li>`;
    return;
  }

  for (const item of items) {
    const li = document.createElement("li");
    li.className = `profile-action-item profile-action-item--${item.kind}`;
    const kindLabel = item.kind === "note" ? "Note" : "Contact";
    const meta = [
      kindLabel,
      item.action_date,
      item.kind === "contact" ? contactMethodLabel(item.contact_method) : null,
      item.politician_name,
      item.bill_label,
    ]
      .filter(Boolean)
      .join(" · ");
    li.innerHTML = `
      <div>
        <strong>${escapeProfileHtml(item.title || kindLabel)}</strong>
        <span>${escapeProfileHtml(meta)}</span>
        <p>${escapeProfileHtml(item.body)}</p>
      </div>
      <button type="button" data-delete-action="${escapeProfileHtml(
        item.id
      )}">Delete</button>
    `;
    actionsLog.append(li);
  }
}

async function loadCivicActions() {
  const client = getSupabase();
  const { data, error } = await client
    .from("civic_actions")
    .select(
      "id, kind, title, body, bill_id, bill_label, politician_id, politician_name, contact_method, action_date, created_at"
    )
    .eq("user_id", currentUser.id)
    .order("action_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  civicActions = data || [];
  renderCivicActions();
}

async function createCivicAction(payload) {
  const client = getSupabase();
  const { error } = await client.from("civic_actions").insert({
    user_id: currentUser.id,
    ...payload,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  await loadCivicActions();
}

async function deleteCivicAction(id) {
  const client = getSupabase();
  const { error } = await client.from("civic_actions").delete().eq("id", id);
  if (error) throw error;
  await loadCivicActions();
}

function formatElectionDay(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(`${value}T12:00:00`));
  } catch {
    return value;
  }
}

function placeCardHtml(place) {
  return `
    <article class="profile-election-place">
      <strong>${escapeProfileHtml(place.name || "Location")}</strong>
      <span>${escapeProfileHtml(place.address || "")}</span>
      ${
        place.hours
          ? `<span>Hours: ${escapeProfileHtml(place.hours)}</span>`
          : ""
      }
    </article>
  `;
}

async function fetchVoterInfo(address) {
  const query = new URLSearchParams({ address });
  const endpoints = [VOTER_INFO_PATH];
  if (
    typeof location !== "undefined" &&
    location.origin &&
    !location.origin.includes("vercel.app")
  ) {
    endpoints.push(VOTER_INFO_FALLBACK);
  }

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}?${query.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) return data;
      lastError = new Error(data.error || `Voter info failed (${response.status})`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not load voter information.");
}

function renderBallotCues() {
  if (!ballotCuesList) return;
  ballotCuesList.replaceChildren();
  const cues = followedBillOptions.filter((bill) => {
    const haystack = [
      bill.title,
      bill.bill_number,
      bill.jurisdiction,
      bill.level,
    ]
      .join(" ")
      .toLowerCase();
    return /ballot|referendum|initiative|proposition|town hall|public hearing|measure\b/.test(
      haystack
    );
  });

  if (!cues.length) {
    ballotCuesList.innerHTML =
      '<li class="profile-follow-list__empty">No ballot/hearing cues in your followed bills yet.</li>';
    return;
  }

  for (const bill of cues) {
    const li = document.createElement("li");
    li.className = "profile-action-item profile-action-item--note";
    li.innerHTML = `
      <div>
        <strong>${escapeProfileHtml(bill.bill_number || bill.id)}</strong>
        <span>${escapeProfileHtml(
          [bill.level, bill.jurisdiction].filter(Boolean).join(" · ")
        )}</span>
        <p>${escapeProfileHtml(bill.title || "")}</p>
      </div>
    `;
    ballotCuesList.append(li);
  }
}

function renderElectionCenter(payload) {
  if (!electionsContainer) return;

  if (!payload) {
    electionsContainer.innerHTML =
      '<p class="profile-follow-list__empty">Save a location above to load election and voting information.</p>';
    return;
  }

  const elections = payload.elections || [];
  const voterInfo = payload.voterInfo;
  const admin = payload.admin || {};
  const links = payload.registrationLinks || {};

  const electionCards = elections
    .slice(0, 8)
    .map(
      (item) => `
      <article class="profile-election-card">
        <span class="profile-election-card__level">${escapeProfileHtml(
          item.level || "Election"
        )}</span>
        <strong>${escapeProfileHtml(item.name)}</strong>
        <span>${escapeProfileHtml(formatElectionDay(item.electionDay))}</span>
      </article>
    `
    )
    .join("");

  const polling = voterInfo?.pollingLocations || [];
  const early = voterInfo?.earlyVoteSites || [];
  const dropOff = voterInfo?.dropOffLocations || [];
  const contests = voterInfo?.contests || [];

  const coverageNote =
    payload.coverage === "live"
      ? "Live election data for your address."
      : payload.coverage === "partial"
        ? "Some election data is available; polling details may be limited right now."
        : payload.coverage === "calendar"
          ? "Showing upcoming state and federal election dates for your location."
          : payload.message ||
            "Showing general election dates and official voter registration links.";

  electionsContainer.innerHTML = `
    <div class="profile-elections__meta">
      <p>
        <strong>Looking up:</strong>
        ${escapeProfileHtml(payload.normalizedAddress || payload.address || "")}
      </p>
      <p class="profile-form__note">${escapeProfileHtml(coverageNote)}</p>
    </div>

    <div class="profile-elections__section">
      <h3>Upcoming elections</h3>
      <div class="profile-elections__grid">
        ${
          electionCards ||
          '<p class="profile-follow-list__empty">No upcoming elections found for this address.</p>'
        }
      </div>
    </div>

    <div class="profile-elections__section">
      <h3>Where to vote</h3>
      ${
        polling.length || early.length || dropOff.length
          ? `
            ${
              polling.length
                ? `<h4>Polling places</h4><div class="profile-elections__places">${polling
                    .map(placeCardHtml)
                    .join("")}</div>`
                : ""
            }
            ${
              early.length
                ? `<h4>Early voting</h4><div class="profile-elections__places">${early
                    .map(placeCardHtml)
                    .join("")}</div>`
                : ""
            }
            ${
              dropOff.length
                ? `<h4>Ballot drop boxes</h4><div class="profile-elections__places">${dropOff
                    .map(placeCardHtml)
                    .join("")}</div>`
                : ""
            }
          `
          : `<p class="profile-follow-list__empty">No polling locations are published for a live election at this address right now. Check your state election site closer to Election Day.</p>`
      }
    </div>

    <div class="profile-elections__section">
      <h3>Registration &amp; official links</h3>
      <div class="profile-elections__links">
        <a href="${escapeProfileHtml(
          links.voteGovRegister || "https://vote.gov/register"
        )}" target="_blank" rel="noopener noreferrer">Register / update at Vote.gov</a>
        ${
          links.stateSite
            ? `<a href="${escapeProfileHtml(
                links.stateSite
              )}" target="_blank" rel="noopener noreferrer">State election site</a>`
            : ""
        }
        ${
          admin.electionRegistrationUrl
            ? `<a href="${escapeProfileHtml(
                admin.electionRegistrationUrl
              )}" target="_blank" rel="noopener noreferrer">Local registration info</a>`
            : ""
        }
        ${
          admin.electionRegistrationConfirmationUrl
            ? `<a href="${escapeProfileHtml(
                admin.electionRegistrationConfirmationUrl
              )}" target="_blank" rel="noopener noreferrer">Confirm registration</a>`
            : ""
        }
        ${
          admin.votingLocationFinderUrl
            ? `<a href="${escapeProfileHtml(
                admin.votingLocationFinderUrl
              )}" target="_blank" rel="noopener noreferrer">Official polling locator</a>`
            : ""
        }
        ${
          admin.absenteeVotingInfoUrl
            ? `<a href="${escapeProfileHtml(
                admin.absenteeVotingInfoUrl
              )}" target="_blank" rel="noopener noreferrer">Absentee / mail ballot info</a>`
            : ""
        }
      </div>
    </div>

    ${
      contests.length
        ? `<div class="profile-elections__section">
            <h3>Contests on the ballot</h3>
            <ul class="profile-contest-list">
              ${contests
                .map(
                  (contest) => `
                <li>
                  <strong>${escapeProfileHtml(
                    contest.office || contest.ballotTitle || contest.type || "Contest"
                  )}</strong>
                  <span>${escapeProfileHtml(
                    [
                      contest.type,
                      contest.candidates
                        ?.map((c) => c.name)
                        .filter(Boolean)
                        .slice(0, 4)
                        .join(", "),
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  )}</span>
                </li>
              `
                )
                .join("")}
            </ul>
          </div>`
        : ""
    }
  `;
}

async function loadElectionCenter() {
  const address = String(profile.home_address || "").trim();
  renderBallotCues();
  if (!address) {
    renderElectionCenter(null);
    return;
  }
  if (electionsContainer) {
    electionsContainer.innerHTML =
      '<p class="status" data-type="loading">Loading election and voting information…</p>';
  }
  try {
    const payload = await fetchVoterInfo(address);
    renderElectionCenter(payload);
  } catch (error) {
    console.error(error);
    if (electionsContainer) {
      electionsContainer.innerHTML = `<p class="profile-follow-list__empty">${escapeProfileHtml(
        error.message || "Could not load election information."
      )}</p>`;
    }
  }
}

async function unfollowTopic(id) {
  const client = getSupabase();
  const { error } = await client.from("followed_topics").delete().eq("id", id);
  if (error) throw error;
  await loadFollows();
}

async function unfollowPolitician(id) {
  const client = getSupabase();
  const { error } = await client
    .from("followed_politicians")
    .delete()
    .eq("id", id);
  if (error) throw error;
  await loadFollows();
}

async function unfollowBill(id) {
  const client = getSupabase();
  const { error } = await client.from("followed_bills").delete().eq("id", id);
  if (error) throw error;
  await loadFollows();
}

function levelRank(level) {
  const order = ["federal", "state", "county", "city", "school", "local"];
  const idx = order.indexOf(String(level || "").toLowerCase());
  return idx === -1 ? 99 : idx;
}

function renderRepresentation(people, geography = {}) {
  repsContainer.replaceChildren();
  if (!people.length) {
    repsContainer.innerHTML =
      "<p class=\"profile-follow-list__empty\">No representatives found for that location. Try a fuller street address.</p>";
    return;
  }

  const byLevel = new Map();
  for (const person of people) {
    const levels =
      typeof politicianLevels === "function"
        ? politicianLevels(person)
        : [person.level || "local"];
    for (const level of levels) {
      if (!byLevel.has(level)) byLevel.set(level, []);
      byLevel.get(level).push(person);
    }
  }

  const levels = [...byLevel.keys()].sort(
    (a, b) => levelRank(a) - levelRank(b)
  );
  for (const level of levels) {
    const section = document.createElement("section");
    section.className = "profile-reps__group";
    const title =
      typeof levelLabel === "function"
        ? levelLabel(level)
        : String(level || "Other");
    section.innerHTML = `<h3>${escapeProfileHtml(title)}</h3>`;
    const list = document.createElement("div");
    list.className = "profile-reps__cards";

    const seen = new Set();
    for (const person of byLevel.get(level)) {
      const key = person.bioguide_id || person.external_key || person.name;
      if (seen.has(key)) continue;
      seen.add(key);
      const card = document.createElement("article");
      card.className = "profile-rep-card";
      const office =
        person.office_title ||
        person.chamber ||
        person.metadata?.office_title ||
        "";
      const photoUrl =
        typeof resolvePoliticianPhotoUrl === "function"
          ? resolvePoliticianPhotoUrl(person)
          : person.photo_url || "";
      const fallback =
        typeof generatedPortraitDataUrl === "function"
          ? generatedPortraitDataUrl(person.name || "Official")
          : "";
      card.innerHTML = `
        <img class="profile-rep-card__photo" src="${escapeProfileHtml(
          photoUrl
        )}" alt="${escapeProfileHtml(
          person.name ? `Portrait of ${person.name}` : "Official portrait"
        )}" width="56" height="56" loading="lazy" />
        <div>
          ${
            typeof politicianProfileHref === "function" &&
            politicianProfileHref(person)
              ? `<h4><a class="politician-name-link" href="${escapeProfileHtml(
                  politicianProfileHref(person)
                )}">${escapeProfileHtml(person.name)}</a></h4>`
              : `<h4>${escapeProfileHtml(person.name)}</h4>`
          }
          <p>${escapeProfileHtml(
            [office, person.party, person.state, person.district]
              .filter(Boolean)
              .join(" · ")
          )}</p>
        </div>
      `;
      const img = card.querySelector("img");
      if (img && fallback) {
        img.addEventListener("error", () => {
          if (img.src !== fallback) img.src = fallback;
        });
      }
      list.append(card);
    }
    section.append(list);
    repsContainer.append(section);
  }

  const place = [geography.city, geography.state].filter(Boolean).join(", ");
  if (repsSubtitle) {
    repsSubtitle.textContent = place
      ? `Officials resolved for ${place}.`
      : "Officials resolved from your saved location.";
  }
}

async function loadRepresentation() {
  const address = String(profile.home_address || "").trim();
  if (!address) {
    repsContainer.innerHTML =
      "<p class=\"profile-follow-list__empty\">Save a location to see who represents you.</p>";
    if (repsSubtitle) {
      repsSubtitle.textContent =
        "Save a location above to map your federal, state, and local officials.";
    }
    return;
  }

  repsContainer.innerHTML = "<p class=\"status\" data-type=\"loading\">Looking up your representatives…</p>";
  try {
    if (typeof lookupRepresentatives !== "function") {
      throw new Error("Representative lookup is unavailable on this page.");
    }
    const data = await lookupRepresentatives(address);
    const people =
      typeof dedupeLookupPoliticians === "function"
        ? dedupeLookupPoliticians(data.politicians || [])
        : data.politicians || [];
    renderRepresentation(people, {
      state: data.geography?.state || data.state || "",
      city: data.geography?.city || data.city || "",
    });
  } catch (error) {
    console.error(error);
    repsContainer.innerHTML = `<p class="profile-follow-list__empty">${escapeProfileHtml(
      error.message || "Could not look up representatives."
    )}</p>`;
  }
}

addressForm?.addEventListener("change", (event) => {
  if (event.target?.name === "location_precision") syncPrecisionUi();
});

addressChangeBtn?.addEventListener("click", () => {
  editingAddress = true;
  syncAddressView();
  addressInput?.focus();
});

addressCancelBtn?.addEventListener("click", () => {
  editingAddress = false;
  if (addressInput) addressInput.value = profile.home_address || "";
  const precision = profile.location_precision === "zip" ? "zip" : "street";
  const precisionInput = addressForm?.querySelector(
    `input[name="location_precision"][value="${precision}"]`
  );
  if (precisionInput) precisionInput.checked = true;
  syncPrecisionUi();
  syncAddressView();
});

registrationChangeBtn?.addEventListener("click", () => {
  editingRegistration = true;
  syncRegistrationView();
});

registrationCancelBtn?.addEventListener("click", () => {
  editingRegistration = false;
  const registration = profile.voter_registration_status || "";
  const registrationInput = registrationForm?.querySelector(
    `input[name="voter_registration_status"][value="${registration}"]`
  );
  if (registrationInput) registrationInput.checked = true;
  syncRegistrationView();
});

addressForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const precision =
    addressForm.querySelector('input[name="location_precision"]:checked')
      ?.value || "street";
  const homeAddress = String(addressInput.value || "").trim();
  if (!homeAddress) {
    setProfileStatus("Enter an address or ZIP code.", "error");
    return;
  }
  setProfileStatus("Saving location…", "loading");
  try {
    await saveProfilePatch({
      home_address: homeAddress,
      location_precision: precision,
    });
    try {
      localStorage.setItem("policyFeed.locationAddress", homeAddress);
    } catch {
      // Ignore storage failures.
    }
    editingAddress = false;
    syncAddressView();
    setProfileStatus("Location saved.", "success");
    await Promise.all([loadRepresentation(), loadElectionCenter()]);
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not save location.", "error");
  }
});

impactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const impactScale =
    impactForm.querySelector('input[name="impact_scale"]:checked')?.value ||
    "state";
  setProfileStatus("Saving impact preference…", "loading");
  try {
    await saveProfilePatch({ impact_scale: impactScale });
    syncPreferenceSummaries();
    setProfileStatus("Impact preference saved.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not save preference.", "error");
  }
});

accountForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = String(displayNameInput?.value || "").trim();
  const nextAvatar =
    pendingAvatarUrl !== null ? pendingAvatarUrl : profile.avatar_url || "";
  setProfileStatus("Saving account…", "loading");
  try {
    await saveProfilePatch({
      display_name: displayName || null,
      avatar_url: nextAvatar || null,
    });
    pendingAvatarUrl = null;
    refreshAvatarUI();
    syncPreferenceSummaries();
    // Refresh nav avatar/name without full reload.
    if (typeof renderAppNav === "function") {
      await renderAppNav("profile");
    }
    setProfileStatus("Account settings saved.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(
      error.message ||
        "Could not save account. Run migration-profile-avatar.sql in Supabase if columns are missing.",
      "error"
    );
  }
});

displayNameInput?.addEventListener("input", () => {
  refreshAvatarUI();
});

avatarFileInput?.addEventListener("change", async () => {
  const file = avatarFileInput.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setProfileStatus("Choose an image file.", "error");
    return;
  }
  setProfileStatus("Uploading avatar…", "loading");
  try {
    const url = await uploadProfileAvatar(currentUser.id, file);
    pendingAvatarUrl = url;
    refreshAvatarUI();
    setProfileStatus("Avatar ready — click Save account to keep it.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not upload avatar.", "error");
  } finally {
    avatarFileInput.value = "";
  }
});

avatarClearBtn?.addEventListener("click", () => {
  pendingAvatarUrl = "";
  refreshAvatarUI();
});

pocketbookForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setProfileStatus("Saving pocketbook baselines…", "loading");
  try {
    await saveProfilePatch({
      estimated_property_value: Number(propertyValueInput?.value) || null,
      estimated_income: Number(incomeInput?.value) || null,
      filing_status: filingStatusInput?.value || "single",
      vehicle_count: Number(vehicleCountInput?.value) || 0,
    });
    syncPreferenceSummaries();
    setProfileStatus("Pocketbook baselines saved.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(
      error.message ||
        "Could not save baselines. Run the pocketbook migration in Supabase if columns are missing.",
      "error"
    );
  }
});

notifyForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setProfileStatus("Saving notification preferences…", "loading");
  try {
    await saveProfilePatch({
      notify_critical: Boolean(notifyCritical?.checked),
      notify_digest: notifyDigest?.value || "weekly",
      notify_neighborhood: Boolean(notifyNeighborhood?.checked),
    });
    syncPreferenceSummaries();
    setProfileStatus("Notification preferences saved.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(
      error.message || "Could not save notification preferences.",
      "error"
    );
  }
});

document.getElementById("profile-follows")?.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  try {
    if (button.dataset.unfollowTopic) {
      await unfollowTopic(button.dataset.unfollowTopic);
    } else if (button.dataset.unfollowPolitician) {
      await unfollowPolitician(button.dataset.unfollowPolitician);
    } else if (button.dataset.unfollowBill) {
      await unfollowBill(button.dataset.unfollowBill);
    }
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not unfollow.", "error");
  }
});

noteForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = String(noteBody?.value || "").trim();
  if (!body) {
    setProfileStatus("Write a note before saving.", "error");
    return;
  }
  const billMeta = selectedBillMeta(noteBillSelect);
  const manualLabel = String(noteBillLabel?.value || "").trim();
  setProfileStatus("Saving note…", "loading");
  try {
    await createCivicAction({
      kind: "note",
      title: String(noteTitle?.value || "").trim() || null,
      body,
      bill_id: billMeta.bill_id,
      bill_label: billMeta.bill_label || manualLabel || null,
      politician_id: null,
      politician_name: null,
      contact_method: null,
      action_date: noteDate?.value || todayInputValue(),
    });
    noteForm.reset();
    setDefaultActionDates();
    fillBillSelects();
    setProfileStatus("Note saved.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not save note.", "error");
  }
});

contactForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const body = String(contactBody?.value || "").trim();
  const selectedId = String(contactPoliticianSelect?.value || "");
  const selectedPerson = followedPoliticianOptions.find(
    (person) => person.id === selectedId
  );
  const politicianName =
    selectedPerson?.name || String(contactPoliticianName?.value || "").trim();
  if (!body) {
    setProfileStatus("Describe the contact before saving.", "error");
    return;
  }
  if (!politicianName) {
    setProfileStatus("Choose or enter a representative.", "error");
    return;
  }
  const billMeta = selectedBillMeta(contactBillSelect);
  setProfileStatus("Saving contact log…", "loading");
  try {
    await createCivicAction({
      kind: "contact",
      title: `Contacted ${politicianName}`,
      body,
      bill_id: billMeta.bill_id,
      bill_label: billMeta.bill_label,
      politician_id: selectedPerson?.id || null,
      politician_name: politicianName,
      contact_method: contactMethod?.value || "other",
      action_date: contactDate?.value || todayInputValue(),
    });
    contactForm.reset();
    setDefaultActionDates();
    fillBillSelects();
    fillPoliticianSelect();
    setProfileStatus("Contact logged.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not log contact.", "error");
  }
});

document
  .querySelector(".profile-actions-filters")
  ?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter]");
    if (!button) return;
    civicActionFilter = button.dataset.filter || "all";
    document
      .querySelectorAll(".profile-actions-filter")
      .forEach((el) => el.classList.toggle("is-active", el === button));
    renderCivicActions();
  });

actionsLog?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-action]");
  if (!button) return;
  try {
    await deleteCivicAction(button.dataset.deleteAction);
    setProfileStatus("Action deleted.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not delete action.", "error");
  }
});

registrationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const status =
    registrationForm.querySelector(
      'input[name="voter_registration_status"]:checked'
    )?.value || "";
  if (!status) {
    setProfileStatus("Choose a registration status.", "error");
    return;
  }
  setProfileStatus("Saving registration status…", "loading");
  try {
    await saveProfilePatch({ voter_registration_status: status });
    editingRegistration = false;
    syncRegistrationView();
    setProfileStatus("Registration status saved.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(
      error.message || "Could not save registration status.",
      "error"
    );
  }
});

(async function initProfilePage() {
  await bootNav("profile");
  currentUser = await getUser();
  if (!currentUser) {
    requireAuthRedirect();
    return;
  }

  setDefaultActionDates();
  initAccordions();
  setProfileStatus("Loading profile…", "loading");
  try {
    profile = await loadProfileRow(currentUser.id);
    fillFormsFromProfile();
    await Promise.all([
      loadFollows().then(() => renderBallotCues()),
      loadRepresentation(),
      loadAlignmentBreakdown(),
      loadCivicActions().catch((error) => {
        console.warn(error);
        if (actionsLog) {
          actionsLog.innerHTML = "<li class=\"profile-follow-list__empty\">Run migration-civic-actions.sql in Supabase to enable the action tracker.</li>";
        }
      }),
      loadElectionCenter(),
    ]);
    setProfileStatus("", "success");
    if (window.location.hash === "#account" || window.location.hash === "#settings") {
      document.getElementById("account")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not load profile.", "error");
  }
})();
