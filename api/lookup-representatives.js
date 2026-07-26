const GEOCODIO_BASE = "https://api.geocod.io/v1.7";
const CICERO_BASE = "https://app.cicerodata.com/v3.1";
const OPENSTATES_BASE = "https://v3.openstates.org";
const GOOGLE_CIVIC_BASE = "https://www.googleapis.com/civicinfo/v2";

const LEVEL_ORDER = ["federal", "state", "county", "city", "school", "local"];

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function fullName(parts = {}) {
  return [
    parts.first_name || parts.firstName || parts.preferred_name,
    parts.middle_name || parts.middle_initial || parts.middleName,
    parts.last_name || parts.lastName,
    parts.suffix || parts.name_suffix,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeParty(party) {
  if (!party) return "";
  const value = String(party).toLowerCase();
  if (value.startsWith("dem")) return "Democratic";
  if (value.startsWith("rep")) return "Republican";
  if (value.startsWith("ind")) return "Independent";
  if (value.includes("nonpartisan") || value === "npa") return "Nonpartisan";
  return party;
}

function slugKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizePersonName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((part) => part.length > 1)
    .join(" ");
}

function personMatchKey(politician) {
  if (politician.bioguide_id) {
    return `bioguide:${String(politician.bioguide_id).toLowerCase()}`;
  }
  const ciceroSk = politician.metadata?.cicero_sk;
  // Prefer name+state matching across sources; cicero sk alone would prevent Geocodio merge.
  const name = normalizePersonName(politician.name);
  const state = String(politician.state || "").toUpperCase();
  if (name) return `name:${state}:${name}`;
  if (ciceroSk) return `cicero:${ciceroSk}`;
  return `key:${politician.external_key}`;
}

function officeFromPolitician(politician) {
  return {
    level: politician.level || "local",
    chamber: politician.chamber || "",
    office_title:
      politician.metadata?.office_title ||
      politician.office_title ||
      politician.chamber ||
      "",
    district: politician.district || "",
    source: politician.source || "",
    external_key: politician.external_key,
  };
}

function preferFilled(current, next) {
  if (next == null || next === "") return current;
  if (current == null || current === "") return next;
  return current;
}

function mergePersonRecords(existing, incoming) {
  const offices = [...(existing.offices || [])];
  const nextOffice = officeFromPolitician(incoming);
  const officeKey = `${nextOffice.level}|${normalizePersonName(
    nextOffice.office_title
  )}|${String(nextOffice.district).toLowerCase()}`;
  const already = offices.some(
    (office) =>
      `${office.level}|${normalizePersonName(office.office_title)}|${String(
        office.district
      ).toLowerCase()}` === officeKey
  );
  if (!already) offices.push(nextOffice);

  const levels = [
    ...new Set(
      [...(existing.levels || []), incoming.level, ...offices.map((o) => o.level)].filter(
        Boolean
      )
    ),
  ].sort(
    (a, b) =>
      LEVEL_ORDER.indexOf(a) - LEVEL_ORDER.indexOf(b) || String(a).localeCompare(b)
  );

  const primaryLevel = levels[0] || incoming.level || existing.level;
  const primaryOffice =
    offices.find((office) => office.level === primaryLevel) || offices[0];

  return {
    ...existing,
    external_key: preferFilled(existing.external_key, incoming.external_key),
    bioguide_id: preferFilled(existing.bioguide_id, incoming.bioguide_id),
    level: primaryLevel,
    chamber: preferFilled(existing.chamber, incoming.chamber),
    name:
      String(incoming.name || "").length > String(existing.name || "").length
        ? incoming.name
        : existing.name || incoming.name,
    party: preferFilled(existing.party, incoming.party),
    state: preferFilled(existing.state, incoming.state),
    district: preferFilled(
      primaryOffice?.district || existing.district,
      incoming.district
    ),
    photo_url: preferFilled(existing.photo_url, incoming.photo_url),
    website_url: preferFilled(existing.website_url, incoming.website_url),
    phone: preferFilled(existing.phone, incoming.phone),
    source: preferFilled(existing.source, incoming.source),
    levels,
    offices,
    metadata: {
      ...(existing.metadata || {}),
      ...(incoming.metadata || {}),
      office_title:
        primaryOffice?.office_title ||
        existing.metadata?.office_title ||
        incoming.metadata?.office_title,
      levels,
      offices,
    },
  };
}

function mergePoliticians(lists) {
  const byPerson = new Map();

  for (const list of lists) {
    for (const politician of list || []) {
      if (!politician?.external_key || !politician?.name) continue;
      // Keep school district placeholders distinct from people.
      if (politician.metadata?.district_only) {
        const key = `district:${politician.external_key}`;
        if (!byPerson.has(key)) {
          byPerson.set(key, {
            ...politician,
            levels: [politician.level || "school"],
            offices: [officeFromPolitician(politician)],
          });
        }
        continue;
      }

      const key = personMatchKey(politician);
      const existing = byPerson.get(key);
      if (!existing) {
        byPerson.set(key, {
          ...politician,
          levels: [politician.level || "local"],
          offices: [officeFromPolitician(politician)],
          metadata: {
            ...(politician.metadata || {}),
            levels: [politician.level || "local"],
            offices: [officeFromPolitician(politician)],
          },
        });
      } else {
        byPerson.set(key, mergePersonRecords(existing, politician));
      }
    }
  }

  return [...byPerson.values()].sort((a, b) => {
    const levelDiff =
      LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level);
    if (levelDiff !== 0) return levelDiff;
    return String(a.name).localeCompare(String(b.name));
  });
}

