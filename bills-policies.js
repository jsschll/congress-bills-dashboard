const policyFeedStatus = document.getElementById("policy-feed-status");
const policyFeedCoverage = document.getElementById("policy-feed-coverage");
const policyFeedList = document.getElementById("policy-feed-list");
const policyFeedEmpty = document.getElementById("policy-feed-empty");
const policyFeedPanel = document.getElementById("policy-feed-panel");
const policyFeedFilters = document.getElementById("policy-feed-filters");
const forYouFeedPanel = document.getElementById("foryou-feed-panel");
const forYouStatus = document.getElementById("foryou-status");
const forYouList = document.getElementById("foryou-list");
const feedManageTopics = document.getElementById("feed-manage-topics");
const tabAllFeed = document.getElementById("tab-all-feed");
const tabMyFeed = document.getElementById("tab-my-feed");
const tabForYouFeed = document.getElementById("tab-foryou-feed");
const tabVotesFeed = document.getElementById("tab-votes-feed");
const votesFeedPanel = document.getElementById("votes-feed-panel");
const votesFeedList = document.getElementById("votes-feed-list");
const votesFeedEmpty = document.getElementById("votes-feed-empty");
const votesFeedStatus = document.getElementById("votes-feed-status");
const votesQuizBanner = document.getElementById("votes-quiz-banner");
const votesSubjectChips = document.getElementById("votes-subject-chips");
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
let cachedNotifications = [];
let notificationsLoaded = false;
let forYouLoaded = false;
let votesLoaded = false;
let votesItems = [];
let votesSubject = "";
let votesQuizMode = false;
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
  locationFallback: null,
};

function tabFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const tab = String(params.get("tab") || "").toLowerCase();
  if (params.get("n")) return "mine";
  if (tab === "mine" || tab === "my" || tab === "updates" || tab === "update") {
    return "mine";
  }
  if (
    tab === "foryou" ||
    tab === "for-you" ||
    tab === "suggested" ||
    tab === "suggestions"
  ) {
    return "foryou";
  }
  if (tab === "votes" || tab === "vote" || tab === "rollcall" || tab === "quiz") {
    return "votes";
  }
  if (tab === "all") return "all";
  return "all";
}

function syncTabQuery(tabName) {
  const url = new URL(window.location.href);
  if (tabName === "all") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tabName);
  if (tabName !== "mine") url.searchParams.delete("n");
  if (tabName !== "votes") {
    url.searchParams.delete("quiz");
    url.searchParams.delete("subject");
  } else {
    if (votesQuizMode) url.searchParams.set("quiz", "1");
    else url.searchParams.delete("quiz");
    if (votesSubject) url.searchParams.set("subject", votesSubject);
    else url.searchParams.delete("subject");
  }
  window.history.replaceState({}, "", url);
}

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
  if (
    value.includes("planned") ||
    value.includes("ready") ||
    value.includes("coming soon")
  ) {
    return "is-planned";
  }
  return "";
}

function friendlyCoverageLabel(level, status) {
  const value = String(status || "").toLowerCase();
  if (value.includes("live")) return "Live";
  if (value.includes("sample") || value.includes("curated")) return "Sample";
  if (value.includes("client")) return "Live";
  if (value.includes("planned") || value.includes("ready")) return "Coming soon";
  return status || "Unavailable";
}

function renderCoverageBadges(coverage = {}) {
  policyFeedCoverage.replaceChildren(
    ...Object.entries(coverage).map(([level, status]) => {
      const badge = document.createElement("span");
      badge.className = `policy-feed-coverage__badge ${coverageTone(level, status)}`;
      badge.textContent = `${level}: ${friendlyCoverageLabel(level, status)}`;
      return badge;
    })
  );
}

function coverageSummaryText(coverage = {}) {
  const federal = String(coverage.Federal || "").toLowerCase();
  const state = String(coverage.State || "").toLowerCase();
  if (federal.includes("ready") || federal.includes("planned")) {
    return "Federal live updates are temporarily limited. Local sample items are shown for now.";
  }
  if (state.includes("live")) {
    return "Federal and state feeds are live. County, City, and District currently use curated samples. With “Affects my location,” local items come first; broader levels fill in when needed.";
  }
  if (state.includes("ready") || state.includes("planned")) {
    return "Federal feed is live. State bills are limited right now. County, City, and District use curated samples.";
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
  const steps = ["Introduced", "In Committee", "Chamber Vote", "Signed"];
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
  const lower = summary.toLowerCase();
  if (
    /calendar no\.?|legislative calendar|referred to the|read twice|agreed to without amendment/.test(
      lower
    )
  ) {
    return { added: [], changed: [], removed: [] };
  }
  return { added: [summary], changed: [], removed: [] };
}

function cleanClientActionText(text = "") {
  return String(text || "")
    .replace(/\s*\([^)]*CR[^)]*\)\s*/gi, " ")
    .replace(/\s*Calendar No\.?\s*\d+\.?/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCityName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\bcity of\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCountyName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+county$/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const LOCATION_FEED_MIN = 5;
const LOCAL_LEVELS = new Set(["City", "District"]);
const LOCATION_LEVEL_RANK = {
  City: 0,
  District: 0,
  County: 1,
  State: 2,
  Federal: 3,
};

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
    // Location toggle + address are account-scoped — never restore a prior
    // visitor's home address for signed-out or newly signed-up users.
    filterState.locationOn = false;
    filterState.addressQuery = "";
    localStorage.removeItem(STORAGE_KEYS.address);
    localStorage.removeItem(STORAGE_KEYS.locationOn);
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
}

