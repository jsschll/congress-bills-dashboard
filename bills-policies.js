const policyFeedStatus = document.getElementById("policy-feed-status");
const policyFeedCoverage = document.getElementById("policy-feed-coverage");
const policyFeedList = document.getElementById("policy-feed-list");
const policyFeedEmpty = document.getElementById("policy-feed-empty");
const tabAllFeed = document.getElementById("tab-all-feed");
const tabMyFeed = document.getElementById("tab-my-feed");
const stateFilterSelect = document.getElementById("policy-state-filter");
const locationToggle = document.getElementById("policy-location-toggle");
const locationForm = document.getElementById("policy-location-form");
const locationInput = document.getElementById("policy-location-input");
const filterStatus = document.getElementById("policy-filter-status");

const STORAGE_KEYS = {
  state: "policyFeed.stateFilter",
  locationOn: "policyFeed.locationOn",
  address: "policyFeed.locationAddress",
};

const US_STATES = [
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CO", "Colorado"],
  ["CT", "Connecticut"],
  ["DE", "Delaware"],
  ["DC", "District of Columbia"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["HI", "Hawaii"],
  ["ID", "Idaho"],
  ["IL", "Illinois"],
  ["IN", "Indiana"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["ME", "Maine"],
  ["MD", "Maryland"],
  ["MA", "Massachusetts"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MS", "Mississippi"],
  ["MO", "Missouri"],
  ["MT", "Montana"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["OH", "Ohio"],
  ["OK", "Oklahoma"],
  ["OR", "Oregon"],
  ["PA", "Pennsylvania"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["VA", "Virginia"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
];

const STATE_NAME_BY_CODE = Object.fromEntries(US_STATES);

let activeTab = "all";
let rawItems = [];
let allItems = [];
let myItems = [];
let followedBillIds = new Set();
let feedPreferences = {
  topics: [],
  billIds: [],
  politicianIds: [],
  districts: [],
};
let filterState = {
  stateCode: "",
  locationOn: false,
  addressQuery: "",
  resolved: null,
};

function setPolicyFeedStatus(message, type = "loading") {
  policyFeedStatus.hidden = !message;
  policyFeedStatus.textContent = message;
  policyFeedStatus.dataset.type = type;
}

function escapePolicyHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatRelativeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatShortDate(value);
  return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(
    Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
    "day"
  );
}

function coverageTone(level, status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("live") || value.includes("sample") || value.includes("client")) {
    return "is-live";
  }
  if (value.includes("planned") || value.includes("ready")) return "is-planned";
  return "";
}

function renderCoverageBadges(coverage = {}) {
  policyFeedCoverage.replaceChildren(
    ...Object.entries(coverage).map(([level, status]) => {
      const badge = document.createElement("span");
      badge.className = `policy-feed-coverage__badge ${coverageTone(level, status)}`;
      badge.textContent = `${level}: ${status}`;
      return badge;
    })
  );
}

function coverageSummaryText(coverage = {}) {
  const federal = String(coverage.Federal || "").toLowerCase();
  const state = String(coverage.State || "").toLowerCase();
  if (federal.includes("ready")) {
    return "Set CONGRESS_API_KEY in Vercel to enable the live federal feed. City and District sample items are shown for now.";
  }
  if (state.includes("live")) {
    return "Federal and state feeds are live. City and District currently use curated sample items.";
  }
  if (state.includes("ready")) {
    return "Federal feed is live. Add OPENSTATES_API_KEY on Vercel for state bills. City and District use curated samples.";
  }
  return "Showing available bill and policy updates across covered levels.";
}

const BILLS_FEED_PATH = "/api/bills-feed";
const BILLS_FEED_FALLBACK =
  "https://congress-bills-dashboard.vercel.app/api/bills-feed";
const LOOKUP_API_PATH = "/api/lookup-representatives";
const LOOKUP_API_FALLBACK =
  "https://congress-bills-dashboard.vercel.app/api/lookup-representatives";
const CONGRESS_API_BASE = "https://api.congress.gov/v3";
const CONGRESS = 119;

function policySteps(currentStep, actionDate = "") {
  const steps = ["Introduced", "In Committee", "Chamber Vote", "Signed into Law"];
  return steps.map((stepName, index) => ({
    stepNumber: index + 1,
    totalSteps: steps.length,
    stepName,
    isCompleted: index + 1 < currentStep,
    isCurrent: index + 1 === currentStep,
    date: index + 1 === currentStep ? actionDate || undefined : undefined,
  }));
}

function inferFederalStep(actionText = "") {
  const text = String(actionText || "").toLowerCase();
  if (text.includes("became public law") || text.includes("signed by president")) return 4;
  if (text.includes("passed senate") || text.includes("passed house")) return 3;
  if (text.includes("committee") || text.includes("referred")) return 2;
  return 1;
}

function clientDeltaFromText(text = "") {
  const summary = String(text || "").trim();
  if (!summary) return { added: [], changed: [], removed: [] };
  return { added: [summary], changed: [], removed: [] };
}

function normalizeCityName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bcity of\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function populateStateOptions() {
  if (!stateFilterSelect) return;
  const fragment = document.createDocumentFragment();
  for (const [code, name] of US_STATES) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = name;
    fragment.appendChild(option);
  }
  stateFilterSelect.appendChild(fragment);
}

function readStoredFilters() {
  try {
    filterState.stateCode = String(localStorage.getItem(STORAGE_KEYS.state) || "").toUpperCase();
    filterState.locationOn = localStorage.getItem(STORAGE_KEYS.locationOn) === "1";
    filterState.addressQuery = String(localStorage.getItem(STORAGE_KEYS.address) || "");
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
}

function persistFilters() {
  try {
    localStorage.setItem(STORAGE_KEYS.state, filterState.stateCode || "");
    localStorage.setItem(STORAGE_KEYS.locationOn, filterState.locationOn ? "1" : "0");
    localStorage.setItem(STORAGE_KEYS.address, filterState.addressQuery || "");
  } catch {
    // Ignore storage failures.
  }
}

function syncFilterControls() {
  if (stateFilterSelect) stateFilterSelect.value = filterState.stateCode || "";
  if (locationToggle) locationToggle.checked = Boolean(filterState.locationOn);
  if (locationInput) locationInput.value = filterState.addressQuery || "";
  if (locationForm) {
    locationForm.hidden = !filterState.locationOn;
  }
  updateFilterStatusLine();
}

function updateFilterStatusLine() {
  if (!filterStatus) return;
  const parts = [];
  if (filterState.stateCode) {
    parts.push(STATE_NAME_BY_CODE[filterState.stateCode] || filterState.stateCode);
  }
  if (filterState.locationOn && filterState.resolved) {
    const city = filterState.resolved.city;
    const state = filterState.resolved.state;
    parts.push(city && state ? `${city}, ${state}` : city || state || "location set");
  } else if (filterState.locationOn && filterState.addressQuery) {
    parts.push(`looking up ${filterState.addressQuery}`);
  }

  if (!parts.length) {
    filterStatus.hidden = true;
    filterStatus.textContent = "";
    return;
  }

  filterStatus.hidden = false;
  filterStatus.textContent = `Filtering: ${parts.join(" · ")}`;
}

async function loadSavedHomeAddress() {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) return "";

  const { data, error } = await client
    .from("profiles")
    .select("home_address")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.warn("Could not load home_address:", error.message);
    return "";
  }
  return String(data?.home_address || "").trim();
}

async function saveHomeAddress(address) {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) return;
  const { error } = await client
    .from("profiles")
    .update({ home_address: address })
    .eq("id", user.id);
  if (error) console.warn("Could not save home_address:", error.message);
}

async function fetchClientFederalFeed(limit = 12) {
  if (typeof API_KEY === "undefined" || !API_KEY || API_KEY.includes("YOUR_")) {
    throw new Error(
      "Missing CONGRESS_API_KEY on the server and no client API_KEY in config.js."
    );
  }

  const listUrl = `${CONGRESS_API_BASE}/bill/${CONGRESS}?limit=${limit}&sort=updateDate+desc&format=json&api_key=${API_KEY}`;
  const listResponse = await fetch(listUrl);
  const listData = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) {
    throw new Error(listData.error?.message || listData.error || "Congress.gov request failed");
  }

  const bills = Array.isArray(listData.bills) ? listData.bills : [];
  return bills.map((bill) => {
    const type = String(bill.type || "").toLowerCase();
    const number = String(bill.number || "");
    const actionText = bill.latestAction?.text || "Updated";
    const actionDate = bill.latestAction?.actionDate || bill.updateDate || "";
    const allSteps = policySteps(inferFederalStep(actionText), actionDate);
    const status = allSteps.find((step) => step.isCurrent) || allSteps[0];
    return {
      id: `federal-${bill.congress}-${type}-${number}`.toLowerCase(),
      billNumber: `${String(bill.type || "").toUpperCase()} ${number}`.trim(),
      title: bill.title || "Untitled bill",
      level: "Federal",
      jurisdiction: "U.S. Congress",
      stateCode: "",
      cityName: "",
      primarySponsor: { name: "Sponsor unavailable", title: "Member of Congress" },
      lastUpdated: actionDate
        ? new Date(`${actionDate}T12:00:00`).toISOString()
        : new Date().toISOString(),
      status,
      allSteps,
      shortPitch: actionText,
      deltaSummary: clientDeltaFromText(actionText),
      officialUrl: `https://www.congress.gov/bill/${bill.congress}th-congress/${type}/${number}`,
      tags: [],
    };
  });
}