function mapFederalLegislator(legislator, state, district) {
  const bio = legislator.bio || {};
  const contact = legislator.contact || {};
  const references = legislator.references || {};
  const type = String(legislator.type || "").toLowerCase();
  const chamber =
    type === "senator" ? "senate" : type === "representative" ? "house" : type;
  const bioguide = references.bioguide_id || null;
  const districtValue =
    chamber === "senate" ? "Statewide" : district != null ? String(district) : "";

  return {
    external_key: bioguide
      ? `federal:${bioguide}`
      : `federal:${state}:${chamber}:${fullName(bio)}`.toLowerCase(),
    bioguide_id: bioguide,
    level: "federal",
    chamber,
    name: fullName(bio) || "Unknown member",
    party: normalizeParty(bio.party),
    state: state || "",
    district: districtValue,
    photo_url: bio.photo_url || "",
    website_url: contact.url || "",
    phone: contact.phone || "",
    source: "geocodio",
    metadata: {
      seniority: legislator.seniority || null,
      contact,
      social: legislator.social || {},
      references,
      office_title: chamber === "senate" ? "U.S. Senator" : "U.S. Representative",
    },
  };
}

function mapStateLegislator(legislator, state, district, chamberHint) {
  const bio = legislator.bio || {};
  const contact = legislator.contact || {};
  const references = legislator.references || {};
  const type = String(legislator.type || chamberHint || "").toLowerCase();
  const chamber =
    type.includes("upper") || type.includes("senate")
      ? "state_senate"
      : type.includes("lower") || type.includes("house")
        ? "state_house"
        : type || "state_legislature";
  const openStatesId =
    references.openstates_id ||
    references.legiscan_id ||
    references.votesmart_id ||
    null;
  const name = fullName(bio) || legislator.name || "State legislator";

  return {
    external_key: openStatesId
      ? `state:${openStatesId}`
      : `state:${state}:${chamber}:${district}:${name}`.toLowerCase(),
    bioguide_id: null,
    level: "state",
    chamber,
    name,
    party: normalizeParty(bio.party || legislator.party),
    state: state || "",
    district: district != null ? String(district) : "",
    photo_url: bio.photo_url || legislator.photo_url || "",
    website_url: contact.url || legislator.url || "",
    phone: contact.phone || "",
    source: "geocodio",
    metadata: {
      contact,
      social: legislator.social || {},
      references,
      office_title:
        chamber === "state_senate" ? "State Senator" : "State Representative",
    },
  };
}

