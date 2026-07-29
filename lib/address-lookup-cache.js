/**
 * Address/ZIP lookup cache + roster enrichment for /api/lookup-representatives.
 *
 * Flow:
 *  1. Normalize query → cache_key (zip:##### or addr:…)
 *  2. If a row exists and fetched_at is < 30 days, return payload
 *  3. Otherwise caller runs live Civic APIs, then enrichWithDirectors()
 *     merges national_officials + geography-scoped state/local tables
 *  4. writeAddressLookupCache stores the combined roster
 */

const { createClient } = require("@supabase/supabase-js");

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function getSupabaseAdmin() {
  const url =
    env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function extractZip(value) {
  const match = String(value || "").match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : "";
}

function buildCacheKey(query) {
  const raw = String(query || "").trim();
  const collapsed = raw.toLowerCase().replace(/\s+/g, " ").trim();
  const digitsOnly = collapsed.replace(/\s+/g, "");
  if (/^\d{5}(-\d{4})?$/.test(digitsOnly)) {
    const zip = digitsOnly.slice(0, 5);
    return { cacheKey: `zip:${zip}`, zipCode: zip, queryRaw: raw };
  }
  const zipCode = extractZip(collapsed);
  return {
    cacheKey: `addr:${collapsed}`,
    zipCode: zipCode || null,
    queryRaw: raw,
  };
}

function isFresh(fetchedAt, now = Date.now()) {
  const ts = new Date(fetchedAt).getTime();
  if (!Number.isFinite(ts)) return false;
  return now - ts < CACHE_TTL_MS;
}

async function readAddressLookupCache(supabase, cacheKey) {
  if (!supabase || !cacheKey) return null;
  const { data, error } = await supabase
    .from("address_lookup_cache")
    .select("cache_key, zip_code, payload, fetched_at")
    .eq("cache_key", cacheKey)
    .maybeSingle();
  if (error) {
    console.warn("address_lookup_cache read failed:", error.message || error);
    return null;
  }
  if (!data?.payload || !isFresh(data.fetched_at)) return null;
  return data;
}

async function writeAddressLookupCache(
  supabase,
  { cacheKey, queryRaw, zipCode, payload }
) {
  if (!supabase || !cacheKey || !payload) return false;
  const now = new Date().toISOString();
  const row = {
    cache_key: cacheKey,
    query_raw: queryRaw || payload.query || cacheKey,
    zip_code: zipCode || extractZip(payload.address || payload.query) || null,
    state: payload.state || payload.geography?.state || null,
    city: payload.city || payload.geography?.city || null,
    county: payload.county || payload.geography?.county || null,
    place_mode: Boolean(payload.placeMode),
    payload,
    fetched_at: now,
    updated_at: now,
  };
  const { error } = await supabase
    .from("address_lookup_cache")
    .upsert(row, { onConflict: "cache_key" });
  if (error) {
    console.warn("address_lookup_cache write failed:", error.message || error);
    return false;
  }
  return true;
}

function normalizePartyLabel(party) {
  if (!party) return "";
  const value = String(party).toLowerCase();
  if (value.startsWith("dem")) return "Democratic";
  if (value.startsWith("rep")) return "Republican";
  if (value.startsWith("ind")) return "Independent";
  if (value.includes("nonpartisan") || value === "npa") return "Nonpartisan";
  return String(party);
}

function normalizeStateCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw.length === 2) return raw;
  const map = {
    TEXAS: "TX",
    CALIFORNIA: "CA",
    "NEW YORK": "NY",
    FLORIDA: "FL",
  };
  return map[raw] || raw.slice(0, 2);
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

