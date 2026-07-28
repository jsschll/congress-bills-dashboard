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
    return keys.length ? keys : [`district:${politician.external_key || politician.name}`];
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

function personMatchKey(politician) {
  return personIdentityKeys(politician)[0] || `key:${politician.external_key}`;
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
  const records = [];
  const keyToIndex = new Map();

  for (const list of lists) {
    for (const politician of list || []) {
      if (!politician?.external_key || !politician?.name) continue;

      // Keep school district placeholders distinct from people, but merge
      // duplicate district rows from Geocodio + Cicero by name/state.
      if (politician.metadata?.district_only) {
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
            levels: [politician.level || "school"],
            offices: [officeFromPolitician(politician)],
          });
        } else {
          records[index] = mergePersonRecords(records[index], politician);
          records[index].metadata = {
            ...(records[index].metadata || {}),
            district_only: true,
          };
        }

        for (const key of personIdentityKeys(records[index])) {
          keyToIndex.set(key, index);
        }
        continue;
      }

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
          levels: [politician.level || "local"],
          offices: [officeFromPolitician(politician)],
          metadata: {
            ...(politician.metadata || {}),
            levels: [politician.level || "local"],
            offices: [officeFromPolitician(politician)],
          },
        });
      } else {
        records[index] = mergePersonRecords(records[index], politician);
      }

      // Bind every known identity key so bioguide + name aliases merge later.
      for (const key of personIdentityKeys(records[index])) {
        keyToIndex.set(key, index);
      }
    }
  }

  return records.sort((a, b) => {
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

function looksLikePlaceQuery(query = "") {
  const text = String(query || "").trim();
  if (!text) return false;
  // Street addresses usually include a leading house number.
  if (/^\d+\s+\S/.test(text)) return false;
  // Bare ZIP / ZIP+4 — treat as place-like broad lookup.
  if (/^\d{5}(?:-\d{4})?$/.test(text)) return true;
  // "City, ST" or plain city name.
  if (/^[A-Za-z][A-Za-z.'\-\s]+(?:,\s*[A-Za-z]{2})?$/.test(text)) return true;
  return !/\d/.test(text);
}

function isPlaceGeocodeResult(result) {
  if (!result) return false;
  const accuracy = String(result.accuracy_type || "").toLowerCase();
  if (["place", "city", "county", "state"].includes(accuracy)) return true;
  const components = result.address_components || {};
  const hasStreet =
    Boolean(components.number || components.street || components.formatted_street) ||
    /^\d+\s+\S/.test(String(result.formatted_address || ""));
  return !hasStreet && Boolean(components.city || components.place);
}

function placeDisplayLabel(components = {}, fallback = "") {
  const city = String(components.city || components.place || "").trim();
  const state = String(components.state || "").toUpperCase();
  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  // Strip ZIP from Geocodio place fallbacks like "San Diego, CA 92101".
  const cleaned = String(fallback || "")
    .replace(/\s+\d{5}(?:-\d{4})?\s*$/, "")
    .trim();
  return cleaned || fallback || null;
}

function extractStateLegDistrictsFromFields(fields = {}) {
  const stateLeg = fields.state_legislative_districts || {};
  const stateBuckets = [
    { key: "senate", chamber: "state_senate" },
    { key: "house", chamber: "state_house" },
    { key: "upper", chamber: "state_senate" },
    { key: "lower", chamber: "state_house" },
  ];
  const stateSenateDistricts = [];
  const stateHouseDistricts = [];

  for (const bucket of stateBuckets) {
    const entries = stateLeg[bucket.key];
    const list = Array.isArray(entries) ? entries : entries ? [entries] : [];
    for (const entry of list) {
      const districtKey = String(entry.district_number || entry.name || "").trim();
      if (!districtKey) continue;
      if (bucket.chamber === "state_senate") {
        if (!stateSenateDistricts.includes(districtKey)) {
          stateSenateDistricts.push(districtKey);
        }
      } else if (!stateHouseDistricts.includes(districtKey)) {
        stateHouseDistricts.push(districtKey);
      }
    }
  }
  return { stateSenateDistricts, stateHouseDistricts };
}

function samplePointsInBbox(bbox, maxPoints = 49) {
  let [south, north, west, east] = bbox.map(Number);
  if (![south, north, west, east].every((n) => Number.isFinite(n))) return [];
  if (north <= south || east <= west) return [];

  // Pad slightly so edge districts that clip the city boundary are included.
  const latPad = Math.max(0.01, (north - south) * 0.08);
  const lngPad = Math.max(0.01, (east - west) * 0.08);
  south -= latPad;
  north += latPad;
  west -= lngPad;
  east += lngPad;

  // Adaptive grid: denser for larger places, capped for Geocodio cost.
  const latSpan = Math.max(0.01, north - south);
  const lngSpan = Math.max(0.01, east - west);
  const target = Math.min(maxPoints, Math.max(25, Math.round(latSpan * lngSpan * 1100)));
  const cols = Math.max(5, Math.round(Math.sqrt(target * (lngSpan / latSpan))));
  const rows = Math.max(5, Math.round(target / cols));
  const points = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const lat = south + ((r + 0.5) / rows) * (north - south);
      const lng = west + ((c + 0.5) / cols) * (east - west);
      points.push({ lat, lng });
    }
  }
  return points;
}

function samplePointsAroundCentroid(lat, lng, maxPoints = 25) {
  if (lat == null || lng == null) return [];
  // Rings at ~3/7/12/18 km — enough to cover large US cities like San Diego.
  const ringsKm = [0, 3, 7, 12, 18];
  const points = [{ lat, lng }];
  for (const km of ringsKm.slice(1)) {
    const dLat = km / 111;
    const dLng = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
    const steps = km <= 7 ? 8 : 12;
    for (let i = 0; i < steps; i += 1) {
      const angle = (2 * Math.PI * i) / steps;
      points.push({
        lat: lat + dLat * Math.sin(angle),
        lng: lng + dLng * Math.cos(angle),
      });
      if (points.length >= maxPoints) return points;
    }
  }
  return points.slice(0, maxPoints);
}

async function fetchPlaceBoundingBox(query, stateHint = "") {
  const q = [String(query || "").trim(), stateHint ? String(stateHint).trim() : ""]
    .filter(Boolean)
    .join(", ");
  if (!q) return null;
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0` +
    `&q=${encodeURIComponent(q)}`;
  const response = await fetch(url, {
    headers: {
      "User-Agent": "congress-bills-dashboard/1.0 (city legislative district expansion)",
      Accept: "application/json",
    },
  });
  if (!response.ok) return null;
  const payload = await response.json();
  const hit = Array.isArray(payload) ? payload[0] : null;
  const bbox = hit?.boundingbox;
  if (!Array.isArray(bbox) || bbox.length < 4) return null;
  // Nominatim: [south, north, west, east]
  return bbox.map(Number);
}

async function batchReverseStateLegDistricts(points, apiKey) {
  if (!points?.length || !apiKey) {
    return { stateSenateDistricts: [], stateHouseDistricts: [] };
  }
  const coords = points.map((p) => `${p.lat},${p.lng}`);
  const url =
    `${GEOCODIO_BASE}/reverse?fields=stateleg&skipGeocoding=1` +
    `&api_key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(coords),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || "Geocodio batch reverse failed"
    );
  }

  const senate = [];
  const house = [];
  const rows = Array.isArray(payload.results)
    ? payload.results
    : Array.isArray(payload)
      ? payload
      : [];

  for (const row of rows) {
    const results =
      row?.response?.results ||
      row?.results ||
      (row?.fields ? [row] : []);
    for (const result of results) {
      const extracted = extractStateLegDistrictsFromFields(result.fields || {});
      for (const d of extracted.stateSenateDistricts) {
        if (!senate.includes(d)) senate.push(d);
      }
      for (const d of extracted.stateHouseDistricts) {
        if (!house.includes(d)) house.push(d);
      }
    }
  }

  return { stateSenateDistricts: senate, stateHouseDistricts: house };
}

