const feedStatus = document.getElementById("feed-status");
const feedStream = document.getElementById("feed-stream");
const suggestionsSection = document.getElementById("suggestions");
const suggestionsList = document.getElementById("suggestions-list");

function setFeedStatus(message, type = "loading") {
  feedStatus.hidden = !message;
  feedStatus.textContent = message;
  feedStatus.dataset.type = type;
}

function renderFeedCard(item, { highlight = false, suggestion = false } = {}) {
  const card = document.createElement("article");
  card.className = `feed-card ${highlight ? "feed-card--highlight" : ""} ${
    suggestion ? "feed-card--suggestion" : ""
  }`;
  card.id = item.id ? `notif-${item.id}` : undefined;

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

async function loadFeed() {
  const notifications = await fetchNotifications({ limit: 40 });
  const params = new URLSearchParams(window.location.search);
  const focusId = params.get("n");

  feedStream.replaceChildren();

  if (notifications.length === 0) {
    setFeedStatus(
      "No updates yet. Follow topics and check back after the watcher runs.",
      "loading"
    );
  } else {
    setFeedStatus("", "success");
    notifications.forEach((item) => {
      feedStream.append(
        renderFeedCard(item, { highlight: focusId && item.id === focusId })
      );
    });
  }

  if (focusId) {
    await markNotificationRead(focusId);
    const target = document.getElementById(`notif-${focusId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  await loadSuggestions(notifications);
}

async function loadSuggestions(notifications) {
  const client = getSupabase();
  const user = await getUser();
  if (!client || !user || typeof API_KEY === "undefined" || !API_KEY) return;

  const { data: follows, error } = await client
    .from("followed_topics")
    .select("*")
    .eq("user_id", user.id);

  if (error || !follows?.length) return;

  const notifiedKeys = new Set(
    notifications.map(
      (item) =>
        `${item.bill_congress}-${item.bill_type}-${item.bill_number}`.toLowerCase()
    )
  );

  const keywords = follows
    .filter((item) => item.kind === "keyword")
    .map((item) => item.value.toLowerCase());
  const policyAreas = follows
    .filter((item) => item.kind === "policy_area")
    .map((item) => item.value.toLowerCase());

  try {
    const listUrl = `https://api.congress.gov/v3/bill/119?limit=40&sort=updateDate+desc&format=json&api_key=${API_KEY}`;
    const response = await fetch(listUrl);
    if (!response.ok) return;
    const payload = await response.json();
    const bills = payload.bills || [];

    const suggestions = [];
    for (const bill of bills) {
      const key = `${bill.congress}-${bill.type}-${bill.number}`.toLowerCase();
      if (notifiedKeys.has(key)) continue;

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
          ? `Keyword · ${matchedKeyword}`
          : `Related · ${matchedPolicy}`,
      });

      if (suggestions.length >= 6) break;
    }

    if (suggestions.length === 0) return;

    suggestionsSection.hidden = false;
    suggestionsList.replaceChildren(
      ...suggestions.map((item) =>
        renderFeedCard(item, { suggestion: true })
      )
    );
  } catch (error) {
    console.error(error);
  }
}

(async function initFeedPage() {
  await bootNav("feed");

  if (!isSupabaseConfigured()) {
    setFeedStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
      "error"
    );
    return;
  }

  const user = await requireUser();
  if (!user) return;

  setFeedStatus("Loading your feed…", "loading");
  try {
    await loadFeed();
  } catch (error) {
    console.error(error);
    setFeedStatus("Could not load feed.", "error");
  }
})();
