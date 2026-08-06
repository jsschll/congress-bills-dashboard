/**
 * Map Supabase `processed_votes` rows → Votes feed card shape.
 * Shared by /api/votes-feed (server) — mirror lives in shared.js for the browser.
 */

const {
  DEFAULT_YEA_LABEL,
  DEFAULT_NAY_LABEL,
} = require("./format-bill-summary");

function displayDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/**
 * @param {Record<string, unknown>} row
 */
function mapProcessedVoteToFeedItem(row = {}) {
  const rollCallId = String(row.roll_call_id || row.id || "").trim();
  const congress = Number(row.congress || 119);
  const sessionNumber = Number(row.session_number || 1);
  const rollCallNumber = Number(row.roll_call_number || 0);
  const billNumber = String(row.bill_number || "").trim() || null;
  const title =
    String(row.title || "").trim() ||
    String(row.vote_question || "").trim() ||
    (rollCallNumber ? `House Roll Call ${rollCallNumber}` : "Congressional vote");
  const summary = String(row.summary || "").trim();
  const voteQuestion = String(row.vote_question || "").trim();
  const result = String(row.result || "").trim();
  const date = displayDate(row.vote_date);
  const chamber = String(row.chamber || "house").toLowerCase();
  const voteKind = String(row.vote_kind || "").trim() || null;
  const yeaMeans = String(row.yea_means || "").trim();
  const nayMeans = String(row.nay_means || "").trim();
  const yeaLabel =
    String(row.yea_label || "").trim() || DEFAULT_YEA_LABEL;
  const nayLabel =
    String(row.nay_label || "").trim() || DEFAULT_NAY_LABEL;
  const shortTitle = String(row.short_title || "").trim();
  const plainSummary = String(
    row.plain_summary || row.what_it_does || ""
  ).trim();
  const whatItDoes = plainSummary;
  const displaySummary = plainSummary || summary;
  const yeaImpact = String(row.yea_impact || "").trim();
  const nayImpact = String(row.nay_impact || "").trim();
  const officialUrl =
    String(row.official_url || "").trim() ||
    String(row.clerk_url || "").trim() ||
    "#";
  const clerkUrl = String(row.clerk_url || "").trim() || officialUrl;
  const billId = String(row.bill_id || "").trim() || rollCallId;

  return {
    id: rollCallId || billId,
    billId: billId || rollCallId,
    rollCallId,
    billNumber: billNumber || (rollCallNumber ? `Roll Call ${rollCallNumber}` : ""),
    title,
    summary: displaySummary,
    officialSummary: displaySummary,
    shortPitch: displaySummary || title,
    yeaMeans,
    nayMeans,
    yea_means: yeaMeans,
    nay_means: nayMeans,
    yeaLabel,
    nayLabel,
    yea_label: yeaLabel,
    nay_label: nayLabel,
    shortTitle,
    short_title: shortTitle,
    plainSummary,
    plain_summary: plainSummary,
    whatItDoes,
    what_it_does: whatItDoes,
    yeaImpact,
    yea_impact: yeaImpact,
    nayImpact,
    nay_impact: nayImpact,
    level: "Federal",
    jurisdiction: chamber === "senate" ? "U.S. Senate" : "U.S. House",
    chamber,
    congress,
    sessionNumber,
    rollCallNumber,
    voteQuestion,
    voteKind,
    result,
    date,
    lastUpdated: toIsoDate(row.updated_at || row.vote_date) || new Date().toISOString(),
    officialUrl,
    clerkUrl,
    policyArea: "",
    subjectCategory: "",
    tags: [],
    primarySponsor: {
      name: chamber === "senate" ? "U.S. Senate" : "U.S. House",
      title: "Roll-call vote",
    },
    statusLabel: result || voteQuestion || "Roll-call vote",
    allSteps: [],
    status: null,
    deltaSummary: { added: [], changed: [], removed: [] },
    hasLinkedBill: Boolean(billNumber),
    summarySource: String(row.summary_source || "llm"),
    source: "processed_votes",
  };
}

