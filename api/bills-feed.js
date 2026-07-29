const API_BASE = "https://api.congress.gov/v3";
const OPENSTATES_BASE = "https://v3.openstates.org";
const CONGRESS = 119;
const DEFAULT_LIMIT = 16;
const PRIORITY_STATE_JURISDICTIONS = [
  "California",
  "Texas",
  "Florida",
  "New York",
  "Illinois",
  "Washington",
];

const STATE_CODE_TO_NAME = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
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
};

const STATE_NAME_TO_CODE = Object.fromEntries(
  Object.entries(STATE_CODE_TO_NAME).map(([code, name]) => [name.toLowerCase(), code])
);

function normalizeStateCode(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length === 2) return raw.toUpperCase();
  return STATE_NAME_TO_CODE[raw.toLowerCase()] || "";
}

function jurisdictionNameForStateCode(code) {
  return STATE_CODE_TO_NAME[normalizeStateCode(code)] || "";
}

function stateCodeFromJurisdiction(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const direct = normalizeStateCode(raw);
  if (direct) return direct;
  const lower = raw.toLowerCase();
  for (const [name, code] of Object.entries(STATE_NAME_TO_CODE)) {
    if (lower.includes(name)) return code;
  }
  return "";
}
function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.end(JSON.stringify(body));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Congress API ${response.status} for ${url}`);
  }
  return response.json();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSentences(text, max = 2) {
  const parts = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, max).join(" ");
}

function sponsorTitle(member = {}) {
  const district = member.district ? ` District ${member.district}` : "";
  if (member.currentMember === false) return "Former member";
  if (member.terms?.item?.[0]?.chamber) {
    const chamber = String(member.terms.item[0].chamber).toLowerCase();
    if (chamber.includes("senate")) return `Senator${district}`;
    if (chamber.includes("house")) return `Representative${district}`;
  }
  return member.state ? `${member.state}${district}` : "Sponsor";
}

function inferStatus(actionText = "", title = "") {
  const text = `${actionText} ${title}`.toLowerCase();
  if (text.includes("became public law") || text.includes("signed by president")) {
    return 4;
  }
  if (
    text.includes("passed senate") ||
    text.includes("passed house") ||
    text.includes("agreed to in senate") ||
    text.includes("agreed to in house")
  ) {
    return 3;
  }
  if (
    text.includes("committee") ||
    text.includes("ordered to be reported") ||
    text.includes("referred to the committee")
  ) {
    return 2;
  }
  return 1;
}

function buildSteps(currentStep, actionDate = "") {
  const steps = [
    "Introduced",
    "In Committee",
    "Chamber Vote",
    "Signed into Law",
  ];
  return steps.map((stepName, index) => ({
    stepNumber: index + 1,
    totalSteps: steps.length,
    stepName,
    isCompleted: index + 1 < currentStep,
    isCurrent: index + 1 === currentStep,
    date: index + 1 === currentStep ? actionDate || undefined : undefined,
  }));
}

function deltaSummaryFromText(text = "") {
  const summary = String(text || "").trim();
  if (!summary) {
    return { added: [], changed: [], removed: [] };
  }

  const snippets = summary
    .split(/(?<=[.;])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 3);

  const delta = { added: [], changed: [], removed: [] };
  for (const snippet of snippets) {
    const lower = snippet.toLowerCase();
    if (/\brepeal|\bremove|\bterminate|\bstrike\b/.test(lower)) {
      delta.removed.push(snippet);
    } else if (/\bamend|\bmodify|\brevise|\bextend|\bupdate\b/.test(lower)) {
      delta.changed.push(snippet);
    } else {
      delta.added.push(snippet);
    }
  }
  return delta;
}

function inferStateStatus(actionText = "", title = "") {
  const text = `${actionText} ${title}`.toLowerCase();
  if (text.includes("signed") || text.includes("chaptered") || text.includes("became law")) {
    return 4;
  }
  if (text.includes("passed") || text.includes("adopted") || text.includes("enrolled")) {
    return 3;
  }
  if (
    text.includes("committee") ||
    text.includes("referred") ||
    text.includes("hearing") ||
    text.includes("reading")
  ) {
    return 2;
  }
  return 1;
}

async function fetchBillSummary(congress, type, number, apiKey) {
  try {
    const url = `${API_BASE}/bill/${congress}/${type}/${number}/summaries?format=json&api_key=${apiKey}`;
    const data = await fetchJson(url);
    const summaries = data.summaries || [];
    const latest = summaries[summaries.length - 1];
    const plain = stripHtml(latest?.text || "");
    return plain || "";
  } catch {
    return "";
  }
}

async function fetchBillSubjects(congress, type, number, apiKey) {
  try {
    const url = `${API_BASE}/bill/${congress}/${type}/${number}/subjects?format=json&api_key=${apiKey}`;
    const data = await fetchJson(url);
    const tags = new Set();
    const policy = data?.subjects?.policyArea?.name || data?.policyArea?.name;
    if (policy) tags.add(policy);
    for (const item of data?.subjects?.legislativeSubjects || []) {
      if (item?.name) tags.add(item.name);
      if (tags.size >= 6) break;
    }
    return [...tags];
  } catch {
    return [];
  }
}

async function fetchBillDetails(congress, type, number, apiKey) {
  try {
    const url = `${API_BASE}/bill/${congress}/${type}/${number}?format=json&api_key=${apiKey}`;
    const data = await fetchJson(url);
    return data.bill || null;
  } catch {
    return null;
  }
}

async function toBillItem(bill, apiKey) {
  const type = String(bill.type || "").toLowerCase();
  const number = String(bill.number || "");
  const details = await fetchBillDetails(bill.congress, type, number, apiKey);
  const summaryText = await fetchBillSummary(bill.congress, type, number, apiKey);
  const tags = await fetchBillSubjects(bill.congress, type, number, apiKey);
  const actionText = bill.latestAction?.text || details?.latestAction?.text || "Updated";
  const actionDate =
    bill.latestAction?.actionDate || details?.latestAction?.actionDate || bill.updateDate || "";
  const currentStep = inferStatus(actionText, bill.title);
  const allSteps = buildSteps(currentStep, actionDate);
  const status = allSteps.find((step) => step.isCurrent) || allSteps[0];
  const sponsor =
    details?.sponsors?.[0] ||
    bill.sponsors?.[0] ||
    {};

  return {
    id: `federal-${bill.congress}-${type}-${number}`.toLowerCase(),
    billNumber: `${String(bill.type || "").toUpperCase()} ${number}`.trim(),
    title: bill.title || "Untitled bill",
    level: "Federal",
    jurisdiction: "U.S. Congress",
    stateCode: "",
    cityName: "",
    primarySponsor: {
      name: sponsor.fullName || sponsor.name || "Sponsor unavailable",
      title: sponsorTitle(sponsor),
    },
    lastUpdated: actionDate ? new Date(`${actionDate}T12:00:00`).toISOString() : new Date().toISOString(),
    status,
    allSteps,
    shortPitch:
      toSentences(summaryText, 2) ||
      toSentences(stripHtml(actionText), 1) ||
      "Recent federal legislative activity.",
    deltaSummary: deltaSummaryFromText(summaryText || actionText),
    officialUrl: `https://www.congress.gov/bill/${bill.congress}th-congress/${type}/${number}`,
    tags,
  };
}

