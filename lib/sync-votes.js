/**
 * Sync House + Senate roll-call votes → Supabase `processed_votes`.
 * Shared by /api/votes (route=sync-votes) and scripts/run-sync-votes.js.
 */

const { createClient } = require("@supabase/supabase-js");
const { fetchLatestSenateVotes } = require("./senate-votes");

const CONGRESS_API = "https://api.congress.gov/v3";
const DEFAULT_CONGRESS = 119;
const DEFAULT_LIMIT = 100;
const MAX_SYNC_LIMIT = 250;
const OPENAI_MODEL = "gpt-4o-mini";
const ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

const POLICY_CATEGORIES = [
  "Economy & Taxes",
  "Healthcare",
  "Immigration & Border",
  "Housing & Infrastructure",
  "Foreign Policy & Defense",
  "Civil Rights & Justice",
  "Energy & Environment",
  "Education & Labor",
];

const SYSTEM_PROMPT = `You are an expert civic journalist translating complex federal legislation for everyday voters. Write at an 8th-grade reading level: short words, clear sentences, no jargon.

RULES:
- BAN JARGON: Eliminate references to tax codes, administrative databases (e.g. WEAMS), statutory sub-clauses, and legalisms. Do not use terms like 'appropriations', 'reconciliation', 'pursuant to title II', 'procedural motion', or raw amendment numbers.
- BE CONCRETE, NOT VAGUE: Prefer hard facts from the source text — dollar amounts, dates, agency names, who must do what, exact rules, caps, eligibility cuts, and penalties/fines. Name the actual programs, offices, or people affected when the text says so.
- BAN EMPTY BUZZWORDS: Do NOT write filler like "provides funding for", "addresses", "supports", "improves", "strengthens", "takes steps to", "aims to", or "makes changes related to" unless you immediately follow with the specific dollar amount, rule, agency directive, or penalty from the text.
- FOCUS ON REAL-WORLD IMPACT: Explain what changes for an ordinary citizen's wallet, rights, or community.
- MAXIMUM LENGTHS: card_summary ≤2 short sentences (~35 words). takeaway = 1 crisp headline line. key_points = exactly 3 short bullets. pro_argument / con_argument = 1 sentence each.
- PRIMARY CATEGORY: Assign exactly ONE primary_category from this list only:
  ${POLICY_CATEGORIES.map((c) => `"${c}"`).join(", ")}.
- KEY VOTE GATEKEEPER: Set \`is_key_vote: true\` for significant policy decisions, foreign military authorizations (including War Powers / S.J.Res. or H.J.Res. votes), major budget packages, and contentious amendments. Set \`is_key_vote: false\` for minor procedural steps.

Format your response in plain, direct English. Use Parent Bill + Amendment context, but never paste amendment numbers or process jargon. Do not invent programs, dollar amounts, repeals, bans, or funding cuts that are not clearly in the source text. Do not restate or paraphrase the bill title. No slogans and no fear-mongering.

EXPECTED OUTPUT JSON STRUCTURE (JSON only — no markdown, no code fences, no prose before or after):
{
  "short_title": "Clear 3-6 word topic name (e.g. Local Law Enforcement Hiring Grants)",
  "card_summary": "Adds $70B for border security agents and barriers. Affects staffing and enforcement near ports of entry.",
  "takeaway": "Big new border security funding package",
  "key_points": [
    "Adds $70B for border agents and barriers",
    "Affects communities and workers near the southern border",
    "Raises federal enforcement spending this year"
  ],
  "pro_argument": "Supporters say the $70B is needed to hire agents and reduce illegal crossings.",
  "con_argument": "Opponents say $70B is too much and skips broader immigration reforms.",
  "primary_category": "Immigration & Border",
  "is_key_vote": true
}`;

const VOTE_CARD_TOOL = {
  name: "submit_vote_card",
  description:
    "Submit the structured plain-language vote breakdown with concrete details (dollars, agencies, rules, penalties when present). Always call this tool with valid fields; never reply with free-form text.",
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      short_title: {
        type: "string",
        description:
          'Clear 3–6 word topic name. Example: "Local Law Enforcement Hiring Grants". No bill numbers or amendment codes.',
      },
      card_summary: {
        type: "string",
        description:
          "Strict ≤2 sentences AND ≤35 words (8th-grade level) for the scorecard accordion. Cover the exact legal/numeric mechanism from the text (dollars, agency directives, rules, caps, or penalties when present) plus direct citizen impact. Ban vague buzzwords like 'provides funding for' or 'addresses'. Do not repeat the bill title.",
      },
      takeaway: {
        type: "string",
        description:
          "1-line crisp takeaway headline for the deep-dive Bill Breakdown view. Prefer a concrete fact over a vague theme.",
      },
      key_points: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: { type: "string" },
        description:
          "Exactly 3 short bullets with concrete facts: mechanism (numbers/rules when present), who is affected, and fiscal/legal change.",
      },
      pro_argument: {
        type: "string",
        description:
          "1 concrete sentence on why supporters voted Yea / back this measure (include numbers/rules when in the text).",
      },
      con_argument: {
        type: "string",
        description:
          "1 concrete sentence on why opponents voted Nay / oppose this measure (include numbers/rules when in the text).",
      },
      primary_category: {
        type: "string",
        enum: POLICY_CATEGORIES,
        description:
          "Exactly one standardized policy category for filters and badges.",
      },
      is_key_vote: {
        type: "boolean",
        description:
          "true for significant policy decisions, foreign military authorizations, major budget packages, and contentious amendments; false for minor procedural steps.",
      },
    },
    required: [
      "short_title",
      "card_summary",
      "takeaway",
      "key_points",
      "pro_argument",
      "con_argument",
      "primary_category",
      "is_key_vote",
    ],
  },
};

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