function extractGeocodioPoliticians(geocodeResult) {
  const result = geocodeResult?.results?.[0];
  if (!result) return { address: null, state: "", lat: null, lng: null, politicians: [] };

  const components = result.address_components || {};
  const state = (components.state || "").toUpperCase();
  const formatted = result.formatted_address || null;
  const fields = result.fields || {};
  const politicians = [];
  const seen = new Set();
  const lat = result.location?.lat ?? null;
  const lng = result.location?.lng ?? null;

  for (const district of fields.congressional_districts || []) {
    for (const legislator of district.current_legislators || []) {
      const mapped = mapFederalLegislator(
        legislator,
        state,
        district.district_number
      );
      if (seen.has(mapped.external_key)) continue;
      seen.add(mapped.external_key);
      politicians.push(mapped);
    }
  }

  const stateLeg = fields.state_legislative_districts || {};
  const stateBuckets = [
    { key: "senate", chamber: "state_senate" },
    { key: "house", chamber: "state_house" },
    { key: "upper", chamber: "state_senate" },
    { key: "lower", chamber: "state_house" },
  ];

  for (const bucket of stateBuckets) {
    const entries = stateLeg[bucket.key];
    const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
    for (const entry of list) {
      const districtNumber = entry.district_number || entry.name || "";
      for (const legislator of entry.current_legislators || []) {
        const mapped = mapStateLegislator(
          legislator,
          state,
          districtNumber,
          bucket.chamber
        );
        if (seen.has(mapped.external_key)) continue;
        seen.add(mapped.external_key);
        politicians.push(mapped);
      }
    }
  }

  // School district names (Geocodio does not return board members).
  const school = fields.school_districts || {};
  const schoolEntries = []
    .concat(school.unified || [])
    .concat(school.elementary || [])
    .concat(school.secondary || []);
  for (const entry of schoolEntries) {
    const name = entry.name || entry.district_name;
    const lea = entry.lea_code || entry.geoid || "";
    if (!name) continue;
    const external_key = `school-district:${state}:${lea || name}`.toLowerCase();
    if (seen.has(external_key)) continue;
    seen.add(external_key);
    politicians.push({
      external_key,
      bioguide_id: null,
      level: "school",
      chamber: "school_district",
      name,
      party: "Nonpartisan",
      state,
      district: lea ? `LEA ${lea}` : "",
      photo_url: "",
      website_url: "",
      phone: "",
      source: "geocodio-school-district",
      metadata: {
        district_only: true,
        office_title: "School District",
        note: "District boundary match. Individual school board members require Cicero or Google Civic coverage.",
        entry,
      },
    });
  }

  return { address: formatted, state, lat, lng, politicians };
}

function mapGoogleCivicLevel(levels = [], roles = [], officeName = "") {
  const levelSet = new Set((levels || []).map((v) => String(v).toLowerCase()));
  const roleSet = new Set((roles || []).map((v) => String(v).toLowerCase()));
  const office = String(officeName || "").toLowerCase();

  if (roleSet.has("schoolboard") || office.includes("school board")) {
    return { level: "school", chamber: "school_board" };
  }
  if (levelSet.has("country")) {
    if (roleSet.has("legislatorupperbody")) return { level: "federal", chamber: "senate" };
    if (roleSet.has("legislatorlowerbody")) return { level: "federal", chamber: "house" };
    if (roleSet.has("headofstate") || roleSet.has("headofgovernment")) {
      return { level: "federal", chamber: "executive" };
    }
    return { level: "federal", chamber: slugKey(officeName) || "federal" };
  }
  if (levelSet.has("administrativearea1")) {
    if (roleSet.has("legislatorupperbody")) return { level: "state", chamber: "state_senate" };
    if (roleSet.has("legislatorlowerbody")) return { level: "state", chamber: "state_house" };
    if (roleSet.has("headofgovernment")) return { level: "state", chamber: "governor" };
    return { level: "state", chamber: slugKey(officeName) || "state" };
  }
  if (levelSet.has("administrativearea2")) {
    return { level: "county", chamber: slugKey(officeName) || "county" };
  }
  if (levelSet.has("locality") || levelSet.has("sublocality1") || levelSet.has("sublocality2")) {
    return { level: "city", chamber: slugKey(officeName) || "city" };
  }
  if (levelSet.has("special")) {
    return { level: "local", chamber: slugKey(officeName) || "special" };
  }
  return { level: "local", chamber: slugKey(officeName) || "local" };
}