function extractGeocodioPoliticians(geocodeResult) {
  const result = geocodeResult?.results?.[0];
  if (!result) {
    return {
      address: null,
      state: "",
      county: "",
      lat: null,
      lng: null,
      politicians: [],
      stateSenateDistricts: [],
      stateHouseDistricts: [],
      placeMode: false,
    };
  }

  const components = result.address_components || {};
  const state = (components.state || "").toUpperCase();
  const county = String(components.county || components.county_name || "")
    .replace(/\s+county$/i, "")
    .trim();
  const placeMode = isPlaceGeocodeResult(result);
  const formatted = placeMode
    ? placeDisplayLabel(components, result.formatted_address)
    : result.formatted_address || null;
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
  const { stateSenateDistricts, stateHouseDistricts } =
    extractStateLegDistrictsFromFields(fields);

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

  return {
    address: formatted,
    state,
    county,
    lat,
    lng,
    politicians,
    stateSenateDistricts,
    stateHouseDistricts,
    placeMode,
    accuracyType: result.accuracy_type || "",
  };
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
  if (title.includes("school board") || title.includes("board of education") || title.includes("trustee")) {
    return { level: "school", chamber: title.includes("trustee") ? "trustee" : "school_board" };
  }
  if (title.includes("sheriff") || title.includes("constable") || title.includes("marshal")) {
    return { level: "county", chamber: "sheriff" };
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
    (title.includes("commissioner") && title.includes("county")) ||
    (title.includes("supervisor") && !title.includes("city"))
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
    // Keep all benches under State for the State tab court subgroups.
    if (title.includes("criminal appeals")) {
      return {
        level: "state",
        chamber: "state_criminal_appeals",
        court_group: "statewide",
      };
    }
    if (title.includes("supreme")) {
      return {
        level: "state",
        chamber: "state_supreme",
        court_group: "statewide",
      };
    }
    if (title.includes("appeals") || title.includes("appellate")) {
      return {
        level: "state",
        chamber: "state_appeals",
        court_group: "appellate",
      };
    }
    if (
      title.includes("district court") ||
      title.includes("district judge") ||
      /\b\d+(st|nd|rd|th)\b/.test(title)
    ) {
      return {
        level: "state",
        chamber: "state_district",
        court_group: "district",
      };
    }
    if (title.includes("county")) {
      return {
        level: "state",
        chamber: "county_court",
        court_group: "district",
      };
    }
    return {
      level: "state",
      chamber: "state_district",
      court_group: "district",
    };
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
    return {
      level: "state",
      chamber: "state_district",
      court_group: "district",
    };
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
  const countyHint = String(
    district.county ||
      district.county_name ||
      office.representing_county ||
      primaryAddress.county ||
      ""
  )
    .replace(/\s+county$/i, "")
    .trim();

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
      court_name: officeTitle,
      cicero_sk: sk,
      district_type: districtTypeName,
      court_group: mapped.court_group || null,
      county: countyHint || null,
      district_label: district.label || districtValue || null,
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

async function expandPlaceLegislativeDistricts(base, query, apiKey) {
  if (!base?.placeMode && !looksLikePlaceQuery(query)) {
    return base;
  }

  let points = [];
  try {
    const bbox = await fetchPlaceBoundingBox(query, base.state);
    if (bbox) points = samplePointsInBbox(bbox, 49);
  } catch (_) {
    // Fall through to centroid rings.
  }
  if (!points.length) {
    points = samplePointsAroundCentroid(base.lat, base.lng, 25);
  }
  if (!points.length) return { ...base, placeMode: true };

  try {
    const expanded = await batchReverseStateLegDistricts(points, apiKey);
    const stateSenateDistricts = [
      ...new Set([
        ...(base.stateSenateDistricts || []),
        ...(expanded.stateSenateDistricts || []),
      ]),
    ];
    const stateHouseDistricts = [
      ...new Set([
        ...(base.stateHouseDistricts || []),
        ...(expanded.stateHouseDistricts || []),
      ]),
    ];
    return {
      ...base,
      placeMode: true,
      stateSenateDistricts,
      stateHouseDistricts,
      samplePointCount: points.length,
    };
  } catch (error) {
    // Keep the single-point districts if expansion fails.
    return {
      ...base,
      placeMode: true,
      expansionError: error.message || String(error),
    };
  }
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
  const base = extractGeocodioPoliticians(payload);
  const shouldExpand =
    base.placeMode ||
    looksLikePlaceQuery(query) ||
    String(base.accuracyType || "").toLowerCase() === "place";
  if (!shouldExpand) return base;
  return expandPlaceLegislativeDistricts(
    { ...base, placeMode: true },
    query,
    apiKey
  );
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

function parseJudicialDistrictMeta(label = "") {
  const text = String(label || "").trim();
  const lower = text.toLowerCase();
  const numberMatch = text.match(/(\d+)(st|nd|rd|th)?/i);
  const number = numberMatch ? numberMatch[1] : "";

  if (
    lower.includes("court of appeals") ||
    lower.includes("appeals court") ||
    lower.includes("appellate")
  ) {
    return {
      kind: "appellate",
      appellateDistrict: number || text,
      trialDistrict: "",
      label: text,
    };
  }
  if (
    lower.includes("supreme") ||
    lower.includes("criminal appeals")
  ) {
    return {
      kind: "statewide",
      appellateDistrict: "",
      trialDistrict: "",
      label: text,
    };
  }
  if (lower.includes("district") || lower.includes("judicial") || number) {
    return {
      kind: "trial",
      appellateDistrict: "",
      trialDistrict: number ? `${number}${numberMatch?.[2] || ""}` : text,
      label: text,
    };
  }
  return {
    kind: "other",
    appellateDistrict: "",
    trialDistrict: text,
    label: text,
  };
}

function emptyGeography(state = "", county = "") {
  return {
    state: String(state || "").toUpperCase(),
    county: String(county || "").replace(/\s+county$/i, "").trim(),
    appellateDistricts: [],
    trialDistricts: [],
    judicialDistrictLabels: [],
    stateSenateDistricts: [],
    stateHouseDistricts: [],
  };
}

function mergeGeography(...parts) {
  const merged = emptyGeography();
  for (const part of parts) {
    if (!part) continue;
    if (part.state) merged.state = String(part.state).toUpperCase();
    if (part.county) {
      merged.county = String(part.county).replace(/\s+county$/i, "").trim();
    }
    for (const value of part.appellateDistricts || []) {
      const key = String(value).trim();
      if (key && !merged.appellateDistricts.includes(key)) {
        merged.appellateDistricts.push(key);
      }
    }
    for (const value of part.trialDistricts || []) {
      const key = String(value).trim();
      if (key && !merged.trialDistricts.includes(key)) {
        merged.trialDistricts.push(key);
      }
    }
    for (const value of part.judicialDistrictLabels || []) {
      const key = String(value).trim();
      if (key && !merged.judicialDistrictLabels.includes(key)) {
        merged.judicialDistrictLabels.push(key);
      }
    }
    for (const value of part.stateSenateDistricts || []) {
      const key = String(value).trim();
      if (key && !merged.stateSenateDistricts.includes(key)) {
        merged.stateSenateDistricts.push(key);
      }
    }
    for (const value of part.stateHouseDistricts || []) {
      const key = String(value).trim();
      if (key && !merged.stateHouseDistricts.includes(key)) {
        merged.stateHouseDistricts.push(key);
      }
    }
  }
  return merged;
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

  let geography = emptyGeography();

  // Non-legislative districts (school / county / judicial) often need a district
  // lookup first, then an officials query by district_id to return board members,
  // sheriffs, and judges.
  try {
    const nonleg = await fetchCiceroNonlegislativeOfficials(
      apiKey,
      lat,
      lng,
      query
    );
    politicians.push(...nonleg.politicians);
    typeErrors.push(...nonleg.typeErrors);
    geography = mergeGeography(geography, nonleg.geography);
  } catch (error) {
    typeErrors.push({
      district_type: "nonlegislative",
      error: error.message || String(error),
    });
  }

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

  return {
    politicians: politicians.filter(isRelevantOfficeholder),
    typeErrors,
    geography,
  };
}

async function fetchCiceroNonlegislativeOfficials(apiKey, lat, lng, query) {
  const types = ["SCHOOL", "COUNTY", "JUDICIAL"];
  const politicians = [];
  const typeErrors = [];
  const geography = emptyGeography();

  for (const districtType of types) {
    try {
      const params = new URLSearchParams({
        format: "json",
        key: apiKey,
        max: "50",
        district_type: districtType,
      });
      if (lat != null && lng != null) {
        params.set("lat", String(lat));
        params.set("lon", String(lng));
      } else {
        params.set("search_loc", query);
      }

      const response = await fetch(
        `${CICERO_BASE}/nonlegislative_district?${params.toString()}`
      );
      const payload = await response.json();
      const errors = payload?.response?.errors || [];
      if (!response.ok || (Array.isArray(errors) && errors.length)) {
        throw new Error(
          errors?.[0]?.message ||
            errors?.[0] ||
            `Cicero ${districtType} districts failed`
        );
      }

      const districts =
        payload?.response?.results?.districts ||
        payload?.response?.results?.district ||
        [];
      const list = Array.isArray(districts) ? districts : [];

      for (const district of list.slice(0, 8)) {
        const districtId = district.district_id || district.id;
        const districtName =
          district.label ||
          district.city ||
          district.district_id ||
          `${districtType} district`;

        if (districtType === "COUNTY" && districtName) {
          const countyName = String(districtName)
            .replace(/\s+county$/i, "")
            .trim();
          if (countyName && !geography.county) geography.county = countyName;
        }

        if (districtType === "JUDICIAL" && districtName) {
          const meta = parseJudicialDistrictMeta(districtName);
          geography.judicialDistrictLabels.push(String(districtName));
          if (meta.kind === "appellate" && meta.appellateDistrict) {
            if (!geography.appellateDistricts.includes(meta.appellateDistrict)) {
              geography.appellateDistricts.push(meta.appellateDistrict);
            }
          }
          if (meta.kind === "trial" && meta.trialDistrict) {
            if (!geography.trialDistricts.includes(meta.trialDistrict)) {
              geography.trialDistricts.push(meta.trialDistrict);
            }
          }
        }

        // Always surface the district itself so school districts appear even when
        // Cicero has no individual board-member records for that area.
        if (districtType === "SCHOOL" && districtName) {
          politicians.push({
            external_key: `cicero-district:school:${districtId || districtName}`
              .toLowerCase(),
            bioguide_id: null,
            level: "school",
            chamber: "school_district",
            name: String(districtName),
            party: "Nonpartisan",
            state: String(district.state || "").toUpperCase(),
            district: district.subtype ? String(district.subtype) : "",
            photo_url: "",
            website_url: "",
            phone: "",
            source: "cicero-school-district",
            metadata: {
              office_title: "School District",
              district_only: true,
              district_type: "SCHOOL",
              note: "School district for this address. Individual board members appear when Cicero has them.",
            },
          });
        }

        if (!districtId) continue;

        try {
          const officials = await fetchCiceroPage({
            apiKey,
            lat,
            lng,
            query,
            districtType,
            offset: 0,
          });
          // Prefer exact district_id match when present on returned officials.
          const matched = officials.politicians.filter((person) => {
            const personDistrict = String(person.district || "").toLowerCase();
            const id = String(districtId).toLowerCase();
            return (
              personDistrict === id ||
              person.metadata?.district_type === districtType ||
              person.level ===
                (districtType === "SCHOOL"
                  ? "school"
                  : districtType === "JUDICIAL"
                    ? "state"
                    : "county")
            );
          });

          // Also do a targeted call with district_id when supported.
          const targetedParams = new URLSearchParams({
            format: "json",
            key: apiKey,
            max: "200",
            district_type: districtType,
            district_id: String(districtId),
          });
          if (lat != null && lng != null) {
            targetedParams.set("lat", String(lat));
            targetedParams.set("lon", String(lng));
          } else {
            targetedParams.set("search_loc", query);
          }
          const targetedResponse = await fetch(
            `${CICERO_BASE}/official?${targetedParams.toString()}`
          );
          const targetedPayload = await targetedResponse.json();
          const targetedOfficials = extractCiceroPoliticians(targetedPayload);
          politicians.push(...matched, ...targetedOfficials);
        } catch (error) {
          typeErrors.push({
            district_type: `${districtType}:${districtId}`,
            error: error.message || String(error),
          });
        }
      }
    } catch (error) {
      typeErrors.push({
        district_type: districtType,
        error: error.message || String(error),
      });
    }
  }

  return { politicians, typeErrors, geography };
}

function isRelevantOfficeholder(politician) {
  if (!politician?.name) return false;
  if (politician.level !== "federal") return true;

  // Keep elected federal offices; drop appointed cabinet / agency heads that
  // drown out local results without representing the address's district.
  if (politician.chamber === "senate" || politician.chamber === "house") {
    return true;
  }
  if (politician.chamber === "executive") return true;
  const title = String(
    politician.metadata?.office_title || politician.chamber || ""
  ).toLowerCase();
  if (title.includes("vice president")) return true;
  if (/\bpresident\b/.test(title) && !title.includes("pro tempore")) return true;
  return false;
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
  let county = "";
  let lat = null;
  let lng = null;
  let geography = emptyGeography();
  let placeMode = false;
  let samplePointCount = 0;

  try {
    // 1) Geocode whenever possible — also supplies federal/state (+ school district names).
    if (geocodioKey) {
      sourcesTried.push("geocodio");
      try {
        const geo = await fetchGeocodio(q, geocodioKey);
        address = geo.address || address;
        state = geo.state || state;
        county = geo.county || county;
        lat = geo.lat;
        lng = geo.lng;
        placeMode = Boolean(geo.placeMode);
        samplePointCount = geo.samplePointCount || 0;
        politicianLists.push(geo.politicians);
        geography = mergeGeography(geography, {
          state: geo.state,
          county: geo.county,
          stateSenateDistricts: geo.stateSenateDistricts || [],
          stateHouseDistricts: geo.stateHouseDistricts || [],
        });
        if (geo.expansionError) {
          sourceErrors.push({
            source: "geocodio-place-expand",
            error: geo.expansionError,
          });
        }
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
        geography = mergeGeography(geography, cicero.geography, {
          state,
          county,
        });
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

    const politicians = mergePoliticians(politicianLists).filter(
      isRelevantOfficeholder
    );
    if (!politicians.length) {
      return json(res, 404, {
        error:
          "No representatives found. Try a full street address. For city, county, and school board coverage, set CICERO_API_KEY (Google Civic Representatives was turned down in 2025).",
        sourcesTried,
        sourceErrors,
        geography: mergeGeography(geography, { state, county }),
      });
    }

    geography = mergeGeography(geography, { state, county });

    const senateCount = geography.stateSenateDistricts?.length || 0;
    const houseCount = geography.stateHouseDistricts?.length || 0;
    const coverageNote = placeMode
      ? `City/place search: sampled ${samplePointCount || "multiple"} points across the place and matched ${senateCount} state senate and ${houseCount} state house/assembly districts. Statewide executives always load for the state. Use a street address for your exact single district.`
      : "Federal/state legislators come from Geocodio (+ Open States when configured). City, county, school board, and judges require Cicero or a working Google Civic key. State / appellate / county benches load from state_officials via county_district_mapping.";

    return json(res, 200, {
      ok: true,
      query: q,
      address,
      state: geography.state || state,
      county: geography.county || county,
      placeMode,
      samplePointCount,
      geography,
      politicians,
      sourcesTried,
      sourceErrors,
      coverageNote,
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
