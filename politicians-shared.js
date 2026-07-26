const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
];

function escapePoliticianHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function chamberLabel(chamber) {
  switch (chamber) {
    case "house":
      return "U.S. House";
    case "senate":
      return "U.S. Senate";
    case "state_house":
      return "State House";
    case "state_senate":
      return "State Senate";
    default:
      return chamber || "Office";
  }
}

function partyClass(party) {
  const value = String(party || "").toLowerCase();
  if (value.startsWith("dem")) return "party--dem";
  if (value.startsWith("rep")) return "party--rep";
  return "party--other";
}

const LOOKUP_API_PATH = "/api/lookup-representatives";
const LOOKUP_API_FALLBACK =
  "https://congress-bills-dashboard.vercel.app/api/lookup-representatives";

async function fetchLookupRepresentatives(endpoint, query) {
  const response = await fetch(
    `${endpoint}?q=${encodeURIComponent(query)}`
  );
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function lookupRepresentatives(query) {
  const q = query.trim();
  if (!q) throw new Error("Enter an address or ZIP code.");

  let { response, data } = await fetchLookupRepresentatives(LOOKUP_API_PATH, q);

  // GitHub Pages / static hosts have no Vercel serverless routes — retry production API.
  if (!response.ok && !LOOKUP_API_PATH.startsWith("http")) {
    const absoluteOrigin =
      typeof location !== "undefined" &&
      location.origin &&
      !location.origin.includes("vercel.app")
        ? LOOKUP_API_FALLBACK
        : null;
    if (absoluteOrigin) {
      ({ response, data } = await fetchLookupRepresentatives(absoluteOrigin, q));
    }
  }

  if (!response.ok) {
    // Optional local fallback when GEOCODIO_API_KEY is present in config.js.
    if (typeof GEOCODIO_API_KEY === "string" && GEOCODIO_API_KEY && !GEOCODIO_API_KEY.includes("YOUR_")) {
      return lookupRepresentativesDirect(q);
    }
    throw new Error(data.error || `Lookup failed (${response.status})`);
  }
  return data;
}

async function lookupRepresentativesDirect(query) {
  const url = `https://api.geocod.io/v1.7/geocode?q=${encodeURIComponent(
    query
  )}&fields=cd,stateleg&limit=1&api_key=${encodeURIComponent(GEOCODIO_API_KEY)}`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Geocodio lookup failed");
  }

  // Reuse server mapper logic lightly on the client for fallback.
  const result = payload.results?.[0];
  if (!result) return { address: null, politicians: [] };

  const state = (result.address_components?.state || "").toUpperCase();
  const politicians = [];
  const seen = new Set();

  for (const district of result.fields?.congressional_districts || []) {
    for (const legislator of district.current_legislators || []) {
      const bio = legislator.bio || {};
      const contact = legislator.contact || {};
      const references = legislator.references || {};
      const type = String(legislator.type || "").toLowerCase();
      const chamber = type === "senator" ? "senate" : "house";
      const name = [bio.first_name, bio.last_name].filter(Boolean).join(" ");
      const bioguide = references.bioguide_id || null;
      const external_key = bioguide
        ? `federal:${bioguide}`
        : `federal:${state}:${chamber}:${name}`.toLowerCase();
      if (seen.has(external_key)) continue;
      seen.add(external_key);
      politicians.push({
        external_key,
        bioguide_id: bioguide,
        level: "federal",
        chamber,
        name,
        party: bio.party || "",
        state,
        district:
          chamber === "senate"
            ? "Statewide"
            : String(district.district_number || ""),
        photo_url: bio.photo_url || "",
        website_url: contact.url || "",
        phone: contact.phone || "",
        source: "geocodio",
        metadata: { references },
      });
    }
  }

  return {
    address: result.formatted_address || null,
    state,
    politicians,
  };
}

async function upsertPoliticianRecord(politician) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client.rpc("upsert_politician", {
    p_external_key: politician.external_key,
    p_bioguide_id: politician.bioguide_id || null,
    p_level: politician.level,
    p_chamber: politician.chamber || null,
    p_name: politician.name,
    p_party: politician.party || null,
    p_state: politician.state || null,
    p_district: politician.district || null,
    p_photo_url: politician.photo_url || null,
    p_website_url: politician.website_url || null,
    p_phone: politician.phone || null,
    p_source: politician.source || "app",
    p_metadata: politician.metadata || {},
  });

  if (error) {
    console.error(error);
    return null;
  }
  return data;
}

async function loadFollowedPoliticianIds(userId) {
  const client = getSupabase();
  if (!client || !userId) return new Set();
  const { data, error } = await client
    .from("followed_politicians")
    .select("politician_id")
    .eq("user_id", userId);
  if (error) {
    console.error(error);
    return new Set();
  }
  return new Set((data || []).map((row) => row.politician_id));
}

