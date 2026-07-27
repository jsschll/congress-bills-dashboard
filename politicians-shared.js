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
    case "cabinet":
      return "Cabinet";
    case "agency_director":
      return "Agency Director";
    case "supreme_court":
      return "Supreme Court";
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

function normalizeNationalOfficialRow(row) {
  if (!row || typeof row !== "object") return null;
  const fullName =
    row.full_name || row.name || row.official_name || row.fullName || "";
  if (!String(fullName).trim()) return null;
  return {
    id: row.id,
    full_name: String(fullName).trim(),
    title: row.title || row.office_title || row.position || "",
    category: row.category || row.type || row.group || row.section || "",
    branch: row.branch || "",
    department: row.department || row.agency || "",
  };
}

function classifyNationalOfficial(row) {
  const category = String(row.category || "").toLowerCase().trim();
  const hay = [row.category, row.branch, row.title, row.department]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    category === "agency director" ||
    category.includes("agency director") ||
    /agency\s+director/.test(hay)
  ) {
    return "agency_director";
  }
  if (
    category.includes("supreme") ||
    category.includes("court") ||
    /supreme|scotus|chief justice|\bjustices?\b|judicial/.test(hay)
  ) {
    return "supreme_court";
  }
  if (
    category.includes("cabinet") ||
    category.includes("secretary") ||
    /cabinet|secretary|attorney general/.test(hay)
  ) {
    return "cabinet";
  }
  return "other";
}

function nationalOfficialChamber(group) {
  if (group === "supreme_court") return "supreme_court";
  if (group === "agency_director") return "agency_director";
  return "cabinet";
}

function mapNationalOfficial(row) {
  const normalized = normalizeNationalOfficialRow(row) || row;
  const group = classifyNationalOfficial(normalized);
  const chamber = nationalOfficialChamber(group);
  const title =
    readableOfficeTitle(normalized.title) || normalized.department || "";
  return {
    external_key: `national:${normalized.id}`,
    bioguide_id: null,
    level: "federal",
    chamber,
    name: normalized.full_name || "Unknown",
    party: "",
    state: "US",
    district: "",
    photo_url: "",
    website_url: "",
    phone: "",
    source: "national_officials",
    office_title: title,
    metadata: {
      office_title: title,
      department: normalized.department || "",
      branch: normalized.branch || "",
      category: normalized.category || "",
      national_official_id: normalized.id,
      national_group: group,
    },
    levels: ["federal"],
    offices: [
      {
        level: "federal",
        chamber,
        office_title: title,
        district: "",
        source: "national_officials",
        external_key: `national:${normalized.id}`,
      },
    ],
  };
}

