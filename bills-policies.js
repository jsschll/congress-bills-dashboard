const policyFeedStatus = document.getElementById("policy-feed-status");
const policyFeedCoverage = document.getElementById("policy-feed-coverage");
const policyFeedList = document.getElementById("policy-feed-list");
const policyFeedEmpty = document.getElementById("policy-feed-empty");
const tabAllFeed = document.getElementById("tab-all-feed");
const tabMyFeed = document.getElementById("tab-my-feed");

let activeTab = "all";
let allItems = [];
let myItems = [];
let followedBillIds = new Set();
let feedPreferences = {
  topics: [],
  billIds: [],
  politicianIds: [],
  districts: [],
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

async function fetchBillsFeedPayload(limit = 16) {
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
      const response = await fetch(`${endpoint}?limit=${limit}`);
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
  myItems = allItems.filter(matchesMyFeed);
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

  if (!items.length) {
    policyFeedEmpty.hidden = false;
    policyFeedEmpty.innerHTML =
      activeTab === "mine"
        ? `<h2>No personalized matches yet</h2><p>Follow topics, politicians, or bill cards to build your feed.</p>`
        : `<h2>No bill updates available</h2><p>Check back shortly for new legislative activity.</p>`;
    return;
  }

  policyFeedEmpty.hidden = true;
  policyFeedList.append(...items.map(renderBillCard));
}

async function loadBillsPoliciesPage() {
  setPolicyFeedStatus("Loading bills, laws & policies…", "loading");
  const [payload] = await Promise.all([fetchBillsFeedPayload(16), loadFeedPreferences()]);

  allItems = payload.items || [];
  myItems = allItems.filter(matchesMyFeed);
  renderCoverageBadges(payload.coverage || {});
  setPolicyFeedStatus(coverageSummaryText(payload.coverage || {}), "success");
  renderActiveTab();
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

(async function initBillsPoliciesPage() {
  await bootNav("bills-policies");
  try {
    await loadBillsPoliciesPage();
  } catch (error) {
    console.error(error);
    setPolicyFeedStatus(error.message || "Could not load page.", "error");
  }
})();