const PROCESSED_VOTES_SELECT = [
  "roll_call_id",
  "bill_id",
  "title",
  "summary",
  "yea_means",
  "nay_means",
  "yea_label",
  "nay_label",
  "short_title",
  "plain_summary",
  "what_it_does",
  "yea_impact",
  "nay_impact",
  "is_key_vote",
  "bill_number",
  "legislation_number",
  "bill_type",
  "result",
  "vote_date",
  "vote_question",
  "vote_kind",
  "chamber",
  "congress",
  "session_number",
  "roll_call_number",
  "official_url",
  "clerk_url",
  "summary_source",
  "updated_at",
].join(",");

const PROCESSED_VOTES_SELECT_LEGACY = [
  "roll_call_id",
  "bill_id",
  "title",
  "summary",
  "yea_means",
  "nay_means",
  "yea_label",
  "nay_label",
  "bill_number",
  "legislation_number",
  "bill_type",
  "result",
  "vote_date",
  "vote_question",
  "vote_kind",
  "chamber",
  "congress",
  "session_number",
  "roll_call_number",
  "official_url",
  "clerk_url",
  "summary_source",
  "updated_at",
].join(",");

function normalizeLegislationType(type) {
  return String(type || "")
    .toLowerCase()
    .replace(/\./g, "")
    .trim();
}

function processedBillLookupKey(congress, billType, legislationNumber) {
  const c = Number(congress || 0);
  const t = normalizeLegislationType(billType);
  const n = String(legislationNumber || "").replace(/\D/g, "");
  if (!c || !t || !n) return "";
  return `${c}:${t}:${n}`;
}

function parseBillNumberParts(billNumber) {
  const match = String(billNumber || "")
    .trim()
    .match(/^([A-Za-z.]+)\s*(\d+)$/);
  if (!match) return null;
  return {
    billType: normalizeLegislationType(match[1]),
    legislationNumber: match[2],
  };
}

/** Join key for a News/My Feed bill item → processed_votes row. */
function billItemLookupKey(item = {}) {
  const id = String(item.id || item.billId || "").toLowerCase();
  const fromId = id.match(/federal-(?:bill-)?(\d{2,3})-([a-z]+)-(\d+)/);
  if (fromId) {
    return processedBillLookupKey(fromId[1], fromId[2], fromId[3]);
  }
  const parts = parseBillNumberParts(item.billNumber || item.bill_number);
  const congress = Number(item.congress || item.bill_congress || 0);
  if (parts && congress) {
    return processedBillLookupKey(congress, parts.billType, parts.legislationNumber);
  }
  if (item.bill_type && item.bill_number && congress) {
    return processedBillLookupKey(congress, item.bill_type, item.bill_number);
  }
  return "";
}