async function fetchOpenStatesBillsForJurisdictions(apiKey, jurisdictions, perJurisdiction = 2) {
  const items = [];
  for (const jurisdiction of jurisdictions) {
    const params = new URLSearchParams({
      jurisdiction,
      sort: "updated_desc",
      per_page: String(perJurisdiction),
    });
    params.append("include", "sponsorships");
    params.append("include", "abstracts");
    params.append("include", "actions");

    try {
      const data = await fetchJson(
        `${OPENSTATES_BASE}/bills?${params.toString()}&apikey=${encodeURIComponent(apiKey)}`
      );
      for (const bill of data.results || []) {
        const actionText = bill.latest_action_description || bill.actions?.[bill.actions.length - 1]?.description || "Updated";
        const currentStep = inferStateStatus(actionText, bill.title);
        const allSteps = buildSteps(currentStep, bill.latest_action_date || bill.updated_at || "");
        const status = allSteps.find((step) => step.isCurrent) || allSteps[0];
        const summaryText =
          bill.abstracts?.[bill.abstracts.length - 1]?.abstract ||
          bill.extras?.summary ||
          "";
        const sponsor =
          bill.sponsorships?.find((entry) => entry.primary || entry.classification === "primary") ||
          bill.sponsorships?.[0] ||
          {};
        const stateCode =
          stateCodeFromJurisdiction(bill.jurisdiction?.name || jurisdiction) ||
          normalizeStateCode(jurisdiction);
        items.push({
          id: `state-${bill.id}`.toLowerCase(),
          billNumber: bill.identifier || "State bill",
          title: bill.title || "Untitled state bill",
          level: "State",
          jurisdiction: `${bill.jurisdiction?.name || jurisdiction} Legislature`,
          stateCode,
          cityName: "",
          primarySponsor: {
            name: sponsor.name || "Sponsor unavailable",
            title: "State legislator",
          },
          lastUpdated: bill.updated_at || new Date().toISOString(),
          status,
          allSteps,
          shortPitch:
            toSentences(stripHtml(summaryText), 2) ||
            toSentences(stripHtml(actionText), 1) ||
            "Recent state legislative activity.",
          deltaSummary: deltaSummaryFromText(summaryText || actionText),
          officialUrl: bill.openstates_url || "",
          tags: Array.isArray(bill.subject) ? bill.subject.slice(0, 6) : [],
        });
      }
    } catch (error) {
      console.error(`OpenStates ${jurisdiction} feed failed:`, error.message || error);
    }
  }
  return items;
}

