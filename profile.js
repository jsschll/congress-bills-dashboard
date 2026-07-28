const profileStatus = document.getElementById("profile-status");
const profileHeading = document.getElementById("profile-heading");
const addressForm = document.getElementById("profile-address-form");
const addressInput = document.getElementById("profile-address-input");
const addressLabel = document.getElementById("profile-address-label");
const precisionNote = document.getElementById("profile-precision-note");
const impactForm = document.getElementById("profile-impact-form");
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

const PROFILE_SELECT =
  "username, email, home_address, location_precision, impact_scale, notify_critical, notify_digest, notify_neighborhood";

let currentUser = null;
let profile = {
  username: "",
  email: "",
  home_address: "",
  location_precision: "street",
  impact_scale: "state",
  notify_critical: true,
  notify_digest: "weekly",
  notify_neighborhood: false,
};
let followedBillOptions = [];
let followedPoliticianOptions = [];
let civicActions = [];
let civicActionFilter = "all";

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

function fillFormsFromProfile() {
  if (profileHeading) {
    profileHeading.textContent = profile.username
      ? `${profile.username}'s profile`
      : "Profile";
  }
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
}

async function loadProfileRow(userId) {
  const client = getSupabase();
  const { data, error } = await client
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    // Older DBs may not have preference columns yet — fall back to basics.
    const fallback = await client
      .from("profiles")
      .select("username, email, home_address")
      .eq("id", userId)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return {
      username: fallback.data?.username || "",
      email: fallback.data?.email || "",
      home_address: fallback.data?.home_address || "",
      location_precision: "street",
      impact_scale: "state",
      notify_critical: true,
      notify_digest: "weekly",
      notify_neighborhood: false,
    };
  }

  return {
    username: data?.username || "",
    email: data?.email || "",
    home_address: data?.home_address || "",
    location_precision: data?.location_precision || "street",
    impact_scale: data?.impact_scale || "state",
    notify_critical: data?.notify_critical !== false,
    notify_digest: data?.notify_digest || "weekly",
    notify_neighborhood: Boolean(data?.notify_neighborhood),
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
      li.innerHTML = `
        <div>
          <strong>${escapeProfileHtml(person.name)}</strong>
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
      }`.slice(0, 120);
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
      .join(" · ");
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
      card.innerHTML = `
        <h4>${escapeProfileHtml(person.name)}</h4>
        <p>${escapeProfileHtml(
          [office, person.party, person.state, person.district]
            .filter(Boolean)
            .join(" · ")
        )}</p>
      `;
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
    setProfileStatus("Location saved.", "success");
    await loadRepresentation();
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
    setProfileStatus("Impact preference saved.", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not save preference.", "error");
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

(async function initProfilePage() {
  await bootNav("profile");
  currentUser = await getUser();
  if (!currentUser) {
    requireAuthRedirect();
    return;
  }

  setDefaultActionDates();
  setProfileStatus("Loading profile…", "loading");
  try {
    profile = await loadProfileRow(currentUser.id);
    fillFormsFromProfile();
    await Promise.all([
      loadFollows(),
      loadRepresentation(),
      loadCivicActions().catch((error) => {
        console.warn(error);
        if (actionsLog) {
          actionsLog.innerHTML = `<li class="profile-follow-list__empty">Run migration-civic-actions.sql in Supabase to enable the action tracker.</li>`;
        }
      }),
    ]);
    setProfileStatus("", "success");
  } catch (error) {
    console.error(error);
    setProfileStatus(error.message || "Could not load profile.", "error");
  }
})();