function voteDateMs(row = {}) {
  const raw = row.vote_date || row.updated_at || "";
  if (!raw) return 0;
  const date = new Date(String(raw).includes("T") ? raw : `${raw}T12:00:00`);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

/** Prefer final-passage cards, then newest vote_date, then longer summary. */
function preferProcessedRow(candidate, existing) {
  if (!existing) return true;
  const candFinal =
    String(candidate.vote_kind || "").toLowerCase() === "final_passage" ? 1 : 0;
  const existFinal =
    String(existing.vote_kind || "").toLowerCase() === "final_passage" ? 1 : 0;
  if (candFinal !== existFinal) return candFinal > existFinal;
  const dateDiff = voteDateMs(candidate) - voteDateMs(existing);
  if (dateDiff) return dateDiff > 0;
  return (
    String(candidate.summary || "").trim().length >
    String(existing.summary || "").trim().length
  );
}

function indexProcessedVotesByBill(rows = []) {
  const map = new Map();
  for (const row of rows) {
    if (!String(row?.summary || "").trim()) continue;
    let key = processedBillLookupKey(
      row.congress,
      row.bill_type,
      row.legislation_number
    );
    if (!key) {
      const parts = parseBillNumberParts(row.bill_number || row.bill_id);
      if (parts) {
        key = processedBillLookupKey(
          row.congress,
          parts.billType,
          parts.legislationNumber
        );
      }
    }
    if (!key) continue;
    const prev = map.get(key);
    if (preferProcessedRow(row, prev)) map.set(key, row);
  }
  return map;
}

function applyProcessedSummaryToBillItem(item, row) {
  if (!item || !row) return item;
  const plain = String(
    row.card_summary || row.plain_summary || row.what_it_does || ""
  ).trim();
  const summary = plain || String(row.summary || "").trim();
  if (!summary) return item;
  item.plain_summary = plain || summary;
  item.plainSummary = plain || summary;
  item.plainEnglishSummary = plain || summary;
  item.what_it_does = plain || summary;
  item.card_summary = String(row.card_summary || plain || summary).trim();
  item.cardSummary = item.card_summary;
  if (row.takeaway) item.takeaway = String(row.takeaway).trim();
  if (row.key_points) {
    item.key_points = row.key_points;
    item.keyPoints = row.key_points;
  }
  if (row.pro_argument) {
    item.pro_argument = String(row.pro_argument).trim();
    item.proArgument = item.pro_argument;
  }
  if (row.con_argument) {
    item.con_argument = String(row.con_argument).trim();
    item.conArgument = item.con_argument;
  }
  item.shortPitch = summary;
  item.summary = summary;
  item.officialSummary = summary;
  item.summarySource = String(row.summary_source || "processed_votes");
  if (row.short_title) {
    item.short_title = String(row.short_title).trim();
    item.shortTitle = item.short_title;
  }
  return item;
}

/**
 * Overlay Claude summaries from processed_votes onto federal bill cards.
 * State/city items are left unchanged. Falls back to existing shortPitch.
 */
function applyProcessedSummariesToBillItems(items = [], rows = []) {
  if (!items.length || !rows.length) return items;
  const byBill = indexProcessedVotesByBill(rows);
  for (const item of items) {
    if (String(item.level || "").toLowerCase() !== "federal") continue;
    const key = billItemLookupKey(item);
    if (!key) continue;
    const row = byBill.get(key);
    if (row) applyProcessedSummaryToBillItem(item, row);
  }
  return items;
}

function applyProcessedSummaryToVoteItem(item, row) {
  if (!item || !row) return item;
  const plainSummary = String(
    row.card_summary ||
      row.plain_summary ||
      row.what_it_does ||
      row.summary ||
      ""
  ).trim();
  const summary = plainSummary || String(row.summary || "").trim();
  if (!summary && !String(row.short_title || "").trim()) return item;

  if (summary) {
    item.officialSummary = summary;
    item.shortPitch = summary;
    item.summary = summary;
    item.plainEnglishSummary = summary;
    item.plain_summary = plainSummary || summary;
    item.what_it_does = plainSummary || summary;
    item.card_summary = String(row.card_summary || plainSummary || summary).trim();
    item.cardSummary = item.card_summary;
  }
  if (row.takeaway) {
    item.takeaway = String(row.takeaway).trim();
  }
  if (row.key_points) {
    item.key_points = row.key_points;
    item.keyPoints = row.key_points;
  }
  if (row.pro_argument) {
    item.pro_argument = String(row.pro_argument).trim();
    item.proArgument = item.pro_argument;
  }
  if (row.con_argument) {
    item.con_argument = String(row.con_argument).trim();
    item.conArgument = item.con_argument;
  }
  if (row.primary_category) {
    item.primary_category = String(row.primary_category).trim();
    item.primaryCategory = item.primary_category;
    item.category = item.primary_category;
  }
  item.summarySource = String(row.summary_source || "processed_votes");

  const shortTitle = String(row.short_title || "").trim();
  if (shortTitle) {
    item.short_title = shortTitle;
    item.shortTitle = shortTitle;
    // Keep raw congressional title available for muted badges.
    if (!item.rawTitle) item.rawTitle = item.title || item.voteQuestion || "";
    item.title = shortTitle;
    item.displayTitle = shortTitle;
  }

  const yeaImpact = String(row.yea_impact || "").trim();
  const nayImpact = String(row.nay_impact || "").trim();
  if (yeaImpact) {
    item.yea_impact = yeaImpact;
    item.yeaImpact = yeaImpact;
  }
  if (nayImpact) {
    item.nay_impact = nayImpact;
    item.nayImpact = nayImpact;
  }
  if (Object.prototype.hasOwnProperty.call(row, "is_key_vote")) {
    item.is_key_vote = row.is_key_vote !== false && row.is_key_vote !== null;
    item.isKeyVote = item.is_key_vote;
  }

  const yeaMeans = String(row.yea_means || yeaImpact || "").trim();
  const nayMeans = String(row.nay_means || nayImpact || "").trim();
  const yeaLabel = String(row.yea_label || "").trim();
  const nayLabel = String(row.nay_label || "").trim();
  if (yeaMeans) item.yeaMeans = yeaMeans;
  if (nayMeans) item.nayMeans = nayMeans;
  if (yeaLabel) item.yeaLabel = yeaLabel;
  if (nayLabel) item.nayLabel = nayLabel;

  const voteQuestion = String(row.vote_question || "").trim();
  const voteKind = String(row.vote_kind || "").trim();
  if (voteQuestion && !item.voteQuestion) item.voteQuestion = voteQuestion;
  if (voteKind && !item.voteKind) item.voteKind = voteKind;

  return item;
}

/**
 * Batch-load processed_votes rows that might match the given bill items.
 */
async function fetchProcessedVotesMatchingBills(supabase, items = []) {
  if (!supabase || !items.length) return [];
  const numbers = [];
  for (const item of items) {
    const key = billItemLookupKey(item);
    if (!key) continue;
    const num = key.split(":")[2];
    if (num) numbers.push(num);
  }
  const unique = [...new Set(numbers)];
  if (!unique.length) return [];

  let query = await supabase
    .from("processed_votes")
    .select(PROCESSED_VOTES_SELECT)
    .in("legislation_number", unique)
    .not("summary", "eq", "")
    .order("vote_date", { ascending: false })
    .limit(Math.min(250, Math.max(40, unique.length * 8)));

  if (
    query.error &&
    /short_title|plain_summary|what_it_does|yea_impact|nay_impact/i.test(
      query.error.message || ""
    )
  ) {
    query = await supabase
      .from("processed_votes")
      .select(PROCESSED_VOTES_SELECT_LEGACY)
      .in("legislation_number", unique)
      .not("summary", "eq", "")
      .order("vote_date", { ascending: false })
      .limit(Math.min(250, Math.max(40, unique.length * 8)));
  }

  if (query.error) {
    console.warn(
      "processed_votes bill lookup failed:",
      query.error.message || query.error
    );
    return [];
  }
  return query.data || [];
}

module.exports = {
  mapProcessedVoteToFeedItem,
  PROCESSED_VOTES_SELECT,
  PROCESSED_VOTES_SELECT_LEGACY,
  displayDate,
  toIsoDate,
  normalizeLegislationType,
  processedBillLookupKey,
  parseBillNumberParts,
  billItemLookupKey,
  indexProcessedVotesByBill,
  applyProcessedSummaryToBillItem,
  applyProcessedSummariesToBillItems,
  applyProcessedSummaryToVoteItem,
  fetchProcessedVotesMatchingBills,
  preferProcessedRow,
};