function localPolicyItem({
  id,
  billNumber,
  title,
  level,
  jurisdiction,
  stateCode,
  cityName,
  countyName,
  sponsorName,
  sponsorTitle,
  lastUpdated,
  step,
  shortPitch,
  deltaSummary,
  officialUrl,
  tags,
}) {
  const allSteps = buildSteps(step, lastUpdated.slice(0, 10));
  const status = allSteps.find((entry) => entry.isCurrent) || allSteps[0];
  return {
    id,
    billNumber,
    title,
    level,
    jurisdiction,
    stateCode: normalizeStateCode(stateCode),
    cityName: cityName || "",
    countyName: countyName || "",
    primarySponsor: { name: sponsorName, title: sponsorTitle },
    lastUpdated,
    status,
    allSteps,
    shortPitch,
    deltaSummary,
    officialUrl,
    tags,
  };
}

function curatedCityAndDistrictItems() {
  return [
    localPolicyItem({
      id: "city-nyc-intro-1479-2024",
      billNumber: "Int 1479-2024",
      title: "Requires disclosure of large residential building energy use",
      level: "City",
      jurisdiction: "New York City Council",
      stateCode: "NY",
      cityName: "New York",
      sponsorName: "Council Member",
      sponsorTitle: "City Council",
      lastUpdated: "2026-07-20T12:00:00.000Z",
      step: 2,
      shortPitch:
        "City proposal would expand public reporting of energy use in large residential buildings to support climate goals.",
      deltaSummary: {
        added: ["Public energy-use disclosures for large residential buildings."],
        changed: ["Expands existing building reporting thresholds."],
        removed: [],
      },
      officialUrl: "https://legistar.council.nyc.gov/",
      tags: ["housing", "climate", "energy"],
    }),
    localPolicyItem({
      id: "city-chi-o2024-0001234",
      billNumber: "O2024-0001234",
      title: "Updates sidewalk cafe permitting and outdoor dining rules",
      level: "City",
      jurisdiction: "Chicago City Council",
      stateCode: "IL",
      cityName: "Chicago",
      sponsorName: "Alderman",
      sponsorTitle: "City Council",
      lastUpdated: "2026-07-18T12:00:00.000Z",
      step: 3,
      shortPitch:
        "Ordinance would streamline outdoor dining permits and clarify sidewalk cafe operating hours citywide.",
      deltaSummary: {
        added: ["Standardized outdoor dining permit timeline."],
        changed: ["Clarifies cafe operating hours and clearance requirements."],
        removed: ["Seasonal emergency outdoor dining waivers."],
      },
      officialUrl: "https://chicago.legistar.com/",
      tags: ["small business", "zoning", "public space"],
    }),
    localPolicyItem({
      id: "city-sd-o-2026-42",
      billNumber: "O-2026-42",
      title: "Expands tenant relocation assistance for no-fault evictions",
      level: "City",
      jurisdiction: "San Diego City Council",
      stateCode: "CA",
      cityName: "San Diego",
      sponsorName: "Councilmember",
      sponsorTitle: "City Council",
      lastUpdated: "2026-07-15T12:00:00.000Z",
      step: 2,
      shortPitch:
        "Would raise relocation assistance amounts for tenants displaced by no-fault evictions in San Diego.",
      deltaSummary: {
        added: ["Higher minimum relocation payments for qualifying households."],
        changed: ["Updates payment schedule by unit size."],
        removed: [],
      },
      officialUrl: "https://www.sandiego.gov/city-clerk/officialdocs",
      tags: ["housing", "tenants", "eviction"],
    }),
    localPolicyItem({
      id: "district-lausd-bp-6161",
      billNumber: "BP 6161",
      title: "Revises instructional materials adoption timeline",
      level: "District",
      jurisdiction: "Los Angeles Unified School District",
      stateCode: "CA",
      cityName: "Los Angeles",
      sponsorName: "Board Member",
      sponsorTitle: "School Board",
      lastUpdated: "2026-07-12T12:00:00.000Z",
      step: 3,
      shortPitch:
        "Board policy update shortens review cycles for instructional materials and adds parent comment windows.",
      deltaSummary: {
        added: ["Required public comment window before final adoption."],
        changed: ["Shortens materials review cycle from 24 to 18 months."],
        removed: [],
      },
      officialUrl: "https://www.lausd.org/",
      tags: ["education", "curriculum", "schools"],
    }),
    localPolicyItem({
      id: "district-hisd-board-2026-07",
      billNumber: "Board Item 2026-07",
      title: "Sets school safety camera retention and access rules",
      level: "District",
      jurisdiction: "Houston Independent School District",
      stateCode: "TX",
      cityName: "Houston",
      sponsorName: "Trustee",
      sponsorTitle: "School Board",
      lastUpdated: "2026-07-10T12:00:00.000Z",
      step: 2,
      shortPitch:
        "District policy would standardize camera footage retention periods and who may request access.",
      deltaSummary: {
        added: ["Defined retention periods for campus safety footage."],
        changed: ["Clarifies staff and law-enforcement access procedures."],
        removed: [],
      },
      officialUrl: "https://www.houstonisd.org/",
      tags: ["education", "school safety", "privacy"],
    }),
    localPolicyItem({
      id: "county-harris-tx-flood-2026-14",
      billNumber: "Order 2026-14",
      title: "Updates flood-control project funding priorities",
      level: "County",
      jurisdiction: "Harris County Commissioners Court",
      stateCode: "TX",
      cityName: "Houston",
      countyName: "Harris",
      sponsorName: "County Judge",
      sponsorTitle: "Commissioners Court",
      lastUpdated: "2026-07-14T12:00:00.000Z",
      step: 2,
      shortPitch:
        "County order would re-rank flood-mitigation projects and accelerate buyouts in high-risk watersheds.",
      deltaSummary: {
        added: ["Priority scoring for repetitive-loss neighborhoods."],
        changed: ["Reallocates bond capacity toward detention projects."],
        removed: [],
      },
      officialUrl: "https://www.harriscountytx.gov/",
      tags: ["flooding", "infrastructure", "housing"],
    }),
    localPolicyItem({
      id: "county-cook-il-transit-2026-09",
      billNumber: "Resolution 26-09",
      title: "Expands suburban bus service evening hours",
      level: "County",
      jurisdiction: "Cook County Board",
      stateCode: "IL",
      cityName: "Chicago",
      countyName: "Cook",
      sponsorName: "Commissioner",
      sponsorTitle: "County Board",
      lastUpdated: "2026-07-11T12:00:00.000Z",
      step: 3,
      shortPitch:
        "Would fund later evening and weekend bus service on high-demand suburban corridors.",
      deltaSummary: {
        added: ["Pilot funding for extended evening routes."],
        changed: ["Updates service-hour standards for partner agencies."],
        removed: [],
      },
      officialUrl: "https://www.cookcountyil.gov/",
      tags: ["transit", "workforce", "equity"],
    }),
    localPolicyItem({
      id: "county-sd-ca-housing-2026-22",
      billNumber: "Ordinance 11622",
      title: "Streamlines accessory dwelling unit permitting in unincorporated areas",
      level: "County",
      jurisdiction: "San Diego County Board of Supervisors",
      stateCode: "CA",
      cityName: "San Diego",
      countyName: "San Diego",
      sponsorName: "Supervisor",
      sponsorTitle: "Board of Supervisors",
      lastUpdated: "2026-07-09T12:00:00.000Z",
      step: 2,
      shortPitch:
        "County ordinance would shorten ADU review timelines and publish a single checklist for unincorporated communities.",
      deltaSummary: {
        added: ["One-stop ADU checklist for unincorporated parcels."],
        changed: ["Shortens planning review targets for ADU applications."],
        removed: [],
      },
      officialUrl: "https://www.sandiegocounty.gov/",
      tags: ["housing", "zoning", "adu"],
    }),
    localPolicyItem({
      id: "county-la-ca-air-2026-05",
      billNumber: "Motion 26-005",
      title: "Strengthens warehouse truck-route air quality monitoring",
      level: "County",
      jurisdiction: "Los Angeles County Board of Supervisors",
      stateCode: "CA",
      cityName: "Los Angeles",
      countyName: "Los Angeles",
      sponsorName: "Supervisor",
      sponsorTitle: "Board of Supervisors",
      lastUpdated: "2026-07-08T12:00:00.000Z",
      step: 2,
      shortPitch:
        "Would require additional air monitors near warehouse corridors and publish quarterly community reports.",
      deltaSummary: {
        added: ["Quarterly public air-quality reports for warehouse corridors."],
        changed: ["Expands monitor siting near heavy truck routes."],
        removed: [],
      },
      officialUrl: "https://lacounty.gov/",
      tags: ["air quality", "environment", "public health"],
    }),
    localPolicyItem({
      id: "county-nyc-ny-shelter-2026-03",
      billNumber: "Local Law Intro 2026-03",
      title: "Coordinates borough shelter capacity reporting",
      level: "County",
      jurisdiction: "New York City / Borough continuum",
      stateCode: "NY",
      cityName: "New York",
      countyName: "New York",
      sponsorName: "Borough President liaison",
      sponsorTitle: "Intergovernmental",
      lastUpdated: "2026-07-07T12:00:00.000Z",
      step: 1,
      shortPitch:
        "Sample county-scale item tracking shelter bed capacity reporting across borough service areas.",
      deltaSummary: {
        added: ["Shared weekly shelter capacity dashboard."],
        changed: [],
        removed: [],
      },
      officialUrl: "https://www.nyc.gov/",
      tags: ["housing", "homelessness", "services"],
    }),
  ];
}

