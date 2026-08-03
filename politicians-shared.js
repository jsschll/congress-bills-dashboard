const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS",
  "KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY",
  "NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV",
  "WI","WY","DC",
];

const US_STATE_NAMES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "District of Columbia",
};

function stateDisplayName(stateCode) {
  const code = String(stateCode || "").toUpperCase().trim();
  return US_STATE_NAMES[code] || code || "this state";
}

function normalizeStateCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (US_STATE_NAMES[upper]) return upper;
  const byName = Object.entries(US_STATE_NAMES).find(
    ([, name]) => name.toLowerCase() === raw.toLowerCase()
  );
  return byName ? byName[0] : upper.slice(0, 2);
}

const LEVEL_ORDER = ["federal", "state", "county", "city", "school", "local"];

// User-facing buckets from highest to lowest authority.
const DISPLAY_LEVEL_ORDER = ["federal", "state", "county", "city", "school"];

const LEVEL_LABELS = {
  federal: "Federal",
  state: "State",
  county: "County",
  city: "Municipal",
  school: "School",
  local: "Municipal",
  municipal: "Municipal",
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

function politicianProfileHref(politician = {}) {
  const bioguide =
    politician.bioguide_id || politician.bioguideId || politician.bioguide || "";
  const key = politician.external_key || "";
  const id = politician.id || politician.politician_id || "";
  const nationalId = politician.metadata?.national_official_id || "";
  const chamber = String(politician.chamber || "").toLowerCase();
  const level = String(politician.level || "").toLowerCase();
  const isFederalLegislator =
    Boolean(bioguide) ||
    (level === "federal" && (chamber === "house" || chamber === "senate"));

  // Federal House/Senate → same Representative Scorecard as home ZIP lookup.
  if (bioguide) {
    return `representatives.html?bioguideId=${encodeURIComponent(
      String(bioguide).toUpperCase()
    )}`;
  }
  if (isFederalLegislator && id) {
    // Roster UUID — scorecard resolves politicians.id → representative_profiles.
    return `representatives.html?politicianId=${encodeURIComponent(String(id))}`;
  }

  // National executives (President, cabinet, EOP) are keyed off national_officials,
  // not always present as a politicians-table UUID on browse cards.
  if (
    key ||
    politician.source === "national_officials" ||
    nationalId
  ) {
    const nationalKey =
      key ||
      (nationalId ? `national:${nationalId}` : "");
    if (nationalKey) {
      return `politician.html?key=${encodeURIComponent(nationalKey)}`;
    }
  }

  if (id) return `politician.html?id=${encodeURIComponent(id)}`;
  return "";
}

function sponsorProfileHref(sponsor = {}) {
  return politicianProfileHref({
    bioguide_id: sponsor.bioguideId || sponsor.bioguide_id || "",
    id: sponsor.id || "",
    external_key: sponsor.external_key || "",
    name: sponsor.name || sponsor.fullName || "",
  });
}

function ordinalDistrict(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value || "");
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1:
      return `${num}st`;
    case 2:
      return `${num}nd`;
    case 3:
      return `${num}rd`;
    default:
      return `${num}th`;
  }
}

function formatPoliticianRoleLabel(politician = {}) {
  if (politician.role_label) return politician.role_label;
  const office = readableOfficeTitle(
    politician.office_title || politician.metadata?.office_title
  );
  const state = String(politician.state || "").toUpperCase();
  const chamber = String(politician.chamber || "").toLowerCase();
  const district = politician.district;

  if (politician.level === "federal" || chamber === "house" || chamber === "senate") {
    if (chamber === "senate") {
      return state ? `US Senate · ${state}` : office || "US Senate";
    }
    if (chamber === "house") {
      if (
        state &&
        district != null &&
        district !== "" &&
        !/^statewide$/i.test(String(district))
      ) {
        return `US House · ${state} ${ordinalDistrict(district)} District`;
      }
      return state ? `US House · ${state}` : office || "US House";
    }
  }

  return [office || chamberLabel(chamber, politician), state, formatDistrictMeta(district, politician)]
    .filter(Boolean)
    .join(" · ");
}