function extractGoogleCivicPoliticians(payload) {
  const officials = payload.officials || [];
  const offices = payload.offices || [];
  const normalized = payload.normalizedInput || {};
  const state = (normalized.state || "").toUpperCase();
  const address = [normalized.line1, normalized.city, normalized.state, normalized.zip]
    .filter(Boolean)
    .join(", ");
  const politicians = [];

  for (const office of offices) {
    const mappedLevel = mapGoogleCivicLevel(
      office.levels,
      office.roles,
      office.name
    );
    for (const index of office.officialIndices || []) {
      const official = officials[index];
      if (!official?.name) continue;
      const phone = official.phones?.[0] || "";
      const website = official.urls?.[0] || "";
      const external_key = `civic:${office.divisionId || "unknown"}:${slugKey(
        office.name
      )}:${slugKey(official.name)}`;
      politicians.push({
        external_key,
        bioguide_id: null,
        level: mappedLevel.level,
        chamber: mappedLevel.chamber,
        name: official.name,
        party: normalizeParty(official.party),
        state,
        district: office.divisionId || "",
        photo_url: official.photoUrl || "",
        website_url: website,
        phone,
        source: "google-civic",
        metadata: {
          office_title: office.name,
          division_id: office.divisionId || null,
          levels: office.levels || [],
          roles: office.roles || [],
          emails: official.emails || [],
          channels: official.channels || [],
        },
      });
    }
  }

  return { address: address || null, state, politicians };
}

const CICERO_DISTRICT_TYPES = [
  // Legislative + executive (national / state / local)
  "NATIONAL_EXEC",
  "NATIONAL_UPPER",
  "NATIONAL_LOWER",
  "STATE_EXEC",
  "STATE_UPPER",
  "STATE_LOWER",
  "LOCAL_EXEC",
  "LOCAL",
  // Non-legislative
  "COUNTY",
  "SCHOOL",
  "JUDICIAL",
];

function ciceroDistrictTypeName(district = {}, office = {}) {
  const raw =
    district.district_type__name_short ||
    district.district_type ||
    district.subtype ||
    office.district_type__name_short ||
    office.district_type ||
    "";
  if (typeof raw === "object" && raw) {
    return String(raw.name_short || raw.name || raw.label || "").toUpperCase();
  }
  return String(raw || "").toUpperCase();
}

