const filterLevel = document.getElementById("filter-level");
const filterParty = document.getElementById("filter-party");
const filterState = document.getElementById("filter-state");
const filterSearch = document.getElementById("filter-search");
const filterFollowing = document.getElementById("filter-following");
const browseStatus = document.getElementById("browse-status");
const politiciansGrid = document.getElementById("politicians-grid");

let allPoliticians = [];
let followedIds = new Set();
let currentUser = null;
let followingOnly = (() => {
  const params = new URLSearchParams(window.location.search);
  return params.get("following") === "1" || params.get("tracked") === "1";
})();

function setBrowseStatus(message, type = "loading") {
  browseStatus.hidden = !message;
  browseStatus.textContent = message;
  browseStatus.dataset.type = type;
}

function fillStateFilter() {
  US_STATES.forEach((state) => {
    const option = document.createElement("option");
    option.value = state;
    option.textContent = state;
    filterState.append(option);
  });
}

function normalizeCongressMember(member) {
  const bioguide = member.bioguideId || member.bioguideID;
  const party =
    member.partyName ||
    member.party ||
    member.terms?.[0]?.partyName ||
    "";
  const state = member.state || member.terms?.[0]?.stateCode || "";
  const chamberRaw = (
    member.terms?.[member.terms.length - 1]?.chamber ||
    member.chamber ||
    ""
  ).toLowerCase();
  const chamber = chamberRaw.includes("senate")
    ? "senate"
    : chamberRaw.includes("house")
      ? "house"
      : chamberRaw;
  const district =
    chamber === "senate"
      ? "Statewide"
      : String(member.district ?? member.terms?.[0]?.district ?? "");

  return {
    external_key: bioguide ? `federal:${bioguide}` : `federal:${state}:${member.name}`,
    bioguide_id: bioguide || null,
    level: "federal",
    chamber,
    name: member.name || `${member.firstName || ""} ${member.lastName || ""}`.trim(),
    party,
    state,
    district,
    photo_url: bioguide
      ? `https://www.congress.gov/img/member/${String(bioguide).toLowerCase()}_200.jpg`
      : "",
    website_url: member.officialWebsiteUrl || "",
    phone: "",
    source: "congress.gov",
    metadata: { member },
  };
}

async function fetchFederalMembers() {
  if (typeof API_KEY === "undefined" || !API_KEY) {
    throw new Error("Missing Congress.gov API key");
  }

  const members = [];
  let offset = 0;
  const limit = 250;

  while (offset < 600) {
    const url = `https://api.congress.gov/v3/member?currentMember=true&limit=${limit}&offset=${offset}&format=json&api_key=${API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Congress.gov members failed (${response.status})`);
    const data = await response.json();
    const batch = data.members || [];
    members.push(...batch.map(normalizeCongressMember));
    if (batch.length < limit) break;
    offset += batch.length;
  }

  return members;
}

async function fetchStoredPoliticians(level) {
  const client = getSupabase();
  if (!client) return [];
  let query = client.from("politicians").select("*").order("name");
  if (level && level !== "all") {
    if (level === "municipal") {
      query = query.in("level", ["city", "school", "local"]);
    } else if (level === "city") {
      query = query.in("level", ["city", "local"]);
    } else {
      query = query.eq("level", level);
    }
  }
  const { data, error } = await query;
  if (error) {
    console.error(error);
    return [];
  }
  return data || [];
}

