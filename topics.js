const topicsStatus = document.getElementById("topics-status");
const followingList = document.getElementById("following-list");
const keywordForm = document.getElementById("keyword-form");
const keywordInput = document.getElementById("keyword-input");
const policyFilter = document.getElementById("policy-filter");
const policyGrid = document.getElementById("policy-grid");

let currentUser = null;
let follows = [];

function setTopicsStatus(message, type = "loading") {
  topicsStatus.hidden = !message;
  topicsStatus.textContent = message;
  topicsStatus.dataset.type = type;
}

function followKey(kind, value) {
  return `${kind}::${value.toLowerCase()}`;
}

function isFollowing(kind, value) {
  return follows.some(
    (item) =>
      item.kind === kind &&
      item.value.toLowerCase() === value.toLowerCase()
  );
}

async function loadFollows() {
  const client = getSupabase();
  const { data, error } = await client
    .from("followed_topics")
    .select("*")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  follows = data || [];
}

function renderFollowing() {
  followingList.replaceChildren();

  if (follows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted-copy";
    empty.textContent = "You’re not following anything yet.";
    followingList.append(empty);
    return;
  }

  follows.forEach((item) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "topic-chip topic-chip--active";
    chip.innerHTML = `<span>${escapeHtml(item.value)}</span><span class="topic-chip__meta">${item.kind === "policy_area" ? "policy" : "keyword"}</span>`;
    chip.title = "Unfollow";
    chip.addEventListener("click", () => unfollow(item));
    followingList.append(chip);
  });
}

function renderPolicyAreas() {
  const query = policyFilter.value.trim().toLowerCase();
  policyGrid.replaceChildren();

  POLICY_AREAS.filter((area) => area.toLowerCase().includes(query)).forEach(
    (area) => {
      const card = document.createElement("article");
      card.className = "policy-card";

      const title = document.createElement("h3");
      title.textContent = area;

      const button = document.createElement("button");
      button.type = "button";
      const following = isFollowing("policy_area", area);
      button.className = following
        ? "refresh-btn policy-card__btn is-following"
        : "refresh-btn policy-card__btn";
      button.textContent = following ? "Following" : "Follow";
      button.addEventListener("click", () => {
        if (following) {
          const row = follows.find(
            (item) =>
              item.kind === "policy_area" &&
              item.value.toLowerCase() === area.toLowerCase()
          );
          if (row) unfollow(row);
        } else {
          follow("policy_area", area);
        }
      });

      card.append(title, button);
      policyGrid.append(card);
    }
  );
}

async function follow(kind, value) {
  const cleaned = value.trim();
  if (!cleaned) return;
  if (isFollowing(kind, cleaned)) return;

  setTopicsStatus("Saving…", "loading");
  const client = getSupabase();
  const { error } = await client.from("followed_topics").insert({
    user_id: currentUser.id,
    kind,
    value: cleaned,
  });

  if (error) {
    console.error(error);
    setTopicsStatus(error.message || "Could not follow topic.", "error");
    return;
  }

  await loadFollows();
  renderFollowing();
  renderPolicyAreas();
  setTopicsStatus(`Now following “${cleaned}”.`, "success");
  setTimeout(() => setTopicsStatus(""), 1800);
}

async function unfollow(item) {
  setTopicsStatus("Updating…", "loading");
  const client = getSupabase();
  const { error } = await client
    .from("followed_topics")
    .delete()
    .eq("id", item.id)
    .eq("user_id", currentUser.id);

  if (error) {
    console.error(error);
    setTopicsStatus(error.message || "Could not unfollow.", "error");
    return;
  }

  await loadFollows();
  renderFollowing();
  renderPolicyAreas();
  setTopicsStatus("", "success");
}

keywordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await follow("keyword", keywordInput.value);
  keywordInput.value = "";
});

policyFilter.addEventListener("input", renderPolicyAreas);

(async function initTopicsPage() {
  await bootNav("topics");

  if (!isSupabaseConfigured()) {
    setTopicsStatus(
      "Supabase is not configured. Add SUPABASE_URL and SUPABASE_ANON_KEY to config.js.",
      "error"
    );
    return;
  }

  currentUser = await requireUser();
  if (!currentUser) return;

  try {
    await loadFollows();
    renderFollowing();
    renderPolicyAreas();
  } catch (error) {
    console.error(error);
    setTopicsStatus(
      "Could not load topics. Check that you ran supabase/schema.sql.",
      "error"
    );
  }
})();