function mapCiceroDistrictType(districtType = "", officeTitle = "") {
  const type = String(districtType || "").toUpperCase();
  const title = String(officeTitle || "").toLowerCase();

  // Title-based refinements first (Governors, AGs, Mayors, Judges, school boards).
  if (title.includes("school board") || title.includes("board of education")) {
    return { level: "school", chamber: "school_board" };
  }
  if (title.includes("mayor")) {
    return { level: "city", chamber: "mayor" };
  }
  if (
    title.includes("city council") ||
    title.includes("council member") ||
    title.includes("councilor") ||
    title.includes("councillor") ||
    title.includes("alderman")
  ) {
    return { level: "city", chamber: "city_council" };
  }
  if (
    title.includes("county commissioner") ||
    title.includes("county supervisor") ||
    title.includes("board of supervisors") ||
    (title.includes("commissioner") && title.includes("county"))
  ) {
    return { level: "county", chamber: "county_commissioner" };
  }
  if (title.includes("governor") && !title.includes("lieutenant")) {
    return { level: "state", chamber: "governor" };
  }
  if (title.includes("lieutenant governor")) {
    return { level: "state", chamber: "lieutenant_governor" };
  }
  if (title.includes("attorney general")) {
    return { level: "state", chamber: "attorney_general" };
  }
  if (
    title.includes("secretary of state") ||
    title.includes("state treasurer") ||
    title.includes("state auditor") ||
    title.includes("comptroller")
  ) {
    return { level: "state", chamber: "state_executive" };
  }
  if (title.includes("judge") || title.includes("justice")) {
    if (
      title.includes("supreme") ||
      title.includes("appeals") ||
      title.includes("appellate")
    ) {
      return { level: "state", chamber: "judicial" };
    }
    if (title.includes("county") || title.includes("circuit") || title.includes("superior")) {
      return { level: "county", chamber: "judicial" };
    }
    return { level: "local", chamber: "judicial" };
  }

  if (type.startsWith("NATIONAL")) {
    if (type.includes("UPPER")) return { level: "federal", chamber: "senate" };
    if (type.includes("LOWER")) return { level: "federal", chamber: "house" };
    return { level: "federal", chamber: "executive" };
  }
  if (type.startsWith("STATE")) {
    if (type.includes("UPPER")) return { level: "state", chamber: "state_senate" };
    if (type.includes("LOWER")) return { level: "state", chamber: "state_house" };
    return { level: "state", chamber: "executive" };
  }
  if (type === "COUNTY" || type.includes("COUNTY")) {
    return { level: "county", chamber: "county" };
  }
  if (type === "SCHOOL" || type.includes("SCHOOL")) {
    return { level: "school", chamber: "school_board" };
  }
  if (type === "JUDICIAL" || type.includes("JUDICIAL")) {
    return { level: "county", chamber: "judicial" };
  }
  if (type.startsWith("LOCAL") || type === "LOCAL") {
    return {
      level: "city",
      chamber: type.includes("EXEC") ? "mayor" : "city_council",
    };
  }
  return { level: "local", chamber: slugKey(type) || "local" };
}

function pickReadableTitle(...candidates) {
  for (const value of candidates) {
    if (value == null || value === "") continue;
    if (typeof value === "object") {
      const nested =
        value.name_formal ||
        value.name ||
        value.title ||
        value.role ||
        value.label ||
        "";
      if (nested && typeof nested === "string") return nested.trim();
      continue;
    }
    const text = String(value).trim();
    // Skip JSON blobs / internal ids accidentally stringified into titles.
    if (!text || text.startsWith("{") || text.startsWith("[")) continue;
    if (/^ocd-/i.test(text)) continue;
    return text;
  }
  return "";
}

function cleanDistrictValue(value, { level, chamber } = {}) {
  if (value == null || value === "") return "";
  if (typeof value === "object") {
    return cleanDistrictValue(
      value.district_id || value.id || value.city || value.name || "",
      { level, chamber }
    );
  }
  const text = String(value).trim();
  if (!text) return "";
  if (/^ocd-/i.test(text)) return "";
  if (/^united states$/i.test(text)) return "";
  if (/^\d{5,}$/.test(text)) return ""; // Cicero surrogate / DB ids
  if (
    (chamber === "senate" || chamber === "executive") &&
    level === "federal" &&
    /^[A-Z]{2}$/.test(text)
  ) {
    return chamber === "senate" ? "Statewide" : "";
  }
  return text;
}