function persistFilters() {
  try {
    localStorage.setItem(STORAGE_KEYS.state, filterState.stateCode || "");
    // Do not persist address/locationOn — those belong on the signed-in profile.
    localStorage.removeItem(STORAGE_KEYS.address);
    localStorage.removeItem(STORAGE_KEYS.locationOn);
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

  const fallback = filterState.locationFallback;
  if (fallback?.used) {
    const localLabel =
      fallback.localCount === 1
        ? "1 local policy"
        : `${fallback.localCount} local policies`;
    const broader = fallback.appendedLevels.join(", ");
    parts.push(
      fallback.localCount
        ? `showing ${localLabel} first, then ${broader}`
        : `few local policies found — showing ${broader} that also affect your area`
    );
  } else if (filterState.locationOn && filterState.resolved) {
    parts.push("local policies first");
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
      "Federal bill updates are unavailable right now. Try again shortly."
    );
  }

  const listUrl = `${CONGRESS_API_BASE}/bill/${CONGRESS}?limit=${limit}&sort=updateDate+desc&format=json&api_key=${API_KEY}`;
  const listResponse = await fetch(listUrl);
  const listData = await listResponse.json().catch(() => ({}));
  if (!listResponse.ok) {
    throw new Error(listData.error?.message || listData.error || "Congress.gov request failed");
  }

  const bills = Array.isArray(listData.bills) ? listData.bills : [];
  const items = [];
  for (const bill of bills) {
    const type = String(bill.type || "").toLowerCase();
    const number = String(bill.number || "");
    const actionText = bill.latestAction?.text || "Updated";
    const actionDate = bill.latestAction?.actionDate || bill.updateDate || "";
    const allSteps = policySteps(inferFederalStep(actionText), actionDate);
    const status = allSteps.find((step) => step.isCurrent) || allSteps[0];
    let summaryText = "";
    try {
      const summariesUrl = `${CONGRESS_API_BASE}/bill/${bill.congress}/${type}/${number}/summaries?format=json&api_key=${API_KEY}`;
      const summariesRes = await fetch(summariesUrl);
      const summariesData = await summariesRes.json().catch(() => ({}));
      const summaries = summariesData.summaries || [];
      let best = "";
      for (const entry of summaries) {
        const plain = String(entry?.text || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (plain.length > best.length) best = plain;
      }
      summaryText = best;
    } catch (error) {
      console.warn(error);
    }
    const summaryPitch = summaryText
      .replace(/\b(No|Nos|Mr|Mrs|Ms|Dr|Sen|Rep|vs|etc|U\.S)\./gi, "$1\u2024")
      .split(/(?<=[.!?])\s+/)
      .map((part) => part.replace(/\u2024/g, ".").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");
    const cleanedAction = cleanClientActionText(actionText);
    let primarySponsor = {
      name: "Sponsor unavailable",
      title: "Member of Congress",
      bioguideId: null,
    };
    try {
      const detailUrl = `${CONGRESS_API_BASE}/bill/${bill.congress}/${type}/${number}?format=json&api_key=${API_KEY}`;
      const detailRes = await fetch(detailUrl);
      const detailData = await detailRes.json().catch(() => ({}));
      const sponsor = detailData.bill?.sponsors?.[0] || {};
      if (sponsor.fullName || sponsor.name || sponsor.bioguideId) {
        const chamberTerm = sponsor.terms?.item?.[0]?.chamber || "";
        primarySponsor = {
          name: sponsor.fullName || sponsor.name || "Sponsor unavailable",
          title: /senate/i.test(chamberTerm)
            ? "U.S. Senator"
            : /house/i.test(chamberTerm)
              ? "U.S. Representative"
              : "Member of Congress",
          bioguideId: sponsor.bioguideId || null,
        };
      }
    } catch (error) {
      console.warn(error);
    }
    items.push({
      id: `federal-${bill.congress}-${type}-${number}`.toLowerCase(),
      billNumber: `${String(bill.type || "").toUpperCase()} ${number}`.trim(),
      title: bill.title || "Untitled bill",
      level: "Federal",
      jurisdiction: "U.S. Congress",
      stateCode: "",
      cityName: "",
      primarySponsor,
      lastUpdated: actionDate
        ? new Date(`${actionDate}T12:00:00`).toISOString()
        : new Date().toISOString(),
      status,
      allSteps,
      shortPitch:
        summaryPitch ||
        (bill.title ? `${String(bill.title).replace(/\.$/, "")}.` : "") ||
        "Recent federal legislative activity.",
      statusLabel: cleanedAction || actionText,
      deltaSummary: clientDeltaFromText(summaryPitch),
      officialUrl: `https://www.congress.gov/bill/${bill.congress}th-congress/${type}/${number}`,
      tags: [],
    });
  }
  return items;
}

/** Overlay Claude summaries from processed_votes onto federal News/My Feed cards. */
async function enrichItemsWithProcessedVotes(items = []) {
  if (!items.length) return items;
  if (typeof applyProcessedSummariesToBillItems !== "function") return items;
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client) return items;

  const numbers = [];
  for (const item of items) {
    if (String(item.level || "").toLowerCase() !== "federal") continue;
    const key =
      typeof billItemLookupKey === "function" ? billItemLookupKey(item) : "";
    if (!key) continue;
    const num = key.split(":")[2];
    if (num) numbers.push(num);
  }
  const unique = [...new Set(numbers)];
  if (!unique.length) return items;

  try {
    const { data, error } = await client
      .from("processed_votes")
      .select(
        typeof PROCESSED_VOTES_FEED_SELECT === "string"
          ? PROCESSED_VOTES_FEED_SELECT
          : "roll_call_id, summary, bill_number, legislation_number, bill_type, congress, vote_date, vote_kind, summary_source"
      )
      .in("legislation_number", unique)
      .not("summary", "eq", "")
      .order("vote_date", { ascending: false })
      .limit(Math.min(250, Math.max(40, unique.length * 8)));
    if (error) throw error;
    applyProcessedSummariesToBillItems(items, data || []);
  } catch (error) {
    console.warn("Could not enrich feed with processed_votes:", error);
  }
  return items;
}

async function fetchBillsFeedPayload(limit = 16, stateCode = "") {
  const query = new URLSearchParams({ limit: String(limit) });
  if (stateCode) query.set("state", stateCode);
  if (
    typeof API_KEY === "string" &&
    API_KEY.trim() &&
    !API_KEY.includes("YOUR_")
  ) {
    query.set("api_key", API_KEY.trim());
  }

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
        await enrichItemsWithProcessedVotes(payload.items);
        return payload;
      }
      lastError = new Error(payload.error || `Feed request failed (${response.status})`);
    } catch (error) {
      lastError = error;
    }
  }

  const clientItems = await fetchClientFederalFeed(limit);
  await enrichItemsWithProcessedVotes(clientItems);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    coverage: {
      Federal: "live (client fallback)",
      State: "coming soon",
      County: "sample (curated)",
      City: "sample (curated)",
      District: "sample (curated)",
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
        const label = data.formattedAddress || data.address || q;
        const parsed = parseCityStateFromLabel(label);
        return {
          state: String(data.geography?.state || parsed.state || "").toUpperCase(),
          city: String(data.geography?.city || parsed.city || "").trim(),
          county: String(data.geography?.county || "").trim(),
          label,
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

function citiesMatch(left, right) {
  const a = normalizeCityName(left);
  const b = normalizeCityName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function countiesMatch(left, right) {
  const a = normalizeCountyName(left);
  const b = normalizeCountyName(right);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

function isLocalPolicyLevel(level) {
  return LOCAL_LEVELS.has(String(level || ""));
}

/** Match an item to a location tier: local | county | state | federal. */
function itemMatchesLocationTier(item, resolved, stateCode, tier) {
  if (!resolved?.state && !resolved?.city && !resolved?.county) return false;

  const itemState = String(item.stateCode || "").toUpperCase();
  const resolvedState = String(resolved.state || stateCode || "").toUpperCase();

  if (tier === "federal") return item.level === "Federal";

  if (
    resolvedState &&
    itemState &&
    itemState !== resolvedState &&
    item.level !== "Federal"
  ) {
    return false;
  }

  if (tier === "state") {
    return (
      item.level === "State" &&
      Boolean(resolvedState) &&
      itemState === resolvedState
    );
  }

  if (tier === "county") {
    if (item.level !== "County") return false;
    const resolvedCounty = normalizeCountyName(resolved.county);
    if (resolvedCounty) {
      return (
        countiesMatch(item.countyName, resolved.county) ||
        countiesMatch(item.jurisdiction, resolved.county) ||
        countiesMatch(item.cityName, resolved.county)
      );
    }
    // ZIP-only / missing county: keep same-state county samples available.
    return Boolean(resolvedState) && itemState === resolvedState;
  }

  // local = City + District for the resolved city
  if (!isLocalPolicyLevel(item.level)) return false;
  const resolvedCity = normalizeCityName(resolved.city);
  if (!resolvedCity) return false;
  return (
    citiesMatch(item.cityName, resolved.city) ||
    citiesMatch(item.jurisdiction, resolved.city)
  );
}

/**
 * Location mode: local policies first. If fewer than LOCATION_FEED_MIN,
 * append County → State → Federal so the feed is never empty.
 */
function applyLocationFeedWithFallback(items, resolved, stateCode) {
  const pool = items.filter((item) => matchesStateFilter(item, stateCode));
  const pick = (tier) =>
    pool.filter((item) =>
      itemMatchesLocationTier(item, resolved, stateCode, tier)
    );

  const local = pick("local");
  const selected = [];
  const seen = new Set();
  const appendedLevels = [];

  function takeAll(batch, tierLabel) {
    let added = 0;
    for (const item of batch) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      selected.push(item);
      added += 1;
    }
    if (added && tierLabel) appendedLevels.push(tierLabel);
  }

  takeAll(local, null);

  if (selected.length < LOCATION_FEED_MIN) {
    for (const [tier, label] of [
      ["county", "County"],
      ["state", "State"],
      ["federal", "Federal"],
    ]) {
      if (selected.length >= LOCATION_FEED_MIN) break;
      takeAll(pick(tier), label);
    }
  }

  // Absolute safety net: still empty → pull any state/federal for the place.
  if (!selected.length) {
    takeAll(pick("county"), "County");
    takeAll(pick("state"), "State");
    takeAll(pick("federal"), "Federal");
  }

  filterState.locationFallback = {
    used: appendedLevels.length > 0,
    localCount: local.length,
    appendedLevels: [...new Set(appendedLevels)],
    minTarget: LOCATION_FEED_MIN,
  };

  return selected.sort((a, b) => {
    const rankA = LOCATION_LEVEL_RANK[a.level] ?? 9;
    const rankB = LOCATION_LEVEL_RANK[b.level] ?? 9;
    if (rankA !== rankB) return rankA - rankB;
    return (
      new Date(b.lastUpdated || 0).getTime() -
      new Date(a.lastUpdated || 0).getTime()
    );
  });
}

function matchesLocationFilter(item, resolved, stateCode) {
  // Kept for callers that need a simple boolean; location feed uses the
  // tiered fallback builder above.
  return (
    itemMatchesLocationTier(item, resolved, stateCode, "local") ||
    itemMatchesLocationTier(item, resolved, stateCode, "county") ||
    itemMatchesLocationTier(item, resolved, stateCode, "state") ||
    itemMatchesLocationTier(item, resolved, stateCode, "federal")
  );
}

function applyGeoFilters(items) {
  const stateCode = filterState.stateCode || "";
  filterState.locationFallback = null;

  if (
    filterState.locationOn &&
    !filterState.resolved?.state &&
    !filterState.resolved?.city &&
    !filterState.resolved?.county
  ) {
    return [];
  }

  if (filterState.locationOn) {
    return applyLocationFeedWithFallback(
      items,
      filterState.resolved,
      stateCode
    );
  }

  return items.filter((item) => matchesStateFilter(item, stateCode));
}

function locationEmptyStateHtml({ forMyFeed = false } = {}) {
  const needsLocation =
    filterState.locationOn &&
    !filterState.resolved?.state &&
    !filterState.resolved?.city &&
    !filterState.resolved?.county;

  if (needsLocation) {
    return forMyFeed
      ? `<h2>Add your location</h2><p>Enter an address or ZIP and click Apply to see followed items that affect your area. If few local policies are available, we add County, State, and Federal bills automatically.</p>`
      : `<h2>Add your location</h2><p>Enter an address or ZIP and click Apply to see bills that affect your area. If fewer than ${LOCATION_FEED_MIN} local policies match, we automatically add County, State, and Federal bills so your feed is not empty.</p>`;
  }

  const fallback = filterState.locationFallback;
  if (filterState.locationOn && fallback?.used === false && !rawItems.length) {
    return `<h2>No bill updates available</h2><p>We looked for local policies first, then County, State, and Federal coverage for your area. Check back shortly.</p>`;
  }

  if (filterState.locationOn && rawItems.length > 0 && !allItems.length) {
    return `<h2>No matches for this location yet</h2><p>We prioritize City and District policies for your address. When fewer than ${LOCATION_FEED_MIN} local items are available, County, State, and Federal bills are added automatically — none matched right now. Try another address or clear “Affects my location.”</p>`;
  }

  return null;
}

function parseCityStateFromLabel(label = "") {
  const text = String(label || "").trim();
  if (!text) return { city: "", state: "" };
  // "San Diego, CA 92101" or "Austin, Texas"
  const match = text.match(
    /^([^,]+),\s*([A-Za-z]{2}|[A-Za-z]+(?:\s+[A-Za-z]+)?)(?:\s+\d{5})?/
  );
  if (!match) return { city: "", state: "" };
  const city = match[1].trim();
  let state = match[2].trim().toUpperCase();
  if (state.length > 2) {
    const found = US_STATES.find(([, name]) => name.toLowerCase() === match[2].trim().toLowerCase());
    state = found ? found[0] : "";
  }
  return { city, state };
}

function recomputeVisibleItems() {
  const filtered = applyGeoFilters(rawItems);
  allItems = filtered;
  myItems = filtered.filter(matchesMyFeed);
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

function normalizeSponsorName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b(rep\.?|sen\.?|senator|representative|hon\.?|dr\.?|mr\.?|mrs\.?|ms\.?)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sponsorMatchKeys(item) {
  const sponsor = item?.primarySponsor || {};
  return {
    name: normalizeSponsorName(sponsor.name),
    bioguide: String(sponsor.bioguideId || sponsor.bioguide_id || "")
      .trim()
      .toLowerCase(),
  };
}

function matchesFollowedPolitician(item) {
  const keys = sponsorMatchKeys(item);
  if (!keys.name && !keys.bioguide) return false;
  return (feedPreferences.politicianIds || []).some((raw) => {
    const value = String(raw || "").trim().toLowerCase();
    if (!value) return false;
    if (keys.bioguide && value === keys.bioguide) return true;
    // Skip opaque external keys for name matching.
    if (value.includes(":") || /^[0-9a-f-]{36}$/i.test(value)) return false;
    const followedName = normalizeSponsorName(value);
    if (!followedName || !keys.name) return false;
    return (
      keys.name.includes(followedName) || followedName.includes(keys.name)
    );
  });
}

function isFollowedBill(item) {
  return followedBillIds.has(item.id);
}

function matchesMyFeed(item) {
  if (isFollowedBill(item)) return true;
  if (feedPreferences.billIds.includes(item.id)) return true;
  if (matchesFollowedPolitician(item)) return true;
  if (feedPreferences.topics.some((value) => tagsKey(item).includes(value))) {
    return true;
  }
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
      .select(
        "politician:politician_id(name, bioguide_id, external_key)"
      )
      .eq("user_id", user.id),
  ]);

  const topics = (followedTopicsRes.data || []).map((item) =>
    String(item.value || "").toLowerCase()
  );
  const billIds = (followedBillsRes.data || []).map((item) => String(item.bill_id));
  const politicianIds = (followedPoliticiansRes.data || [])
    .map((item) => item.politician)
    .filter(Boolean)
    .flatMap((person) => {
      const values = [];
      if (person.bioguide_id) {
        values.push(String(person.bioguide_id).toLowerCase());
      }
      if (person.name) values.push(String(person.name).toLowerCase());
      return values;
    });

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
    if (typeof promptAuthGate === "function") {
      promptAuthGate({
        next: currentPageNextPath?.() || "bills-policies.html",
        title: "Follow bills with a free account",
        body: "Create a free account to follow legislation and get alerts when it moves.",
      });
    }
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

function looksLikeTruncatedHeadline(text) {
  const value = String(text || "").trim();
  if (!value) return true;
  if (/[.!?…]"?$/.test(value)) return false;
  // Abrupt cutoffs like "pull U.S" / "the Pres" / trailing connector words.
  if (/\b(u\.s|the|a|an|to|of|for|and|or|with|from|by|in|on)\s*$/i.test(value)) {
    return true;
  }
  if (value.length < 28) return false;
  // Incomplete-looking endings without terminal punctuation.
  return !/[.!?]$/.test(value) && /\s[A-Za-z]{1,3}$/.test(value);
}

/** Detect official-style bill names (… Act / Resolution / etc.). */
function looksLikeOfficialBillTitle(text) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value || value.length > 160) return false;
  if (/^(this|the)\s+(bill|resolution|measure|amendment)\b/i.test(value)) {
    return false;
  }
  return /\b(act|resolution|amendments?|bill)\b(?:\s+of\s+\d{4})?\.?$/i.test(
    value
  );
}

/**
 * Split glued blobs like:
 * "Northern Border Security Enhancement and Review Act This bill requires…"
 */
function splitGluedTitleSummary(text) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { title: "", summary: "" };

  const match = cleaned.match(
    /^(.*?\b(?:Act|Resolution|Amendments?|Bill)\b(?:\s+of\s+\d{4})?)\s+((?:This|The)\s+(?:bill|resolution|measure|amendment)\b|[A-Z][a-z]+\b(?:\s+[a-z]+)?\s+(?:the|a|an|to|for|that)\b)([\s\S]*)$/
  );
  if (match) {
    return {
      title: match[1].replace(/\.$/, "").trim(),
      summary: `${match[2]}${match[3] || ""}`.replace(/\s+/g, " ").trim(),
    };
  }
  return { title: cleaned, summary: "" };
}

function stripLeadingTitleFromSummary(summary, title) {
  const text = String(summary || "")
    .replace(/\s+/g, " ")
    .trim();
  const titleClean = String(title || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || !titleClean) return text;
  if (!text.toLowerCase().startsWith(titleClean.toLowerCase())) return text;
  // Only strip when a real summary remains after the title prefix.
  const rest = text.slice(titleClean.length).replace(/^[\s.:;,-]+/, "").trim();
  return rest || text;
}

/**
 * Resolve scannable feed-card copy: plain-English headline + clean title.
 * Never concatenates title + summary into one blob.
 */
function resolveFeedCardCopy(item = {}, copy = {}) {
  const rawTitle = String(
    item.title || item.voteQuestion || item.displayTitle || ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const shortTitle = String(
    copy.shortTitle || item.short_title || item.shortTitle || ""
  )
    .replace(/\s+/g, " ")
    .trim();
  const rawSummary = String(
    copy.summary ||
      copy.displaySummary?.full ||
      preferPlainSummaryText(item) ||
      item.card_summary ||
      item.cardSummary ||
      item.plain_summary ||
      item.plainSummary ||
      item.shortPitch ||
      item.summary ||
      ""
  )
    .replace(/\s+/g, " ")
    .trim();

  const gluedFromTitle = splitGluedTitleSummary(rawTitle);
  const gluedFromShort = splitGluedTitleSummary(shortTitle);
  const gluedFromSummary = splitGluedTitleSummary(rawSummary);

  let cleanTitle = "";
  if (looksLikeOfficialBillTitle(shortTitle)) {
    cleanTitle = shortTitle.replace(/\.$/, "");
  } else if (gluedFromShort.summary && looksLikeOfficialBillTitle(gluedFromShort.title)) {
    cleanTitle = gluedFromShort.title;
  } else if (gluedFromTitle.summary && looksLikeOfficialBillTitle(gluedFromTitle.title)) {
    cleanTitle = gluedFromTitle.title;
  } else if (looksLikeOfficialBillTitle(rawTitle)) {
    cleanTitle = rawTitle.replace(/\.$/, "");
  } else if (gluedFromSummary.summary && looksLikeOfficialBillTitle(gluedFromSummary.title)) {
    cleanTitle = gluedFromSummary.title;
  } else {
    cleanTitle = firstCompleteSentence(gluedFromTitle.title || rawTitle || "Legislation", 120);
  }

  let summary = rawSummary;
  if (!summary || summary.toLowerCase() === cleanTitle.toLowerCase()) {
    summary =
      gluedFromSummary.summary ||
      gluedFromTitle.summary ||
      gluedFromShort.summary ||
      rawSummary;
  }
  summary = stripLeadingTitleFromSummary(summary, cleanTitle);

  // Prefer a punchy plain-English hook for fast scrolling.
  let headline = "";
  if (
    shortTitle &&
    !looksLikeTruncatedHeadline(shortTitle) &&
    !looksLikeOfficialBillTitle(shortTitle) &&
    shortTitle.length <= 120
  ) {
    headline = firstCompleteSentence(shortTitle, 90);
  } else if (summary) {
    headline =
      (typeof clampPunchySummary === "function"
        ? clampPunchySummary(summary, { maxSentences: 1, maxWords: 12 })
        : "") || firstCompleteSentence(summary, 90);
  } else if (shortTitle && !looksLikeTruncatedHeadline(shortTitle)) {
    headline = firstCompleteSentence(shortTitle, 90);
  } else {
    headline = cleanTitle;
  }

  return {
    title: cleanTitle,
    headline: clampFeedHeadlineWords(headline || cleanTitle || "Legislation", 12),
    summary: summary || "",
  };
}

/** Hard-cap feed headlines to ~10–12 words for glanceability. */
function clampFeedHeadlineWords(text, maxWords = 12) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return cleaned.replace(/[,:;–—-]+$/, "").replace(/\.$/, "");
  }
  return `${words
    .slice(0, maxWords)
    .join(" ")
    .replace(/[,:;–—-]+$/, "")}…`;
}