function getSupabaseAdmin() {
  const url = env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for processed_votes upsert."
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status}: ${text.slice(0, 200)}`);
  }
  return response.json();
}

function normalizeBillType(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/\./g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * Ingestion allow-list:
 * - Bills (H.R., S.) and Joint Resolutions (H.J.Res., S.J.Res.)
 * - Motions to Proceed / Discharge on Joint Resolutions (e.g. War Powers)
 * Excludes: simple/concurrent resolutions, nominations, minor scheduling,
 * Motions to Table / Previous Question, and Motions to Proceed on ordinary bills.
 */
function isExcludedVote(vote = {}) {
  const billType = normalizeBillType(
    vote.legislationType || vote.bill_type || vote.billType || ""
  );
  const question = String(
    vote.voteQuestion || vote.question || vote.vote_question || ""
  );
  const title = String(vote.legislationTitle || vote.title || "");
  const issue = String(vote.issue || vote.bill_number || vote.billNumber || "");
  const hay = `${question} ${title} ${issue}`;
  const isJointRes = billType === "HJRES" || billType === "SJRES";
  const isBillOrJres =
    billType === "HR" ||
    billType === "S" ||
    billType === "HJRES" ||
    billType === "SJRES";

  // Routine lower-court / executive nominations.
  if (
    /\bnomination\b|\bon the nomination\b|\bconfirmed\b/i.test(hay) ||
    /^PN\d+/i.test(issue.trim())
  ) {
    return true;
  }

  // Simple / concurrent resolutions are feed clutter.
  if (
    billType === "HRES" ||
    billType === "SRES" ||
    billType === "HCONRES" ||
    billType === "SCONRES"
  ) {
    return true;
  }

  // When legislation type is known, only keep bills + joint resolutions.
  if (billType && !isBillOrJres) return true;

  // Always drop these routine floor motions.
  if (
    /motion to table|previous question|motion to adjourn|approve the journal|quorum call|election of speaker|ordering a second|committee of the whole/i.test(
      question
    )
  ) {
    return true;
  }

  // Minor executive / scheduling motions.
  if (
    /\b(morning business|unanimous consent|recess|scheduling|executive session)\b/i.test(
      question
    ) &&
    !isJointRes
  ) {
    return true;
  }

  // Motions to Proceed / Discharge: keep for joint resolutions only.
  if (/motion to (proceed|discharge)/i.test(question)) {
    return !isJointRes;
  }

  return false;
}

function displayDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildVoteId(vote) {
  const congress = Number(vote.congress || DEFAULT_CONGRESS);
  const session = Number(vote.sessionNumber || vote.session_number || 1);
  const roll = Number(vote.rollCallNumber || vote.roll_call_number);
  return `house-vote-${congress}-${session}-${roll}`;
}

function mapHouseVote(raw) {
  const congress = Number(raw.congress || DEFAULT_CONGRESS);
  const sessionNumber = Number(raw.sessionNumber || 1);
  const rollCallNumber = Number(raw.rollCallNumber);
  const billType = String(raw.legislationType || "").trim();
  const legislationNumber = String(raw.legislationNumber || "").trim();
  const billNumber =
    billType && legislationNumber
      ? `${billType.replace(/\./g, "").toUpperCase()} ${legislationNumber}`
      : null;
  const title =
    raw.legislationTitle ||
    raw.voteQuestion ||
    `House Roll Call ${rollCallNumber}`;
  const voteQuestion = raw.voteQuestion || "";
  const result = raw.result || "";
  const voteDate = displayDate(raw.startDate || raw.date || null);
  const typeKey = normalizeBillType(billType).toLowerCase();
  const officialUrl =
    typeKey && legislationNumber
      ? `https://www.congress.gov/bill/${congress}th-congress/${typeKey}/${legislationNumber}`
      : `https://clerk.house.gov/Votes/Details/${congress}${String(
          rollCallNumber
        ).padStart(3, "0")}`;
  const clerkUrl = `https://clerk.house.gov/Votes/Details/${congress}${String(
    rollCallNumber
  ).padStart(3, "0")}`;

  const rollCallId = buildVoteId({
    congress,
    sessionNumber,
    rollCallNumber,
  });
  return {
    // Existing Supabase table PK is roll_call_id (not id).
    roll_call_id: rollCallId,
    bill_id: billNumber || null,
    congress,
    session_number: sessionNumber,
    roll_call_number: rollCallNumber,
    chamber: "house",
    bill_type: billType || null,
    bill_number: billNumber,
    legislation_number: legislationNumber || null,
    title,
    vote_question: voteQuestion,
    result,
    vote_date: voteDate,
    official_url: officialUrl,
    clerk_url: clerkUrl,
    raw_payload: raw,
  };
}

