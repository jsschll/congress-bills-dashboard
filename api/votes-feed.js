const CONGRESS_API = "https://api.congress.gov/v3";
const CONGRESS = 119;
const DEFAULT_LIMIT = 16;
const {
  isProceduralLegislation,
  classifyVoteKind,
  completeSentences,
  DEFAULT_YEA_LABEL,
  DEFAULT_NAY_LABEL,
} = require("../lib/format-bill-summary");

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
    if (value) return value;
  }
  return "";
}

function toIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function displayDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const iso = toIsoDate(raw);
  return iso ? iso.slice(0, 10) : raw;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status}: ${text.slice(0, 160)}`);
  }
  return response.json();
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function toSentences(text, max = 2) {
  return completeSentences(text, { maxSentences: max, maxChars: 480 });
}

function normalizeVoteCast(voteCast = "") {
  const value = String(voteCast || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "Yea";
  if (value === "nay" || value === "no") return "Nay";
  if (value.includes("present")) return "Present";
  if (value.includes("not voting") || value === "nv") return "Not Voting";
  return voteCast || "—";
}

function mapSubjectCategory(policyArea = "") {
  const value = String(policyArea || "").toLowerCase();
  if (!value) return "Other";
  if (/health|medicare|medicaid|drug/.test(value)) return "Healthcare";
  if (/armed forces|defense|foreign|national security|intelligence/.test(value)) {
    return "Defense";
  }
  if (/tax|finance|economy|budget|appropriations|commerce|labor/.test(value)) {
    return "Economy";
  }
  if (/science|technology|communications|space/.test(value)) return "Tech";
  if (/energy/.test(value)) return "Energy";
  if (/civil rights|civil liberties|discrimination/.test(value)) return "Civil rights";
  if (/immigration|border/.test(value)) return "Immigration";
  if (/crime|law|justice/.test(value)) return "Justice";
  if (/education|family|housing|social welfare/.test(value)) return "Family";
  if (/environment|public lands|agriculture|water/.test(value)) return "Environment";
  return "Other";
}

function subjectMatches(vote, subjectQuery) {
  const subject = String(subjectQuery || "").trim().toLowerCase();
  if (!subject) return true;
  const aliases = {
    healthcare: ["healthcare", "health"],
    defense: ["defense", "armed", "national security", "foreign"],
    economy: ["economy", "tax", "budget", "appropriations", "finance", "commerce"],
    tech: ["tech", "technology", "science", "communications"],
    energy: ["energy"],
    "civil rights": ["civil rights", "civil liberties"],
    civil_rights: ["civil rights", "civil liberties"],
    immigration: ["immigration", "border"],
    justice: ["justice", "crime"],
    family: ["family", "education", "housing"],
    environment: ["environment", "agriculture", "public lands"],
  };
  const needles = aliases[subject] || [subject.replace(/_/g, " ")];
  const haystack = [
    vote.subjectCategory,
    vote.policyArea,
    ...(vote.tags || []),
    vote.title,
    vote.voteQuestion,
  ]
    .join(" ")
    .toLowerCase();
  return needles.some((needle) => haystack.includes(needle));
}

async function fetchBillSummary(congress, type, number, apiKey) {
  try {
    const url = `${CONGRESS_API}/bill/${congress}/${type}/${number}/summaries?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const data = await fetchJson(url);
    const summaries = data.summaries || [];
    if (!summaries.length) return "";
    const best = summaries.reduce((current, item) => {
      const currentText = stripHtml(current?.text || "");
      const itemText = stripHtml(item?.text || "");
      if (!current) return item;
      if (itemText.length > currentText.length) return item;
      return current;
    }, null);
    return stripHtml(best?.text || "");
  } catch {
    return "";
  }
}