async function followPolitician(userId, politicianId) {
  const client = getSupabase();
  const { error } = await client.from("followed_politicians").insert({
    user_id: userId,
    politician_id: politicianId,
  });
  if (error) throw error;
}

async function unfollowPolitician(userId, politicianId) {
  const client = getSupabase();
  const { error } = await client
    .from("followed_politicians")
    .delete()
    .eq("user_id", userId)
    .eq("politician_id", politicianId);
  if (error) throw error;
}

function renderPoliticianCard(politician, { followedIds, user, onFollowChange }) {
  const card = document.createElement("article");
  card.className = "politician-card";

  const media = document.createElement("div");
  media.className = "politician-card__media";
  if (politician.photo_url) {
    const img = document.createElement("img");
    img.src = politician.photo_url;
    img.alt = politician.name;
    img.loading = "lazy";
    media.append(img);
  } else {
    media.innerHTML = `<div class="politician-card__avatar">${escapePoliticianHtml(
      (politician.name || "?").slice(0, 1)
    )}</div>`;
  }

  const body = document.createElement("div");
  body.className = "politician-card__body";

  const name = document.createElement("h2");
  name.className = "politician-card__name";
  name.textContent = politician.name;

  const meta = document.createElement("p");
  meta.className = "politician-card__meta";
  meta.textContent = [
    chamberLabel(politician.chamber),
    politician.state,
    politician.district ? `Dist. ${politician.district}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const party = document.createElement("span");
  party.className = `politician-card__party ${partyClass(politician.party)}`;
  party.textContent = politician.party || "Independent/Other";

  const actions = document.createElement("div");
  actions.className = "politician-card__actions";

  if (politician.website_url) {
    const link = document.createElement("a");
    link.className = "bill-card__link";
    link.href = politician.website_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Official site";
    actions.append(link);
  }

  const followBtn = document.createElement("button");
  followBtn.type = "button";
  followBtn.className = "refresh-btn politician-card__follow";

  const isFollowed = politician.id && followedIds?.has(politician.id);
  followBtn.textContent = isFollowed ? "Following" : "Follow";
  if (isFollowed) followBtn.classList.add("is-following");

  followBtn.addEventListener("click", async () => {
    if (!user) {
      window.location.href = `auth.html?next=${encodeURIComponent(
        window.location.pathname.split("/").pop() || "politicians.html"
      )}`;
      return;
    }

    followBtn.disabled = true;
    try {
      let record = politician;
      if (!record.id) {
        record = await upsertPoliticianRecord(politician);
        if (!record?.id) throw new Error("Could not save politician");
        politician.id = record.id;
      }

      if (followedIds.has(politician.id)) {
        await unfollowPolitician(user.id, politician.id);
        followedIds.delete(politician.id);
        followBtn.textContent = "Follow";
        followBtn.classList.remove("is-following");
      } else {
        await followPolitician(user.id, politician.id);
        followedIds.add(politician.id);
        followBtn.textContent = "Following";
        followBtn.classList.add("is-following");
      }
      onFollowChange?.(politician);
    } catch (error) {
      console.error(error);
      alert(error.message || "Could not update follow.");
    } finally {
      followBtn.disabled = false;
    }
  });

  actions.append(followBtn);
  body.append(name, meta, party, actions);
  card.append(media, body);
  return card;
}

function mountAddressLookup({ formId, inputId, statusId, resultsId }) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  const status = document.getElementById(statusId);
  const results = document.getElementById(resultsId);
  if (!form || !input || !status || !results) return;

  function setStatus(message, type = "loading") {
    status.hidden = !message;
    status.textContent = message;
    status.dataset.type = type;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    results.replaceChildren();
    setStatus("Looking up your representatives…", "loading");

    try {
      await injectSupabaseScript().catch(() => {});
      const user = await getUser().catch(() => null);
      const followedIds = user
        ? await loadFollowedPoliticianIds(user.id)
        : new Set();

      const data = await lookupRepresentatives(input.value);
      const politicians = data.politicians || [];

      // Persist discovered politicians for browse/follow.
      const saved = [];
      for (const politician of politicians) {
        if (politician.metadata?.district_only) {
          saved.push(politician);
          continue;
        }
        const row = await upsertPoliticianRecord(politician);
        saved.push(row ? { ...politician, ...row } : politician);
      }

      if (!saved.length) {
        setStatus(
          "No representatives found for that address. Try a fuller street address.",
          "error"
        );
        return;
      }

      setStatus(
        `Representatives for ${data.address || input.value}`,
        "success"
      );
      results.replaceChildren(
        ...saved.map((politician) =>
          renderPoliticianCard(politician, { followedIds, user })
        )
      );
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Address lookup failed.", "error");
    }
  });
}