function formatFeedStatusTag(item = {}, { isVote = false } = {}) {
  const chamberRaw = String(item.chamber || item.jurisdiction || "").toLowerCase();
  const chamber = chamberRaw.includes("senate")
    ? "Senate"
    : chamberRaw.includes("house")
      ? "House"
      : "";
  const result = String(item.result || item.statusLabel || "").trim();
  const lower = result.toLowerCase();

  if (/\b(passed|pass|agreed|confirmed|adopted|carried|enacted|became law|signed)\b/.test(lower)) {
    const label = chamber ? `Passed ${chamber}` : "Passed";
    return { label, tone: "passed", icon: "✓" };
  }
  if (/\b(failed|fail|rejected|reject|defeated|defeat|not agree|tabled|vetoed|veto)\b/.test(lower)) {
    const label = chamber ? `Rejected ${chamber}` : "Rejected";
    return { label, tone: "failed", icon: "✕" };
  }
  if (isVote) return { label: "Pending Vote", tone: "pending", icon: "◎" };
  if (result && result.length <= 28 && !/calendar no\.?\s*$/i.test(result)) {
    return { label: result, tone: "pending", icon: "◎" };
  }
  return { label: "Pending Vote", tone: "pending", icon: "◎" };
}

function formatFeedCategoryPill(item = {}) {
  const explicit = String(
    item.primaryCategory ||
      item.primary_category ||
      item.category ||
      item.subjectCategory ||
      item.policyArea ||
      item.tags?.[0] ||
      ""
  ).trim();
  let label = explicit;
  if (label) {
    label = label
      .replace(/^Immigration\b.*/i, "Immigration")
      .replace(/^(Energy|Environment)\b.*/i, "Energy")
      .replace(/^(Economy|Tax|Taxes)\b.*/i, "Economy")
      .replace(/^Foreign Policy\b.*/i, "Foreign Policy")
      .replace(/^(Defense|National Security)\b.*/i, "Defense")
      .replace(/^Civil Rights\b.*/i, "Civil Rights")
      .replace(/^Healthcare\b.*/i, "Healthcare");
  } else {
    label = inferVoteTopic(item) || "Congress";
  }
  return { label, icon: feedCategoryIcon(label) };
}