function parseDistrictNumberList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (value == null || value === "") return [];
  return String(value)
    .split(/[,;/|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function districtNumbersMatch(rowValue, allowed) {
  if (!allowed?.length) return false;
  const normalizedAllowed = new Set(
    allowed.map((item) => String(item).replace(/^0+/, "") || "0")
  );
  return parseDistrictNumberList(rowValue).some((item) =>
    normalizedAllowed.has(String(item).replace(/^0+/, "") || "0")
  );
}

function classifyNationalGroup(row) {
  const category = String(row.category || "").toLowerCase();
  const title = String(row.title || "").toLowerCase();
  const department = String(row.department || "").toLowerCase();
  const blob = `${category} ${title} ${department}`;

  if (
    category === "president" ||
    category === "vice president" ||
    title === "president" ||
    title === "vice president" ||
    /^vice\s+president\b/.test(title) ||
    /\bpresident\s+of\s+the\s+united\s+states\b/.test(title)
  ) {
    return "executive";
  }
  if (
    category.includes("supreme court") ||
    (category.includes("supreme") && category.includes("justice"))
  ) {
    return "supreme_court";
  }
  if (category.includes("cabinet")) return "cabinet";
  if (category.includes("agency director")) return "agency_director";
  if (
    category.includes("white house") ||
    category.includes("executive office") ||
    category === "eop"
  ) {
    return "white_house";
  }
  if (/supreme\s+court|chief\s+justice/.test(title)) return "supreme_court";
  if (/\bsecretary of\b|\battorney general\b/.test(blob)) return "cabinet";
  if (
    /agency\s+director|administrator|\bdirector of\b|\bcommissioner\b|\bfbi\b|\bepa\b|\bnasa\b|\bomb\b/.test(
      blob
    )
  ) {
    return "agency_director";
  }
  if (/white\s+house|chief\s+of\s+staff|executive office/.test(blob)) {
    return "white_house";
  }
  return "agency_director";
}

function mapNationalOfficial(row) {
  const group = classifyNationalGroup(row);
  const chamber =
    group === "supreme_court"
      ? "supreme_court"
      : group === "agency_director"
        ? "agency_director"
        : group === "executive"
          ? "executive"
          : group === "white_house"
            ? "white_house"
            : "cabinet";
  const title = String(row.title || row.department || "").trim();
  return {
    external_key: `national:${row.id}`,
    bioguide_id: null,
    level: "federal",
    chamber,
    name: row.full_name || "Unknown",
    party: normalizePartyLabel(row.party || ""),
    state: "US",
    district: "",
    photo_url: row.photo_url || "",
    website_url: "",
    phone: "",
    source: "national_officials",
    office_title: title,
    metadata: {
      office_title: title,
      department: row.department || "",
      branch: row.branch || "",
      category: row.category || "",
      national_official_id: row.id,
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
        external_key: `national:${row.id}`,
      },
    ],
  };
}

function mapStateOfficialRow(row) {
  const level = String(row.level || "").trim();
  const levelKey = level.toLowerCase();
  const agency = String(row.court_or_agency || "").trim();
  const officeTitle =
    String(row.title || "").trim() || agency || level || "State official";

  let courtGroup = "statewide";
  let chamber = "state_executive";
  if (levelKey === "legislative") {
    courtGroup = "legislative";
    const agencyLower = agency.toLowerCase();
    if (agencyLower.includes("senate")) chamber = "state_senate";
    else if (
      agencyLower.includes("house") ||
      agencyLower.includes("assembly")
    ) {
      chamber = "state_house";
    } else chamber = "state_legislature";
  } else if (levelKey === "appellate") {
    courtGroup = "appellate";
    chamber = "state_appellate";
  } else if (levelKey === "district") {
    courtGroup = "district";
    chamber = "state_district";
  } else if (levelKey.startsWith("county")) {
    courtGroup = "county";
    chamber = "county_court";
  } else if (/executive|governor|attorney general|secretary/.test(
    `${agency} ${officeTitle}`.toLowerCase()
  )) {
    courtGroup = "executive";
    chamber = "state_executive";
  }

  const district = String(row.district_number || row.county_name || "");
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
      district_number:
        row.district_number != null ? String(row.district_number) : "",
      state_official_id: row.id,
      party: normalizePartyLabel(row.party || ""),
      selection_method: String(row.selection_method || "").trim().toLowerCase(),
      appointed_by: String(row.appointed_by || "").trim(),
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

function mapLocalOfficialRow(row) {
  const title = String(row.title || "Mayor").trim() || "Mayor";
  const isMayor = title.toLowerCase().includes("mayor");
  return {
    external_key: `local-official:${row.id}`,
    bioguide_id: null,
    level: "city",
    chamber: isMayor ? "mayor" : "city_council",
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
      selection_method: String(row.selection_method || "").trim().toLowerCase(),
      appointed_by: String(row.appointed_by || "").trim(),
      source_name: row.source_name || "",
      source_ref: row.source_ref || "",
      government_type: row.government_type || "",
      coverage_status: row.coverage_status || "",
    },
    levels: ["city"],
    offices: [
      {
        level: "city",
        chamber: isMayor ? "mayor" : "city_council",
        office_title: title,
        district: "",
        source: "local_officials",
        external_key: `local-official:${row.id}`,
      },
    ],
  };
}

async function fetchNationalOfficials(supabase) {
  if (!supabase) return [];
  const { data, error } = await supabase.from("national_officials").select("*");
  if (error) {
    console.warn("national_officials fetch failed:", error.message || error);
    return [];
  }
  return (data || []).map(mapNationalOfficial).filter((row) => row?.name);
}

async function fetchStateOfficialsForGeography(supabase, geography = {}) {
  if (!supabase) return [];
  const stateCode = normalizeStateCode(geography.state);
  const countyName = normalizeCountyName(geography.county);
  if (!stateCode) return [];

  let mapping = null;
  if (countyName) {
    const variants = [
      countyName,
      `${countyName} County`,
      countyName.replace(/\s+parish$/i, ""),
    ];
    for (const variant of variants) {
      const { data, error } = await supabase
        .from("county_district_mapping")
        .select("*")
        .eq("state_code", stateCode)
        .ilike("county_name", variant)
        .limit(1);
      if (error) {
        console.warn("county_district_mapping error:", error.message || error);
        break;
      }
      if (data?.length) {
        mapping = data[0];
        break;
      }
    }
    if (!mapping) {
      const { data } = await supabase
        .from("county_district_mapping")
        .select("*")
        .eq("state_code", stateCode)
        .ilike("county_name", `%${countyName}%`)
        .limit(1);
      mapping = data?.[0] || null;
    }
  }

  const appellateNumbers = parseDistrictNumberList(
    mapping?.appellate_district_numbers ?? mapping?.appellate_district_number
  );
  const judicialNumbers = parseDistrictNumberList(
    mapping?.judicial_district_numbers
  );
  const senateDistricts = parseDistrictNumberList(
    geography.stateSenateDistricts
  );
  const houseDistricts = parseDistrictNumberList(geography.stateHouseDistricts);
  const legislativeDistricts = [
    ...new Set([...senateDistricts, ...houseDistricts]),
  ];

  const [
    statewideRes,
    appellateRes,
    districtRes,
    countyRes,
    legislativeRes,
  ] = await Promise.all([
    supabase
      .from("state_officials")
      .select("*")
      .eq("state_code", stateCode)
      .eq("level", "Statewide"),
    appellateNumbers.length
      ? supabase
          .from("state_officials")
          .select("*")
          .eq("state_code", stateCode)
          .eq("level", "Appellate")
      : Promise.resolve({ data: [], error: null }),
    judicialNumbers.length
      ? supabase
          .from("state_officials")
          .select("*")
          .eq("state_code", stateCode)
          .eq("level", "District")
      : Promise.resolve({ data: [], error: null }),
    countyName
      ? supabase
          .from("state_officials")
          .select("*")
          .eq("state_code", stateCode)
          .in("level", ["County/Magistrate", "County"])
      : Promise.resolve({ data: [], error: null }),
    legislativeDistricts.length
      ? supabase
          .from("state_officials")
          .select("*")
          .eq("state_code", stateCode)
          .eq("level", "Legislative")
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [
    statewideRes,
    appellateRes,
    districtRes,
    countyRes,
    legislativeRes,
  ]) {
    if (result.error) {
      console.warn("state_officials query error:", result.error.message);
    }
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
  const legislativeRows = (legislativeRes.data || []).filter((row) =>
    districtNumbersMatch(row.district_number, legislativeDistricts)
  );

  return [
    ...(statewideRes.data || []),
    ...appellateRows,
    ...districtRows,
    ...countyRows,
    ...legislativeRows,
  ]
    .map(mapStateOfficialRow)
    .filter((row) => row?.name);
}

async function fetchLocalOfficialsForGeography(supabase, geography = {}) {
  if (!supabase) return [];
  const stateCode = normalizeStateCode(geography.state);
  const cityName = normalizeCityName(geography.city);
  if (!stateCode || !cityName) return [];

  const candidates = [
    cityName,
    cityName.replace(/\s+urban county$/i, ""),
    cityName.replace(/\s+city$/i, ""),
    cityName.replace(/^boise city$/i, "Boise"),
  ]
    .map((value) => normalizeCityName(value))
    .filter(Boolean);

  for (const candidate of [...new Set(candidates)]) {
    const { data, error } = await supabase
      .from("local_officials")
      .select("*")
      .eq("state_code", stateCode)
      .ilike("city_name", candidate)
      .limit(50);
    if (error) {
      console.warn("local_officials error:", error.message || error);
      return [];
    }
    if (data?.length) {
      return data.map(mapLocalOfficialRow).filter((row) => row?.name);
    }
  }
  return [];
}

async function fetchStoredFederalExecutives(supabase) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("politicians")
    .select("*")
    .eq("level", "federal")
    .eq("chamber", "executive")
    .order("name");
  if (error) {
    console.warn("stored federal executives error:", error.message || error);
    return [];
  }
  return (data || []).map((row) => {
    const officeTitle =
      row.office_title || row.metadata?.office_title || row.chamber || "";
    return {
      ...row,
      office_title: officeTitle,
      metadata: {
        ...(row.metadata || {}),
        office_title: officeTitle,
      },
      levels: [row.level || "federal"],
      offices: [
        {
          level: row.level || "federal",
          chamber: row.chamber || "",
          office_title: officeTitle,
          district: row.district || "",
          source: row.source || "politicians",
          external_key: row.external_key,
        },
      ],
    };
  });
}

/**
 * Merge live Civic API politicians with global Federal/State directors and
 * geography-scoped state/local directories from Supabase.
 */
async function enrichLookupRoster(supabase, basePayload) {
  const geography = {
    ...(basePayload.geography || {}),
    state: basePayload.geography?.state || basePayload.state || "",
    city: basePayload.geography?.city || basePayload.city || "",
    county: basePayload.geography?.county || basePayload.county || "",
  };

  const [
    nationalOfficials,
    stateOfficials,
    localOfficials,
    storedExecutives,
  ] = await Promise.all([
    fetchNationalOfficials(supabase),
    fetchStateOfficialsForGeography(supabase, geography),
    fetchLocalOfficialsForGeography(supabase, geography),
    fetchStoredFederalExecutives(supabase),
  ]);

  const fetchedAt = new Date().toISOString();
  return {
    ...basePayload,
    geography,
    nationalOfficials,
    stateOfficials,
    localOfficials,
    storedExecutives,
    rosterEnriched: true,
    fetchedAt,
  };
}

function cacheMeta({ hit, fetchedAt, cacheKey, skippedReason = "" }) {
  const fetched = fetchedAt ? new Date(fetchedAt) : null;
  const ageMs = fetched ? Date.now() - fetched.getTime() : null;
  return {
    hit: Boolean(hit),
    cacheKey: cacheKey || null,
    fetchedAt: fetchedAt || null,
    ageDays:
      ageMs != null && Number.isFinite(ageMs)
        ? Math.round((ageMs / (24 * 60 * 60 * 1000)) * 10) / 10
        : null,
    ttlDays: 30,
    skippedReason: skippedReason || null,
  };
}

module.exports = {
  CACHE_TTL_MS,
  buildCacheKey,
  cacheMeta,
  enrichLookupRoster,
  getSupabaseAdmin,
  isFresh,
  readAddressLookupCache,
  writeAddressLookupCache,
};
