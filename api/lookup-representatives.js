const GEOCODIO_BASE = "https://api.geocod.io/v1.7";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

function getGeocodioKey() {
  return (
    process.env.GEOCODIO_API_KEY ||
    process.env.GEOCODIO_KEY ||
    ""
  );
}

function fullName(bio = {}) {
  return [bio.first_name, bio.middle_name, bio.last_name, bio.suffix]
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
  return party;
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
    },
  };
}

function mapStateLegislator(legislator, state, district, chamberHint) {
  const bio = legislator.bio || {};
  const contact = legislator.contact || {};
  const references = legislator.references || {};
  const type = String(legislator.type || chamberHint || "").toLowerCase();
  const chamber = type.includes("upper") || type.includes("senate")
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
    },
  };
}

function extractPoliticians(geocodeResult) {
  const result = geocodeResult?.results?.[0];
  if (!result) return { address: null, politicians: [] };

  const components = result.address_components || {};
  const state = (components.state || "").toUpperCase();
  const formatted = result.formatted_address || null;
  const fields = result.fields || {};
  const politicians = [];
  const seen = new Set();

  const districts = fields.congressional_districts || [];
  for (const district of districts) {
    const districtNumber = district.district_number;
    for (const legislator of district.current_legislators || []) {
      const mapped = mapFederalLegislator(legislator, state, districtNumber);
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
      const legislators = entry.current_legislators || [];
      if (legislators.length) {
        for (const legislator of legislators) {
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
      } else if (districtNumber) {
        const placeholder = {
          external_key: `state-district:${state}:${bucket.chamber}:${districtNumber}`.toLowerCase(),
          bioguide_id: null,
          level: "state",
          chamber: bucket.chamber,
          name: `${state} ${bucket.chamber === "state_senate" ? "State Senate" : "State House"} District ${districtNumber}`,
          party: "",
          state,
          district: String(districtNumber),
          photo_url: "",
          website_url: "",
          phone: "",
          source: "geocodio-district",
          metadata: { district_only: true, entry },
        };
        if (!seen.has(placeholder.external_key)) {
          seen.add(placeholder.external_key);
          politicians.push(placeholder);
        }
      }
    }
  }

  return {
    address: formatted,
    state,
    politicians,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return json(res, 204, {});
  }

  if (req.method !== "GET") {
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = getGeocodioKey();
  if (!apiKey) {
    return json(res, 500, {
      error: "Missing GEOCODIO_API_KEY environment variable",
    });
  }

  const url = new URL(req.url, "http://localhost");
  const q = (url.searchParams.get("q") || "").trim();
  if (!q) {
    return json(res, 400, { error: "Missing q (address or ZIP)" });
  }

  try {
    const geocodeUrl = `${GEOCODIO_BASE}/geocode?q=${encodeURIComponent(
      q
    )}&fields=cd,stateleg&limit=1&api_key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(geocodeUrl);
    const payload = await response.json();

    if (!response.ok) {
      return json(res, response.status, {
        error: payload.error || payload.message || "Geocodio lookup failed",
        details: payload,
      });
    }

    const extracted = extractPoliticians(payload);
    return json(res, 200, {
      ok: true,
      query: q,
      address: extracted.address,
      state: extracted.state,
      politicians: extracted.politicians,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Lookup failed" });
  }
};