function mapCiceroOfficial(official) {
  const office = official.office || {};
  const district = office.district || official.district || {};
  const districtTypeName = ciceroDistrictTypeName(district, office);
  const officeTitleHint = pickReadableTitle(
    official.title,
    office.title,
    office.chamber,
    Array.isArray(official.titles) ? official.titles[0] : "",
    official.chamber__name_formal,
    districtTypeName
  );
  const mapped = mapCiceroDistrictType(districtTypeName, officeTitleHint);
  const name =
    fullName(official) ||
    [official.preferred_name, official.last_name].filter(Boolean).join(" ");
  const addresses = official.addresses || [];
  const primaryAddress = addresses[0] || {};
  const state = String(
    official.state ||
      district.state ||
      office.representing_state ||
      office.state ||
      primaryAddress.state ||
      ""
  ).toUpperCase();
  const sk = official.sk || official.id;
  const officeTitle = officeTitleHint || mapped.chamber;
  const districtValue = cleanDistrictValue(
    district.district_id ||
      district.label ||
      district.city ||
      office.representing_city ||
      office.district_id ||
      "",
    { level: mapped.level, chamber: mapped.chamber }
  );

  return {
    external_key: sk
      ? `cicero:${sk}`
      : `cicero:${mapped.level}:${slugKey(name)}:${slugKey(officeTitle)}`,
    bioguide_id: null,
    level: mapped.level,
    chamber: mapped.chamber,
    name: name || "Official",
    party: normalizeParty(official.party),
    state,
    district: districtValue,
    photo_url: official.photo_origin_url || "",
    website_url: (official.urls && official.urls[0]) || official.web_form_url || "",
    phone:
      official.phone_1 ||
      primaryAddress.phone_1 ||
      primaryAddress.phone ||
      "",
    source: "cicero",
    metadata: {
      office_title: officeTitle,
      cicero_sk: sk,
      district_type: districtTypeName,
      emails: official.email_addresses || [],
    },
  };
}

function extractCiceroPoliticians(payload) {
  const officials =
    payload?.response?.results?.officials ||
    payload?.response?.results?.official ||
    [];
  const list = Array.isArray(officials) ? officials : [];
  return list.map(mapCiceroOfficial).filter((p) => p.name);
}

function mapOpenStatesPerson(person, stateHint) {
  const current = (person.current_role || person.roles?.find((r) => r.current)) || {};
  const org = String(current.org_classification || current.chamber || "").toLowerCase();
  const title = String(current.title || person.title || "").toLowerCase();
  const jurisdiction = String(
    person.jurisdiction?.name || current.jurisdiction || ""
  ).toLowerCase();

  let level = "state";
  let chamber = "state_legislature";
  if (org.includes("upper") || title.includes("senator")) chamber = "state_senate";
  else if (org.includes("lower") || title.includes("representative")) chamber = "state_house";
  else if (title.includes("governor")) chamber = "governor";
  else if (title.includes("mayor")) {
    level = "city";
    chamber = "mayor";
  } else if (jurisdiction.includes("county")) {
    level = "county";
    chamber = slugKey(current.title || "county");
  } else if (
    jurisdiction.includes("city") ||
    jurisdiction.includes("town") ||
    jurisdiction.includes("village")
  ) {
    level = "city";
    chamber = slugKey(current.title || "city");
  }

  const state = String(
    (person.jurisdiction?.classification === "state"
      ? person.jurisdiction?.id?.split(":").pop()
      : stateHint) || ""
  ).toUpperCase();

  return {
    external_key: person.id ? `openstates:${person.id}` : `openstates:${slugKey(person.name)}`,
    bioguide_id: null,
    level,
    chamber,
    name: person.name,
    party: normalizeParty(person.party?.[0]?.name || person.party || current.party),
    state,
    district: String(current.district || ""),
    photo_url: person.image || "",
    website_url:
      person.links?.find((l) => l.note?.toLowerCase().includes("homepage"))?.url ||
      person.links?.[0]?.url ||
      "",
    phone: "",
    source: "openstates",
    metadata: {
      office_title: current.title || chamber,
      openstates_id: person.id,
      current_role: current,
    },
  };
}