async function fetchBillsFeedPayload(limit = 16, stateCode = "") {
  const query = new URLSearchParams({ limit: String(limit) });
  if (stateCode) query.set("state", stateCode);

  const endpoints = [BILLS_FEED_PATH];
  if (
    typeof location !== "undefined" &&
    location.origin &&
    !location.origin.includes("vercel.app")
  ) {
    endpoints.push(BILLS_FEED_FALLBACK);
  }

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}?${query.toString()}`);
      const payload = await response.json().catch(() => ({}));
      if (response.ok && Array.isArray(payload.items)) {
        return payload;
      }
      lastError = new Error(payload.error || `Feed request failed (${response.status})`);
    } catch (error) {
      lastError = error;
    }
  }

  const clientItems = await fetchClientFederalFeed(limit);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    coverage: {
      Federal: "live (client fallback)",
      State: "ready (needs OpenStates key on server)",
      City: "planned",
      District: "planned",
    },
    items: clientItems,
    warning: lastError?.message || null,
  };
}

async function lookupGeography(query) {
  const q = String(query || "").trim();
  if (!q) throw new Error("Enter an address or ZIP code.");

  const endpoints = [LOOKUP_API_PATH];
  if (
    typeof location !== "undefined" &&
    location.origin &&
    !location.origin.includes("vercel.app")
  ) {
    endpoints.push(LOOKUP_API_FALLBACK);
  }

  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        return {
          state: String(data.geography?.state || "").toUpperCase(),
          city: String(data.geography?.city || "").trim(),
          county: String(data.geography?.county || "").trim(),
          label: data.formattedAddress || q,
        };
      }
      lastError = new Error(data.error || `Lookup failed (${response.status})`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Could not resolve location.");
}

function matchesStateFilter(item, stateCode) {
  if (!stateCode) return true;
  if (item.level === "Federal") return true;
  return String(item.stateCode || "").toUpperCase() === stateCode;
}

function matchesLocationFilter(item, resolved, stateCode) {
  if (!resolved) return true;
  if (item.level === "Federal") return true;

  const itemState = String(item.stateCode || "").toUpperCase();
  const resolvedState = String(resolved.state || stateCode || "").toUpperCase();
  if (resolvedState && itemState && itemState !== resolvedState) return false;

  if (item.level === "State") {
    return !resolvedState || itemState === resolvedState;
  }

  // City / District: narrow to matching city when we have one.
  const resolvedCity = normalizeCityName(resolved.city);
  if (!resolvedCity) {
    return !resolvedState || itemState === resolvedState;
  }

  const itemCity = normalizeCityName(item.cityName);
  const jurisdiction = normalizeCityName(item.jurisdiction);
  if (itemCity && (itemCity === resolvedCity || itemCity.includes(resolvedCity) || resolvedCity.includes(itemCity))) {
    return true;
  }
  if (jurisdiction.includes(resolvedCity)) return true;
  return false;
}

function applyGeoFilters(items) {
  const stateCode = filterState.stateCode || "";
  return items.filter((item) => {
    if (!matchesStateFilter(item, stateCode)) return false;
    if (filterState.locationOn) {
      return matchesLocationFilter(item, filterState.resolved, stateCode);
    }
    return true;
  });
}

function recomputeVisibleItems() {
  const filtered = applyGeoFilters(rawItems);
  allItems = filtered;
  myItems = filtered.filter(matchesMyFeed);
}

function sponsorKey(item) {
  return String(item?.primarySponsor?.name || "").toLowerCase().trim();
}

function tagsKey(item) {
  return [
    ...(item.tags || []),
    item.title || "",
    item.shortPitch || "",
  ]
    .join(" ")
    .toLowerCase();
}

function isFollowedBill(item) {
  return followedBillIds.has(item.id);
}

function matchesMyFeed(item) {
  if (isFollowedBill(item)) return true;
  if (feedPreferences.billIds.includes(item.id)) return true;
  if (feedPreferences.politicianIds.some((value) => sponsorKey(item).includes(value))) return true;
  if (feedPreferences.topics.some((value) => tagsKey(item).includes(value))) return true;
  return false;
}

async function loadFeedPreferences() {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) {
    feedPreferences = { topics: [], billIds: [], politicianIds: [], districts: [] };
    followedBillIds = new Set();
    return;
  }

  const [
    followedTopicsRes,
    followedBillsRes,
    followedPoliticiansRes,
  ] = await Promise.all([
    client.from("followed_topics").select("kind, value").eq("user_id", user.id),
    client.from("followed_bills").select("bill_id").eq("user_id", user.id),
    client
      .from("followed_politicians")
      .select("politician:politician_id(name, bioguide_id, external_key)")
      .eq("user_id", user.id),
  ]);

  const topics = (followedTopicsRes.data || []).map((item) =>
    String(item.value || "").toLowerCase()
  );
  const billIds = (followedBillsRes.data || []).map((item) => String(item.bill_id));
  const politicianIds = (followedPoliticiansRes.data || [])
    .map((item) => item.politician)
    .filter(Boolean)
    .flatMap((person) =>
      [person.name, person.bioguide_id, person.external_key]
        .filter(Boolean)
        .map((value) => String(value).toLowerCase())
    );

  feedPreferences = {
    topics,
    billIds,
    politicianIds,
    districts: [],
  };
  followedBillIds = new Set(billIds);
}

async function toggleFollowBill(item) {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) {
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`
    );
    window.location.href = `auth.html?next=${next}`;
    return;
  }

  const followed = isFollowedBill(item);
  if (followed) {
    const { error } = await client
      .from("followed_bills")
      .delete()
      .eq("user_id", user.id)
      .eq("bill_id", item.id);
    if (error) throw error;
    followedBillIds.delete(item.id);
  } else {
    const currentStep = item.status || item.allSteps?.find((step) => step.isCurrent) || {};
    const { error: upsertError } = await client.from("bill_items").upsert(
      {
        id: item.id,
        bill_number: item.billNumber,
        title: item.title,
        level: item.level,
        jurisdiction: item.jurisdiction,
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );
    if (upsertError) throw upsertError;

    const { error } = await client.from("followed_bills").insert({
      user_id: user.id,
      bill_id: item.id,
    });
    if (error) throw error;
    followedBillIds.add(item.id);
  }

  feedPreferences.billIds = [...followedBillIds];
  recomputeVisibleItems();
  renderActiveTab();
}