function applyFilters() {
  const level = filterLevel.value;
  const party = filterParty.value.toLowerCase();
  const state = filterState.value.toUpperCase();
  const search = filterSearch.value.trim().toLowerCase();

  const filtered = allPoliticians.filter((politician) => {
    if (followingOnly || filterFollowing?.checked) {
      if (!politician.id || !followedIds.has(politician.id)) return false;
    }
    if (level !== "all") {
      const displayLevel = toDisplayLevel(politician.level);
      if (displayLevel !== level && politician.level !== level) return false;
    }
    if (party) {
      const p = String(politician.party || "").toLowerCase();
      if (party.startsWith("dem") && !p.startsWith("dem")) return false;
      if (party.startsWith("rep") && !p.startsWith("rep")) return false;
      if (party.startsWith("ind") && !p.startsWith("ind")) return false;
    }
    if (state && String(politician.state || "").toUpperCase() !== state) return false;
    if (search) {
      const haystack = [
        politician.name,
        politician.district,
        politician.chamber,
        politician.office_title,
        politician.metadata?.office_title,
        politician.metadata?.department,
        politician.metadata?.category,
        politician.state,
        politician.level,
        politician.external_key,
        politician.bioguide_id,
      ]
        .join(" ")
        .toLowerCase();
      // Every token must match so "josh hawley" finds the senator.
      const tokens = search.split(/\s+/).filter(Boolean);
      if (!tokens.every((token) => haystack.includes(token))) return false;
    }
    return true;
  });

  politiciansGrid.replaceChildren();
  if (!filtered.length) {
    setBrowseStatus(
      followingOnly || filterFollowing?.checked
        ? "No followed officials match these filters."
        : "No politicians match these filters.",
      "error"
    );
    return;
  }

  renderPoliticianFlatList(politiciansGrid, filtered, {
    followedIds,
    user: currentUser,
    searchQuery: filterSearch?.value || "",
  });
  setBrowseStatus(
    followingOnly || filterFollowing?.checked
      ? `Showing ${filtered.length} followed official${
          filtered.length === 1 ? "" : "s"
        }.`
      : `Showing ${filtered.length} politicians.`,
    "success"
  );
}

async function loadBrowseList() {
  setBrowseStatus("Loading politicians…", "loading");
  if (typeof showSkeletonCards === "function" && politiciansGrid) {
    showSkeletonCards(politiciansGrid, { type: "politician", count: 8 });
  }
  try {
    const level = filterLevel.value;
    let list = [];

    if (level === "federal" || level === "all") {
      // Load national officials independently so Congress.gov failures don't hide them.
      const [federal, national] = await Promise.all([
        fetchFederalMembers().catch((error) => {
          console.error("Congress.gov members failed:", error);
          return [];
        }),
        fetchNationalOfficials(),
      ]);
      list = list.concat(federal, national);
      if (!national.length) {
        console.warn(
          "No national_officials rows loaded. Check Supabase RLS SELECT policy for anon."
        );
      }
    }

    if (level === "state" || level === "all") {
      const stateCode = filterState.value || "";
      if (stateCode) {
        // Without a county, Option A still returns Statewide leadership/high courts.
        const statewideOfficials = await fetchStateOfficialsForAddress({
          state_code: stateCode,
          county_name: "",
        });
        list = list.concat(statewideOfficials);
      }
    }

    const stored = await fetchStoredPoliticians(level === "all" ? "all" : level);
    const byKey = new Map(list.map((item) => [item.external_key, item]));
    for (const row of stored) {
      byKey.set(row.external_key, { ...row });
    }
    allPoliticians = [...byKey.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    applyFilters();
  } catch (error) {
    console.error(error);
    if (politiciansGrid) politiciansGrid.replaceChildren();
    setBrowseStatus(error.message || "Could not load politicians.", "error");
  }
}

const nameSearchForm = document.getElementById("name-search-form");
const nameSearchInput = document.getElementById("name-search-input");
const browseSection = document.querySelector(".politicians-browse");

function syncNameSearchUrl(query) {
  const url = new URL(window.location.href);
  const q = String(query || "").trim();
  if (q) url.searchParams.set("q", q);
  else url.searchParams.delete("q");
  window.history.replaceState({}, "", url);
}

function scrollToBrowse() {
  browseSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function applyNameSearch(query, { scroll = true, syncUrl = true } = {}) {
  const q = String(query || "").trim();
  if (nameSearchInput) nameSearchInput.value = q;
  if (filterSearch) filterSearch.value = q;
  if (syncUrl) syncNameSearchUrl(q);
  applyFilters();
  if (scroll && q) scrollToBrowse();
}

filterLevel.addEventListener("change", () => {
  loadBrowseList();
});
filterParty.addEventListener("change", applyFilters);
filterState.addEventListener("change", applyFilters);
filterSearch.addEventListener("input", () => {
  if (nameSearchInput) nameSearchInput.value = filterSearch.value;
  syncNameSearchUrl(filterSearch.value);
  applyFilters();
});
filterFollowing?.addEventListener("change", () => {
  followingOnly = Boolean(filterFollowing.checked);
  const url = new URL(window.location.href);
  if (followingOnly) url.searchParams.set("following", "1");
  else url.searchParams.delete("following");
  window.history.replaceState({}, "", url);
  applyFilters();
});

nameSearchForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  applyNameSearch(nameSearchInput?.value || "");
});