function feedCategoryIcon(category = "") {
  const value = String(category || "").toLowerCase();
  if (/immigra|border|asylum/.test(value)) return "🛂";
  if (/defense|national security|military|armed/.test(value)) return "🛡️";
  if (/energy|environment|climate/.test(value)) return "⚡";
  if (/economy|tax|budget|finance/.test(value)) return "💵";
  if (/health|medicare|medicaid/.test(value)) return "🏥";
  if (/foreign|diplomacy|sanction/.test(value)) return "🌐";
  if (/civil rights|justice|voting/.test(value)) return "⚖️";
  if (/tech|cyber|broadband|ai\b/.test(value)) return "💻";
  return "📜";
}

function mountFeedCardStanceButtons(card, item, options = {}) {
  const mountOpts = {
    supportLabel: "👍 Support",
    opposeLabel: "👎 Oppose",
    prompt: "",
    compact: true,
    showFollow: false,
    showAskAi: false,
    showTakeAction: false,
    showWhoVoted: false,
    showCommunity: false,
    showAlignment: false,
    ...options,
  };
  if (window.PolicyEngagement?.mountVote && options.useVoteMount !== false) {
    window.PolicyEngagement.mountVote(card, item, mountOpts);
  } else if (window.PolicyEngagement?.mount) {
    window.PolicyEngagement.mount(card, item, mountOpts);
  }

  // Mount Support/Oppose into the bottom action bar slot.
  const slot = card.querySelector(".engagement-mount-point");
  const engage = card.querySelector(".policy-engage");
  if (slot && engage) slot.append(engage);
}

