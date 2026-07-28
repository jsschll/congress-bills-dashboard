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

async function fetchOpenStatesBills(apiKey, perJurisdiction = 2) {
  const items = [];
  for (const jurisdiction of PRIORITY_STATE_JURISDICTIONS) {
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
        items.push({
          id: `state-${bill.id}`.toLowerCase(),
          billNumber: bill.identifier || "State bill",
          title: bill.title || "Untitled state bill",
          level: "State",
          jurisdiction: `${bill.jurisdiction?.name || jurisdiction} Legislature`,
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

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const apiKey = process.env.CONGRESS_API_KEY;
  const openStatesKey =
    process.env.OPENSTATES_API_KEY || process.env.OPEN_STATES_API_KEY || "";
  if (!apiKey) {
    return json(res, 500, { error: "Missing CONGRESS_API_KEY" });
  }

  const limit = Math.max(4, Math.min(24, Number(req.query.limit || DEFAULT_LIMIT) || DEFAULT_LIMIT));

  try {
    const listUrl = `${API_BASE}/bill/${CONGRESS}?limit=${limit}&sort=updateDate+desc&format=json&api_key=${apiKey}`;
    const listData = await fetchJson(listUrl);
    const bills = Array.isArray(listData.bills) ? listData.bills : [];
    const items = [];

    for (const bill of bills) {
      items.push(await toBillItem(bill, apiKey));
    }

    const stateItems = openStatesKey ? await fetchOpenStatesBills(openStatesKey, 2) : [];
    const merged = [...items, ...stateItems].sort(
      (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );

    return json(res, 200, {
      ok: true,
      generatedAt: new Date().toISOString(),
      coverage: {
        Federal: "live",
        State: openStatesKey ? "live (selected jurisdictions)" : "ready (needs OpenStates key)",
        City: "planned",
        District: "planned",
      },
      items: merged,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Could not load bills feed" });
  }
};