async function resolveSavedHomeAddress() {
  const fromEngagement = String(
    window.PolicyEngagement?.getState?.()?.homeAddress || ""
  ).trim();
  if (fromEngagement) return fromEngagement;

  const client = typeof getSupabase === "function" ? getSupabase() : null;
  const user = typeof getUser === "function" ? await getUser() : null;
  if (!client || !user) return "";
  const { data, error } = await client
    .from("profiles")
    .select("home_address")
    .eq("id", user.id)
    .maybeSingle();
  if (error) {
    console.warn(error);
    return "";
  }
  return String(data?.home_address || "").trim();
}

function setupMyRepresentativesQuickLoad({ addressInput, addressForm, user }) {
  const wrap = document.getElementById("my-reps-wrap");
  const btn = document.getElementById("my-reps-btn");
  const statusEl = document.getElementById("my-reps-status");
  const fallback = document.getElementById("my-reps-fallback");
  if (!wrap || !btn || !addressInput || !addressForm) return;

  return (async () => {
    const savedAddress = await resolveSavedHomeAddress();
    if (savedAddress) {
      wrap.hidden = false;
      if (fallback) fallback.hidden = true;
      btn.addEventListener("click", () => {
        addressInput.value = savedAddress;
        if (statusEl) {
          statusEl.hidden = false;
          statusEl.textContent = "Showing reps for your saved address…";
        }
        btn.disabled = true;
        addressForm.requestSubmit();
      });
      return;
    }

    wrap.hidden = true;
    if (fallback) {
      // Signed-in users without an address get a Profile nudge; otherwise hide.
      fallback.hidden = !user;
      if (user) {
        fallback.innerHTML =
          '<a href="profile.html#location">Add address in Profile</a> to quick-load your representatives.';
      }
    }
  })();
}

(async function initPoliticiansPage() {
  fillStateFilter();
  await bootNav("politicians");
  if (window.PolicyEngagement?.init) {
    try {
      await window.PolicyEngagement.init();
    } catch (error) {
      console.warn(error);
    }
  }

  const params = new URLSearchParams(window.location.search);
  const addressInput = document.getElementById("address-input");
  const addressForm = document.getElementById("address-form");
  const guestLocation =
    typeof readGuestLocationContext === "function"
      ? readGuestLocationContext()
      : null;
  const prefillAddress =
    params.get("address")?.trim() ||
    params.get("zipCode")?.trim() ||
    params.get("zip")?.trim() ||
    String(guestLocation?.query || guestLocation?.zipCode || guestLocation?.address || "").trim() ||
    "";
  const prefillName =
    params.get("q")?.trim() ||
    params.get("name")?.trim() ||
    params.get("search")?.trim() ||
    "";
  if (prefillAddress && addressInput) {
    addressInput.value = prefillAddress;
  }
  if (prefillName) {
    if (nameSearchInput) nameSearchInput.value = prefillName;
    if (filterSearch) filterSearch.value = prefillName;
  }

  mountAddressLookup({
    formId: "address-form",
    inputId: "address-input",
  });

  // Homepage hero or stored guest ZIP/address → continue into the localized
  // audit view so navigating away and back does not clear their search.
  if (prefillAddress && addressForm && params.get("browse") !== "1") {
    addressForm.requestSubmit();
    return;
  }

  currentUser = (await getUser().catch(() => null)) || null;
  await setupMyRepresentativesQuickLoad({
    addressInput,
    addressForm,
    user: currentUser,
  });

  if (currentUser) {
    followedIds = await loadFollowedPoliticianIds(currentUser.id);
  }
  if (filterFollowing) {
    filterFollowing.checked = followingOnly;
    if (!currentUser) {
      filterFollowing.disabled = true;
      filterFollowing.title = "Sign in to filter followed officials";
    } else if (followingOnly && filterLevel) {
      // Show followed officials across levels by default.
      filterLevel.value = "all";
    }
  }

  await loadBrowseList();
  if (prefillName) {
    applyNameSearch(prefillName, { scroll: true, syncUrl: true });
  }
})();