async function fetchLatestHouseVotes(apiKey, { congress, limit }) {
  const url = `${CONGRESS_API}/house-vote/${congress}?format=json&limit=${Math.min(
    250,
    Math.max(limit * 3, limit)
  )}&api_key=${encodeURIComponent(apiKey)}`;
  const data = await fetchJson(url);
  const votes = Array.isArray(data.houseRollCallVotes)
    ? data.houseRollCallVotes
    : [];
  return votes
    .filter((vote) => !isExcludedVote(vote))
    .slice(0, limit)
    .map(mapHouseVote);
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBillNumberDisplay(billType, legislationNumber, fallback = "") {
  const type = normalizeBillType(billType);
  const number = String(legislationNumber || "").replace(/\D/g, "");
  if (!type || !number) return String(fallback || "").trim();
  if (type === "HR") return `H.R. ${number}`;
  if (type === "HJRES") return `H.J.Res. ${number}`;
  if (type === "HCONRES") return `H.Con.Res. ${number}`;
  if (type === "HRES") return `H.Res. ${number}`;
  if (type === "S") return `S. ${number}`;
  if (type === "SJRES") return `S.J.Res. ${number}`;
  if (type === "SCONRES") return `S.Con.Res. ${number}`;
  if (type === "SRES") return `S.Res. ${number}`;
  return `${type} ${number}`;
}

function parentBillCacheKey(vote) {
  const type = normalizeBillType(vote.bill_type).toLowerCase();
  const number = String(vote.legislation_number || "").trim();
  const congress = Number(vote.congress || DEFAULT_CONGRESS);
  if (!type || !number) return "";
  return `${congress}:${type}:${number}`;
}

/**
 * Fetch parent bill title / topic / CRS summary for Claude context.
 * Cached per sync run so many amendments on the same bill share one lookup.
 */
async function fetchParentBillContext(vote, apiKey, cache = new Map()) {
  const key = parentBillCacheKey(vote);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);

  const type = normalizeBillType(vote.bill_type).toLowerCase();
  const number = String(vote.legislation_number || "").trim();
  const congress = Number(vote.congress || DEFAULT_CONGRESS);
  const billNumber = formatBillNumberDisplay(
    type,
    number,
    vote.bill_number
  );

  const context = {
    billNumber,
    title: "",
    shortTitle: "",
    policyArea: "",
    topic: "",
    summaryText: "",
  };

  try {
    const detailUrl = `${CONGRESS_API}/bill/${congress}/${type}/${number}?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const detailData = await fetchJson(detailUrl);
    const bill = detailData.bill || detailData || {};
    context.title = stripHtml(bill.title || "");
    context.policyArea = stripHtml(bill.policyArea?.name || bill.policyArea || "");
  } catch (error) {
    console.warn("Parent bill detail fetch failed:", error.message || error);
  }

  try {
    const titlesUrl = `${CONGRESS_API}/bill/${congress}/${type}/${number}/titles?format=json&limit=20&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const titlesData = await fetchJson(titlesUrl);
    const titles = Array.isArray(titlesData.titles) ? titlesData.titles : [];
    const shortish = titles
      .map((item) => ({
        title: stripHtml(item?.title || ""),
        typeName: String(item?.titleType || item?.type || ""),
      }))
      .filter((item) => item.title)
      .sort((a, b) => {
        const aShort = /short/i.test(a.typeName) ? 0 : 1;
        const bShort = /short/i.test(b.typeName) ? 0 : 1;
        if (aShort !== bShort) return aShort - bShort;
        return a.title.length - b.title.length;
      });
    if (shortish[0]?.title) context.shortTitle = shortish[0].title;
  } catch (error) {
    console.warn("Parent bill titles fetch failed:", error.message || error);
  }

  try {
    const summaryUrl = `${CONGRESS_API}/bill/${congress}/${type}/${number}/summaries?format=json&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const summaryData = await fetchJson(summaryUrl);
    const summaries = summaryData.summaries || [];
    if (summaries.length) {
      const best = summaries.reduce((current, item) => {
        const currentText = stripHtml(current?.text || "");
        const itemText = stripHtml(item?.text || "");
        if (!current) return item;
        return itemText.length > currentText.length ? item : current;
      }, null);
      context.summaryText = stripHtml(best?.text || "");
    }
  } catch (error) {
    console.warn("CRS summary fetch failed:", error.message || error);
  }

  // Prefer a punchy short title; fall back to official title / policy area.
  const topicSource =
    context.shortTitle ||
    context.title ||
    context.policyArea ||
    "";
  context.topic = topicSource
    .replace(/\b(An? Act|A Bill)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  cache.set(key, context);
  return context;
}

/** @deprecated use fetchParentBillContext — kept for callers that only need CRS text */
async function fetchBillSummaryText(vote, apiKey) {
  const parent = await fetchParentBillContext(vote, apiKey);
  return parent?.summaryText || "";
}

function extractAmendmentLabel(vote = {}) {
  const haystack = [
    vote.title,
    vote.vote_question,
    vote.raw_payload?.title,
    vote.raw_payload?.question,
  ]
    .filter(Boolean)
    .join(" | ");
  const match = String(haystack).match(
    /([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,3})\s+Amdt\.?\s*(?:No\.?\s*)?(\d+)/i
  );
  if (match) {
    return `${match[1].replace(/\s+/g, " ").trim()} Amdt. ${match[2]}`;
  }
  if (
    String(vote.vote_kind || "").toLowerCase() === "amendment" ||
    /\bamdt\b|\bamendment\b/i.test(haystack)
  ) {
    const cleaned = String(vote.title || vote.vote_question || "")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned || "Floor amendment";
  }
  return "";
}

/**
 * Build Parent Bill + Amendment lines + source text for the Claude user prompt.
 */
function buildClaudeVoteContext(vote = {}, parent = null) {
  const billNumber =
    String(
      parent?.billNumber ||
        formatBillNumberDisplay(
          vote.bill_type,
          vote.legislation_number,
          vote.bill_number
        ) ||
        ""
    ).trim() || "Unknown bill";
  const parentTopic =
    String(parent?.topic || "").trim() ||
    String(vote.title || "")
      .replace(/\bAmdt\.?\s*(No\.?\s*)?\d+/gi, "")
      .replace(/^[^:]+:\s*/, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120);
  const parentLine = parentTopic
    ? `Parent Bill: ${billNumber} — ${parentTopic}`
    : `Parent Bill: ${billNumber}`;

  const amendmentLabel = extractAmendmentLabel(vote);
  const amendmentLine = amendmentLabel
    ? `Amendment: ${amendmentLabel}`
    : `Vote: ${String(vote.vote_question || vote.title || "Congressional roll call")
        .replace(/\s+/g, " ")
        .trim()}`;

  const sourceParts = [
    parent?.summaryText ? `Parent bill summary: ${parent.summaryText}` : "",
    vote.vote_question ? `Vote question: ${vote.vote_question}` : "",
    vote.title ? `Roll-call title: ${vote.title}` : "",
    parent?.policyArea ? `Policy area: ${parent.policyArea}` : "",
  ].filter(Boolean);

  return {
    parentLine,
    amendmentLine,
    amendmentLabel,
    parentTopic,
    billNumber,
    displayTitle: amendmentLabel
      ? `${billNumber}: ${amendmentLabel}`
      : vote.title || vote.vote_question || billNumber,
    rawText: sourceParts.join("\n\n"),
  };
}

function extractJsonObject(text) {
  let raw = String(text || "").trim();
  if (!raw) return null;

  // Strip common markdown wrappers Claude sometimes adds.
  raw = raw
    .replace(/^```(?:json|JSON)?\s*/m, "")
    .replace(/\s*```$/m, "")
    .trim();
  // If the model wrapped JSON in conversational text, keep the object span.
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    raw = raw.slice(start, end + 1);
  }

  try {
    return JSON.parse(raw);
  } catch {
    // Tolerate trailing commas / smart quotes from rare model slips.
    try {
      const cleaned = raw
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(cleaned);
    } catch {
      return null;
    }
  }
}

function normalizeShortTitle(value, fallbackTitle) {
  let title = String(value || "")
    .replace(/^(seed|placeholder)\s*:\s*/i, "")
    .replace(/\b(H\.?\s*R\.?|S\.?)\s*\d+\b/gi, "")
    .replace(/\bAmdt\.?\s*(No\.?\s*)?\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[:\-–—]\s*/, "")
    .trim();
  if (!title || /^<?\s*unknown\s*>?$/i.test(title)) {
    title = String(fallbackTitle || "")
      .replace(/\bAmdt\.?\s*(No\.?\s*)?\d+\b/gi, "Amendment")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
  }
  // Keep short titles punchy (under 6 words).
  const words = title.split(/\s+/).filter(Boolean).slice(0, 6);
  title = words.join(" ");
  if (title.length > 72) title = `${title.slice(0, 69).replace(/\s+\S*$/, "")}…`;
  return title || "Congressional roll call";
}

function coerceBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const raw = value.trim().toLowerCase();
    if (raw === "true" || raw === "1" || raw === "yes") return true;
    if (raw === "false" || raw === "0" || raw === "no") return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function inferIsKeyVote(parsed, fallbackTitle = "", context = {}) {
  if (
    parsed &&
    Object.prototype.hasOwnProperty.call(parsed, "is_key_vote")
  ) {
    return coerceBoolean(parsed.is_key_vote, false);
  }
  const hay = `${fallbackTitle} ${context.amendmentLine || ""} ${
    context.parentLine || ""
  } ${context.rawText || ""}`.toLowerCase();
  if (/war powers|military force|authorization for use|joint resolution|budget resolution|tax cut|tax hike|border wall|immigration|health care|medicare|social security/.test(
      hay
    )
  ) {
    return true;
  }
  if (/motion to (table|adjourn)|previous question|quorum|journal|naming/.test(hay)) {
    return false;
  }
  return false;
}

function collapseWs(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnknownClaudeValue(value = "") {
  return /^<?\s*unknown\s*>?$/i.test(collapseWs(value));
}

function splitPlainSentences(text = "") {
  const cleaned = collapseWs(text);
  if (!cleaned || isUnknownClaudeValue(cleaned)) return [];
  const protectedText = cleaned
    .replace(/\bU\.S\./gi, "US")
    .replace(/\bF\.Y\.?/gi, "FY")
    .replace(/\bNo\./gi, "No")
    .replace(/\bAmdt\./gi, "Amdt");
  return protectedText
    .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
    ?.map((part) => collapseWs(part).replace(/\bUS\b/g, "U.S."))
    .filter(Boolean) || [];
}

/** Cap plain_summary at 2 sentences / ~35 words for scannable cards. */
function clampPlainSummary(text = "", { maxSentences = 2, maxWords = 35 } = {}) {
  if (isUnknownClaudeValue(text)) return "";
  const sentences = splitPlainSentences(text).slice(0, maxSentences);
  if (!sentences.length) return "";
  let out = sentences.join(" ");
  const words = out.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    out = words.slice(0, maxWords).join(" ").replace(/[,:;–—-]+$/, "");
    if (!/[.!?]$/.test(out)) out = `${out}.`;
  } else if (!/[.!?]$/.test(out)) {
    out = `${out}.`;
  }
  return out;
}

/** Cap impact fields to one short clause (~14 words). */
function clampImpactLine(text = "", { maxWords = 14 } = {}) {
  let out = collapseWs(text);
  if (!out || isUnknownClaudeValue(out)) return "";
  out = out
    .replace(/^a (yea|nay) vote means\s+/i, "")
    .replace(/^votes?\s+(yes|no|yea|nay)?\s*(to|for|against)?\s*/i, "")
    .replace(/^(supports?|opposes?|supported|opposed)\s+/i, "");
  const first = splitPlainSentences(out)[0] || out;
  let words = collapseWs(first.replace(/[.!?]+$/, ""))
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > maxWords) words = words.slice(0, maxWords);
  out = words.join(" ");
  // Prefer gerund / noun-phrase style for footer lines.
  out = out.replace(/^to\s+/i, "");
  return out;
}

function normalizeKeyPoints(value, fallbacks = []) {
  let points = [];
  if (Array.isArray(value)) {
    points = value.map((item) => collapseWs(item)).filter(Boolean);
  } else if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        points = parsed.map((item) => collapseWs(item)).filter(Boolean);
      }
    } catch {
      points = value
        .split(/\n|•|;/)
        .map((part) => collapseWs(part))
        .filter(Boolean);
    }
  }
  points = points.filter((point) => point && !isUnknownClaudeValue(point));
  for (const fallback of fallbacks) {
    if (points.length >= 3) break;
    const text = collapseWs(fallback);
    if (text && !isUnknownClaudeValue(text) && !points.includes(text)) {
      points.push(text);
    }
  }
  while (points.length < 3) {
    points.push(
      [
        "This vote changes how a federal policy works in practice.",
        "It affects ordinary people, workers, or communities tied to the issue.",
        "Supporters and opponents disagree about the cost or tradeoffs.",
      ][points.length]
    );
  }
  return points.slice(0, 3).map((point) => {
    const words = point.split(/\s+/).filter(Boolean);
    if (words.length <= 18) return point.replace(/[.!?]+$/, "");
    return words.slice(0, 18).join(" ").replace(/[,:;–—-]+$/, "");
  });
}

function normalizePrimaryCategory(value, context = {}) {
  const raw = collapseWs(value);
  const exact = POLICY_CATEGORIES.find(
    (category) => category.toLowerCase() === raw.toLowerCase()
  );
  if (exact) return exact;

  // Map common aliases / older labels onto the standardized list.
  const lower = raw.toLowerCase();
  const aliasMap = [
    [/immigra|border|asylum|visa|deport|refugee|customs/, "Immigration & Border"],
    [/health|medicare|medicaid|hospital|pharma|vaccine|\baca\b/, "Healthcare"],
    [/\bhous(e|ing)\b|rent|mortgage|homeless|infra|transit|highway|bridge/, "Housing & Infrastructure"],
    [/foreign|defense|military|war powers|\bnato\b|troop|sanction/, "Foreign Policy & Defense"],
    [/civil|justice|voting|police|prison|\bgun\b|court|rights/, "Civil Rights & Justice"],
    [/energy|environ|climate|\bepa\b|emission|\boil\b|\bgas\b|renewable/, "Energy & Environment"],
    [/educat|school|student|labor|union|wage|worker|\bosha\b/, "Education & Labor"],
    [/tax|budget|economy|spend|deficit|debt|tariff|\birs\b|fee|payroll/, "Economy & Taxes"],
  ];
  for (const [re, category] of aliasMap) {
    if (re.test(lower)) return category;
  }

  const hay = `${context.fallbackTitle || ""} ${context.parentLine || ""} ${
    context.rawText || ""
  } ${context.displayTitle || ""}`.toLowerCase();
  for (const [re, category] of aliasMap) {
    if (re.test(hay)) return category;
  }
  return "Economy & Taxes";
}

function normalizeCard(parsed, fallbackTitle, context = {}) {
  // Prefer structured breakdown fields; fall back to legacy plain_summary / impacts.
  const card_summary = clampPlainSummary(
    parsed?.card_summary ||
      parsed?.plain_summary ||
      parsed?.what_it_does ||
      parsed?.summary ||
      ""
  );
  const takeaway = collapseWs(
    parsed?.takeaway || parsed?.short_title || fallbackTitle || ""
  )
    .split(/\s+/)
    .slice(0, 12)
    .join(" ");
  const takeawayClean = isUnknownClaudeValue(takeaway) ? "" : takeaway;
  const pro_argument = clampPlainSummary(
    parsed?.pro_argument || parsed?.yea_impact || parsed?.yea_means || "",
    { maxSentences: 1, maxWords: 28 }
  );
  const con_argument = clampPlainSummary(
    parsed?.con_argument || parsed?.nay_impact || parsed?.nay_means || "",
    { maxSentences: 1, maxWords: 28 }
  );
  const yea_impact = clampImpactLine(
    parsed?.yea_impact || parsed?.pro_argument || parsed?.yea_means || ""
  );
  const nay_impact = clampImpactLine(
    parsed?.nay_impact || parsed?.con_argument || parsed?.nay_means || ""
  );
  const short_title = normalizeShortTitle(
    parsed?.short_title || parsed?.takeaway,
    fallbackTitle
  );
  const is_key_vote = inferIsKeyVote(parsed, fallbackTitle, context);
  const primary_category = normalizePrimaryCategory(
    parsed?.primary_category || parsed?.category || "",
    { ...context, fallbackTitle, displayTitle: short_title }
  );

  const cardSummaryFallback =
    card_summary ||
    clampPlainSummary(
      fallbackTitle
        ? `This vote is about ${fallbackTitle}.`
        : "This is a recent congressional roll-call vote."
    );
  const yeaFallback =
    yea_impact || clampImpactLine(pro_argument) || "Advancing this measure as written";
  const nayFallback =
    nay_impact || clampImpactLine(con_argument) || "Rejecting this measure";
  const proFallback =
    pro_argument ||
    `Supporters back ${yeaFallback.charAt(0).toLowerCase()}${yeaFallback.slice(1)}.`;
  const conFallback =
    con_argument ||
    `Opponents want to stop ${nayFallback.charAt(0).toLowerCase()}${nayFallback.slice(1)}.`;
  const key_points = normalizeKeyPoints(parsed?.key_points, [
    cardSummaryFallback,
    yeaFallback,
    nayFallback,
  ]);
  const takeawayFallback =
    takeawayClean || short_title || "Congressional roll-call vote";

  return {
    // Keep legacy columns filled from the plain-language fields.
    summary: cardSummaryFallback,
    yea_means: yeaFallback,
    nay_means: nayFallback,
    yea_label: "Support Measure",
    nay_label: "Oppose Measure",
    short_title,
    plain_summary: cardSummaryFallback,
    // Mirror for older readers that still select what_it_does.
    what_it_does: cardSummaryFallback,
    yea_impact: yeaFallback,
    nay_impact: nayFallback,
    card_summary: cardSummaryFallback,
    takeaway: takeawayFallback,
    key_points,
    pro_argument: proFallback,
    con_argument: conFallback,
    primary_category,
    is_key_vote,
  };
}

function buildUserPrompt(context = {}) {
  const parentLine =
    context.parentLine ||
    `Parent Bill: ${context.billNumber || "Unknown bill"}`;
  const amendmentLine =
    context.amendmentLine ||
    `Vote: ${context.displayTitle || "Congressional roll call"}`;
  const rawText = String(context.rawText || "").slice(0, 6000);

  return `${parentLine}
${amendmentLine}

Source text (use for facts only — translate into plain English; do not copy jargon or amendment numbers into the output):
"""
${rawText || "(No CRS summary available.)"}
"""

Call submit_vote_card with ONLY these fields:
- short_title: clear 3–6 word topic (e.g. "Local Law Enforcement Hiring Grants")
- card_summary: ≤2 sentences AND ≤35 words; cover the exact legal/numeric mechanism (dollars, agencies, rules, penalties) and direct citizen impact — no vague buzzwords; do not copy the title
- takeaway: 1-line crisp concrete headline for the deep-dive breakdown
- key_points: exactly 3 short bullets with hard facts (mechanism, who is affected, fiscal/legal change)
- pro_argument: 1 concrete sentence on why supporters voted Yea
- con_argument: 1 concrete sentence on why opponents voted Nay
- primary_category: exactly one of ${POLICY_CATEGORIES.map((c) => `"${c}"`).join(", ")}
- is_key_vote: true for significant policy / War Powers / major budget / contentious amendments; false for minor procedural steps

Write at an 8th-grade reading level. Ban jargon and empty filler ("provides funding for", "addresses", "supports", "improves") unless followed by a specific fact from the text. Keep every field punchy and scannable. Return structured tool input only.`;
}

function parseAnthropicVoteCard(data) {
  const blocks = Array.isArray(data?.content) ? data.content : [];
  const toolBlock = blocks.find(
    (part) =>
      part?.type === "tool_use" &&
      (part.name === VOTE_CARD_TOOL.name || part?.input)
  );
  if (toolBlock?.input && typeof toolBlock.input === "object") {
    return toolBlock.input;
  }

  const text = blocks
    .filter((part) => part?.type === "text")
    .map((part) => part.text || "")
    .join("\n");
  return extractJsonObject(text);
}

async function formatVoteWithAnthropic(context = {}) {
  const apiKey = env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY");
  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY for vote formatting.");
  }

  const fallbackTitle = context.displayTitle || context.amendmentLine || "";
  const model = env("ANTHROPIC_MODEL", "CLAUDE_MODEL") || ANTHROPIC_MODEL;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      temperature: 0,
      system: SYSTEM_PROMPT,
      tools: [VOTE_CARD_TOOL],
      tool_choice: { type: "tool", name: VOTE_CARD_TOOL.name },
      messages: [{ role: "user", content: buildUserPrompt(context) }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const parsed = parseAnthropicVoteCard(data);
  if (!parsed) {
    throw new Error("Anthropic returned non-JSON content.");
  }
  return normalizeCard(parsed, fallbackTitle, context);
}

async function formatVoteWithOpenAI(context = {}) {
  const apiKey = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY");
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY for vote formatting.");
  }

  const fallbackTitle = context.displayTitle || context.amendmentLine || "";
  const base = (
    env("OPENAI_BASE_URL", "LLM_BASE_URL") || "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = env("OPENAI_MODEL", "LLM_MODEL") || OPENAI_MODEL;

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(context) },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || "";
  const parsed = extractJsonObject(content);
  if (!parsed) {
    throw new Error("OpenAI returned non-JSON content.");
  }
  return normalizeCard(parsed, fallbackTitle, context);
}

/** Prefer Anthropic when set; otherwise OpenAI-compatible. */
async function formatVoteWithAI(context = {}) {
  // Back-compat for older callers: formatVoteWithAI({ title, rawText })
  const normalized =
    context && (context.parentLine || context.rawText || context.amendmentLine)
      ? context
      : {
          parentLine: `Parent Bill: ${context?.title || "Unknown bill"}`,
          amendmentLine: `Vote: ${context?.title || "Congressional roll call"}`,
          displayTitle: context?.title || "",
          rawText: context?.rawText || "",
        };

  if (env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY")) {
    return formatVoteWithAnthropic(normalized);
  }
  return formatVoteWithOpenAI(normalized);
}

const BREAKDOWN_FIELD_ERROR_RE =
  /card_summary|takeaway|key_points|pro_argument|con_argument|primary_category/i;

const IMPACT_FIELD_ERROR_RE =
  /short_title|plain_summary|what_it_does|yea_impact|nay_impact|is_key_vote|card_summary|takeaway|key_points|pro_argument|con_argument|primary_category/i;

function withoutBreakdownFields(row) {
  const legacy = { ...row };
  delete legacy.card_summary;
  delete legacy.takeaway;
  delete legacy.key_points;
  delete legacy.pro_argument;
  delete legacy.con_argument;
  delete legacy.primary_category;
  return legacy;
}

function withoutImpactFields(row) {
  const legacy = withoutBreakdownFields(row);
  delete legacy.short_title;
  delete legacy.plain_summary;
  delete legacy.what_it_does;
  delete legacy.yea_impact;
  delete legacy.nay_impact;
  delete legacy.is_key_vote;
  return legacy;
}

async function upsertProcessedVote(supabase, row) {
  const { data, error } = await supabase
    .from("processed_votes")
    .upsert(row, { onConflict: "roll_call_id" })
    .select("roll_call_id")
    .maybeSingle();
  if (error && BREAKDOWN_FIELD_ERROR_RE.test(error.message || "")) {
    const withoutBreakdown = withoutBreakdownFields(row);
    const retryBreakdown = await supabase
      .from("processed_votes")
      .upsert(withoutBreakdown, { onConflict: "roll_call_id" })
      .select("roll_call_id")
      .maybeSingle();
    if (!retryBreakdown.error) return retryBreakdown.data;
    // Fall through to broader legacy handling with the stripped row.
    return upsertProcessedVote(supabase, withoutBreakdown);
  }
  if (error && IMPACT_FIELD_ERROR_RE.test(error.message || "")) {
    // Prefer dropping only newly added columns when older DBs lack them.
    let legacy = { ...row };
    if (/is_key_vote/i.test(error.message || "")) {
      delete legacy.is_key_vote;
    } else if (/plain_summary/i.test(error.message || "")) {
      delete legacy.plain_summary;
    } else {
      legacy = withoutImpactFields(row);
    }
    const retry = await supabase
      .from("processed_votes")
      .upsert(legacy, { onConflict: "roll_call_id" })
      .select("roll_call_id")
      .maybeSingle();
    if (retry.error && IMPACT_FIELD_ERROR_RE.test(retry.error.message || "")) {
      const minimal = withoutImpactFields(legacy);
      const last = await supabase
        .from("processed_votes")
        .upsert(minimal, { onConflict: "roll_call_id" })
        .select("roll_call_id")
        .maybeSingle();
      if (last.error) {
        throw new Error(last.error.message || "Supabase upsert failed.");
      }
      return last.data;
    }
    if (retry.error) {
      throw new Error(retry.error.message || "Supabase upsert failed.");
    }
    return retry.data;
  }
  if (error) {
    throw new Error(error.message || "Supabase upsert failed.");
  }
  return data;
}

function resolveChamberFilter(value) {
  const raw = String(value || "both").trim().toLowerCase();
  if (raw === "house" || raw === "senate" || raw === "both") return raw;
  return "both";
}

/**
 * @param {{
 *   limit?: number,
 *   congress?: number,
 *   skipExisting?: boolean,
 *   chamber?: "house" | "senate" | "both",
 * }} [options]
 */
async function syncVotes(options = {}) {
  const congressApiKey = env("CONGRESS_API_KEY", "API_KEY");
  if (!congressApiKey) {
    throw new Error("Missing CONGRESS_API_KEY.");
  }

  const congress = Number(options.congress) || DEFAULT_CONGRESS;
  const limit = Math.min(
    MAX_SYNC_LIMIT,
    Math.max(1, Number(options.limit) || DEFAULT_LIMIT)
  );
  const skipExisting = options.skipExisting !== false;
  const chamber = resolveChamberFilter(options.chamber);

  const supabase = getSupabaseAdmin();

  // When syncing both chambers, split the limit roughly evenly.
  const houseLimit =
    chamber === "senate" ? 0 : chamber === "both" ? Math.ceil(limit / 2) : limit;
  const senateLimit =
    chamber === "house" ? 0 : chamber === "both" ? Math.floor(limit / 2) : limit;

  const mapped = [];
  if (houseLimit > 0) {
    const houseVotes = await fetchLatestHouseVotes(congressApiKey, {
      congress,
      limit: houseLimit,
    });
    mapped.push(...houseVotes);
  }
  if (senateLimit > 0) {
    const senateVotes = await fetchLatestSenateVotes({
      congress,
      limit: senateLimit,
    });
    mapped.push(...senateVotes);
  }

  mapped.sort((a, b) =>
    String(b.vote_date || "").localeCompare(String(a.vote_date || ""))
  );

  const results = {
    congress,
    chamber,
    fetched: mapped.length,
    fetched_house: mapped.filter((v) => v.chamber === "house").length,
    fetched_senate: mapped.filter((v) => v.chamber === "senate").length,
    upserted: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    ids: [],
  };

  const parentCache = new Map();

  for (const vote of mapped) {
    try {
      if (skipExisting) {
        const { data: existing, error: existingError } = await supabase
          .from("processed_votes")
          .select("roll_call_id")
          .eq("roll_call_id", vote.roll_call_id)
          .maybeSingle();
        if (existingError) {
          throw new Error(existingError.message || "Could not check existing vote.");
        }
        if (existing?.roll_call_id) {
          results.skipped += 1;
          continue;
        }
      }

      const parent = await fetchParentBillContext(
        vote,
        congressApiKey,
        parentCache
      );
      const claudeContext = buildClaudeVoteContext(vote, parent);
      const card = await formatVoteWithAI(claudeContext);

      const row = {
        ...vote,
        summary: card.summary,
        yea_means: card.yea_means,
        nay_means: card.nay_means,
        yea_label: card.yea_label,
        nay_label: card.nay_label,
        short_title: card.short_title,
        plain_summary: card.plain_summary,
        what_it_does: card.what_it_does || card.plain_summary,
        yea_impact: card.yea_impact,
        nay_impact: card.nay_impact,
        card_summary: card.card_summary || card.plain_summary,
        takeaway: card.takeaway,
        key_points: card.key_points,
        pro_argument: card.pro_argument,
        con_argument: card.con_argument,
        primary_category: card.primary_category,
        is_key_vote: card.is_key_vote === true,
        summary_source: "llm",
        updated_at: new Date().toISOString(),
      };

      await upsertProcessedVote(supabase, row);
      results.upserted += 1;
      results.ids.push(vote.roll_call_id);
    } catch (error) {
      results.failed += 1;
      results.errors.push({
        id: vote.roll_call_id,
        message: error.message || String(error),
      });
      console.warn("sync-votes item failed:", vote.roll_call_id, error);
    }
  }

  return results;
}

module.exports = {
  syncVotes,
  isExcludedVote,
  mapHouseVote,
  fetchLatestHouseVotes,
  fetchParentBillContext,
  buildClaudeVoteContext,
  extractAmendmentLabel,
  formatVoteWithAI,
  formatVoteWithOpenAI,
  formatVoteWithAnthropic,
  fetchBillSummaryText,
  getSupabaseAdmin,
  POLICY_CATEGORIES,
  normalizePrimaryCategory,
  DEFAULT_CONGRESS,
  DEFAULT_LIMIT,
  MAX_SYNC_LIMIT,
};
