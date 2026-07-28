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
  if (status === "live") return "is-live";
  if (status === "planned") return "is-planned";
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
  const [feedResponse] = await Promise.all([
    fetch("/api/bills-feed?limit=16"),
    loadFeedPreferences(),
  ]);

  const payload = await feedResponse.json();
  if (!feedResponse.ok) {
    throw new Error(payload.error || "Could not load bills feed");
  }

  allItems = payload.items || [];
  myItems = allItems.filter(matchesMyFeed);
  renderCoverageBadges(payload.coverage || {});
  setPolicyFeedStatus(
    "Federal feed is live now. State, City, and District coverage are scaffolded and ready for source integrations.",
    "success"
  );
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