async function fetchGeocodio(query, apiKey) {
  const url = `${GEOCODIO_BASE}/geocode?q=${encodeURIComponent(
    query
  )}&fields=cd,stateleg,school&limit=1&api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || payload.message || "Geocodio lookup failed");
  }
  return extractGeocodioPoliticians(payload);
}

async function fetchGoogleCivic(query, apiKey) {
  const params = new URLSearchParams({
    key: apiKey,
    address: query,
    includeOffices: "true",
  });
  // Request all major levels explicitly.
  for (const level of [
    "country",
    "administrativeArea1",
    "administrativeArea2",
    "locality",
    "regional",
    "special",
    "subLocality1",
    "subLocality2",
  ]) {
    params.append("levels", level);
  }
  const url = `${GOOGLE_CIVIC_BASE}/representatives?${params.toString()}`;
  const response = await fetch(url);
  const payload = await response.json();
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      `Google Civic failed (${response.status})`;
    throw new Error(message);
  }
  return extractGoogleCivicPoliticians(payload);
}

async function fetchCiceroPage({ apiKey, lat, lng, query, districtType, offset = 0 }) {
  const params = new URLSearchParams({
    format: "json",
    key: apiKey,
    max: "200",
    order: "district_type",
    offset: String(offset),
  });
  if (districtType) params.append("district_type", districtType);
  if (lat != null && lng != null) {
    params.set("lat", String(lat));
    params.set("lon", String(lng));
  } else {
    params.set("search_loc", query);
  }

  const url = `${CICERO_BASE}/official?${params.toString()}`;
  const response = await fetch(url);
  const payload = await response.json();
  const errors = payload?.response?.errors || [];
  if (!response.ok || (Array.isArray(errors) && errors.length)) {
    throw new Error(
      errors?.[0]?.message ||
        errors?.[0] ||
        payload?.response?.messages?.[0] ||
        `Cicero lookup failed (${response.status})`
    );
  }
  const count = payload?.response?.results?.count || {};
  return {
    politicians: extractCiceroPoliticians(payload),
    total: Number(count.total || 0),
    to: Number(count.to || 0),
  };
}

async function fetchCiceroDistrictType(apiKey, lat, lng, query, districtType) {
  const politicians = [];
  let offset = 0;
  for (let page = 0; page < 5; page += 1) {
    const result = await fetchCiceroPage({
      apiKey,
      lat,
      lng,
      query,
      districtType,
      offset,
    });
    politicians.push(...result.politicians);
    if (!result.total || result.to >= result.total || !result.politicians.length) {
      break;
    }
    offset = result.to;
  }
  return politicians;
}

async function fetchCicero(query, apiKey, lat, lng) {
  // Explicitly request every national/state/county/local district type so we get
  // legislative AND executive/judicial officials (Governor, AG, Mayor, Judges, etc.).
  const settled = await Promise.allSettled(
    CICERO_DISTRICT_TYPES.map((districtType) =>
      fetchCiceroDistrictType(apiKey, lat, lng, query, districtType)
    )
  );

  const politicians = [];
  const typeErrors = [];
  settled.forEach((result, index) => {
    const districtType = CICERO_DISTRICT_TYPES[index];
    if (result.status === "fulfilled") {
      politicians.push(...result.value);
    } else {
      typeErrors.push({
        district_type: districtType,
        error: result.reason?.message || String(result.reason),
      });
    }
  });

  if (!politicians.length) {
    const fallback = await fetchCiceroPage({
      apiKey,
      lat,
      lng,
      query,
      districtType: null,
      offset: 0,
    });
    politicians.push(...fallback.politicians);
  }

  return { politicians, typeErrors };
}

async function fetchOpenStates(lat, lng, apiKey, stateHint) {
  if (lat == null || lng == null) return [];
  const url = `${OPENSTATES_BASE}/people.geo?lat=${encodeURIComponent(
    lat
  )}&lng=${encodeURIComponent(lng)}`;
  const response = await fetch(url, {
    headers: { "X-API-KEY": apiKey },
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.detail || payload.error || "Open States lookup failed");
  }
  const people = payload.results || payload || [];
  return (Array.isArray(people) ? people : []).map((person) =>
    mapOpenStatesPerson(person, stateHint)
  );
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const geocodioKey = env("GEOCODIO_API_KEY", "GEOCODIO_KEY");
  const googleCivicKey = env(
    "GOOGLE_CIVIC_API_KEY",
    "GOOGLE_API_KEY",
    "CIVIC_API_KEY"
  );
  const ciceroKey = env("CICERO_API_KEY", "CICERO_KEY");
  const openStatesKey = env("OPENSTATES_API_KEY", "OPEN_STATES_API_KEY");

  if (!geocodioKey && !googleCivicKey && !ciceroKey) {
    return json(res, 500, {
      error:
        "Configure GEOCODIO_API_KEY, CICERO_API_KEY, and/or GOOGLE_CIVIC_API_KEY for address lookup",
    });
  }

  const url = new URL(req.url, "http://localhost");
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) {
    return json(res, 400, { error: "Missing q (address or ZIP)" });
  }

  const sourcesTried = [];
  const sourceErrors = [];
  const politicianLists = [];
  let address = null;
  let state = "";
  let lat = null;
  let lng = null;

  try {
    // 1) Geocode whenever possible — also supplies federal/state (+ school district names).
    if (geocodioKey) {
      sourcesTried.push("geocodio");
      try {
        const geo = await fetchGeocodio(q, geocodioKey);
        address = geo.address || address;
        state = geo.state || state;
        lat = geo.lat;
        lng = geo.lng;
        politicianLists.push(geo.politicians);
      } catch (error) {
        sourceErrors.push({ source: "geocodio", error: error.message });
      }
    }

    // 2) Google Civic (full local coverage when still available for a key).
    if (googleCivicKey) {
      sourcesTried.push("google-civic");
      try {
        const civic = await fetchGoogleCivic(q, googleCivicKey);
        address = civic.address || address;
        state = civic.state || state;
        politicianLists.push(civic.politicians);
      } catch (error) {
        sourceErrors.push({ source: "google-civic", error: error.message });
      }
    }

    // 3) Cicero — best current replacement for city/county/school board officials.
    if (ciceroKey) {
      sourcesTried.push("cicero");
      try {
        const cicero = await fetchCicero(q, ciceroKey, lat, lng);
        politicianLists.push(cicero.politicians);
        if (cicero.typeErrors?.length) {
          sourceErrors.push(...cicero.typeErrors.map((item) => ({
            source: `cicero:${item.district_type}`,
            error: item.error,
          })));
        }
      } catch (error) {
        sourceErrors.push({ source: "cicero", error: error.message });
      }
    }

    // 4) Open States geo people — free enrichment for state (+ some municipal).
    if (openStatesKey && lat != null && lng != null) {
      sourcesTried.push("openstates");
      try {
        politicianLists.push(await fetchOpenStates(lat, lng, openStatesKey, state));
      } catch (error) {
        sourceErrors.push({ source: "openstates", error: error.message });
      }
    }

    const politicians = mergePoliticians(politicianLists);
    if (!politicians.length) {
      return json(res, 404, {
        error:
          "No representatives found. Try a full street address. For city, county, and school board coverage, set CICERO_API_KEY (Google Civic Representatives was turned down in 2025).",
        sourcesTried,
        sourceErrors,
      });
    }

    return json(res, 200, {
      ok: true,
      query: q,
      address,
      state,
      politicians,
      sourcesTried,
      sourceErrors,
      coverageNote:
        "Federal/state legislators come from Geocodio (+ Open States when configured). City, county, and school board members require Cicero or a working Google Civic key.",
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      error: error.message || "Lookup failed",
      sourcesTried,
      sourceErrors,
    });
  }
};