async function fetchNationalOfficialsViaRest() {
  if (!isSupabaseConfigured()) return { data: [], error: "Supabase is not configured." };

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/national_officials?select=*`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: "application/json",
      },
    }
  );

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error_description ||
      payload?.hint ||
      `national_officials request failed (${response.status})`;
    return { data: [], error: message };
  }

  return { data: Array.isArray(payload) ? payload : [], error: null };
}

/** Fetch every row from public.national_officials (nationwide; not address-based). */
async function fetchNationalOfficials() {
  try {
    if (typeof injectSupabaseScript === "function") {
      await injectSupabaseScript().catch((error) => {
        console.warn("Supabase script load warning:", error);
      });
    }

    const client = getSupabase();
    let rows = [];
    let errorMessage = null;

    if (client) {
      const { data, error } = await client.from("national_officials").select("*");

      if (error) {
        errorMessage = error.message || String(error);
        console.error("national_officials Supabase error:", error);
      } else {
        rows = data || [];
      }
    } else {
      console.warn(
        "Supabase client unavailable; falling back to REST for national_officials."
      );
    }

    if (!rows.length) {
      const rest = await fetchNationalOfficialsViaRest();
      if (rest.error) {
        errorMessage = rest.error;
        console.error("national_officials REST error:", rest.error);
      } else {
        rows = rest.data || [];
      }
    }

    if (!rows.length) {
      console.warn(
        "national_officials returned 0 rows. If the table is populated in Supabase, enable a public SELECT policy and GRANT SELECT to anon/authenticated.",
        errorMessage || ""
      );
      return [];
    }

    const mapped = rows
      .map(normalizeNationalOfficialRow)
      .filter(Boolean)
      .map(mapNationalOfficial);

    console.info(`Loaded ${mapped.length} national_officials`);
    return mapped;
  } catch (error) {
    console.error("fetchNationalOfficials failed:", error);
    return [];
  }
}

function appendPoliticianSubgroup(
  list,
  heading,
  politicians,
  cardOptions,
  sectionLevel,
  { startCollapsed = true } = {}
) {
  if (!politicians.length) return 0;

  const subgroup = document.createElement("div");
  subgroup.className = "politician-subgroup";
  if (startCollapsed) subgroup.classList.add("is-collapsed");

  const header = document.createElement("button");
  header.type = "button";
  header.className = "politician-subgroup__header";
  header.setAttribute("aria-expanded", startCollapsed ? "false" : "true");

  const arrow = document.createElement("span");
  arrow.className = "politician-subgroup__arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = startCollapsed ? "▸" : "▾";

  const title = document.createElement("h4");
  title.className = "politician-subgroup__title";
  title.textContent = heading;

  const count = document.createElement("span");
  count.className = "politician-subgroup__count";
  count.textContent = `${politicians.length}`;

  header.append(arrow, title, count);

  const body = document.createElement("div");
  body.className = "politician-subgroup__body";

  for (const politician of politicians) {
    body.append(
      renderPoliticianCard(politician, {
        ...cardOptions,
        sectionLevel,
      })
    );
  }

  header.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const collapsed = subgroup.classList.toggle("is-collapsed");
    arrow.textContent = collapsed ? "▸" : "▾";
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
  });

  subgroup.append(header, body);
  list.append(subgroup);
  return politicians.length;
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

function normalizePersonName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => part.length > 1)
    .join(" ");
}

function normalizeSchoolDistrictName(name) {
  return normalizePersonName(name)
    .replace(/\b(independent\s+)?school\s+district\b/g, " ")
    .replace(/\b(unified|elementary|secondary|high)\s+school\s+district\b/g, " ")
    .replace(/\bisd\b/g, " ")
    .replace(/\busd\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function personIdentityKeys(politician) {
  if (politician?.metadata?.district_only) {
    const keys = [];
    if (politician.external_key) {
      keys.push(`district:${politician.external_key}`);
    }
    // Merge Geocodio + Cicero placeholders for the same school district.
    const name = normalizeSchoolDistrictName(politician.name);
    const state = String(politician.state || "").toUpperCase();
    if (name) keys.push(`school-district:${state}:${name}`);
    return keys.length
      ? keys
      : [`district:${politician.external_key || politician.name}`];
  }

  const keys = [];
  if (politician.bioguide_id) {
    keys.push(`bioguide:${String(politician.bioguide_id).toLowerCase()}`);
  }
  const ciceroSk = politician.metadata?.cicero_sk;
  if (ciceroSk) keys.push(`cicero:${ciceroSk}`);

  const name = normalizePersonName(politician.name);
  const state = String(politician.state || "").toUpperCase();
  if (name) keys.push(`name:${state}:${name}`);

  if (politician.external_key) keys.push(`key:${politician.external_key}`);
  return keys;
}

function personIdentityKey(politician) {
  return personIdentityKeys(politician)[0] || `key:${politician.external_key || politician.name}`;
}

function mergeOfficeLists(existingOffices, incomingOffices) {
  const offices = [...existingOffices];
  for (const office of incomingOffices) {
    const signature = `${toDisplayLevel(office.level)}|${normalizePersonName(
      office.office_title
    )}|${String(office.district || "").toLowerCase()}`;
    const already = offices.some(
      (item) =>
        `${toDisplayLevel(item.level)}|${normalizePersonName(
          item.office_title
        )}|${String(item.district || "").toLowerCase()}` === signature
    );
    if (!already) offices.push(office);
  }
  return offices;
}

function mergePersonRecordsClient(existing, incoming) {
  const levels = [
    ...new Set([
      ...politicianLevels(existing),
      ...politicianLevels(incoming),
    ]),
  ].sort(
    (a, b) => DISPLAY_LEVEL_ORDER.indexOf(a) - DISPLAY_LEVEL_ORDER.indexOf(b)
  );
  const offices = mergeOfficeLists(
    politicianOffices(existing),
    politicianOffices(incoming)
  );

  return {
    ...existing,
    ...incoming,
    name:
      String(incoming.name || "").length > String(existing.name || "").length
        ? incoming.name
        : existing.name || incoming.name,
    photo_url: existing.photo_url || incoming.photo_url,
    website_url: existing.website_url || incoming.website_url,
    phone: existing.phone || incoming.phone,
    bioguide_id: existing.bioguide_id || incoming.bioguide_id,
    external_key: existing.external_key || incoming.external_key,
    levels,
    offices,
    metadata: {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {}),
      levels,
      offices,
    },
  };
}

function groupPoliticiansByLevel(politicians) {
  const people = politicians.map((politician) => ({
    ...politician,
    levels: politicianLevels(politician),
    offices: politicianOffices(politician),
  }));

  const byLevel = new Map(DISPLAY_LEVEL_ORDER.map((level) => [level, []]));
  for (const politician of people) {
    // One listing per government level this person holds.
    const levels = [
      ...new Set(
        (politician.levels.length
          ? politician.levels
          : [politician.level || "local"]
        ).map((level) => toDisplayLevel(level))
      ),
    ].filter((level) => DISPLAY_LEVEL_ORDER.includes(level));

    for (const displayLevel of levels) {
      if (!byLevel.has(displayLevel)) byLevel.set(displayLevel, []);
      byLevel.get(displayLevel).push(politician);
    }
  }

  for (const level of DISPLAY_LEVEL_ORDER) {
    const group = byLevel.get(level) || [];
    const unique = [];
    const seen = new Map();
    for (const politician of group) {
      const key = personIdentityKey(politician);
      const existing = seen.get(key);
      if (existing != null) {
        unique[existing] = mergePersonRecordsClient(unique[existing], politician);
        continue;
      }
      seen.set(key, unique.length);
      unique.push(politician);
    }
    unique.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    byLevel.set(level, unique);
  }

  return byLevel;
}

function selectedLevelsLabel(selected, availableLevels, showAll = false) {
  if (showAll || !selected.size || selected.size === availableLevels.length) {
    return "Show all";
  }
  return availableLevels
    .filter((level) => selected.has(level))
    .map(levelLabel)
    .join(", ");
}

function renderPoliticianGroups(container, politicians, cardOptions = {}) {
  const nationalOfficials = Array.isArray(cardOptions.nationalOfficials)
    ? cardOptions.nationalOfficials
    : [];
  const byLevel = groupPoliticiansByLevel(politicians);
  let availableLevels = DISPLAY_LEVEL_ORDER.filter(
    (level) => (byLevel.get(level) || []).length > 0
  );

  if (nationalOfficials.length && !availableLevels.includes("federal")) {
    availableLevels = DISPLAY_LEVEL_ORDER.filter(
      (level) => level === "federal" || availableLevels.includes(level)
    );
  }

  if (!availableLevels.length) {
    container.replaceChildren();
    return;
  }

  // Fresh lookup always starts in "Show all" mode (individuals unchecked).
  let showAll = true;
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
  container._showAllLevels = showAll;
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
    text.textContent = selectedLevelsLabel(selected, availableLevels, showAll);
    const caret = document.createElement("span");
    caret.className = "level-filter__caret";
    caret.setAttribute("aria-hidden", "true");
    caret.textContent = "▾";
    toggle.append(text, caret);
  }

  function syncCheckboxUi() {
    menu.querySelectorAll('input[type="checkbox"]').forEach((box) => {
      if (box.value === "all") {
        box.checked = showAll;
      } else {
        // In Show all mode, leave category boxes unmarked.
        box.checked = !showAll && selected.has(box.value);
      }
    });
  }

  function applySectionVisibility() {
    sectionsWrap.querySelectorAll(".politician-level-group").forEach((section) => {
      const level = section.dataset.level;
      const visible = showAll || selected.has(level);
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
    const group = (byLevel.get(level) || []).filter(
      (politician) => politician.source !== "national_officials"
    );

    const cabinet = level === "federal"
      ? nationalOfficials.filter((p) => p.metadata?.national_group === "cabinet")
      : [];
    const agencyDirectors = level === "federal"
      ? nationalOfficials.filter(
          (p) => p.metadata?.national_group === "agency_director"
        )
      : [];
    const justices = level === "federal"
      ? nationalOfficials.filter(
          (p) => p.metadata?.national_group === "supreme_court"
        )
      : [];
    const otherNational = level === "federal"
      ? nationalOfficials.filter((p) => p.metadata?.national_group === "other")
      : [];

    const totalCount =
      group.length +
      cabinet.length +
      agencyDirectors.length +
      justices.length +
      otherNational.length;
    if (!totalCount) continue;

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
    count.textContent = `${totalCount}`;

    header.append(arrow, title, count);

    header.addEventListener("click", () => {
      if (collapsed.has(level)) collapsed.delete(level);
      else collapsed.add(level);
      container._collapsedLevels = collapsed;
      applySectionVisibility();
    });

    const list = document.createElement("div");
    list.className = "politician-list";

    if (level === "federal") {
      if (group.length) {
        appendPoliticianSubgroup(
          list,
          "Congress & elected officials",
          group,
          cardOptions,
          level
        );
      }
      appendPoliticianSubgroup(
        list,
        "Cabinet Secretaries",
        cabinet,
        cardOptions,
        level
      );
      appendPoliticianSubgroup(
        list,
        "Federal Agency Directors",
        agencyDirectors,
        cardOptions,
        level
      );
      appendPoliticianSubgroup(
        list,
        "Supreme Court Justices",
        justices,
        cardOptions,
        level
      );
      if (otherNational.length) {
        appendPoliticianSubgroup(
          list,
          "Other national officials",
          otherNational,
          cardOptions,
          level
        );
      }
    } else {
      list.append(
        ...group.map((politician) =>
          renderPoliticianCard(politician, {
            ...cardOptions,
            sectionLevel: level,
          })
        )
      );
    }

    section.append(header, list);
    sectionsWrap.append(section);
  }

  const allLabel = document.createElement("label");
  allLabel.className = "level-filter__option";
  const allInput = document.createElement("input");
  allInput.type = "checkbox";
  allInput.value = "all";
  allInput.checked = true;
  allLabel.append(allInput, document.createTextNode(" Show all"));
  menu.append(allLabel);

  for (const level of availableLevels) {
    const label = document.createElement("label");
    label.className = "level-filter__option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = level;
    input.checked = false;
    label.append(input, document.createTextNode(` ${levelLabel(level)}`));
    menu.append(label);
  }

  menu.addEventListener("change", (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    if (input.value === "all") {
      if (input.checked) {
        showAll = true;
        selected.clear();
        availableLevels.forEach((level) => selected.add(level));
      } else {
        // Unchecking Show all with no categories picked keeps Show all on.
        showAll = true;
      }
    } else if (input.checked) {
      if (showAll) {
        showAll = false;
        selected.clear();
      }
      selected.add(input.value);
      collapsed.delete(input.value);
    } else {
      selected.delete(input.value);
      if (!selected.size) {
        showAll = true;
        availableLevels.forEach((level) => selected.add(level));
      }
    }

    container._selectedLevels = selected;
    container._showAllLevels = showAll;
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
  syncCheckboxUi();
  applySectionVisibility();
}

function dedupeLookupPoliticians(politicians) {
  const records = [];
  const keyToIndex = new Map();

  for (const politician of politicians) {
    if (!politician?.name) continue;

    const keys = personIdentityKeys(politician);
    let index = null;
    for (const key of keys) {
      if (keyToIndex.has(key)) {
        index = keyToIndex.get(key);
        break;
      }
    }

    if (index == null) {
      index = records.length;
      records.push({
        ...politician,
        levels: politicianLevels(politician),
        offices: politicianOffices(politician),
      });
    } else {
      records[index] = mergePersonRecordsClient(records[index], politician);
    }

    for (const key of personIdentityKeys(records[index])) {
      keyToIndex.set(key, index);
    }
  }

  return records;
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
    setStatus(
      "Loading nationwide officials and looking up district representatives…",
      "loading"
    );

    try {
      await injectSupabaseScript().catch(() => {});
      const user = await getUser().catch(() => null);
      const followedIds = user
        ? await loadFollowedPoliticianIds(user.id)
        : new Set();

      // Nationwide roles never depend on address — always load the full table.
      // Address lookup only supplies district / local officeholders.
      const [lookupResult, nationalOfficials] = await Promise.all([
        lookupRepresentatives(address)
          .then((data) => ({ ok: true, data }))
          .catch((error) => ({
            ok: false,
            error: error?.message || String(error) || "Address lookup failed.",
          })),
        fetchNationalOfficials(),
      ]);

      const uniquePeople = lookupResult.ok
        ? dedupeLookupPoliticians(lookupResult.data.politicians || []).filter(
            (politician) => politician.source !== "national_officials"
          )
        : [];

      if (!uniquePeople.length && !nationalOfficials.length) {
        setStatus(
          lookupResult.ok
            ? "No representatives found for that address. Try a fuller street address."
            : lookupResult.error,
          "error"
        );
        return;
      }

      const resolvedAddress = lookupResult.ok
        ? lookupResult.data.address || address
        : address;
      if (queryLabel) queryLabel.textContent = resolvedAddress;

      const levelCounts = DISPLAY_LEVEL_ORDER.map((level) => {
        let count = uniquePeople.filter((p) =>
          politicianLevels(p).includes(level)
        ).length;
        if (level === "federal") count += nationalOfficials.length;
        return count ? `${levelLabel(level)} ${count}` : null;
      }).filter(Boolean);

      const localCount = uniquePeople.length;
      const nationalCount = nationalOfficials.length;
      const summaryParts = [
        nationalCount
          ? `${nationalCount} nationwide (Cabinet, agencies, Court)`
          : null,
        localCount ? `${localCount} for this address` : null,
        levelCounts.length ? levelCounts.join(" · ") : null,
      ].filter(Boolean);

      if (!lookupResult.ok && nationalCount) {
        setStatus(
          `${summaryParts.join(" · ")}. Address lookup failed: ${lookupResult.error}`,
          "error"
        );
      } else if (!localCount && nationalCount) {
        setStatus(
          `${summaryParts.join(" · ")}. No district officials found for that address.`,
          "success"
        );
      } else {
        setStatus(summaryParts.join(" · "), "success");
      }

      renderPoliticianGroups(results, uniquePeople, {
        followedIds,
        user,
        nationalOfficials,
      });

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