function wireFeedCardAskAi(card, item) {
  card
    .querySelector(".details-toggle-btn")
    ?.addEventListener("click", (event) => {
      event.stopPropagation();
      if (window.PolicyEngagement?.openAskAi) {
        window.PolicyEngagement.openAskAi(item);
      } else if (typeof openBillAskAiModal === "function") {
        openBillAskAiModal(item);
      }
    });
}

/**
 * Visual-first social feed card:
 * category icon + status → short headline → Bill ID • Date → actions
 */
function renderSocialFeedCardShell({
  status,
  category,
  headline,
  subtext,
}) {
  const tone = String(status?.tone || "pending").replace(/[^a-z0-9_-]/gi, "");
  const statusIcon = status?.icon || "◎";
  const categoryLabel =
    typeof category === "string" ? category : category?.label || "";
  const categoryIcon =
    (typeof category === "object" && category?.icon) ||
    feedCategoryIcon(categoryLabel);
  return `
    <div class="feed-social-card__header">
      <div class="category-pill" title="${escapePolicyHtml(categoryLabel || "Congress")}">
        <span class="category-pill__icon" aria-hidden="true">${categoryIcon}</span>
        <span class="category-pill__label">${escapePolicyHtml(
          categoryLabel || "Congress"
        )}</span>
      </div>
      <span class="status-badge is-${tone}">
        <span class="status-badge__icon" aria-hidden="true">${escapePolicyHtml(
          statusIcon
        )}</span>
        <span class="status-badge__label">${escapePolicyHtml(
          status?.label || "Pending Vote"
        )}</span>
      </span>
    </div>
    <div class="feed-social-card__body">
      <h3 class="feed-social-card__headline">${escapePolicyHtml(headline)}</h3>
      ${
        subtext
          ? `<div class="feed-social-card__sub">${escapePolicyHtml(
              subtext
            )}</div>`
          : ""
      }
    </div>
    <div class="feed-social-card__actions">
      <button type="button" class="details-toggle-btn">
        💬 Ask AI / Details
      </button>
      <div class="engagement-mount-point" aria-label="Your stance"></div>
    </div>
  `;
}

function renderBillCard(item) {
  const card = document.createElement("article");
  card.className = "policy-bill-card feed-social-card";

  const pitch = String(
    preferPlainSummaryText(item) || item.shortPitch || ""
  ).trim();
  const cardCopy = resolveFeedCardCopy(item, { summary: pitch });
  const status = formatFeedStatusTag(item, { isVote: false });
  const category = formatFeedCategoryPill(item);
  const updated =
    formatRelativeDate(item.lastUpdated) || formatShortDate(item.lastUpdated);
  const subtext = [item.billNumber, updated].filter(Boolean).join(" • ");

  card.innerHTML = renderSocialFeedCardShell({
    status,
    category,
    headline: cardCopy.headline,
    subtext,
  });

  wireFeedCardAskAi(card, item);
  mountFeedCardStanceButtons(card, item, { useVoteMount: false });
  return card;
}

function setForYouStatus(message, type = "loading") {
  if (!forYouStatus) return;
  forYouStatus.hidden = !message;
  forYouStatus.textContent = message;
  forYouStatus.dataset.type = type;
}

function setVotesFeedStatus(message, type = "loading") {
  if (!votesFeedStatus) return;
  votesFeedStatus.hidden = !message;
  votesFeedStatus.textContent = message;
  votesFeedStatus.dataset.type = type;
}

function voteKindLabel(kind, item = {}) {
  if (typeof formatVoteMotionLabel === "function") {
    return formatVoteMotionLabel({
      voteKind: kind || item.voteKind || item.vote_kind,
      voteQuestion: item.voteQuestion || item.vote_question,
      motionLabel: item.motionLabel,
      result: item.result,
    });
  }
  if (kind === "final_passage") return "Final Passage";
  if (kind === "amendment") return "On Agreeing to the Amendment";
  if (kind === "procedural") return "Procedural Vote";
  return "Floor Vote";
}

function formatVoteResultMeta(item) {
  const parts = [];
  if (item.result) parts.push(item.result);
  if (item.date) parts.push(formatShortDate(item.date));
  if (item.rollCallNumber) parts.push(`Roll Call ${item.rollCallNumber}`);
  return parts.join(" · ");
}

function voteCardDateLabel(item) {
  const raw = item.date || item.vote_date || item.voteDate || "";
  if (!raw) return "";
  return formatShortDate(raw) || String(raw).slice(0, 10);
}

