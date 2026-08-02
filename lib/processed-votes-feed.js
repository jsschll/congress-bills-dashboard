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
    summary,
    officialSummary: summary,
    shortPitch: summary || title,
    yeaMeans,
    nayMeans,
    yea_means: yeaMeans,
    nay_means: nayMeans,
    yeaLabel,
    nayLabel,
    yea_label: yeaLabel,
    nay_label: nayLabel,
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

module.exports = {
  mapProcessedVoteToFeedItem,
  PROCESSED_VOTES_SELECT,
  displayDate,
  toIsoDate,
};
