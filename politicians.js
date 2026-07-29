const filterLevel = document.getElementById("filter-level");
const filterParty = document.getElementById("filter-party");
const filterState = document.getElementById("filter-state");
const filterSearch = document.getElementById("filter-search");
const filterTracked = document.getElementById("filter-tracked");
const browseStatus = document.getElementById("browse-status");
const politiciansGrid = document.getElementById("politicians-grid");

let allPoliticians = [];
let followedIds = new Set();
let currentUser = null;
let trackedOnly =
  new URLSearchParams(window.location.search).get("tracked") === "1";

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
    if (trackedOnly || filterTracked?.checked) {
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
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const nationalOfficials = filtered.filter(
    (politician) => politician.source === "national_officials"
  );
  const stateJudges = filtered.filter(
    (politician) =>
      politician.source === "state_officials" ||
      politician.source === "state_judges"
  );
  const others = filtered.filter(
    (politician) =>
      politician.source !== "national_officials" &&
      politician.source !== "state_officials" &&
      politician.source !== "state_judges"
  );

  politiciansGrid.replaceChildren();
  if (!filtered.length) {
    setBrowseStatus(
      trackedOnly || filterTracked?.checked
        ? "No tracked officials match these filters."
        : "No politicians match these filters.",
      "error"
    );
    return;
  }

  const geography = {
    state: filterState.value || "",
    county: "",
    appellateDistricts: [],
    trialDistricts: [],
  };

  renderPoliticianGroups(politiciansGrid, others, {
    followedIds,
    user: currentUser,
    nationalOfficials,
    stateJudges,
    geography,
  });
  setBrowseStatus(
    trackedOnly || filterTracked?.checked
      ? `Showing ${filtered.length} tracked official${
          filtered.length === 1 ? "" : "s"
        }.`
      : `Showing ${filtered.length} politicians.`,
    "success"
  );
}

async function loadBrowseList() {
  setBrowseStatus("Loading politicians…", "loading");
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
    setBrowseStatus(error.message || "Could not load politicians.", "error");
  }
}

filterLevel.addEventListener("change", () => {
  loadBrowseList();
});
filterParty.addEventListener("change", applyFilters);
filterState.addEventListener("change", applyFilters);
filterSearch.addEventListener("input", applyFilters);
filterTracked?.addEventListener("change", () => {
  trackedOnly = Boolean(filterTracked.checked);
  const url = new URL(window.location.href);
  if (trackedOnly) url.searchParams.set("tracked", "1");
  else url.searchParams.delete("tracked");
  window.history.replaceState({}, "", url);
  applyFilters();
});

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

  const addressInput = document.getElementById("address-input");
  const addressForm = document.getElementById("address-form");
  const prefillAddress = new URLSearchParams(window.location.search)
    .get("address")
    ?.trim();
  if (prefillAddress && addressInput) {
    addressInput.value = prefillAddress;
  }

  mountAddressLookup({
    formId: "address-form",
    inputId: "address-input",
  });

  // Homepage hero lands here with ?address=… already filled, then continues
  // into the lookup so users are not asked to click Look up again.
  if (prefillAddress && addressForm) {
    addressForm.requestSubmit();
    return;
  }

  currentUser = (await getUser().catch(() => null)) || null;
  if (currentUser) {
    followedIds = await loadFollowedPoliticianIds(currentUser.id);
  }
  if (filterTracked) {
    filterTracked.checked = trackedOnly;
    if (!currentUser) {
      filterTracked.disabled = true;
      filterTracked.title = "Sign in to filter tracked officials";
    } else if (trackedOnly && filterLevel) {
      // Show tracked officials across levels by default.
      filterLevel.value = "all";
    }
  }

  await loadBrowseList();
})();