async function fetchBillPolicyArea(congress, type, number, apiKey) {
  try {
    const url = `${CONGRESS_API}/bill/${congress}/${type}/${number}/subjects?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const data = await fetchJson(url);
    return (
      data?.subjects?.policyArea?.name ||
      data?.policyArea?.name ||
      data?.subjects?.legislativeSubjects?.[0]?.name ||
      ""
    );
  } catch {
    return "";
  }
}

function mapVoteCard(raw) {
  const congress = Number(raw.congress || CONGRESS);
  const sessionNumber = Number(raw.sessionNumber || 1);
  const rollCallNumber = Number(raw.rollCallNumber);
  const type = String(raw.legislationType || "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "");
  const number = String(raw.legislationNumber || "");
  const billNumber =
    type && number
      ? `${String(raw.legislationType || type).toUpperCase().replace(/\./g, "")} ${number}`
      : `Roll Call ${rollCallNumber}`;
  const voteQuestion = raw.voteQuestion || "";
  const result = raw.result || "";
  const voteKind = classifyVoteKind(voteQuestion, result, {
    legislationType: type,
    billNumber,
    billId: type && number ? `federal-${congress}-${type}-${number}` : "",
    title: raw.legislationTitle || "",
  });
  const billId =
    type && number && voteKind === "final_passage"
      ? `federal-${congress}-${type}-${number}`.toLowerCase()
      : `house-vote-${congress}-${sessionNumber}-${rollCallNumber}`;
  const title =
    raw.legislationTitle ||
    voteQuestion ||
    `House Roll Call ${rollCallNumber}`;
  const date = displayDate(raw.startDate || raw.date || null);

  return {
    id: billId,
    billId,
    billNumber,
    title,
    level: "Federal",
    jurisdiction: "U.S. House",
    congress,
    sessionNumber,
    rollCallNumber,
    voteQuestion,
    voteKind,
    result,
    date,
    lastUpdated: toIsoDate(raw.startDate || raw.date) || new Date().toISOString(),
    officialUrl:
      type && number
        ? `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`
        : `https://clerk.house.gov/Votes/Details/${congress}${String(
            rollCallNumber
          ).padStart(3, "0")}`,
    clerkUrl: `https://clerk.house.gov/Votes/Details/${congress}${String(
      rollCallNumber
    ).padStart(3, "0")}`,
    shortPitch: title || voteQuestion || "",
    officialSummary: "",
    yeaMeans: "",
    nayMeans: "",
    yeaLabel: DEFAULT_YEA_LABEL,
    nayLabel: DEFAULT_NAY_LABEL,
    policyArea: "",
    subjectCategory: "Other",
    tags: [],
    primarySponsor: { name: "U.S. House", title: "Roll-call vote" },
    statusLabel: result || voteQuestion || "House vote",
    allSteps: [],
    status: null,
    deltaSummary: { added: [], changed: [], removed: [] },
    hasLinkedBill: Boolean(type && number),
    legislationType: type,
    legislationNumber: number,
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const apiKey =
    env("CONGRESS_API_KEY", "API_KEY") ||
    String(req.query.api_key || "").trim();
  if (!apiKey) {
    return json(res, 500, { error: "Missing Congress.gov API key." });
  }

  const limit = Math.min(
    40,
    Math.max(5, Number(req.query.limit) || DEFAULT_LIMIT)
  );
  const subject = String(req.query.subject || "").trim().toLowerCase();
  const includeProcedural =
    String(req.query.includeProcedural || "").toLowerCase() === "1" ||
    String(req.query.includeProcedural || "").toLowerCase() === "true";
  const kindFilter = String(req.query.kind || "").trim().toLowerCase();

  try {
    const listUrl = `${CONGRESS_API}/house-vote/${CONGRESS}?format=json&limit=80&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const listData = await fetchJson(listUrl);
    let cards = (listData.houseRollCallVotes || [])
      .map(mapVoteCard)
      .filter((vote) => vote.rollCallNumber);

    if (!includeProcedural) {
      cards = cards.filter(
        (vote) =>
          vote.voteKind !== "procedural" && !isProceduralLegislation(vote)
      );
    }
    if (kindFilter === "final_passage" || kindFilter === "amendment") {
      cards = cards.filter((vote) => vote.voteKind === kindFilter);
    } else {
      // Focus on final passage + major amendments; fall back to other
      // non-procedural votes if the recent window is thin.
      const substantive = cards.filter(
        (vote) =>
          vote.voteKind === "final_passage" || vote.voteKind === "amendment"
      );
      if (substantive.length >= Math.min(8, limit)) {
        cards = substantive;
      }
    }

    cards.sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
    cards = cards.slice(0, Math.max(limit * 2, limit));

    // Attach official CRS summaries only — no LLM rewrite at runtime.
    const enrichCount = Math.min(cards.length, Math.max(limit, 10));
    const enriched = [];
    const chunkSize = 4;
    for (let i = 0; i < enrichCount; i += chunkSize) {
      const chunk = cards.slice(i, i + chunkSize);
      const rows = await Promise.all(
        chunk.map(async (vote) => {
          if (vote.hasLinkedBill) {
            const [crsSummary, policyArea] = await Promise.all([
              fetchBillSummary(
                vote.congress,
                vote.legislationType,
                vote.legislationNumber,
                apiKey
              ),
              fetchBillPolicyArea(
                vote.congress,
                vote.legislationType,
                vote.legislationNumber,
                apiKey
              ),
            ]);
            const official =
              completeSentences(crsSummary, { maxSentences: 3, maxChars: 480 }) ||
              crsSummary ||
              "";
            vote.officialSummary = official;
            vote.shortPitch =
              official || vote.title || vote.voteQuestion || vote.shortPitch || "";
            vote.policyArea = policyArea || "";
            vote.subjectCategory = mapSubjectCategory(policyArea);
            vote.tags = policyArea ? [policyArea, vote.subjectCategory] : [];
            vote.summarySource = official ? "crs" : "official";
          } else {
            vote.shortPitch =
              vote.shortPitch || vote.title || vote.voteQuestion || "";
            vote.summarySource = "official";
          }
          vote.yeaMeans = vote.yeaMeans || "";
          vote.nayMeans = vote.nayMeans || "";
          vote.yeaLabel = vote.yeaLabel || DEFAULT_YEA_LABEL;
          vote.nayLabel = vote.nayLabel || DEFAULT_NAY_LABEL;
          return vote;
        })
      );
      enriched.push(...rows);
    }

    const remaining = cards.slice(enrichCount).map((vote) => {
      vote.shortPitch = vote.shortPitch || vote.title || vote.voteQuestion || "";
      vote.yeaMeans = vote.yeaMeans || "";
      vote.nayMeans = vote.nayMeans || "";
      vote.yeaLabel = vote.yeaLabel || DEFAULT_YEA_LABEL;
      vote.nayLabel = vote.nayLabel || DEFAULT_NAY_LABEL;
      vote.summarySource = "official";
      return vote;
    });

    let items = [...enriched, ...remaining];
    if (subject) {
      items = items.filter((vote) => subjectMatches(vote, subject));
    }

    items = items.slice(0, limit);

    return json(res, 200, {
      congress: CONGRESS,
      count: items.length,
      items,
      subjects: [
        "Healthcare",
        "Defense",
        "Economy",
        "Tech",
        "Energy",
        "Civil rights",
        "Immigration",
      ],
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Votes feed failed" });
  }
};
