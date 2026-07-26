const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
];

const LEVEL_ORDER = ["federal", "state", "county", "city", "school", "local"];

// User-facing buckets from highest to lowest authority.
const DISPLAY_LEVEL_ORDER = ["federal", "state", "county", "city", "school"];

const LEVEL_LABELS = {
  federal: "Federal",
  state: "State",
  county: "County",
  city: "City / Municipal",
  school: "School Board / District",
  local: "City / Municipal",
  municipal: "City / Municipal",
};

function toDisplayLevel(level) {
  if (level === "local" || level === "municipal") return "city";
  if (DISPLAY_LEVEL_ORDER.includes(level)) return level;
  return "city";
}

function escapePoliticianHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function levelLabel(level) {
  return LEVEL_LABELS[level] || LEVEL_LABELS[toDisplayLevel(level)] || "Other";
}

function readableOfficeTitle(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    return readableOfficeTitle(
      value.name_formal || value.name || value.title || value.role || ""
    );
  }
  const text = String(value).trim();
  if (!text || text.startsWith("{") || text.startsWith("[")) return "";
  if (text === "[object Object]") return "";
  if (/^ocd-/i.test(text)) return "";
  return text;
}

function formatDistrictMeta(district, politician = {}) {
  const raw = String(district || "").trim();
  if (!raw) return "";
  if (/^ocd-/i.test(raw)) return "";
  if (/^united states$/i.test(raw)) return "";
  if (/^\d{5,}$/.test(raw)) return "";
  if (/^statewide$/i.test(raw)) return "Statewide";
  if (/^lea\s+/i.test(raw)) return raw;
  if (
    politician.chamber === "senate" &&
    politician.level === "federal" &&
    /^[A-Z]{2}$/.test(raw)
  ) {
    return "Statewide";
  }
  return `Dist. ${raw}`;
}

function chamberLabel(chamber, politician = {}) {
  const officeTitle = readableOfficeTitle(
    politician.office_title || politician.metadata?.office_title
  );
  if (officeTitle) return officeTitle;

  switch (chamber) {
    case "house":
      return "U.S. House";
    case "senate":
      return "U.S. Senate";
    case "executive":
      return "Executive";
    case "governor":
      return "Governor";
    case "lieutenant_governor":
      return "Lieutenant Governor";
    case "attorney_general":
      return "Attorney General";
    case "state_executive":
      return "State Executive";
    case "judicial":
      return "Judge";
    case "sheriff":
      return "Sheriff";
    case "trustee":
      return "Trustee";
    case "county_commissioner":
      return "County Commissioner";
    case "state_house":
      return "State House";
    case "state_senate":
      return "State Senate";
    case "mayor":
      return "Mayor";
    case "city_council":
      return "City Council";
    case "county":
      return "County office";
    case "school_board":
      return "School Board";
    case "school_district":
      return "School District";
    default:
      return chamber
        ? String(chamber).replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())
        : "Office";
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
    throw new Error(data.error || `Lookup failed (${response.status})`);
  }
  return data;
}