function renderDeltaGroup(label, values, tone) {
  if (!values?.length) return "";
  return `
    <div class="policy-bill-card__delta-group ${tone}">
      <h4>${label}</h4>
      <ul>
        ${values.map((value) => `<li>${escapePolicyHtml(value)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function renderBillCard(item) {
  const card = document.createElement("article");
  card.className = "policy-bill-card";

  const followed = isFollowedBill(item);
  card.innerHTML = `
    <div class="policy-bill-card__header">
      <div>
        <div class="policy-bill-card__badges">
          <span class="policy-bill-card__level">${escapePolicyHtml(item.level)}</span>
          <span class="policy-bill-card__bill-number">${escapePolicyHtml(item.billNumber)}</span>
        </div>
        <h2 class="policy-bill-card__title">${escapePolicyHtml(item.title)}</h2>
        <p class="policy-bill-card__meta">
          ${escapePolicyHtml(item.jurisdiction)} · Sponsor: ${escapePolicyHtml(
            item.primarySponsor.name
          )} · ${escapePolicyHtml(item.primarySponsor.title)} · Updated ${escapePolicyHtml(
            formatRelativeDate(item.lastUpdated) || formatShortDate(item.lastUpdated)
          )}
        </p>
      </div>
      <button class="refresh-btn policy-bill-card__follow" type="button">
        ${followed ? "Following" : "Follow bill"}
      </button>
    </div>
    <p class="policy-bill-card__pitch">${escapePolicyHtml(item.shortPitch)}</p>
    <div class="policy-bill-card__progress">
      ${item.allSteps
        .map(
          (step) => `
            <div class="policy-bill-card__step ${step.isCompleted ? "is-complete" : ""} ${
            step.isCurrent ? "is-current" : ""
          }">
              <span class="policy-bill-card__step-number">${step.stepNumber}</span>
              <span class="policy-bill-card__step-name">${escapePolicyHtml(step.stepName)}</span>
            </div>
          `
        )
        .join("")}
    </div>
    <section class="policy-bill-card__delta">
      <h3>What changes?</h3>
      ${renderDeltaGroup("Added", item.deltaSummary.added, "is-added")}
      ${renderDeltaGroup("Changed", item.deltaSummary.changed, "is-changed")}
      ${renderDeltaGroup("Removed", item.deltaSummary.removed, "is-removed")}
    </section>
    ${
      item.tags?.length
        ? `<p class="policy-bill-card__tags">${item.tags
            .map((tag) => `<span>${escapePolicyHtml(tag)}</span>`)
            .join("")}</p>`
        : ""
    }
    <a class="bill-card__link" href="${escapePolicyHtml(item.officialUrl)}" target="_blank" rel="noopener noreferrer">Open official source</a>
  `;

  card
    .querySelector(".policy-bill-card__follow")
    .addEventListener("click", async () => {
      try {
        await toggleFollowBill(item);
      } catch (error) {
        console.error(error);
        setPolicyFeedStatus("Could not update bill follow.", "error");
      }
    });

  return card;
}

function setActiveTab(tabName) {
  activeTab = tabName;
  tabAllFeed.classList.toggle("is-active", tabName === "all");
  tabMyFeed.classList.toggle("is-active", tabName === "mine");
}

function renderActiveTab() {
  const items = activeTab === "all" ? allItems : myItems;
  policyFeedList.replaceChildren();
  updateFilterStatusLine();

  if (!items.length) {
    policyFeedEmpty.hidden = false;
    const filteredOut = rawItems.length > 0;
    if (activeTab === "mine") {
      policyFeedEmpty.innerHTML = filteredOut
        ? `<h2>No matches for these filters</h2><p>Try another state, clear location filtering, or follow more bills.</p>`
        : `<h2>No personalized matches yet</h2><p>Follow topics, politicians, or bill cards to build your feed.</p>`;
    } else {
      policyFeedEmpty.innerHTML = filteredOut
        ? `<h2>No matches for these filters</h2><p>Try another state or clear “Affects my location.”</p>`
        : `<h2>No bill updates available</h2><p>Check back shortly for new legislative activity.</p>`;
    }
    return;
  }

  policyFeedEmpty.hidden = true;
  policyFeedList.append(...items.map(renderBillCard));
}

async function resolveLocationIfNeeded() {
  if (!filterState.locationOn) {
    filterState.resolved = null;
    return;
  }

  let query = filterState.addressQuery.trim();
  if (!query) {
    query = await loadSavedHomeAddress();
    if (query) {
      filterState.addressQuery = query;
      if (locationInput) locationInput.value = query;
    }
  }

  if (!query) {
    filterState.resolved = null;
    return;
  }

  const resolved = await lookupGeography(query);
  filterState.resolved = resolved;
  if (resolved.state) {
    filterState.stateCode = resolved.state;
    if (stateFilterSelect) stateFilterSelect.value = resolved.state;
  }
  persistFilters();
  updateFilterStatusLine();
}

async function loadBillsPoliciesPage() {
  setPolicyFeedStatus("Loading bills, laws & policies…", "loading");
  await resolveLocationIfNeeded();

  const [payload] = await Promise.all([
    fetchBillsFeedPayload(16, filterState.stateCode),
    loadFeedPreferences(),
  ]);

  rawItems = payload.items || [];
  recomputeVisibleItems();
  renderCoverageBadges(payload.coverage || {});
  setPolicyFeedStatus(coverageSummaryText(payload.coverage || {}), "success");
  renderActiveTab();
}

async function refreshWithFilters({ resolveLocation = false } = {}) {
  persistFilters();
  syncFilterControls();
  setPolicyFeedStatus("Updating feed…", "loading");
  try {
    if (resolveLocation || (filterState.locationOn && !filterState.resolved)) {
      await resolveLocationIfNeeded();
    }
    const payload = await fetchBillsFeedPayload(16, filterState.stateCode);
    rawItems = payload.items || [];
    recomputeVisibleItems();
    renderCoverageBadges(payload.coverage || {});
    setPolicyFeedStatus(coverageSummaryText(payload.coverage || {}), "success");
    renderActiveTab();
  } catch (error) {
    console.error(error);
    setPolicyFeedStatus(error.message || "Could not update filters.", "error");
  }
}

tabAllFeed?.addEventListener("click", () => {
  setActiveTab("all");
  renderActiveTab();
});

tabMyFeed?.addEventListener("click", async () => {
  const user = await getUser();
  if (!user) {
    const next = encodeURIComponent(
      `${window.location.pathname}${window.location.search}`
    );
    window.location.href = `auth.html?next=${next}`;
    return;
  }
  setActiveTab("mine");
  renderActiveTab();
});

stateFilterSelect?.addEventListener("change", async () => {
  filterState.stateCode = String(stateFilterSelect.value || "").toUpperCase();
  await refreshWithFilters();
});

locationToggle?.addEventListener("change", async () => {
  filterState.locationOn = Boolean(locationToggle.checked);
  if (!filterState.locationOn) {
    filterState.resolved = null;
  }
  syncFilterControls();
  await refreshWithFilters({ resolveLocation: filterState.locationOn });
});

locationForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  filterState.locationOn = true;
  filterState.addressQuery = String(locationInput?.value || "").trim();
  if (locationToggle) locationToggle.checked = true;
  if (!filterState.addressQuery) {
    setPolicyFeedStatus("Enter an address or ZIP to filter by location.", "error");
    return;
  }
  await saveHomeAddress(filterState.addressQuery);
  await refreshWithFilters({ resolveLocation: true });
});

(async function initBillsPoliciesPage() {
  await bootNav("bills-policies");
  populateStateOptions();
  readStoredFilters();

  try {
    const saved = await loadSavedHomeAddress();
    if (saved && !filterState.addressQuery) {
      filterState.addressQuery = saved;
    }
  } catch (error) {
    console.warn(error);
  }

  syncFilterControls();

  try {
    await loadBillsPoliciesPage();
  } catch (error) {
    console.error(error);
    setPolicyFeedStatus(error.message || "Could not load page.", "error");
  }
})();