async function fetchFederalBills(apiKey, limit) {
  const listUrl = `${API_BASE}/bill/${CONGRESS}?limit=${limit}&sort=updateDate+desc&format=json&api_key=${apiKey}`;
  const listData = await fetchJson(listUrl);
  const bills = Array.isArray(listData.bills) ? listData.bills : [];
  const items = [];
  for (const bill of bills) {
    items.push(await toBillItem(bill, apiKey));
  }
  return items;
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.CONGRESS_API_KEY || process.env.API_KEY || "";
  const openStatesKey =
    process.env.OPENSTATES_API_KEY || process.env.OPEN_STATES_API_KEY || "";

  const limit = Math.max(4, Math.min(24, Number(req.query.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT));
  const stateFilter = normalizeStateCode(req.query.state);

  try {
    let federalItems = [];
    let federalCoverage = "coming soon";
    if (apiKey) {
      federalItems = await fetchFederalBills(apiKey, limit);
      federalCoverage = "live";
    }

    let jurisdictions = PRIORITY_STATE_JURISDICTIONS;
    if (stateFilter) {
      const name = jurisdictionNameForStateCode(stateFilter);
      jurisdictions = name ? [name] : [];
    }

    const stateItems = openStatesKey
      ? await fetchOpenStatesBillsForJurisdictions(openStatesKey, jurisdictions, 2)
      : [];
    let localItems = curatedCityAndDistrictItems();
    if (stateFilter) {
      localItems = localItems.filter((item) => item.stateCode === stateFilter);
    }

    const merged = [...federalItems, ...stateItems, ...localItems].sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );

    if (!merged.length) {
      return json(res, 500, {
        error:
          "Bill updates are temporarily unavailable. Please try again shortly.",
      });
    }

    return json(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      stateFilter: stateFilter || null,
      coverage: {
        Federal: federalCoverage,
        State: openStatesKey
          ? stateFilter
            ? `live (${jurisdictionNameForStateCode(stateFilter) || stateFilter})`
            : "live (selected jurisdictions)"
          : "coming soon",
        County: "sample (curated)",
        City: "sample (curated)",
        District: "sample (curated)",
      },
      items: merged,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Could not load bills feed" });
  }
};
