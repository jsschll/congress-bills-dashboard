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

function mergePoliticians(lists) {
  const seen = new Set();
  const merged = [];
  for (const list of lists) {
    for (const politician of list || []) {
      if (!politician?.external_key || !politician?.name) continue;
      if (seen.has(politician.external_key)) continue;
      seen.add(politician.external_key);
      merged.push(politician);
    }
  }
  return merged.sort((a, b) => {
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

function mapCiceroDistrictType(districtType = "") {
  const type = String(districtType || "").toUpperCase();
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
  if (type.startsWith("LOCAL")) {
    return { level: "city", chamber: type.includes("EXEC") ? "mayor" : "city_council" };
  }
  return { level: "local", chamber: slugKey(type) || "local" };
}

function mapCiceroOfficial(official) {
  const office = official.office || {};
  const district = office.district || {};
  const districtType =
    district.district_type ||
    district.subtype ||
    office.representing_city ||
    "";
  const mapped = mapCiceroDistrictType(
    typeof districtType === "object"
      ? districtType.name_short || districtType.name || ""
      : districtType
  );
  const name =
    fullName(official) ||
    [official.preferred_name, official.last_name].filter(Boolean).join(" ");
  const addresses = official.addresses || [];
  const primaryAddress = addresses[0] || {};
  const state = (
    district.state ||
    office.state ||
    primaryAddress.state ||
    ""
  ).toUpperCase();
  const sk = official.sk || official.id;
  const chamberName =
    office.chamber ||
    office.title ||
    (Array.isArray(official.titles) ? official.titles[0] : "") ||
    mapped.chamber;

  return {
    external_key: sk ? `cicero:${sk}` : `cicero:${mapped.level}:${slugKey(name)}:${slugKey(chamberName)}`,
    bioguide_id: null,
    level: mapped.level,
    chamber: mapped.chamber,
    name: name || "Official",
    party: normalizeParty(official.party),
    state,
    district: String(
      district.district_id ||
        district.id ||
        district.city ||
        office.district_id ||
        ""
    ),
    photo_url: official.photo_origin_url || "",
    website_url: (official.urls && official.urls[0]) || official.web_form_url || "",
    phone: primaryAddress.phone_1 || primaryAddress.phone || "",
    source: "cicero",
    metadata: {
      office_title: chamberName || office.role || mapped.chamber,
      cicero_sk: sk,
      emails: official.email_addresses || [],
      office,
      district,
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

async function fetchCicero(query, apiKey, lat, lng) {
  const params = new URLSearchParams({
    format: "json",
    key: apiKey,
    max: "100",
    order: "district_type",
  });
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
  return {
    politicians: extractCiceroPoliticians(payload),
  };
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