async function upsertPoliticianRecord(politician) {
  const client = getSupabase();
  if (!client) return null;

  const officeTitle =
    politician.office_title ||
    politician.metadata?.office_title ||
    politician.chamber ||
    null;

  const payload = {
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
    p_metadata: {
      ...(politician.metadata || {}),
      office_title: officeTitle,
    },
    p_office_title: officeTitle,
  };

  let { data, error } = await client.rpc("upsert_politician", payload);
  if (error && /p_office_title|function.*upsert_politician/i.test(error.message || "")) {
    delete payload.p_office_title;
    ({ data, error } = await client.rpc("upsert_politician", payload));
  }

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

function politicianLevels(politician) {
  const fromFields = [
    ...(politician.levels || []),
    ...(politician.metadata?.levels || []),
    politician.level,
  ].filter(Boolean);
  const unique = [
    ...new Set(fromFields.map((level) => toDisplayLevel(level))),
  ].filter((level) => DISPLAY_LEVEL_ORDER.includes(level));
  unique.sort(
    (a, b) => DISPLAY_LEVEL_ORDER.indexOf(a) - DISPLAY_LEVEL_ORDER.indexOf(b)
  );
  return unique.length ? unique : ["city"];
}

function politicianOffices(politician) {
  const offices = politician.offices || politician.metadata?.offices || [];
  if (offices.length) return offices;
  return [
    {
      level: politician.level || "local",
      chamber: politician.chamber || "",
      office_title:
        politician.office_title ||
        politician.metadata?.office_title ||
        politician.chamber ||
        "",
      district: politician.district || "",
      source: politician.source || "",
      external_key: politician.external_key,
    },
  ];
}

function officeForLevel(politician, sectionLevel) {
  const offices = politicianOffices(politician);
  const match = offices.find(
    (office) => toDisplayLevel(office.level) === sectionLevel
  );
  return match || offices[0] || null;
}

function renderPoliticianCard(
  politician,
  { followedIds, user, onFollowChange, sectionLevel = null }
) {
  const card = document.createElement("article");
  card.className = "politician-card";
  const levels = politicianLevels(politician);
  const activeLevel = sectionLevel || levels[0] || politician.level || "local";
  const activeOffice = officeForLevel(politician, activeLevel);
  card.dataset.level = activeLevel;

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

  const name = document.createElement("h3");
  name.className = "politician-card__name";
  name.textContent = politician.name;

  const officeTitle = readableOfficeTitle(
    activeOffice?.office_title ||
      politician.office_title ||
      politician.metadata?.office_title
  );
  const viewForLabel = {
    ...politician,
    chamber: activeOffice?.chamber || politician.chamber,
    office_title: officeTitle,
    metadata: {
      ...(politician.metadata || {}),
      office_title: officeTitle,
    },
    district: activeOffice?.district || politician.district,
  };

  const meta = document.createElement("p");
  meta.className = "politician-card__meta";
  meta.textContent = [
    chamberLabel(viewForLabel.chamber, viewForLabel),
    politician.state,
    formatDistrictMeta(viewForLabel.district, viewForLabel),
  ]
    .filter(Boolean)
    .join(" · ");

  const extras = document.createElement("div");
  extras.className = "politician-card__extras";

  const party = document.createElement("span");
  party.className = `politician-card__party ${partyClass(politician.party)}`;
  party.textContent = politician.party || "Independent/Other";
  extras.append(party);

  const otherLevels = levels.filter((level) => level !== activeLevel);
  if (otherLevels.length) {
    const also = document.createElement("span");
    also.className = "politician-card__also-levels";
    also.textContent = `Also: ${otherLevels.map(levelLabel).join(", ")}`;
    extras.append(also);
  }

  const actions = document.createElement("div");
  actions.className = "politician-card__actions";

  if (politician.website_url) {
    const link = document.createElement("a");
    link.className = "bill-card__link";
    link.href = politician.website_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Site";
    actions.append(link);
  }

  const followBtn = document.createElement("button");
  followBtn.type = "button";
  followBtn.className = "refresh-btn politician-card__follow";

  const isDistrictOnly = Boolean(politician.metadata?.district_only);
  const isFollowed = politician.id && followedIds?.has(politician.id);
  followBtn.textContent = isDistrictOnly
    ? "District"
    : isFollowed
      ? "Following"
      : "Follow";
  if (isFollowed) followBtn.classList.add("is-following");
  if (isDistrictOnly) {
    followBtn.disabled = true;
    followBtn.title =
      politician.metadata?.note ||
      "This is a district match, not an individual officeholder.";
  }

  followBtn.addEventListener("click", async () => {
    if (isDistrictOnly) return;
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
  body.append(name, meta, extras);
  card.append(media, body, actions);
  return card;
}

function groupPoliticiansByLevel(politicians) {
  const people = politicians.map((politician) => ({
    ...politician,
    levels: politicianLevels(politician),
    offices: politicianOffices(politician),
  }));

  const byLevel = new Map(DISPLAY_LEVEL_ORDER.map((level) => [level, []]));
  for (const politician of people) {
    const levels = politician.levels.length
      ? politician.levels
      : [toDisplayLevel(politician.level || "local")];
    for (const level of levels) {
      const displayLevel = toDisplayLevel(level);
      if (!byLevel.has(displayLevel)) byLevel.set(displayLevel, []);
      byLevel.get(displayLevel).push(politician);
    }
  }

  for (const level of DISPLAY_LEVEL_ORDER) {
    const group = byLevel.get(level) || [];
    const unique = [];
    const seen = new Set();
    for (const politician of group) {
      const key = politician.external_key || politician.name;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(politician);
    }
    unique.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    byLevel.set(level, unique);
  }

  return byLevel;
}

function selectedLevelsLabel(selected, availableLevels) {
  if (!selected.size || selected.size === availableLevels.length) {
    return "All levels";
  }
  return availableLevels
    .filter((level) => selected.has(level))
    .map(levelLabel)
    .join(", ");
}

function renderPoliticianGroups(container, politicians, cardOptions = {}) {
  const byLevel = groupPoliticiansByLevel(politicians);
  const availableLevels = DISPLAY_LEVEL_ORDER.filter(
    (level) => (byLevel.get(level) || []).length > 0
  );

  if (!availableLevels.length) {
    container.replaceChildren();
    return;
  }

  // Fresh lookup always starts with every category checked/visible.
  const selected = new Set(availableLevels);
  const collapsed = container._collapsedLevels instanceof Set
    ? new Set(
        [...container._collapsedLevels].filter((level) =>
          availableLevels.includes(level)
        )
      )
    : new Set();

  container._politicianData = { politicians, cardOptions };
  container._selectedLevels = selected;
  container._collapsedLevels = collapsed;
  container.replaceChildren();

  const toolbar = document.createElement("div");
  toolbar.className = "politician-results-toolbar";

  const sortLabel = document.createElement("span");
  sortLabel.className = "politician-results-toolbar__label";
  sortLabel.textContent = "SORT BY";

  const filter = document.createElement("div");
  filter.className = "level-filter";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "level-filter__toggle";
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-haspopup", "true");

  const menu = document.createElement("div");
  menu.className = "level-filter__menu";
  menu.hidden = true;
  menu.setAttribute("role", "group");
  menu.setAttribute("aria-label", "Choose government levels to show");

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "politician-results-sections";

  function setMenuOpen(open) {
    menu.hidden = !open;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    filter.classList.toggle("is-open", open);
  }

  function refreshToggleLabel() {
    toggle.innerHTML = "";
    const text = document.createElement("span");
    text.textContent = selectedLevelsLabel(selected, availableLevels);
    const caret = document.createElement("span");
    caret.className = "level-filter__caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾";
    toggle.append(text, caret);
  }

  function syncCheckboxUi() {
    menu.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      if (box.value === "all") {
        box.checked = selected.size === availableLevels.length;
      } else {
        box.checked = selected.has(box.value);
      }
    });
  }

  function applySectionVisibility() {
    sectionsWrap.querySelectorAll(".politician-level-group").forEach((section) => {
      const level = section.dataset.level;
      const visible = selected.has(level);
      section.hidden = !visible;
      section.classList.toggle("is-hidden", !visible);
      section.classList.toggle("is-collapsed", collapsed.has(level));
      const arrow = section.querySelector(".politician-level-group__arrow");
      if (arrow) {
        arrow.textContent = collapsed.has(level) ? "▸" : "▾";
        arrow.setAttribute(
          "aria-label",
          collapsed.has(level) ? "Expand section" : "Collapse section"
        );
      }
      const header = section.querySelector(".politician-level-group__header");
      if (header) {
        header.setAttribute("aria-expanded", collapsed.has(level) ? "false" : "true");
      }
    });
    refreshToggleLabel();
  }

  // Build every available category section up front; checkboxes fold them.
  for (const level of availableLevels) {
    const group = byLevel.get(level) || [];

    const section = document.createElement("section");
    section.className = "politician-level-group";
    section.dataset.level = level;
    section.setAttribute("aria-label", levelLabel(level));

    const header = document.createElement("button");
    header.type = "button";
    header.className = "politician-level-group__header";
    header.setAttribute("aria-expanded", "true");

    const arrow = document.createElement("span");
    arrow.className = "politician-level-group__arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "▾";

    const title = document.createElement("h3");
    title.className = "politician-level-group__title";
    title.textContent = levelLabel(level);

    const count = document.createElement("span");
    count.className = "politician-level-group__count";
    count.textContent = `${group.length}`;

    header.append(arrow, title, count);

    header.addEventListener("click", () => {
      if (collapsed.has(level)) collapsed.delete(level);
      else collapsed.add(level);
      container._collapsedLevels = collapsed;
      applySectionVisibility();
    });

    const list = document.createElement("div");
    list.className = "politician-list";
    list.append(
      ...group.map((politician) =>
        renderPoliticianCard(politician, {
          ...cardOptions,
          sectionLevel: level,
        })
      )
    );

    section.append(header, list);
    sectionsWrap.append(section);
  }

  const allLabel = document.createElement("label");
  allLabel.className = "level-filter__option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.value = "all";
  allInput.checked = true;
  allLabel.append(allInput, document.createTextNode(" All levels"));
  menu.append(allLabel);

  for (const level of availableLevels) {
    const label = document.createElement("label");
    label.className = "level-filter__option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = level;
    input.checked = true;
    label.append(input, document.createTextNode(` ${levelLabel(level)}`));
    menu.append(label);
  }

  menu.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    if (input.value === "all") {
      selected.clear();
      if (input.checked) {
        availableLevels.forEach((level) => selected.add(level));
      }
    } else if (input.checked) {
      selected.add(input.value);
      // Re-checking a category unfolds it.
      collapsed.delete(input.value);
    } else {
      selected.delete(input.value);
    }

    // Keep at least one category visible.
    if (!selected.size) {
      availableLevels.forEach((level) => selected.add(level));
    }

    container._selectedLevels = selected;
    container._collapsedLevels = collapsed;
    syncCheckboxUi();
    applySectionVisibility();
  });

  toggle.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(menu.hidden);
  });

  if (container._levelFilterAbort) {
    container._levelFilterAbort.abort();
  }
  container._levelFilterAbort = new AbortController();
  const { signal } = container._levelFilterAbort;

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!filter.contains(event.target)) setMenuOpen(false);
    },
    { signal }
  );

  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    },
    { signal }
  );

  filter.append(toggle, menu);
  toolbar.append(sortLabel, filter);
  container.append(toolbar, sectionsWrap);
  setMenuOpen(false);
  applySectionVisibility();
}

