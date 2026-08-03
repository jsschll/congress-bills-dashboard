/**
 * Geocodio helper for resolving ZIP/address → state + congressional district.
 * Falls back to a mock resolver when GEOCODIO_API_KEY is missing.
 */

const GEOCODIO_BASE = "https://api.geocod.io/v1.7";

/** @type {Record<string, { state: string, district: string, formattedAddress: string }>} */
const MOCK_ZIP_DISTRICTS = {
  "10001": {
    state: "NY",
    district: "12",
    formattedAddress: "New York, NY 10001",
  },
  "20500": {
    state: "DC",
    district: "AL",
    formattedAddress: "Washington, DC 20500",
  },
  "30301": {
    state: "GA",
    district: "5",
    formattedAddress: "Atlanta, GA 30301",
  },
  "60601": {
    state: "IL",
    district: "7",
    formattedAddress: "Chicago, IL 60601",
  },
  "75201": {
    state: "TX",
    district: "30",
    formattedAddress: "Dallas, TX 75201",
  },
  "78701": {
    state: "TX",
    district: "37",
    formattedAddress: "Austin, TX 78701",
  },
  "85001": {
    state: "AZ",
    district: "3",
    formattedAddress: "Phoenix, AZ 85001",
  },
  "90210": {
    state: "CA",
    district: "32",
    formattedAddress: "Beverly Hills, CA 90210",
  },
  "94102": {
    state: "CA",
    district: "11",
    formattedAddress: "San Francisco, CA 94102",
  },
  "98101": {
    state: "WA",
    district: "7",
    formattedAddress: "Seattle, WA 98101",
  },
};

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function extractZip(value) {
  const match = String(value || "").match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : "";
}

/**
 * Normalize congressional district tokens for comparison.
 * @param {string|number|null|undefined} value
 */
function normalizeDistrict(value) {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/^0+/, "");
  if (!raw || raw === "STATEWIDE" || raw === "SENATE") return "";
  if (raw === "AL" || raw === "AT-LARGE" || raw === "AT LARGE" || raw === "0") {
    return "AL";
  }
  const digits = raw.match(/(\d+)/);
  if (digits) return String(Number(digits[1]));
  return raw;
}

function districtsMatch(a, b) {
  const left = normalizeDistrict(a);
  const right = normalizeDistrict(b);
  if (!left || !right) return false;
  return left === right;
}

/**
 * @param {string} query
 * @returns {{ state: string, district: string, formattedAddress: string, zipCode: string|null, source: string, lat: number|null, lng: number|null, bioguides: string[] }}
 */
function mockResolveDistrict(query) {
  const zipCode = extractZip(query);
  if (zipCode && MOCK_ZIP_DISTRICTS[zipCode]) {
    const hit = MOCK_ZIP_DISTRICTS[zipCode];
    return {
      state: hit.state,
      district: normalizeDistrict(hit.district),
      formattedAddress: hit.formattedAddress,
      zipCode,
      source: "mock",
      lat: null,
      lng: null,
      bioguides: [],
    };
  }

  const stateMatch = String(query || "").match(/\b([A-Za-z]{2})\b(?:\s+\d{5})?$/);
  const embedded = String(query || "").match(/,\s*([A-Za-z]{2})\b/);
  const state = String(
    (embedded && embedded[1]) || (stateMatch && stateMatch[1]) || "TX"
  ).toUpperCase();

  return {
    state,
    district: "1",
    formattedAddress: zipCode
      ? `${state} ${zipCode}`
      : String(query || "").trim() || `${state} district 1`,
    zipCode: zipCode || null,
    source: "mock",
    lat: null,
    lng: null,
    bioguides: [],
  };
}

/**
 * Resolve a ZIP or street address into state + congressional district.
 * @param {{ zipCode?: string|null, address?: string|null, apiKey?: string|null }} input
 */
async function resolveCongressionalDistrict(input = {}) {
  const zipCode = String(input.zipCode || "").trim();
  const address = String(input.address || "").trim();
  const query = address || zipCode;
  if (!query) {
    const error = new Error("Provide zipCode or address");
    error.statusCode = 400;
    throw error;
  }

  const apiKey =
    String(input.apiKey || "").trim() ||
    env("GEOCODIO_API_KEY", "GEOCODIO_KEY");

  if (!apiKey) {
    return mockResolveDistrict(query);
  }

  const url =
    `${GEOCODIO_BASE}/geocode?q=${encodeURIComponent(query)}` +
    `&fields=cd&limit=1&api_key=${encodeURIComponent(apiKey)}`;

  let response;
  try {
    response = await fetch(url);
  } catch (networkError) {
    const fallback = mockResolveDistrict(query);
    return {
      ...fallback,
      source: "mock-fallback",
      warning: networkError.message || "Geocodio network error",
    };
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const fallback = mockResolveDistrict(query);
    return {
      ...fallback,
      source: "mock-fallback",
      warning:
        payload.error ||
        payload.message ||
        `Geocodio failed (${response.status})`,
    };
  }

  const result = payload?.results?.[0];
  if (!result) {
    const error = new Error("No geocoding results for that ZIP/address");
    error.statusCode = 404;
    throw error;
  }

  const components = result.address_components || {};
  const state = String(components.state || "").toUpperCase();
  const districts = result.fields?.congressional_districts || [];
  const primary = districts[0] || {};
  const district = normalizeDistrict(
    primary.district_number ?? primary.name ?? primary.district
  );

  /** @type {string[]} */
  const bioguides = [];
  for (const cd of districts) {
    for (const legislator of cd.current_legislators || []) {
      const id = legislator?.references?.bioguide_id;
      if (id) bioguides.push(String(id).toUpperCase());
    }
  }

  if (!state) {
    const error = new Error("Geocodio result missing state");
    error.statusCode = 422;
    throw error;
  }

  return {
    state,
    district: district || "AL",
    formattedAddress: result.formatted_address || query,
    zipCode: extractZip(result.formatted_address) || extractZip(query) || null,
    source: "geocodio",
    lat: result.location?.lat ?? null,
    lng: result.location?.lng ?? null,
    bioguides: [...new Set(bioguides)],
  };
}

module.exports = {
  MOCK_ZIP_DISTRICTS,
  districtsMatch,
  env,
  extractZip,
  mockResolveDistrict,
  normalizeDistrict,
  resolveCongressionalDistrict,
};