function mapPoliticianSocialLinks(politician = {}) {
  const links = [];
  const social = politician.metadata?.social || {};
  const pairs = [
    ["twitter", "Twitter / X"],
    ["twitter_url", "Twitter / X"],
    ["x", "Twitter / X"],
    ["facebook", "Facebook"],
    ["facebook_url", "Facebook"],
    ["youtube", "YouTube"],
    ["youtube_url", "YouTube"],
    ["instagram", "Instagram"],
  ];
  const seen = new Set();
  for (const [key, label] of pairs) {
    let value = social[key];
    if (!value) continue;
    value = String(value).trim();
    if (!value) continue;
    if (!/^https?:\/\//i.test(value)) {
      if (/twitter|x/i.test(key)) {
        value = `https://twitter.com/${value.replace(/^@/, "")}`;
      } else if (/facebook/i.test(key)) {
        value = `https://facebook.com/${value}`;
      } else if (/youtube/i.test(key)) {
        value = `https://youtube.com/${value}`;
      } else if (/instagram/i.test(key)) {
        value = `https://instagram.com/${value.replace(/^@/, "")}`;
      }
    }
    if (seen.has(label)) continue;
    seen.add(label);
    links.push({ label, url: value });
  }

  const channels = politician.metadata?.channels || [];
  if (Array.isArray(channels)) {
    for (const channel of channels) {
      const type = String(channel.type || channel.id || "").toLowerCase();
      const id = String(channel.id || channel.value || "").trim();
      if (!id) continue;
      let label = "";
      let url = id;
      if (type.includes("twitter") || type === "x") {
        label = "Twitter / X";
        if (!/^https?:\/\//i.test(url)) {
          url = `https://twitter.com/${id.replace(/^@/, "")}`;
        }
      } else if (type.includes("facebook")) {
        label = "Facebook";
        if (!/^https?:\/\//i.test(url)) url = `https://facebook.com/${id}`;
      } else if (type.includes("youtube")) {
        label = "YouTube";
        if (!/^https?:\/\//i.test(url)) url = `https://youtube.com/${id}`;
      }
      if (!label || seen.has(label)) continue;
      seen.add(label);
      links.push({ label, url });
    }
  }
  return links;
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
    case "white_house":
      return "White House / Executive Office";
    case "governor":
      return "Governor";
    case "lieutenant_governor":
      return "Lieutenant Governor";
    case "attorney_general":
      return "Attorney General";
    case "secretary_of_state":
      return "Secretary of State";
    case "state_treasurer":
      return "State Treasurer";
    case "state_executive":
      return "State Executive";
    case "judicial":
      return "Judge";
    case "state_supreme":
      return "State Supreme Court";
    case "state_criminal_appeals":
      return "Court of Criminal Appeals";
    case "state_appeals":
      return "Court of Appeals";
    case "state_district":
      return "District Court";
    case "county_court":
      return "County Court";
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
  if (!client || !politician) return null;

  const bioguide = String(
    politician.bioguide_id || politician.bioguideId || ""
  )
    .trim()
    .toUpperCase();
  const level = String(politician.level || "federal").toLowerCase();
  const name = String(politician.name || "").trim();
  if (!name) {
    console.error("upsertPoliticianRecord: missing name");
    return null;
  }

  let externalKey = String(politician.external_key || "").trim();
  if (!externalKey && bioguide) {
    externalKey = `federal:${bioguide}`;
  }
  if (!externalKey) {
    const state = String(politician.state || "xx").toLowerCase();
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    externalKey = `${level}:${state}:${slug}`;
  }

  // Keep the in-memory person in sync so follow / notes can reuse the key.
  politician.external_key = externalKey;
  if (bioguide) politician.bioguide_id = bioguide;
  if (!politician.level) politician.level = level;

  const officeTitle =
    politician.office_title ||
    politician.metadata?.office_title ||
    politician.role_label ||
    politician.chamber ||
    null;

  const payload = {
    p_external_key: externalKey,
    p_bioguide_id: bioguide || null,
    p_level: level === "local" ? "local" : level,
    p_chamber: politician.chamber || null,
    p_name: name,
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
    const err = new Error(error.message || "Could not save official.");
    err.cause = error;
    throw err;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.id) politician.id = row.id;
  return row || null;
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

function normalizePartyLabel(party) {
  const value = String(party || "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (lower.startsWith("dem")) return "Democrat";
  if (lower.startsWith("rep")) return "Republican";
  if (lower.startsWith("ind")) return "Independent";
  if (lower.includes("nonpartisan") || lower.includes("non-partisan")) {
    return "Nonpartisan";
  }
  return value;
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
    party: normalizePartyLabel(row.party || row.party_name || ""),
    photo_url: row.photo_url || row.photoUrl || row.image_url || row.image || "",
  };
}

/** Fallback portraits/party when DB rows predate party/photo_url columns. */
const NATIONAL_EXECUTIVE_DEFAULTS = {
  "donald j trump": {
    party: "Republican",
    photo_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg/960px-January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg",
  },
  "donald trump": {
    party: "Republican",
    photo_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg/960px-January_2025_Official_Presidential_Portrait_of_Donald_J._Trump.jpg",
  },
  "jd vance": {
    party: "Republican",
    photo_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg/960px-January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg",
  },
  "j d vance": {
    party: "Republican",
    photo_url:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg/960px-January_2025_Official_Vice_Presidential_Portrait_of_JD_Vance.jpg",
  },
};

function nationalExecutiveDefaults(fullName) {
  const key = String(fullName || "")
    .toLowerCase()
    .replace(/[.'’]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return NATIONAL_EXECUTIVE_DEFAULTS[key] || null;
}

function officeTitleText(personOrTitle) {
  if (personOrTitle && typeof personOrTitle === "object") {
    return String(
      personOrTitle.office_title ||
        personOrTitle.metadata?.office_title ||
        personOrTitle.title ||
        personOrTitle.chamber ||
        ""
    );
  }
  return String(personOrTitle || "");
}

/** True only for the U.S. President or Vice President — not other executive-branch offices. */
function isPresidentOrVicePresidentTitle(title) {
  const raw = officeTitleText(title).toLowerCase().replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (
    /pro\s+tempore|president\s+pro|university|college|board|senate|council|company|bank/.test(
      raw
    )
  ) {
    return false;
  }
  if (
    raw === "vice president" ||
    /^vice\s+president\b/.test(raw) ||
    /\bvice\s+president\s+of\s+the\s+united\s+states\b/.test(raw)
  ) {
    return true;
  }
  if (
    raw === "president" ||
    /^president\b/.test(raw) ||
    /\bpresident\s+of\s+the\s+united\s+states\b/.test(raw)
  ) {
    return true;
  }
  return false;
}

/**
 * Classify a federal officeholder into national subgroups.
 * Used for national_officials rows and Cicero/Geocodio executives saved in politicians.
 */
function classifyFederalOfficeGroup(personOrRow) {
  const category = String(
    personOrRow?.category || personOrRow?.metadata?.category || ""
  )
    .toLowerCase()
    .trim();
  const title = officeTitleText(personOrRow).toLowerCase();
  const department = String(
    personOrRow?.department || personOrRow?.metadata?.department || ""
  ).toLowerCase();
  const blob = `${category} ${title} ${department}`;
  const existingGroup = String(
    personOrRow?.metadata?.national_group || ""
  ).toLowerCase();

  if (
    existingGroup === "executive" ||
    category === "president" ||
    category === "vice president" ||
    isPresidentOrVicePresidentTitle(title)
  ) {
    // Only the two elected White House principals — never generic "executive" / EOP staff.
    if (
      category === "president" ||
      category === "vice president" ||
      isPresidentOrVicePresidentTitle(title)
    ) {
      return "executive";
    }
  }

  if (
    existingGroup === "supreme_court" ||
    category === "supreme court" ||
    category.includes("supreme court") ||
    (category.includes("supreme") && category.includes("justice"))
  ) {
    return "supreme_court";
  }
  if (
    existingGroup === "cabinet" ||
    category === "cabinet secretary" ||
    category.includes("cabinet")
  ) {
    return "cabinet";
  }
  if (
    existingGroup === "agency_director" ||
    category === "agency director" ||
    category.includes("agency director")
  ) {
    return "agency_director";
  }
  if (
    existingGroup === "white_house" ||
    category.includes("white house") ||
    category.includes("executive office") ||
    category === "eop"
  ) {
    return "white_house";
  }

  // Title heuristics (Cicero NATIONAL_EXEC rows often only have chamber=executive).
  if (
    /supreme\s+court|scotus|chief\s+justice/.test(title) ||
    (/\bassociate\s+justice\b|\bjustices?\b/.test(title) &&
      !/department of justice|attorney general/.test(blob))
  ) {
    return "supreme_court";
  }
  if (
    (/\bsecretary of\b|\battorney general\b/.test(blob) ||
      /cabinet/.test(blob)) &&
    !/deputy|assistant|under\s+secretary|acting\s+assistant/.test(title)
  ) {
    return "cabinet";
  }
  if (
    /white\s+house|chief\s+of\s+staff|council of economic advis|office of science and technology|united nations|trade representative|\bustr\b|national security advis|domestic policy council|council on environmental quality|executive office of the president/.test(
      blob
    )
  ) {
    return "white_house";
  }
  if (
    /agency\s+director|administrator|\bdirector of\b|\bcommissioner\b|national intelligence|\bfbi\b|\bcia\b|\bepa\b|\bfema\b|secret service|\bnasa\b|management and budget|\bomb\b|small business administration/.test(
      blob
    )
  ) {
    return "agency_director";
  }
  if (String(personOrRow?.chamber || "").toLowerCase() === "executive") {
    // Remaining national EXEC offices (not Congress) → White House / EOP bucket.
    return "white_house";
  }
  return "other";
}

function classifyNationalOfficial(row) {
  return classifyFederalOfficeGroup(row);
}

function nationalOfficialChamber(group) {
  if (group === "supreme_court") return "supreme_court";
  if (group === "agency_director") return "agency_director";
  if (group === "executive") return "executive";
  if (group === "white_house") return "white_house";
  return "cabinet";
}

function isFederalExecutivePerson(person) {
  // Never treat generic chamber=executive (Chief of Staff, OMB, etc.) as POTUS/VP.
  return isPresidentOrVicePresidentTitle(person);
}

/** First + last token only, so "Howard W. Lutnick" matches "Howard Lutnick". */
function normalizePersonNameLoose(name) {
  const parts = normalizePersonName(name).split(" ").filter(Boolean);
  if (parts.length <= 1) return parts.join(" ");
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function mapNationalOfficial(row) {
  const normalized = normalizeNationalOfficialRow(row) || row;
  const group = classifyNationalOfficial(normalized);
  const chamber = nationalOfficialChamber(group);
  const title =
    readableOfficeTitle(normalized.title) || normalized.department || "";
  const defaults =
    group === "executive"
      ? nationalExecutiveDefaults(normalized.full_name)
      : null;
  const party =
    normalizePartyLabel(normalized.party) ||
    defaults?.party ||
    "";
  const photoUrl = normalized.photo_url || defaults?.photo_url || "";
  return {
    external_key: `national:${normalized.id}`,
    bioguide_id: null,
    level: "federal",
    chamber,
    name: normalized.full_name || "Unknown",
    party,
    state: "US",
    district: "",
    photo_url: photoUrl,
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

/** Normalize a politicians-table row into the shape used by result cards. */
function normalizeStoredPolitician(row) {
  if (!row) return null;
  const officeTitle =
    row.office_title || row.metadata?.office_title || row.chamber || "";
  const level = row.level || "federal";
  return {
    ...row,
    office_title: officeTitle,
    metadata: {
      ...(row.metadata || {}),
      office_title: officeTitle,
    },
    levels: Array.isArray(row.levels)
      ? row.levels
      : Array.isArray(row.metadata?.levels)
        ? row.metadata.levels
        : [level],
    offices: Array.isArray(row.offices)
      ? row.offices
      : Array.isArray(row.metadata?.offices)
        ? row.metadata.offices
        : [
            {
              level,
              chamber: row.chamber || "",
              office_title: officeTitle,
              district: row.district || "",
              source: row.source || "politicians",
              external_key: row.external_key,
            },
          ],
  };
}

/**
 * Nationwide federal executives saved from prior Cicero lookups
 * (White House / EOP, and any cabinet/agency rows not yet in national_officials).
 * Address search alone often omits these when Cicero is unavailable.
 */
async function fetchStoredFederalExecutives() {
  if (!isSupabaseConfigured()) return [];

  try {
    await injectSupabaseScript().catch(() => {});
    const client = getSupabase();
    if (client) {
      const { data, error } = await client
        .from("politicians")
        .select("*")
        .eq("level", "federal")
        .eq("chamber", "executive")
        .order("name");
      if (error) {
        console.error("stored federal executives error:", error);
      } else if (Array.isArray(data) && data.length) {
        return data.map(normalizeStoredPolitician).filter(Boolean);
      }
    }

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/politicians?select=*&level=eq.federal&chamber=eq.executive&order=name`,
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
      console.error("stored federal executives REST error:", payload);
      return [];
    }
    return (Array.isArray(payload) ? payload : [])
      .map(normalizeStoredPolitician)
      .filter(Boolean);
  } catch (error) {
    console.error("fetchStoredFederalExecutives failed:", error);
    return [];
  }
}

function normalizeCountyName(value) {
  return String(value || "")
    .replace(/\s+county$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCityName(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/\s+city$/i, "")
    .trim();
}

function normalizeDistrictToken(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw.toLowerCase();
}

function parseDistrictNumberList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  if (value == null || value === "") return [];
  if (typeof value === "number") return [String(value)];
  return [
    ...new Set(
      String(value)
        .split(/[,;/|]+/)
        .map((part) => part.trim())
        .filter(Boolean)
    ),
  ];
}

function districtNumbersMatch(left, rightList) {
  const leftToken = normalizeDistrictToken(left);
  if (!leftToken) return false;
  return (rightList || []).some((value) => {
    const rightToken = normalizeDistrictToken(value);
    return (
      rightToken &&
      (leftToken === rightToken ||
        String(left).trim().toLowerCase() === String(value).trim().toLowerCase())
    );
  });
}

function isStateExecutiveOfficeTitle(titleOrChamber = "") {
  const text = String(titleOrChamber || "").toLowerCase();
  if (!text) return false;
  if (text.includes("lieutenant governor") || text.includes("lt. governor")) {
    return true;
  }
  if (/\bgovernor\b/.test(text) && !text.includes("lieutenant")) return true;
  if (text.includes("attorney general")) return true;
  if (
    text.includes("secretary of state") ||
    text.includes("secretary of the commonwealth")
  ) {
    return true;
  }
  if (
    text.includes("treasurer") ||
    text.includes("comptroller") ||
    text.includes("chief financial officer") ||
    text.includes("state auditor")
  ) {
    return true;
  }
  return false;
}

function isStatewideHighCourtTitle(title = "", agency = "", chamber = "") {
  const titleLower = String(title || "").toLowerCase();
  const agencyLower = String(agency || "").toLowerCase();
  const chamberLower = String(chamber || "").toLowerCase();
  if (isStateExecutiveOfficeTitle(titleLower) || isStateExecutiveOfficeTitle(agencyLower)) {
    return false;
  }
  if (
    chamberLower.includes("state_supreme") ||
    chamberLower.includes("state_criminal_appeals")
  ) {
    return true;
  }
  if (agencyLower.includes("criminal appeals")) return true;
  if (agencyLower.includes("supreme") && agencyLower.includes("court")) return true;
  if (
    (titleLower.includes("justice") ||
      titleLower.includes("chief justice") ||
      (titleLower.includes("judge") && !titleLower.includes("trial"))) &&
    (agencyLower.includes("supreme") ||
      agencyLower.includes("criminal appeals") ||
      agencyLower.includes("high court"))
  ) {
    return true;
  }
  return false;
}

function mapStateOfficialRow(row) {
  const level = String(row.level || "").trim();
  const levelKey = level.toLowerCase();
  const title = readableOfficeTitle(row.title) || "";
  const agency = readableOfficeTitle(row.court_or_agency) || "";
  const titleLower = title.toLowerCase();
  const agencyLower = agency.toLowerCase();
  const blob = `${titleLower} ${agencyLower}`;

  // Prefer "Chief Justice, Texas Supreme Court" when title and agency are split.
  // Skip appending generic branch labels — title alone is clearer.
  const officeTitle =
    title &&
    agency &&
    agencyLower !== "executive branch" &&
    agencyLower !== "legislative branch" &&
    !titleLower.includes(agencyLower)
      ? `${title}, ${agency}`
      : title || agency;

  let chamber = "state_executive";
  let courtGroup = "leadership";
  if (levelKey === "statewide") {
    const isExecAgency =
      agencyLower === "executive branch" ||
      agencyLower.includes("office of the governor") ||
      agencyLower.includes("office of the lieutenant") ||
      agencyLower.includes("office of the attorney") ||
      agencyLower.includes("office of the secretary") ||
      agencyLower.includes("office of the treasurer") ||
      agencyLower.includes("office of the comptroller");
    const isExecTitle = isStateExecutiveOfficeTitle(title) || isStateExecutiveOfficeTitle(blob);

    if (isExecAgency || isExecTitle) {
      courtGroup = "executive";
      if (
        titleLower.includes("lieutenant governor") ||
        titleLower.includes("lt. governor") ||
        titleLower.includes("lt governor")
      ) {
        chamber = "lieutenant_governor";
      } else if (/\bgovernor\b/.test(titleLower)) {
        chamber = "governor";
      } else if (blob.includes("attorney general")) {
        chamber = "attorney_general";
      } else if (
        titleLower.includes("secretary of state") ||
        titleLower.includes("secretary of the commonwealth")
      ) {
        chamber = "secretary_of_state";
      } else if (
        titleLower.includes("treasurer") ||
        titleLower.includes("comptroller") ||
        titleLower.includes("chief financial") ||
        titleLower.includes("state auditor")
      ) {
        chamber = "state_treasurer";
      } else {
        chamber = "state_executive";
      }
    } else if (isStatewideHighCourtTitle(title, agency, "")) {
      courtGroup = "statewide";
      if (agencyLower.includes("criminal appeals") || titleLower.includes("criminal appeals")) {
        chamber = "state_criminal_appeals";
      } else {
        chamber = "state_supreme";
      }
    } else if (agencyLower.includes("court")) {
      // Other statewide courts (not supreme / CCA) still count as high-court adjacent.
      courtGroup = "statewide";
      chamber = "judicial";
    } else {
      // Unknown statewide non-judicial → keep out of High Courts.
      courtGroup = "executive";
      chamber = "state_executive";
    }
  } else if (levelKey === "appellate") {
    courtGroup = "appellate";
    chamber = "state_appeals";
  } else if (levelKey === "legislative") {
    courtGroup = "legislative";
    if (titleLower.includes("senator") || agencyLower.includes("senate")) {
      chamber = "state_senate";
    } else if (
      titleLower.includes("assembly") ||
      agencyLower.includes("assembly")
    ) {
      chamber = "state_house";
    } else {
      chamber = "state_house";
    }
  } else if (levelKey === "district") {
    courtGroup = "district";
    chamber = "state_district";
  } else if (levelKey.startsWith("county")) {
    // Matches "County" and "County/Magistrate"
    courtGroup = "county";
    chamber = "county_court";
  }

  const district = String(row.district_number || row.county_name || "");
  const selectionMethod = String(row.selection_method || "")
    .trim()
    .toLowerCase();
  const appointedBy = String(row.appointed_by || "").trim();

  return {
    external_key: `state-official:${row.id}`,
    bioguide_id: null,
    level: "state",
    chamber,
    name: row.full_name || "Unknown",
    party: normalizePartyLabel(row.party || ""),
    state: String(row.state_code || "").toUpperCase(),
    district,
    photo_url: row.photo_url || "",
    website_url: "",
    phone: "",
    source: "state_officials",
    office_title: officeTitle,
    metadata: {
      office_title: officeTitle,
      court_name: agency || officeTitle,
      court_or_agency: agency,
      court_group: courtGroup,
      official_level: level,
      county: normalizeCountyName(row.county_name),
      district_number: row.district_number != null ? String(row.district_number) : "",
      state_official_id: row.id,
      party: normalizePartyLabel(row.party || ""),
      selection_method: selectionMethod || "",
      appointed_by: appointedBy || "",
    },
    levels: ["state"],
    offices: [
      {
        level: "state",
        chamber,
        office_title: officeTitle,
        district,
        source: "state_officials",
        external_key: `state-official:${row.id}`,
      },
    ],
  };
}

/**
 * Option A: 2-step address lookup
 * 1) county_district_mapping by state_code + county_name
 *    -> appellate_district_numbers[], judicial_district_numbers[]
 * 2) state_officials for Statewide / Appellate / District / County/Magistrate
 */
async function fetchStateOfficialsForAddress({
  state_code,
  county_name,
  state_senate_districts = [],
  state_house_districts = [],
} = {}) {
  const stateCode = normalizeStateCode(state_code);
  const countyName = normalizeCountyName(county_name);
  if (!stateCode) return [];

  try {
    if (typeof injectSupabaseScript === "function") {
      await injectSupabaseScript().catch(() => {});
    }
    const client = getSupabase();
    if (!client) {
      console.warn("Supabase client unavailable for state_officials lookup.");
      return [];
    }

    let mapping = null;
    if (countyName) {
      const countyVariants = [
        countyName,
        `${countyName} County`,
        countyName.replace(/\s+parish$/i, ""),
      ];
      for (const variant of countyVariants) {
        const { data, error } = await client
          .from("county_district_mapping")
          .select("*")
          .eq("state_code", stateCode)
          .ilike("county_name", variant)
          .limit(1);
        if (error) {
          console.error("county_district_mapping error:", error);
          break;
        }
        if (data?.length) {
          mapping = data[0];
          break;
        }
      }

      // Fallback: contains match (e.g. mapping stored as "Fort Bend County")
      if (!mapping) {
        const { data, error } = await client
          .from("county_district_mapping")
          .select("*")
          .eq("state_code", stateCode)
          .ilike("county_name", `%${countyName}%`)
          .limit(1);
        if (error) console.error("county_district_mapping fallback:", error);
        mapping = data?.[0] || null;
      }
    }

    const appellateNumbers = parseDistrictNumberList(
      mapping?.appellate_district_numbers ?? mapping?.appellate_district_number
    );
    const judicialNumbers = parseDistrictNumberList(
      mapping?.judicial_district_numbers
    );
    const senateDistricts = parseDistrictNumberList(state_senate_districts);
    const houseDistricts = parseDistrictNumberList(state_house_districts);
    const legislativeDistricts = [...new Set([...senateDistricts, ...houseDistricts])];

    // Fetch by level, then filter Appellate/District/Legislative client-side.
    const queries = [
      client
        .from("state_officials")
        .select("*")
        .eq("state_code", stateCode)
        .eq("level", "Statewide"),
      appellateNumbers.length
        ? client
            .from("state_officials")
            .select("*")
            .eq("state_code", stateCode)
            .eq("level", "Appellate")
        : Promise.resolve({ data: [], error: null }),
      judicialNumbers.length
        ? client
            .from("state_officials")
            .select("*")
            .eq("state_code", stateCode)
            .eq("level", "District")
        : Promise.resolve({ data: [], error: null }),
      countyName
        ? client
            .from("state_officials")
            .select("*")
            .eq("state_code", stateCode)
            .in("level", ["County/Magistrate", "County"])
        : Promise.resolve({ data: [], error: null }),
      legislativeDistricts.length
        ? client
            .from("state_officials")
            .select("*")
            .eq("state_code", stateCode)
            .eq("level", "Legislative")
        : Promise.resolve({ data: [], error: null }),
    ];

    const [
      statewideRes,
      appellateRes,
      districtRes,
      countyRes,
      legislativeRes,
    ] = await Promise.all(queries);

    for (const result of [
      statewideRes,
      appellateRes,
      districtRes,
      countyRes,
      legislativeRes,
    ]) {
      if (result.error) console.error("state_officials query error:", result.error);
    }

    const appellateRows = (appellateRes.data || []).filter((row) =>
      districtNumbersMatch(row.district_number, appellateNumbers)
    );
    const districtRows = (districtRes.data || []).filter((row) =>
      districtNumbersMatch(row.district_number, judicialNumbers)
    );
    const countyRows = (countyRes.data || []).filter((row) => {
      if (!countyName) return false;
      return (
        normalizeCountyName(row.county_name).toLowerCase() ===
        countyName.toLowerCase()
      );
    });
    const legislativeRows = (legislativeRes.data || []).filter((row) => {
      const title = String(row.title || "").toLowerCase();
      const isSenate =
        title.includes("senator") || title.includes("senate");
      const pool = isSenate ? senateDistricts : houseDistricts.length ? houseDistricts : legislativeDistricts;
      return districtNumbersMatch(row.district_number, pool);
    });

    const rows = [
      ...(statewideRes.data || []),
      ...appellateRows,
      ...districtRows,
      ...countyRows,
      ...legislativeRows,
    ];

    console.info(
      `state_officials loaded ${rows.length} rows for ${stateCode}/${countyName || "(no county)"}`,
      {
        mapping,
        appellateNumbers,
        judicialNumbers,
        senateDistricts,
        houseDistricts,
      }
    );

    return dedupePoliticiansInGroup(rows.map(mapStateOfficialRow));
  } catch (error) {
    console.error("fetchStateOfficialsForAddress failed:", error);
    return [];
  }
}

function mapLocalOfficialRow(row) {
  const title = readableOfficeTitle(row.title || "Mayor");
  const selectionMethod = String(row.selection_method || "")
    .trim()
    .toLowerCase();
  const appointedBy = String(row.appointed_by || "").trim();

  return {
    external_key: `local-official:${row.id}`,
    bioguide_id: null,
    level: "city",
    chamber: title.toLowerCase().includes("mayor") ? "mayor" : "city_council",
    name: row.full_name || "Unknown",
    party: normalizePartyLabel(row.party || ""),
    state: String(row.state_code || "").toUpperCase(),
    district: "",
    photo_url: row.photo_url || "",
    website_url: row.website_url || "",
    phone: "",
    source: "local_officials",
    office_title: title,
    metadata: {
      office_title: title,
      city: normalizeCityName(row.city_name),
      county: normalizeCountyName(row.county_name),
      local_official_id: row.id,
      party: normalizePartyLabel(row.party || ""),
      selection_method: selectionMethod || "",
      appointed_by: appointedBy || "",
      source_name: row.source_name || "",
      source_ref: row.source_ref || "",
      government_type: row.government_type || "",
      coverage_status: row.coverage_status || "",
    },
    levels: ["city"],
    offices: [
      {
        level: "city",
        chamber: title.toLowerCase().includes("mayor") ? "mayor" : "city_council",
        office_title: title,
        district: "",
        source: "local_officials",
        external_key: `local-official:${row.id}`,
      },
    ],
  };
}

function isMayorPerson(person) {
  if (!person?.name) return false;
  const title = String(
    person.office_title || person.metadata?.office_title || person.chamber || ""
  ).toLowerCase();
  const districtType = String(person.metadata?.district_type || "").toUpperCase();
  if (person.chamber === "mayor" || title.includes("mayor")) return true;
  if (districtType.includes("LOCAL_EXEC")) return true;
  return false;
}

async function fetchLocalOfficialsForGeography({
  state_code,
  city_name,
} = {}) {
  const stateCode = normalizeStateCode(state_code);
  const cityName = normalizeCityName(city_name);
  if (!stateCode || !cityName) return [];

  try {
    if (typeof injectSupabaseScript === "function") {
      await injectSupabaseScript().catch(() => {});
    }
    const client = getSupabase();
    if (!client) return [];

    const candidates = [
      cityName,
      cityName.replace(/\s+urban county$/i, ""),
      cityName.replace(/\s+city$/i, ""),
      cityName.replace(/^boise city$/i, "Boise"),
    ]
      .map((value) => normalizeCityName(value))
      .filter(Boolean);

    for (const candidate of [...new Set(candidates)]) {
      const { data, error } = await client
        .from("local_officials")
        .select("*")
        .eq("state_code", stateCode)
        .ilike("city_name", candidate)
        .eq("level", "City");
      if (error) {
        console.error("local_officials query error:", error);
        return [];
      }
      if (data?.length) {
        return dedupePoliticiansInGroup(data.map(mapLocalOfficialRow));
      }
    }

    const { data: fuzzy, error: fuzzyError } = await client
      .from("local_officials")
      .select("*")
      .eq("state_code", stateCode)
      .ilike("city_name", `%${cityName}%`)
      .eq("level", "City");
    if (fuzzyError) {
      console.error("local_officials fuzzy query error:", fuzzyError);
      return [];
    }
    return dedupePoliticiansInGroup((fuzzy || []).map(mapLocalOfficialRow));
  } catch (error) {
    console.error("fetchLocalOfficialsForGeography failed:", error);
    return [];
  }
}

/** @deprecated use fetchStateOfficialsForAddress */
async function fetchStateJudgesForGeography(geography = {}) {
  return fetchStateOfficialsForAddress({
    state_code: geography.state,
    county_name: geography.county,
  });
}

function splitStateOfficials(group = [], stateOfficials = [], geography = {}) {
  const dbOfficials = (stateOfficials || []).filter(
    (person) => person.source === "state_officials"
  );

  const sameState = (person) => {
    const personState = String(person.state || "").toUpperCase();
    const geoState = String(geography.state || "").toUpperCase();
    if (geoState && personState && personState !== geoState) return false;
    return true;
  };

  // High courts: judicial Statewide rows ONLY (never governors / AGs / etc.).
  const statewideCourts = dedupePoliticiansInGroup(
    dbOfficials.filter((person) => {
      if (!sameState(person)) return false;
      if (person.metadata?.court_group !== "statewide") return false;
      return isStatewideHighCourtTitle(
        person.office_title || person.metadata?.office_title,
        person.metadata?.court_or_agency || person.metadata?.court_name,
        person.chamber
      );
    })
  );

  // Executive Branch: only the five constitutional officers (or treasury equivalent).
  const executiveRank = (person) => {
    const title = String(
      person.office_title || person.metadata?.office_title || person.chamber || ""
    ).toLowerCase();
    if (title.includes("lieutenant")) return 2;
    if (/\bgovernor\b/.test(title)) return 1;
    if (title.includes("attorney general")) return 3;
    if (title.includes("secretary")) return 4;
    if (
      title.includes("treasurer") ||
      title.includes("comptroller") ||
      title.includes("chief financial") ||
      title.includes("state auditor")
    ) {
      return 5;
    }
    return 9;
  };
  const isCanonicalExecutive = (person) => {
    const title = String(
      person.office_title || person.metadata?.office_title || person.chamber || ""
    );
    const agency = String(person.metadata?.court_or_agency || "");
    return (
      person.metadata?.court_group === "executive" ||
      person.metadata?.court_group === "leadership" ||
      agency.toLowerCase() === "executive branch" ||
      isStateExecutiveOfficeTitle(title)
    );
  };
  const executives = dedupePoliticiansInGroup(
    dbOfficials.filter(
      (person) => sameState(person) && isCanonicalExecutive(person)
    )
  )
    .filter((person) =>
      isStateExecutiveOfficeTitle(
        person.office_title || person.metadata?.office_title || person.chamber
      )
    )
    .sort(
      (a, b) =>
        executiveRank(a) - executiveRank(b) || a.name.localeCompare(b.name)
    );
  const appellateCourts = dedupePoliticiansInGroup(
    dbOfficials.filter((person) => person.metadata?.court_group === "appellate")
  );
  const districtCourts = dedupePoliticiansInGroup(
    dbOfficials.filter((person) => person.metadata?.court_group === "district")
  );
  const countyCourts = dedupePoliticiansInGroup(
    dbOfficials.filter((person) => person.metadata?.court_group === "county")
  );
  const dbLegislators = dedupePoliticiansInGroup(
    dbOfficials.filter(
      (person) => sameState(person) && person.metadata?.court_group === "legislative"
    )
  ).sort((a, b) => {
    const rank = (p) =>
      String(p.chamber || "").includes("senate")
        ? 1
        : String(p.office_title || "").toLowerCase().includes("senator")
          ? 1
          : 2;
    return rank(a) - rank(b) || a.name.localeCompare(b.name);
  });

  const coveredNames = new Set(
    [
      ...executives,
      ...dbLegislators,
      ...statewideCourts,
      ...appellateCourts,
      ...districtCourts,
      ...countyCourts,
    ].map((person) => normalizePersonName(person.name))
  );

  const isJudicialPerson = (person) => {
    const title = String(
      person.office_title || person.metadata?.office_title || ""
    ).toLowerCase();
    const agency = String(person.metadata?.court_or_agency || "");
    const chamber = String(person.chamber || "");
    if (isStateExecutiveOfficeTitle(title)) return false;
    return (
      isStatewideHighCourtTitle(title, agency, chamber) ||
      chamber.includes("state_appeals") ||
      chamber.includes("state_district") ||
      chamber.includes("county_court") ||
      chamber === "judicial" ||
      title.includes("judge") ||
      title.includes("justice") ||
      title.includes("magistrate")
    );
  };

  const isCivicLegislator = (person) => {
    const chamber = String(person.chamber || "");
    const title = String(
      person.office_title || person.metadata?.office_title || ""
    ).toLowerCase();
    return (
      chamber === "state_senate" ||
      chamber === "state_house" ||
      title.includes("state senator") ||
      title.includes("state representative") ||
      title.includes("assembly member") ||
      title.includes("assemblymember")
    );
  };

  // Pull civic executives into Executive Branch when address APIs return them.
  const civicExecutives = dedupePoliticiansInGroup(
    group.filter((person) => {
      if (
        person.source === "state_officials" ||
        person.source === "state_judges"
      ) {
        return false;
      }
      if (coveredNames.has(normalizePersonName(person.name))) return false;
      return isStateExecutiveOfficeTitle(
        person.office_title || person.chamber || ""
      );
    })
  );
  const executivesWithCivic = dedupePoliticiansInGroup([
    ...executives,
    ...civicExecutives,
  ]).sort(
    (a, b) =>
      executiveRank(a) - executiveRank(b) || a.name.localeCompare(b.name)
  );

  // Civic legislators only as fallback when Supabase has no district match.
  const civicLegislators = dedupePoliticiansInGroup(
    group.filter((person) => {
      if (
        person.source === "state_officials" ||
        person.source === "state_judges"
      ) {
        return false;
      }
      if (coveredNames.has(normalizePersonName(person.name))) return false;
      return isCivicLegislator(person);
    })
  );
  const legislature = dedupePoliticiansInGroup([
    ...dbLegislators,
    ...civicLegislators,
  ]);

  const hasLocalGeography = Boolean(normalizeCountyName(geography.county));
  const stateCode = normalizeStateCode(geography.state);
  const stateName = stateDisplayName(stateCode);

  return {
    executives: executivesWithCivic,
    legislature,
    statewideCourts,
    appellateCourts,
    districtCourts,
    countyCourts,
    localCourts: [...districtCourts, ...countyCourts],
    hasLocalGeography,
    stateCode,
    stateName,
  };
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

    // Table may contain duplicate people; keep one entry per subcategory.
    const deduped = dedupePoliticiansInGroup(mapped);
    console.info(
      `Loaded ${deduped.length} national_officials (${mapped.length} raw rows)`
    );
    return deduped;
  } catch (error) {
    console.error("fetchNationalOfficials failed:", error);
    return [];
  }
}

function dedupePoliticiansInGroup(politicians) {
  const unique = [];
  const seen = new Map();

  for (const politician of politicians || []) {
    if (!politician?.name) continue;
    const group = politician.metadata?.national_group || "";
    const key = group
      ? `${group}:${normalizePersonName(politician.name)}`
      : personIdentityKey(politician);
    if (!key || key.endsWith(":")) continue;

    const existingIndex = seen.get(key);
    if (existingIndex == null) {
      seen.set(key, unique.length);
      unique.push(politician);
      continue;
    }

    // Prefer the row with a richer title/department when duplicates exist.
    const existing = unique[existingIndex];
    const existingScore =
      String(existing.office_title || existing.metadata?.office_title || "")
        .length + String(existing.metadata?.department || "").length;
    const nextScore =
      String(politician.office_title || politician.metadata?.office_title || "")
        .length + String(politician.metadata?.department || "").length;
    if (nextScore > existingScore) {
      unique[existingIndex] = politician;
    }
  }

  unique.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return unique;
}

/** Keep a single President and a single Vice President (prefer national_officials). */
function dedupePresidentVicePresident(politicians) {
  const byOffice = new Map();

  for (const politician of politicians || []) {
    if (!isPresidentOrVicePresidentTitle(politician)) continue;
    const title = officeTitleText(politician).toLowerCase();
    const officeKey = /vice/.test(title) ? "vice_president" : "president";
    const existing = byOffice.get(officeKey);
    if (!existing) {
      byOffice.set(officeKey, politician);
      continue;
    }
    const preferNext =
      (politician.source === "national_officials" &&
        existing.source !== "national_officials") ||
      (Boolean(politician.photo_url) && !existing.photo_url) ||
      officeTitleText(politician).length > officeTitleText(existing).length;
    if (preferNext) byOffice.set(officeKey, politician);
  }

  const ordered = [];
  if (byOffice.has("president")) ordered.push(byOffice.get("president"));
  if (byOffice.has("vice_president")) ordered.push(byOffice.get("vice_president"));
  return ordered;
}

function personLastNameKey(name) {
  const parts = normalizePersonName(name).split(" ").filter(Boolean);
  return parts[parts.length - 1] || "";
}

/** Collapse nickname / fuller-name duplicates within a national subgroup. */
function preferNationalOfficialsByLastName(politicians) {
  const byLast = new Map();
  for (const politician of politicians || []) {
    const last = personLastNameKey(politician.name);
    if (!last) continue;
    const existing = byLast.get(last);
    if (!existing) {
      byLast.set(last, politician);
      continue;
    }
    const preferNext =
      (politician.source === "national_officials" &&
        existing.source !== "national_officials") ||
      (Boolean(politician.photo_url) && !existing.photo_url);
    if (preferNext) byLast.set(last, politician);
  }
  return [...byLast.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
}

function appendPoliticianSubgroup(
  list,
  heading,
  politicians,
  cardOptions,
  sectionLevel,
  { startCollapsed = true } = {}
) {
  const uniquePoliticians = dedupePoliticiansInGroup(politicians);
  if (!uniquePoliticians.length) return 0;

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
    arrow.innerHTML = '<span class="politician-chevron"></span>';
    arrow.dataset.collapsed = startCollapsed ? "true" : "false";

  const title = document.createElement("h4");
  title.className = "politician-subgroup__title";
  title.textContent = heading;

  const count = document.createElement("span");
  count.className = "politician-subgroup__count";
  count.textContent = `${uniquePoliticians.length}`;

  header.append(arrow, title, count);

  const body = document.createElement("div");
  body.className = "politician-subgroup__body";

  for (const politician of uniquePoliticians) {
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
    const collapsedNow = subgroup.classList.toggle("is-collapsed");
    arrow.dataset.collapsed = collapsedNow ? "true" : "false";
    header.setAttribute("aria-expanded", collapsedNow ? "false" : "true");
  });

  subgroup.append(header, body);
  list.append(subgroup);
  return uniquePoliticians.length;
}

function appendStateCategorySection(
  list,
  heading,
  politicians,
  emptyMessage,
  cardOptions,
  sectionLevel
) {
  const count = appendPoliticianSubgroup(
    list,
    heading,
    politicians,
    cardOptions,
    sectionLevel,
    { startCollapsed: false }
  );
  if (count) return count;

  const section = document.createElement("div");
  section.className = "politician-subgroup politician-subgroup--empty";

  const title = document.createElement("h4");
  title.className = "politician-subgroup__title";
  title.textContent = heading;

  const hint = document.createElement("p");
  hint.className = "politician-subgroup-hint";
  hint.textContent = emptyMessage;

  section.append(title, hint);
  list.append(section);
  return 0;
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

function politicianInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^A-Za-z]/g, ""))
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function portraitHue(name) {
  const text = String(name || "official");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  // Keep hues in a muted civic range (teal → slate → olive).
  return 160 + (hash % 80);
}

/** Always-available portrait when no official photo URL exists. */
function generatedPortraitDataUrl(name) {
  const initials = politicianInitials(name);
  const hue = portraitHue(name);
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hue} 28% 38%)"/>
      <stop offset="100%" stop-color="hsl(${hue + 24} 22% 28%)"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" fill="url(#g)"/>
  <circle cx="64" cy="48" r="22" fill="rgba(255,255,255,0.18)"/>
  <ellipse cx="64" cy="112" rx="40" ry="28" fill="rgba(255,255,255,0.14)"/>
  <text x="64" y="78" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="36" font-weight="600" fill="#f7faf8">${initials}</text>
</svg>`.trim();
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function congressBioguidePhotoUrl(bioguideId) {
  const id = String(bioguideId || "").trim().toLowerCase();
  if (!id) return "";
  return `https://www.congress.gov/img/member/${id}_200.jpg`;
}

/**
 * Prefer a real official photo, then Congress bioguide art, then a generated
 * initials portrait so every listed name has a photo slot.
 */
function resolvePoliticianPhotoUrl(politician) {
  const direct = String(
    politician?.photo_url ||
      politician?.photoUrl ||
      politician?.image_url ||
      politician?.image ||
      ""
  ).trim();
  if (direct) return direct;

  const bioguide =
    politician?.bioguide_id ||
    politician?.metadata?.references?.bioguide_id ||
    "";
  const congressPhoto = congressBioguidePhotoUrl(bioguide);
  if (congressPhoto) return congressPhoto;

  return generatedPortraitDataUrl(politician?.name || "Official");
}

function mountPoliticianPhoto(mediaEl, politician) {
  const img = document.createElement("img");
  img.className = "politician-card__photo";
  img.alt = politician?.name
    ? `Portrait of ${politician.name}`
    : "Official portrait";
  img.loading = "lazy";
  img.decoding = "async";
  img.width = 96;
  img.height = 96;
  img.src = resolvePoliticianPhotoUrl(politician);
  img.addEventListener("error", () => {
    const fallback = generatedPortraitDataUrl(politician?.name || "Official");
    if (img.getAttribute("src") !== fallback) img.src = fallback;
  });
  mediaEl.replaceChildren(img);
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
  mountPoliticianPhoto(media, politician);
  const profileHref = politicianProfileHref(politician);
  if (profileHref) {
    const photoLink = document.createElement("a");
    photoLink.className = "politician-card__photo-link";
    photoLink.href = profileHref;
    photoLink.setAttribute(
      "aria-label",
      `Open profile for ${politician.name || "politician"}`
    );
    while (media.firstChild) photoLink.append(media.firstChild);
    media.append(photoLink);
  }

  const body = document.createElement("div");
  body.className = "politician-card__body";

  let name;
  if (profileHref) {
    name = document.createElement("h3");
    name.className = "politician-card__name";
    const nameLink = document.createElement("a");
    nameLink.className = "politician-name-link";
    nameLink.href = profileHref;
    nameLink.textContent = politician.name;
    nameLink.title = `Open profile for ${politician.name}`;
    name.append(nameLink);
  } else {
    name = document.createElement("h3");
    name.className = "politician-card__name";
    name.textContent = politician.name;
  }

  const officeTitle = readableOfficeTitle(
    activeOffice?.office_title ||
      politician.office_title ||
      politician.metadata?.office_title
  );
  const courtNameRaw = readableOfficeTitle(politician.metadata?.court_name);
  const courtNameLower = String(courtNameRaw || "").toLowerCase();
  const courtName =
    courtNameLower === "executive branch" ||
    courtNameLower === "legislative branch"
      ? ""
      : courtNameRaw;
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

  const badges = document.createElement("div");
  badges.className = "politician-card__badges";

  const titleText =
    officeTitle || chamberLabel(viewForLabel.chamber, viewForLabel);
  if (titleText) {
    const titleBadge = document.createElement("span");
    titleBadge.className = "politician-badge";
    titleBadge.textContent = titleText;
    badges.append(titleBadge);
  }

  const levelBadge = document.createElement("span");
  levelBadge.className = "politician-badge politician-badge--level";
  levelBadge.textContent = levelLabel(activeLevel);
  badges.append(levelBadge);

  const bioguide = politician.bioguide_id || politician.bioguideId || "";
  const matchScore =
    typeof window.PolicyEngagement?.getMatchScoreForBioguide === "function"
      ? window.PolicyEngagement.getMatchScoreForBioguide(bioguide)
      : null;
  if (matchScore != null) {
    const matchBadge = document.createElement(
      profileHref ? "a" : "span"
    );
    matchBadge.className = "politician-badge politician-badge--match";
    matchBadge.textContent = `${matchScore}% Match`;
    matchBadge.title = "Based on your Support/Oppose stances vs House roll calls";
    if (profileHref) matchBadge.href = profileHref;
    badges.append(matchBadge);
  }

  if (courtName && courtName !== officeTitle) {
    const courtBadge = document.createElement("span");
    courtBadge.className = "politician-badge politician-badge--soft";
    courtBadge.textContent = courtName;
    badges.append(courtBadge);
  }

  const meta = document.createElement("p");
  meta.className = "politician-card__meta";
  meta.textContent = [
    politician.state,
    formatDistrictMeta(viewForLabel.district, viewForLabel),
    politician.metadata?.city ? politician.metadata.city : null,
    politician.metadata?.county
      ? `${politician.metadata.county} County`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const extras = document.createElement("div");
  extras.className = "politician-card__extras";

  const party = document.createElement("span");
  party.className = `politician-card__party ${partyClass(politician.party)}`;
  party.textContent = politician.party || "Independent/Other";
  extras.append(party);

  const selectionMethod = String(
    politician.metadata?.selection_method || ""
  ).toLowerCase();
  const appointedBy = String(politician.metadata?.appointed_by || "").trim();
  if (selectionMethod === "elected" || selectionMethod === "appointed") {
    const selection = document.createElement("span");
    selection.className = "politician-card__selection";
    selection.textContent =
      selectionMethod === "appointed"
        ? appointedBy
          ? `Appointed by ${appointedBy}`
          : "Appointed"
        : "Elected";
    extras.append(selection);
  }

  const otherLevels = levels.filter((level) => level !== activeLevel);
  if (otherLevels.length) {
    const also = document.createElement("span");
    also.className = "politician-card__also-levels";
    also.textContent = `Also: ${otherLevels.map(levelLabel).join(", ")}`;
    extras.append(also);
  }

  const actions = document.createElement("div");
  actions.className = "politician-card__actions";

  const profileHrefForActions = politicianProfileHref(politician);
  if (profileHrefForActions) {
    const profileLink = document.createElement("a");
    profileLink.className = "bill-card__link";
    profileLink.href = profileHrefForActions;
    profileLink.textContent = "Profile";
    actions.append(profileLink);
  }

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
    followBtn.classList.add("is-loading");
    const wasFollowing = Boolean(politician.id && followedIds.has(politician.id));
    // Optimistic UI
    if (wasFollowing) {
      followBtn.textContent = "Follow";
      followBtn.classList.remove("is-following");
    } else {
      followBtn.textContent = "Following";
      followBtn.classList.add("is-following");
    }
    try {
      let record = politician;
      if (!record.id) {
        record = await upsertPoliticianRecord(politician);
        if (!record?.id) throw new Error("Could not save politician");
        politician.id = record.id;
      }

      if (wasFollowing) {
        await unfollowPolitician(user.id, politician.id);
        followedIds.delete(politician.id);
        followBtn.textContent = "Follow";
        followBtn.classList.remove("is-following");
        if (typeof showAppToast === "function") {
          showAppToast(`Unfollowed ${politician.name || "official"}.`, "info");
        }
      } else {
        await followPolitician(user.id, politician.id);
        followedIds.add(politician.id);
        followBtn.textContent = "Following";
        followBtn.classList.add("is-following");
        if (typeof showAppToast === "function") {
          showAppToast(`Following ${politician.name || "official"}.`, "success");
        }
      }
      onFollowChange?.(politician);
    } catch (error) {
      console.error(error);
      if (wasFollowing) {
        followBtn.textContent = "Following";
        followBtn.classList.add("is-following");
      } else {
        followBtn.textContent = "Follow";
        followBtn.classList.remove("is-following");
      }
      if (typeof showAppToast === "function") {
        showAppToast(error.message || "Could not update follow.", "error");
      } else {
        alert(error.message || "Could not update follow.");
      }
    } finally {
      followBtn.classList.remove("is-loading");
      followBtn.disabled = false;
    }
  });

  actions.append(followBtn);
  body.append(name, badges);
  if (meta.textContent) body.append(meta);
  body.append(extras);
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

/** Flat card list for browse / name search — no address-lookup category chrome. */
function renderPoliticianFlatList(container, politicians, cardOptions = {}) {
  const list = dedupePoliticiansInGroup(politicians || []);
  container.replaceChildren();
  container._politicianData = { politicians: list, cardOptions };
  delete container._selectedLevels;
  delete container._showAllLevels;
  delete container._collapsedLevels;

  if (!list.length) return;

  const search = String(cardOptions.searchQuery || "")
    .trim()
    .toLowerCase();
  const sorted = [...list].sort((a, b) => {
    if (search) {
      const score = (p) => {
        const name = String(p.name || "").toLowerCase();
        if (name === search) return 0;
        if (name.startsWith(search)) return 1;
        if (name.includes(search)) return 2;
        const tokens = search.split(/\s+/).filter(Boolean);
        if (tokens.length && tokens.every((t) => name.includes(t))) return 3;
        return 4;
      };
      const diff = score(a) - score(b);
      if (diff !== 0) return diff;
    }
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  const grid = document.createElement("div");
  grid.className = "politician-grid politician-grid--flat";
  grid.setAttribute("role", "list");

  for (const politician of sorted) {
    const card = renderPoliticianCard(politician, cardOptions);
    card.setAttribute("role", "listitem");
    grid.append(card);
  }

  container.append(grid);
}

function renderPoliticianGroups(container, politicians, cardOptions = {}) {
  const nationalOfficials = Array.isArray(cardOptions.nationalOfficials)
    ? cardOptions.nationalOfficials
    : [];
  const stateJudges = Array.isArray(cardOptions.stateJudges)
    ? cardOptions.stateJudges
    : [];
  const localOfficials = Array.isArray(cardOptions.localOfficials)
    ? cardOptions.localOfficials
    : [];
  const geography = cardOptions.geography || {};
  const byLevel = groupPoliticiansByLevel(politicians);
  const forceFederal = nationalOfficials.length > 0;
  const forceState =
    stateJudges.length > 0 || Boolean(String(geography.state || "").trim());
  const forceCity =
    localOfficials.length > 0 || Boolean(String(geography.city || "").trim());
  let availableLevels = DISPLAY_LEVEL_ORDER.filter(
    (level) =>
      (byLevel.get(level) || []).length > 0 ||
      (level === "federal" && forceFederal) ||
      (level === "state" && forceState) ||
      (level === "city" && forceCity)
  );

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
        arrow.dataset.collapsed = collapsed.has(level) ? "true" : "false";
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
    const dbLocalGroup =
      level === "city"
        ? dedupePoliticiansInGroup(
            localOfficials.filter((person) => person.source === "local_officials")
          )
        : [];

    const nationalByGroup = (groupName) =>
      nationalOfficials.filter((p) => {
        const group =
          p.metadata?.national_group || classifyFederalOfficeGroup(p);
        return group === groupName;
      });

    let cabinet =
      level === "federal"
        ? dedupePoliticiansInGroup(nationalByGroup("cabinet"))
        : [];
    let agencyDirectors =
      level === "federal"
        ? dedupePoliticiansInGroup(nationalByGroup("agency_director"))
        : [];
    let justices =
      level === "federal"
        ? dedupePoliticiansInGroup(nationalByGroup("supreme_court"))
        : [];
    let whiteHouse =
      level === "federal"
        ? dedupePoliticiansInGroup(nationalByGroup("white_house"))
        : [];
    let nationalExecutives =
      level === "federal"
        ? dedupePoliticiansInGroup(
            nationalByGroup("executive").filter(isPresidentOrVicePresidentTitle)
          )
        : [];
    let otherNational =
      level === "federal"
        ? dedupePoliticiansInGroup(nationalByGroup("other"))
        : [];

    // Any national_officials wrongly tagged as executive but not POTUS/VP
    // belong in White House & Executive Office (or another subgroup).
    if (level === "federal") {
      const misplacedExec = nationalByGroup("executive").filter(
        (p) => !isPresidentOrVicePresidentTitle(p)
      );
      for (const person of misplacedExec) {
        const regrouped = classifyFederalOfficeGroup({
          ...person,
          metadata: { ...(person.metadata || {}), national_group: "" },
          category: person.metadata?.category || "",
          title: officeTitleText(person),
          chamber: person.chamber,
        });
        if (regrouped === "cabinet") cabinet.push(person);
        else if (regrouped === "agency_director") agencyDirectors.push(person);
        else if (regrouped === "supreme_court") justices.push(person);
        else whiteHouse.push(person);
      }
      cabinet = dedupePoliticiansInGroup(cabinet);
      agencyDirectors = dedupePoliticiansInGroup(agencyDirectors);
      justices = dedupePoliticiansInGroup(justices);
      whiteHouse = dedupePoliticiansInGroup(whiteHouse);
    }

    // Keep address-based federal officials out of national subgroups by name
    // (loose match drops middle initials so "Howard W. Lutnick" ≈ "Howard Lutnick").
    const nationalNameKeys = new Set(
      [
        ...nationalExecutives,
        ...cabinet,
        ...agencyDirectors,
        ...justices,
        ...whiteHouse,
        ...otherNational,
      ].flatMap((p) => {
        const exact = normalizePersonName(p.name);
        const loose = normalizePersonNameLoose(p.name);
        return exact === loose ? [exact] : [exact, loose];
      })
    );
    const matchesNationalName = (person) => {
      const exact = normalizePersonName(person.name);
      const loose = normalizePersonNameLoose(person.name);
      return nationalNameKeys.has(exact) || nationalNameKeys.has(loose);
    };

    const addressFederal = dedupePoliticiansInGroup(
      group.filter((p) => !matchesNationalName(p))
    );

    // Route Cicero/Geocodio NATIONAL_EXEC rows into the right federal subgroups
    // instead of dumping every chamber=executive into President & VP.
    const addressByGroup = {
      executive: [],
      cabinet: [],
      agency_director: [],
      white_house: [],
      supreme_court: [],
      other: [],
    };
    const routedKeys = new Set();
    for (const person of addressFederal) {
      const groupName = classifyFederalOfficeGroup(person);
      if (
        groupName === "executive" ||
        groupName === "cabinet" ||
        groupName === "agency_director" ||
        groupName === "white_house" ||
        groupName === "supreme_court"
      ) {
        addressByGroup[groupName].push(person);
        routedKeys.add(personIdentityKey(person));
      } else if (String(person.chamber || "").toLowerCase() === "executive") {
        addressByGroup.white_house.push(person);
        routedKeys.add(personIdentityKey(person));
      }
    }

    const localGroup = dedupePoliticiansInGroup(
      addressFederal.filter((p) => !routedKeys.has(personIdentityKey(p)))
    );

    cabinet = dedupePoliticiansInGroup([
      ...cabinet,
      ...addressByGroup.cabinet,
    ]);
    agencyDirectors = dedupePoliticiansInGroup([
      ...agencyDirectors,
      ...addressByGroup.agency_director,
    ]);
    justices = dedupePoliticiansInGroup([
      ...justices,
      ...addressByGroup.supreme_court,
    ]);
    whiteHouse = dedupePoliticiansInGroup([
      ...whiteHouse,
      ...addressByGroup.white_house,
    ]);

    // Prefer seeded national_officials when Cicero uses a nickname / fuller name
    // for the same last name in the same subgroup (e.g. Russ vs Russell Vought).
    cabinet = preferNationalOfficialsByLastName(cabinet);
    agencyDirectors = preferNationalOfficialsByLastName(agencyDirectors);
    justices = preferNationalOfficialsByLastName(justices);

    // President & VP: hard-gate on title so EOP staff can never appear here.
    const executives = dedupePresidentVicePresident([
      ...nationalExecutives,
      ...addressByGroup.executive,
    ]);
    whiteHouse = preferNationalOfficialsByLastName(
      whiteHouse.filter((p) => !isPresidentOrVicePresidentTitle(p))
    );

    const stateSplit =
      level === "state"
        ? splitStateOfficials(
            group.filter(
              (p) =>
                p.source !== "state_judges" && p.source !== "state_officials"
            ),
            stateJudges,
            geography
          )
        : null;

    const totalCount =
      level === "federal"
        ? localGroup.length +
          executives.length +
          whiteHouse.length +
          cabinet.length +
          agencyDirectors.length +
          justices.length +
          otherNational.length
        : level === "state"
          ? stateSplit.legislature.length +
            stateSplit.executives.length +
            stateSplit.statewideCourts.length +
            stateSplit.appellateCourts.length +
            stateSplit.districtCourts.length +
            stateSplit.countyCourts.length
          : level === "city"
            ? dedupePoliticiansInGroup([...dbLocalGroup, ...group]).length
          : group.length;
    // Keep State visible when we have a state code so empty judicial placeholders can show.
    if (
      !totalCount &&
      !(level === "state" && stateSplit?.stateCode) &&
      !(level === "city" && geography.city)
    ) {
      continue;
    }

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
    arrow.innerHTML = '<span class="politician-chevron"></span>';
    arrow.dataset.collapsed = "false";

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
      if (executives.length) {
        appendPoliticianSubgroup(
          list,
          "President & Vice President",
          executives,
          cardOptions,
          level,
          { startCollapsed: false }
        );
      } else {
        appendStateCategorySection(
          list,
          "President & Vice President",
          [],
          "Add President and Vice President rows to the national_officials table in Supabase (see supabase/seed-national-executive.sql).",
          cardOptions,
          level
        );
      }
      // Always show as its own category — never mixed into President & VP.
      if (whiteHouse.length) {
        appendPoliticianSubgroup(
          list,
          "White House & Executive Office",
          whiteHouse,
          cardOptions,
          level,
          { startCollapsed: false }
        );
      } else {
        appendStateCategorySection(
          list,
          "White House & Executive Office",
          [],
          "White House and Executive Office officials will appear here (Chief of Staff, OMB, CEA, UN Ambassador, and similar roles).",
          cardOptions,
          level
        );
      }
      if (localGroup.length) {
        appendPoliticianSubgroup(
          list,
          "Congress & elected officials",
          localGroup,
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
    } else if (level === "state") {
      const stateName = stateSplit.stateName || stateDisplayName(geography.state);
      const countyLabel = stateSplit.hasLocalGeography
        ? geography.county
        : null;
      const needAddressHint =
        "Enter a street address to see judges for your county.";
      const populating = (kind) =>
        `${kind} for ${stateName}${
          countyLabel ? ` (${countyLabel} County)` : ""
        } are currently being populated`;

      appendStateCategorySection(
        list,
        "Executive Branch",
        stateSplit.executives,
        `Statewide executive officers for ${stateName} are currently being populated`,
        cardOptions,
        level
      );
      appendStateCategorySection(
        list,
        "Legislature / Representatives",
        stateSplit.legislature,
        "No state legislators found for this address. Try a city name for citywide coverage, or a street address for your exact district.",
        cardOptions,
        level
      );
      appendStateCategorySection(
        list,
        `Statewide High Courts — Judges & Justices (${stateName})`,
        stateSplit.statewideCourts,
        `Statewide judicial records for ${stateName} are currently being populated`,
        cardOptions,
        level
      );
      appendStateCategorySection(
        list,
        "Regional Courts of Appeals",
        stateSplit.appellateCourts,
        stateSplit.hasLocalGeography
          ? populating("Regional Court of Appeals records")
          : needAddressHint,
        cardOptions,
        level
      );
      appendStateCategorySection(
        list,
        "State District Trial Courts",
        stateSplit.districtCourts,
        stateSplit.hasLocalGeography
          ? populating("State district trial court records")
          : needAddressHint,
        cardOptions,
        level
      );
      appendStateCategorySection(
        list,
        "County Courts & Local Magistrates / Justices of the Peace",
        stateSplit.countyCourts,
        stateSplit.hasLocalGeography
          ? populating("County court and magistrate records")
          : needAddressHint,
        cardOptions,
        level
      );
    } else if (level === "city") {
      const coveredNames = new Set(
        dbLocalGroup.map((person) => normalizePersonName(person.name))
      );
      const civicMayors = dedupePoliticiansInGroup(
        group.filter((person) => {
          if (person.source === "local_officials") return false;
          if (coveredNames.has(normalizePersonName(person.name))) return false;
          return isMayorPerson(person);
        })
      );
      appendStateCategorySection(
        list,
        "Mayor",
        dedupePoliticiansInGroup([...dbLocalGroup, ...civicMayors]),
        geography.city
          ? `No mayor found yet for ${geography.city}. City executives come from Cicero when available, and are saved for next time.`
          : "No mayor found for this city.",
        cardOptions,
        level
      );
      const otherCity = dedupePoliticiansInGroup(
        group.filter((person) => {
          if (person.source === "local_officials") return false;
          return !isMayorPerson(person);
        })
      );
      if (otherCity.length) {
        appendPoliticianSubgroup(
          list,
          "Other city / municipal officials",
          otherCity,
          cardOptions,
          level
        );
      }
    } else {
      list.append(
        ...dedupePoliticiansInGroup(group).map((politician) =>
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
  const value = String(address || "").trim();
  if (!value) return "representatives.html";
  // Match home ZIP lookup params so both entry points share one results page.
  if (/^\d{5}(-\d{4})?$/.test(value)) {
    return `representatives.html?zipCode=${encodeURIComponent(value.slice(0, 5))}`;
  }
  return `representatives.html?address=${encodeURIComponent(value)}`;
}

function politiciansBrowseUrl(address) {
  return `politicians.html?address=${encodeURIComponent(address.trim())}`;
}

function resolveAddressLookupQuery(search = window.location.search) {
  const params = new URLSearchParams(search);
  return (
    params.get("address") ||
    params.get("q") ||
    params.get("zipCode") ||
    params.get("zip") ||
    ""
  ).trim();
}

/**
 * Search forms navigate to the unified Representative Scorecard + directory page.
 * Pass destination: "politicians" to land on the Politicians browse page with the
 * address carried in the query string (auto-populated there).
 */
function mountAddressLookup({ formId, inputId, destination = "results" } = {}) {
  const form = document.getElementById(formId);
  const input = document.getElementById(inputId);
  if (!form || !input) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const address = input.value.trim();
    if (!address) return;
    window.location.href =
      destination === "politicians"
        ? politiciansBrowseUrl(address)
        : politiciansResultsUrl(address);
  });
}

function mountAddressResultsPage({
  statusId = "address-status",
  resultsId = "address-results",
  queryLabelId = "results-query",
  redirectIfMissing = "politicians.html",
  queryOverride = null,
} = {}) {
  const status = document.getElementById(statusId);
  const results = document.getElementById(resultsId);
  const queryLabel = document.getElementById(queryLabelId);
  if (!status || !results) return;

  const address = String(
    queryOverride || resolveAddressLookupQuery() || ""
  ).trim();

  if (!address) {
    if (redirectIfMissing) {
      window.location.replace(redirectIfMissing);
    }
    return;
  }

  if (queryLabel) queryLabel.textContent = address;

  function setStatus(message, type = "loading") {
    status.hidden = !message;
    status.textContent = message;
    status.dataset.type = type;
  }

  (async () => {
    if (typeof showSkeletonCards === "function") {
      showSkeletonCards(results, { type: "politician", count: 6 });
    } else {
      results.replaceChildren();
    }
    setStatus("Looking up representatives…", "loading");

    try {
      await injectSupabaseScript().catch(() => {});
      const user = await getUser().catch(() => null);
      const followedIds = user
        ? await loadFollowedPoliticianIds(user.id)
        : new Set();

      // Address lookup API: cache hit (<30d) → instant; else live Civic APIs +
      // Federal/State directors from Supabase, then write cache.
      const lookupResult = await lookupRepresentatives(address)
        .then((data) => ({ ok: true, data }))
        .catch((error) => ({
          ok: false,
          error:
            error?.message || String(error) || "Address lookup failed.",
        }));

      const rosterFromApi = Boolean(
        lookupResult.ok && lookupResult.data?.rosterEnriched
      );

      // Prefer server-enriched directors when present (cached or freshly built).
      // Fall back to client Supabase reads for older API responses.
      let nationalOfficials = rosterFromApi
        ? lookupResult.data.nationalOfficials || []
        : [];
      let storedExecutives = rosterFromApi
        ? lookupResult.data.storedExecutives || []
        : [];

      if (!rosterFromApi) {
        const [national, stored] = await Promise.all([
          fetchNationalOfficials(),
          fetchStoredFederalExecutives(),
        ]);
        nationalOfficials = national;
        storedExecutives = stored;
      }

      const uniquePeople = dedupeLookupPoliticians([
        ...(lookupResult.ok ? lookupResult.data.politicians || [] : []),
        ...storedExecutives,
      ]).filter(
        (politician) =>
          politician.source !== "national_officials" &&
          politician.source !== "state_judges" &&
          politician.source !== "state_officials" &&
          politician.source !== "local_officials"
      );

      const geography = lookupResult.ok
        ? {
            state: normalizeStateCode(
              lookupResult.data.geography?.state ||
                lookupResult.data.state ||
                ""
            ),
            city: normalizeCityName(
              lookupResult.data.geography?.city ||
                lookupResult.data.city ||
                ""
            ),
            county: normalizeCountyName(
              lookupResult.data.geography?.county ||
                lookupResult.data.county ||
                ""
            ),
            appellateDistricts:
              lookupResult.data.geography?.appellateDistricts || [],
            trialDistricts: lookupResult.data.geography?.trialDistricts || [],
            judicialDistrictLabels:
              lookupResult.data.geography?.judicialDistrictLabels || [],
            stateSenateDistricts:
              lookupResult.data.geography?.stateSenateDistricts || [],
            stateHouseDistricts:
              lookupResult.data.geography?.stateHouseDistricts || [],
          }
        : {};

      let stateOfficials = [];
      let localOfficials = [];
      if (rosterFromApi) {
        stateOfficials = lookupResult.data.stateOfficials || [];
        localOfficials = lookupResult.data.localOfficials || [];
      } else {
        stateOfficials = await fetchStateOfficialsForAddress({
          state_code: geography.state,
          county_name: geography.county,
          state_senate_districts: geography.stateSenateDistricts,
          state_house_districts: geography.stateHouseDistricts,
        });
      }

      // Always try the mayor directory when city is known — covers seed rows and
      // mayors saved from earlier live lookups that the API roster missed.
      if (geography.state && geography.city) {
        const fromDirectory = await fetchLocalOfficialsForGeography({
          state_code: geography.state,
          city_name: geography.city,
        });
        if (fromDirectory.length) {
          localOfficials = dedupePoliticiansInGroup([
            ...localOfficials,
            ...fromDirectory,
          ]);
        }
      }
      const stateJudges = stateOfficials;

      if (
        !uniquePeople.length &&
        !nationalOfficials.length &&
        !stateJudges.length &&
        !localOfficials.length
      ) {
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

      // Keep the status line quiet on success — counts live in the sections.
      if (!lookupResult.ok) {
        setStatus(
          `Address lookup failed: ${lookupResult.error}`,
          "error"
        );
      } else {
        setStatus("", "loading");
      }

      renderPoliticianGroups(results, uniquePeople, {
        followedIds,
        user,
        nationalOfficials,
        stateJudges,
        localOfficials,
        geography,
      });

      Promise.all(
        uniquePeople.map(async (politician) => {
          if (politician.metadata?.district_only || politician.id) {
            return politician;
          }
          const row = await upsertPoliticianRecord(politician).catch((error) => {
            console.error(error);
            return null;
          });
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