function dedupeLookupPoliticians(politicians) {
  const map = new Map();
  for (const politician of politicians) {
    const key =
      (politician.bioguide_id &&
        `bioguide:${String(politician.bioguide_id).toLowerCase()}`) ||
      `name:${String(politician.state || "").toUpperCase()}:${String(
        politician.name || ""
      )
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .split(" ")
        .filter((part) => part.length > 1)
        .join(" ")}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...politician,
        levels: politicianLevels(politician),
        offices: politicianOffices(politician),
      });
      continue;
    }
    const levels = [
      ...new Set([
        ...politicianLevels(existing),
        ...politicianLevels(politician),
      ]),
    ].sort(
      (a, b) => DISPLAY_LEVEL_ORDER.indexOf(a) - DISPLAY_LEVEL_ORDER.indexOf(b)
    );
    const offices = [...politicianOffices(existing)];
    for (const office of politicianOffices(politician)) {
      const signature = `${office.level}|${office.office_title}|${office.district}`;
      if (
        !offices.some(
          (item) =>
            `${item.level}|${item.office_title}|${item.district}` === signature
        )
      ) {
        offices.push(office);
      }
    }
    map.set(key, {
      ...existing,
      ...politician,
      photo_url: existing.photo_url || politician.photo_url,
      website_url: existing.website_url || politician.website_url,
      phone: existing.phone || politician.phone,
      bioguide_id: existing.bioguide_id || politician.bioguide_id,
      levels,
      offices,
      metadata: {
        ...(existing.metadata || {}),
        ...(politician.metadata || {}),
        levels,
        offices,
      },
    });
  }
  return [...map.values()];
}

function politiciansResultsUrl(address) {
  return `politicians-results.html?address=${encodeURIComponent(address.trim())}`;
}

/** Search forms navigate to the results page; they do not render inline. */
function mountAddressLookup({ formId, inputId }) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  if (!form || !input) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const address = input.value.trim();
    if (!address) return;
    window.location.href = politiciansResultsUrl(address);
  });
}

function mountAddressResultsPage({
  statusId = "address-status",
  resultsId = "address-results",
  queryLabelId = "results-query",
} = {}) {
  const status = document.getElementById(statusId);
  const results = document.getElementById(resultsId);
  const queryLabel = document.getElementById(queryLabelId);
  if (!status || !results) return;

  const address = new URLSearchParams(window.location.search)
    .get("address")
    ?.trim();

  if (!address) {
    window.location.replace("politicians.html");
    return;
  }

  if (queryLabel) queryLabel.textContent = address;

  function setStatus(message, type = "loading") {
    status.hidden = !message;
    status.textContent = message;
    status.dataset.type = type;
  }

  (async () => {
    results.replaceChildren();
    setStatus("Looking up officials at every level of government…", "loading");

    try {
      await injectSupabaseScript().catch(() => {});
      const user = await getUser().catch(() => null);
      const followedIds = user
        ? await loadFollowedPoliticianIds(user.id)
        : new Set();

      const data = await lookupRepresentatives(address);
      const uniquePeople = dedupeLookupPoliticians(data.politicians || []);

      if (!uniquePeople.length) {
        setStatus(
          "No representatives found for that address. Try a fuller street address.",
          "error"
        );
        return;
      }

      const levelCounts = DISPLAY_LEVEL_ORDER.map((level) => {
        const count = uniquePeople.filter((p) =>
          politicianLevels(p).includes(level)
        ).length;
        return count ? `${levelLabel(level)} ${count}` : null;
      }).filter(Boolean);

      const resolvedAddress = data.address || address;
      if (queryLabel) queryLabel.textContent = resolvedAddress;

      setStatus(
        `${uniquePeople.length} people · ${levelCounts.join(" · ")}`,
        "success"
      );
      renderPoliticianGroups(results, uniquePeople, { followedIds, user });

      // SORT BY stays first; summary line sits directly under it.
      const toolbar = results.querySelector(".politician-results-toolbar");
      if (toolbar) {
        toolbar.after(status);
      } else {
        results.prepend(status);
      }

      Promise.all(
        uniquePeople.map(async (politician) => {
          if (politician.metadata?.district_only || politician.id) {
            return politician;
          }
          const row = await upsertPoliticianRecord(politician);
          if (row?.id) politician.id = row.id;
          return politician;
        })
      ).catch((error) => console.error(error));
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Address lookup failed.", "error");
    }
  })();
}