function firstCompleteSentence(text, maxChars = 140) {
  const cleaned = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "";

  // Mask abbreviations so "U.S. troops" is not treated as a sentence break.
  const placeholders = [];
  const protectedText = cleaned.replace(
    /\b(?:U\.S\.A\.|U\.S\.|Jr\.|Sr\.|Mr\.|Mrs\.|Ms\.|Dr\.|vs\.|etc\.|[A-Z]\.)/gi,
    (match) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return `\u0000${idx}\u0000`;
    }
  );
  const endMatch = protectedText.match(/^(.+?[.!?])(?:\s+[A-Z0-9“"]|$)/);
  const sentence = (endMatch?.[1] || protectedText)
    .replace(/\u0000(\d+)\u0000/g, (_, idx) => placeholders[Number(idx)] || "")
    .trim();

  if (sentence.length <= maxChars) return sentence;

  // Prefer a clean clause break over mid-word truncation.
  const clipped = sentence.slice(0, maxChars);
  const breakAt = Math.max(
    clipped.lastIndexOf("; "),
    clipped.lastIndexOf(", "),
    clipped.lastIndexOf(" — "),
    clipped.lastIndexOf(" - "),
    clipped.lastIndexOf(" ")
  );
  if (breakAt > 48) {
    return `${clipped.slice(0, breakAt).replace(/[,:;–—-]+$/, "")}…`;
  }
  return `${clipped.trim()}…`;
}

function inferVoteTopic(item = {}) {
  const explicit = String(
    item.primaryCategory ||
      item.primary_category ||
      item.category ||
      item.subjectCategory ||
      item.policyArea ||
      item.tags?.[0] ||
      ""
  ).trim();
  if (explicit) return explicit;

  const haystack = [
    item.short_title,
    item.shortTitle,
    item.plain_summary,
    item.summary,
    item.title,
    item.voteQuestion,
  ]
    .join(" ")
    .toLowerCase();
  const rules = [
    ["Healthcare", /\b(health|medicare|medicaid|hospital|drug|pharma|vaccine)\b/],
    ["Defense", /\b(defense|military|armed|nato|war|troop|veteran)\b/],
    ["Foreign Policy", /\b(foreign|sanction|diplomacy|israel|ukraine|china|treaty)\b/],
    ["Economy & Taxes", /\b(tax|budget|appropriat|economy|finance|bank|tariff)\b/],
    ["Energy & Environment", /\b(energy|climate|oil|gas|epa|environment|renewable)\b/],
    ["Immigration", /\b(immigra|border|asylum|visa|deport)\b/],
    ["Civil Rights", /\b(civil rights|voting rights|discrim|gun|justice)\b/],
    ["Tech", /\b(tech|broadband|internet|ai\b|cyber|fcc|data)\b/],
  ];
  for (const [label, re] of rules) {
    if (re.test(haystack)) return label;
  }
  return "";
}

function formatVoteResultBadge(result) {
  const raw = String(result || "").trim();
  if (!raw) return { label: "", tone: "neutral" };
  const lower = raw.toLowerCase();
  let tone = "neutral";
  if (/\b(pass|agreed|confirm|adopt|carried)\b/.test(lower)) tone = "passed";
  else if (/\b(fail|reject|defeat|not agree|tabled)\b/.test(lower))
    tone = "failed";
  return { label: raw, tone };
}

function renderVoteCard(item) {
  const card = document.createElement("article");
  card.className = "feed-social-card vote-feed-card";

  const dateLabel = voteCardDateLabel(item);
  const copy =
    typeof resolveVoteCardCopy === "function"
      ? resolveVoteCardCopy(item)
      : { yeaLabel: "Support", nayLabel: "Oppose" };
  const cardCopy = resolveFeedCardCopy(item, copy);
  const status = formatFeedStatusTag(item, { isVote: true });
  const category = formatFeedCategoryPill(item);
  const billNumber =
    item.billNumber ||
    (item.rollCallNumber ? `Roll Call ${item.rollCallNumber}` : "");
  const subtext = [billNumber, dateLabel].filter(Boolean).join(" • ");

  card.innerHTML = renderSocialFeedCardShell({
    status,
    category,
    headline: cardCopy.headline,
    subtext,
  });

  wireFeedCardAskAi(card, item);
  mountFeedCardStanceButtons(card, item, { useVoteMount: true });
  return card;
}

async function fetchVotesFromProcessedTable({ limit = 16, subject = "", kind = "" } = {}) {
  const client = typeof getSupabase === "function" ? getSupabase() : null;
  if (!client) {
    throw new Error("Supabase is not configured.");
  }
  if (typeof mapProcessedVoteToFeedItem !== "function") {
    throw new Error("Vote feed mapper is missing (shared.js).");
  }

  const fetchLimit = Math.min(100, Math.max(limit * 4, limit));
  const primarySelect =
    typeof PROCESSED_VOTES_FEED_SELECT === "string"
      ? PROCESSED_VOTES_FEED_SELECT
      : "roll_call_id, title, summary, yea_means, nay_means, yea_label, nay_label, bill_number, result, vote_date, vote_question, vote_kind, chamber, congress, session_number, roll_call_number, official_url, clerk_url, bill_id, summary_source";
  let { data, error } = await client
    .from("processed_votes")
    .select(primarySelect)
    .order("vote_date", { ascending: false })
    .limit(fetchLimit);

  // Older DBs may lack takeaway/key_points — retry without them.
  if (error && /takeaway|key_points/i.test(error.message || "")) {
    const fallbackSelect = primarySelect
      .replace(/,\s*takeaway/i, "")
      .replace(/,\s*key_points/i, "");
    ({ data, error } = await client
      .from("processed_votes")
      .select(fallbackSelect)
      .order("vote_date", { ascending: false })
      .limit(fetchLimit));
  }

  if (error) {
    throw new Error(error.message || "Could not load processed_votes.");
  }

  let items = (data || []).map(mapProcessedVoteToFeedItem);

  if (kind === "final_passage" || kind === "amendment") {
    const filtered = items.filter((vote) => vote.voteKind === kind);
    if (filtered.length) items = filtered;
  }

  if (subject) {
    const needle = String(subject).trim().toLowerCase();
    const aliases = {
      healthcare: ["healthcare", "health", "medicare", "medicaid"],
      defense: ["defense", "armed", "national security", "foreign", "military"],
      economy: ["economy", "tax", "budget", "appropriations", "finance", "commerce"],
      tech: ["tech", "technology", "science", "communications", "space"],
      energy: ["energy"],
      "civil rights": ["civil rights", "civil liberties"],
      immigration: ["immigration", "border"],
      justice: ["justice", "crime"],
      family: ["family", "education", "housing"],
      environment: ["environment", "agriculture", "public lands"],
    };
    const needles = aliases[needle] || [needle.replace(/_/g, " ")];
    items = items.filter((vote) => {
      const haystack = [
        vote.title,
        vote.summary,
        vote.officialSummary,
        vote.voteQuestion,
        vote.billNumber,
      ]
        .join(" ")
        .toLowerCase();
      return needles.some((n) => haystack.includes(n));
    });
  }

  return items.slice(0, limit);
}

async function fetchVotesFeed({ force = false } = {}) {
  if (votesLoaded && !force) return votesItems;
  // Show a wider window of processed_votes (House cards synced daily).
  const limit = votesQuizMode ? 8 : 48;
  const kind = votesQuizMode ? "final_passage" : "";
  setVotesFeedStatus("Loading recent votes…", "loading");
  if (votesFeedEmpty) votesFeedEmpty.hidden = true;
  if (typeof showSkeletonCards === "function" && votesFeedList) {
    showSkeletonCards(votesFeedList, { type: "bill", count: 4 });
  }

  try {
    votesItems = await fetchVotesFromProcessedTable({
      limit,
      subject: votesSubject || "",
      kind,
    });
    votesLoaded = true;
    return votesItems;
  } catch (directError) {
    // Fallback: server API also reads processed_votes.
    console.warn("Direct processed_votes read failed, trying API:", directError);
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (kind) params.set("kind", kind);
    if (votesSubject) params.set("subject", votesSubject);
    const response = await fetch(`/api/votes-feed?${params.toString()}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error ||
          directError.message ||
          "Could not load votes feed."
      );
    }
    votesItems = payload.items || [];
    votesLoaded = true;
    return votesItems;
  }
}

function renderVotesFeed() {
  if (!votesFeedList) return;
  votesFeedList.replaceChildren();
  if (votesQuizBanner) {
    votesQuizBanner.hidden = !votesQuizMode;
  }
  if (!votesItems.length) {
    if (votesFeedEmpty) {
      votesFeedEmpty.hidden = false;
      votesFeedEmpty.innerHTML = votesSubject
        ? `<h2>No votes in this subject</h2><p>Try another subject chip or clear the filter.</p>`
        : `<h2>No votes yet</h2><p>Check back soon — new roll calls show up here after each floor session.</p>`;
    }
    setVotesFeedStatus("", "success");
    return;
  }
  if (votesFeedEmpty) votesFeedEmpty.hidden = true;
  votesFeedList.append(...votesItems.map(renderVoteCard));
  // Keep production status quiet — no developer/debug counts.
  setVotesFeedStatus(
    votesQuizMode ? "Quick Match: pick Support or Oppose on a few recent votes." : "",
    "success"
  );
}

async function loadVotesTab({ force = false } = {}) {
  try {
    await fetchVotesFeed({ force });
    renderVotesFeed();
  } catch (error) {
    console.error(error);
    if (votesFeedEmpty) {
      votesFeedEmpty.hidden = false;
      votesFeedEmpty.innerHTML = `<h2>Could not load votes</h2><p>${escapePolicyHtml(
        error.message || "Try again shortly."
      )}</p>`;
    }
    setVotesFeedStatus(error.message || "Could not load votes.", "error");
  }
}

function syncVotesSubjectChips() {
  votesSubjectChips?.querySelectorAll(".votes-subject-chip").forEach((chip) => {
    const value = String(chip.dataset.subject || "");
    chip.classList.toggle("is-active", value === votesSubject);
  });
}

function notificationBillKey(item = {}) {
  return `${item.bill_congress || ""}-${item.bill_type || ""}-${
    item.bill_number || ""
  }`
    .toLowerCase()
    .trim();
}

function policyItemBillKey(item = {}) {
  const fromId = String(item.id || "").replace(/^federal-/i, "");
  if (fromId.includes("-")) return fromId.toLowerCase();
  return String(item.billNumber || "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

function renderUpdateCard(item, { highlight = false, suggestion = false } = {}) {
  const card = document.createElement("article");
  card.className = `feed-card ${highlight ? "feed-card--highlight" : ""} ${
    suggestion ? "feed-card--suggestion" : ""
  }`;
  if (item.id) card.id = `notif-${item.id}`;

  const topic = document.createElement("span");
  topic.className = "feed-card__topic";
  const category = item.category || item.matched_kind || "";
  if (category === "critical") topic.classList.add("is-critical");
  if (category === "digest") topic.classList.add("is-digest");
  if (category === "neighborhood") topic.classList.add("is-neighborhood");
  topic.textContent = item.matched_topic || item.suggestion_topic || "Update";

  const title = document.createElement("h2");
  title.className = "feed-card__title";
  title.textContent = item.bill_title || "Untitled bill";

  const meta = document.createElement("p");
  meta.className = "feed-card__meta";
  const billLabel = `${item.bill_type || ""} ${item.bill_number || ""}`.trim();
  const when = formatShortDate(item.action_date || item.created_at);
  meta.textContent = [billLabel, when].filter(Boolean).join(" · ");

  const action = document.createElement("p");
  action.className = "feed-card__action";
  action.textContent =
    item.action_text ||
    item.summary_excerpt ||
    "New activity on a bill related to your interests.";

  if (item.summary_excerpt && item.action_text) {
    const excerpt = document.createElement("p");
    excerpt.className = "feed-card__excerpt";
    excerpt.textContent = item.summary_excerpt;
    card.append(topic, title, meta, action, excerpt);
  } else {
    card.append(topic, title, meta, action);
  }

  const link = document.createElement("a");
  link.className = "bill-card__link";
  link.href = congressGovBillUrl(item);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View on Congress.gov";
  card.append(link);

  return card;
}

async function ensureNotificationsLoaded({ force = false } = {}) {
  if (notificationsLoaded && !force) return cachedNotifications;
  if (!isSupabaseConfigured()) {
    cachedNotifications = [];
    notificationsLoaded = true;
    return cachedNotifications;
  }
  cachedNotifications = await fetchNotifications({ limit: 40 });
  notificationsLoaded = true;
  return cachedNotifications;
}

async function loadForYouSuggestions({ force = false } = {}) {
  if (forYouLoaded && !force) return;
  if (!forYouList) return;

  if (!isSupabaseConfigured()) {
    setForYouStatus(
      "Sign in to get personalized suggestions based on what you follow.",
      "error"
    );
    return;
  }

  const client = getSupabase();
  const user = await getUser();
  if (!client || !user) {
    setForYouStatus("Sign in to see suggestions tailored to your follows.", "error");
    return;
  }

  setForYouStatus("Finding related items…", "loading");
  if (typeof showSkeletonCards === "function") {
    showSkeletonCards(forYouList, { type: "bill", count: 3 });
  } else {
    forYouList.replaceChildren();
  }

  const notifications = await ensureNotificationsLoaded();
  const excludeKeys = new Set(notifications.map(notificationBillKey));
  myItems.forEach((item) => excludeKeys.add(policyItemBillKey(item)));
  followedBillIds.forEach((id) => excludeKeys.add(String(id).replace(/^federal-/i, "").toLowerCase()));

  const { data: follows, error } = await client
    .from("followed_topics")
    .select("*")
    .eq("user_id", user.id);

  if (error) {
    setForYouStatus("Could not load suggestions.", "error");
    return;
  }

  const keywords = (follows || [])
    .filter((item) => item.kind === "keyword")
    .map((item) => item.value.toLowerCase());
  const policyAreas = (follows || [])
    .filter((item) => item.kind === "policy_area")
    .map((item) => item.value.toLowerCase());
  const topicValues = [
    ...keywords,
    ...policyAreas,
    ...feedPreferences.topics,
  ].filter(Boolean);

  const suggestions = [];

  // Prefer related items from the broader all-news payload first.
  for (const item of allItems) {
    if (matchesMyFeed(item)) continue;
    const key = policyItemBillKey(item);
    if (excludeKeys.has(key)) continue;
    const haystack = tagsKey(item);
    const matched = topicValues.find((value) => value && haystack.includes(value));
    const softMatch =
      matched ||
      topicValues.find((value) =>
        value
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length > 4)
          .some((word) => haystack.includes(word))
      );
    if (!softMatch) continue;

    suggestions.push({
      bill_congress: CONGRESS,
      bill_type: String(item.billNumber || "").split(/\s+/)[0] || "",
      bill_number: String(item.billNumber || "").split(/\s+/)[1] || "",
      bill_title: item.title,
      matched_topic: softMatch,
      suggestion_topic: `Related · ${softMatch}`,
      action_text: item.shortPitch || item.status?.stepName || "Recent activity",
      action_date: item.lastUpdated,
      officialUrl: item.officialUrl,
      sourceItem: item,
    });
    excludeKeys.add(key);
    if (suggestions.length >= 8) break;
  }

  // Supplement with Congress.gov when a client key is available.
  if (
    suggestions.length < 8 &&
    typeof API_KEY !== "undefined" &&
    API_KEY &&
    !API_KEY.includes("YOUR_") &&
    (keywords.length || policyAreas.length)
  ) {
    try {
      const listUrl = `${CONGRESS_API_BASE}/bill/${CONGRESS}?limit=40&sort=updateDate+desc&format=json&api_key=${API_KEY}`;
      const response = await fetch(listUrl);
      if (response.ok) {
        const payload = await response.json();
        for (const bill of payload.bills || []) {
          const key = `${bill.congress}-${bill.type}-${bill.number}`.toLowerCase();
          if (excludeKeys.has(key)) continue;
          const title = (bill.title || "").toLowerCase();
          const matchedKeyword = keywords.find((word) => title.includes(word));
          const matchedPolicy = policyAreas.find(
            (area) =>
              title.includes(area) ||
              area
                .split(/[^a-z0-9]+/)
                .filter((word) => word.length > 4)
                .some((word) => title.includes(word))
          );
          if (!matchedKeyword && !matchedPolicy) continue;
          suggestions.push({
            bill_congress: bill.congress,
            bill_type: bill.type,
            bill_number: bill.number,
            bill_title: bill.title,
            matched_topic: matchedKeyword || matchedPolicy || "Related",
            action_text: bill.latestAction?.text || "Recent activity",
            action_date: bill.latestAction?.actionDate || bill.updateDate,
            suggestion_topic: matchedKeyword
              ? `Related · ${matchedKeyword}`
              : `Related · ${matchedPolicy}`,
          });
          excludeKeys.add(key);
          if (suggestions.length >= 8) break;
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  if (!suggestions.length) {
    setForYouStatus(
      topicValues.length || feedPreferences.politicianIds.length
        ? "No extra suggestions right now. Check back as more bills move."
        : "Follow topics or politicians to get tailored suggestions.",
      "loading"
    );
    forYouLoaded = true;
    return;
  }

  setForYouStatus("", "success");
  forYouList.replaceChildren(
    ...suggestions.map((item) => {
      if (item.sourceItem) {
        return renderBillCard(item.sourceItem);
      }
      return renderUpdateCard(item, { suggestion: true });
    })
  );
  forYouLoaded = true;
}

async function renderMyFeed() {
  policyFeedList.replaceChildren();
  updateFilterStatusLine();

  let notifications = [];
  try {
    notifications = await ensureNotificationsLoaded();
  } catch (error) {
    console.error(error);
  }

  const focusId = new URLSearchParams(window.location.search).get("n");
  const notifiedKeys = new Set(notifications.map(notificationBillKey));
  const nodes = [];

  notifications.forEach((item) => {
    nodes.push(
      renderUpdateCard(item, { highlight: Boolean(focusId && item.id === focusId) })
    );
  });

  myItems.forEach((item) => {
    const key = policyItemBillKey(item);
    if (notifiedKeys.has(key)) return;
    // Also skip loose "hr-123" style overlaps with "119-hr-123"
    const loose = String(item.billNumber || "")
      .toLowerCase()
      .replace(/\s+/g, "");
    const alreadyNotified = notifications.some((notif) => {
      const label = `${notif.bill_type || ""}${notif.bill_number || ""}`
        .toLowerCase()
        .replace(/\s+/g, "");
      return label && loose && label === loose;
    });
    if (alreadyNotified) return;
    nodes.push(renderBillCard(item));
  });

  if (!nodes.length) {
    policyFeedEmpty.hidden = false;
    const locationHtml = locationEmptyStateHtml({ forMyFeed: true });
    if (locationHtml) {
      policyFeedEmpty.innerHTML = locationHtml;
    } else {
      policyFeedEmpty.innerHTML = `<h2>Nothing in your feed yet</h2><p>Follow topics, politicians, and bills to see new and updated actions here. <a href="topics.html">Manage topics</a></p>`;
    }
    return;
  }

  policyFeedEmpty.hidden = true;
  policyFeedList.append(...nodes);

  if (focusId) {
    try {
      await markNotificationRead(focusId);
    } catch (error) {
      console.warn(error);
    }
    const target = document.getElementById(`notif-${focusId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

function setActiveTab(tabName) {
  activeTab = tabName;
  tabAllFeed?.classList.toggle("is-active", tabName === "all");
  tabMyFeed?.classList.toggle("is-active", tabName === "mine");
  tabForYouFeed?.classList.toggle("is-active", tabName === "foryou");
  tabVotesFeed?.classList.toggle("is-active", tabName === "votes");

  const isForYou = tabName === "foryou";
  const isVotes = tabName === "votes";
  if (policyFeedFilters) policyFeedFilters.hidden = isForYou || isVotes;
  if (policyFeedPanel) policyFeedPanel.hidden = isForYou || isVotes;
  if (forYouFeedPanel) forYouFeedPanel.hidden = !isForYou;
  if (votesFeedPanel) votesFeedPanel.hidden = !isVotes;
  if (feedManageTopics) feedManageTopics.hidden = tabName === "all" || isVotes;

  // Coverage badges are most useful on All News.
  if (policyFeedCoverage) {
    policyFeedCoverage.hidden = tabName !== "all";
  }

  syncTabQuery(tabName);
}

function renderActiveTab() {
  if (activeTab === "foryou" || activeTab === "votes") return;
  if (activeTab === "mine") {
    renderMyFeed();
    return;
  }

  const items = allItems;
  policyFeedList.replaceChildren();
  updateFilterStatusLine();

  if (!items.length) {
    policyFeedEmpty.hidden = false;
    const locationHtml = locationEmptyStateHtml({ forMyFeed: false });
    if (locationHtml) {
      policyFeedEmpty.innerHTML = locationHtml;
    } else {
      const filteredOut = rawItems.length > 0;
      policyFeedEmpty.innerHTML = filteredOut
        ? `<h2>No matches for these filters</h2><p>Try another state or clear “Affects my location.” Local coverage is limited; when few City/District items match we automatically add County, State, and Federal bills.</p>`
        : `<h2>No bill updates available</h2><p>Check back shortly for new legislative activity.</p>`;
    }
    return;
  }

  policyFeedEmpty.hidden = true;
  policyFeedList.append(...items.map(renderBillCard));
}

async function requireSignedInForTab(tabName) {
  const user = await getUser();
  if (user) return true;
  const next = `bills-policies.html?tab=${tabName}`;
  if (typeof promptAuthGate === "function") {
    promptAuthGate({
      next,
      title: tabName === "foryou" ? "Personalize your feed" : "Save your feed",
      body: "Create a free account to track topics, receive personalized alerts, and contact your representatives directly.",
    });
  } else {
    window.location.href = `auth.html?next=${encodeURIComponent(next)}`;
  }
  return false;
}

async function activateTab(tabName, { force = false } = {}) {
  if (tabName === "mine" || tabName === "foryou") {
    const ok = await requireSignedInForTab(tabName);
    if (!ok) return;
  }

  setActiveTab(tabName);
  if (tabName === "foryou") {
    await loadForYouSuggestions({ force });
  } else if (tabName === "mine") {
    await renderMyFeed();
  } else if (tabName === "votes") {
    await loadVotesTab({ force });
  } else {
    renderActiveTab();
  }
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
  if (policyFeedEmpty) policyFeedEmpty.hidden = true;
  if (typeof showSkeletonCards === "function" && policyFeedList) {
    showSkeletonCards(policyFeedList, { type: "bill", count: 4 });
  }
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
  if (policyFeedEmpty) policyFeedEmpty.hidden = true;
  if (
    typeof showSkeletonCards === "function" &&
    policyFeedList &&
    (activeTab === "all" || activeTab === "mine")
  ) {
    showSkeletonCards(policyFeedList, { type: "bill", count: 4 });
  }
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
  activateTab("all");
});

tabMyFeed?.addEventListener("click", () => {
  activateTab("mine");
});

tabForYouFeed?.addEventListener("click", () => {
  activateTab("foryou");
});

tabVotesFeed?.addEventListener("click", () => {
  votesQuizMode = false;
  activateTab("votes");
});

votesSubjectChips?.addEventListener("click", (event) => {
  const chip = event.target.closest(".votes-subject-chip");
  if (!chip) return;
  votesSubject = String(chip.dataset.subject || "");
  syncVotesSubjectChips();
  syncTabQuery("votes");
  votesLoaded = false;
  loadVotesTab({ force: true });
});

stateFilterSelect?.addEventListener("change", async () => {
  filterState.stateCode = String(stateFilterSelect.value || "").toUpperCase();
  await refreshWithFilters();
});

locationToggle?.addEventListener("change", async () => {
  filterState.locationOn = Boolean(locationToggle.checked);
  if (!filterState.locationOn) {
    filterState.resolved = null;
    filterState.locationFallback = null;
  }
  syncFilterControls();
  if (
    filterState.locationOn &&
    !String(locationInput?.value || filterState.addressQuery || "").trim()
  ) {
    locationInput?.focus();
    setPolicyFeedStatus("Enter an address or ZIP, then click Apply.", "error");
    recomputeVisibleItems();
    renderActiveTab();
    persistFilters();
    return;
  }
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
  await bootNav("feed");
  populateStateOptions();
  readStoredFilters();

  try {
    // Only the signed-in account's saved home_address may prefill location.
    const saved = await loadSavedHomeAddress();
    if (saved) {
      filterState.addressQuery = saved;
      filterState.locationOn = true;
    } else {
      filterState.addressQuery = "";
      filterState.locationOn = false;
    }
  } catch (error) {
    console.warn(error);
  }

  if (window.PolicyEngagement?.init) {
    try {
      await window.PolicyEngagement.init();
      const header = document.querySelector(".page--policy-feed .header > div");
      window.PolicyEngagement.renderHeaderScore(header);
    } catch (error) {
      console.warn(error);
    }
  }
  if (window.PolicyImpact?.loadBaselines) {
    try {
      await window.PolicyImpact.loadBaselines();
    } catch (error) {
      console.warn(error);
    }
  }

  syncFilterControls();

  const params = new URLSearchParams(window.location.search);
  votesQuizMode =
    params.get("quiz") === "1" ||
    String(params.get("tab") || "").toLowerCase() === "quiz";
  votesSubject = String(params.get("subject") || "").trim().toLowerCase();
  syncVotesSubjectChips();

  const initialTab = tabFromQuery();

  try {
    if (initialTab === "votes") {
      setActiveTab("votes");
      await loadVotesTab({ force: true });
    } else {
      await loadBillsPoliciesPage();
      await activateTab(initialTab, { force: true });
    }
  } catch (error) {
    console.error(error);
    setPolicyFeedStatus(error.message || "Could not load page.", "error");
  }
})();
