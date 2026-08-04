/**
 * Live roll-call votes for Representative Scorecard (Truth in Voting).
 * House: Congress.gov API. Senate: Senate.gov LIS (via lib/senate-votes).
 * Claude plain-English fields: overlaid from processed_votes (and generated on miss).
 */

const { createClient } = require("@supabase/supabase-js");
const {
  classifyVoteKind,
  isProceduralLegislation,
} = require("./format-bill-summary");
const { fetchRecentSenateVotesForMember } = require("./senate-votes");
const {
  applyProcessedSummaryToVoteItem,
  PROCESSED_VOTES_SELECT,
  PROCESSED_VOTES_SELECT_LEGACY,
} = require("./processed-votes-feed");
const {
  buildClaudeVoteContext,
  fetchParentBillContext,
  formatVoteWithAI,
} = require("./sync-votes");

const CONGRESS_API = "https://api.congress.gov/v3";
const CONGRESS = 119;

function env(...keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status}: ${text.slice(0, 160)}`);
  }
  return response.json();
}

function displayDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function castToVotePosition(voteCast) {
  const value = String(voteCast || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "YES";
  if (value === "nay" || value === "no") return "NO";
  if (value.includes("present")) return "ABSTAIN";
  if (value.includes("not voting") || value === "nv") return "NOT_VOTING";
  return "NOT_VOTING";
}

function normalizeVoteCast(voteCast = "") {
  const value = String(voteCast || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "Yea";
  if (value === "nay" || value === "no") return "Nay";
  if (value.includes("present")) return "Present";
  if (value.includes("not voting") || value === "nv") return "Not Voting";
  return voteCast || null;
}

function inferCategory(title = "", question = "") {
  const haystack = `${title} ${question}`.toLowerCase();
  if (/health|medicare|medicaid|drug|hospital|insurance/.test(haystack)) {
    return "Healthcare";
  }
  if (/tax|budget|appropriat|wage|job|trade|inflat|econom|cost of living/.test(haystack)) {
    return "Economy";
  }
  if (/climate|environ|epa|energy|pollut|water|conserv/.test(haystack)) {
    return "Environment";
  }
  if (/immigra|border|asylum|visa/.test(haystack)) return "Immigration";
  if (/defense|military|pentagon|veteran|armed|national security/.test(haystack)) {
    return "Defense";
  }
  if (/rights|voting|discrim|privacy|amendment|civil/.test(haystack)) {
    return "Civil Rights";
  }
  if (/school|educat|student|tuition/.test(haystack)) return "Education";
  return "Other";
}

function normalizeBillNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(
    /^(h\.?\s*r\.?|s\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*con\.?\s*res\.?)\s*(\d+)/i
  );
  if (!match) return raw;
  const kind = match[1].toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  const number = match[2];
  if (kind === "hr") return `H.R. ${number}`;
  if (kind === "s") return `S. ${number}`;
  if (kind === "sjres") return `S.J.Res. ${number}`;
  if (kind === "hjres") return `H.J.Res. ${number}`;
  if (kind === "sconres") return `S.Con.Res. ${number}`;
  if (kind === "hconres") return `H.Con.Res. ${number}`;
  return raw;
}

function formatBillTitle(billNumber, title) {
  const number = normalizeBillNumber(billNumber);
  const rawTitle = String(title || "")
    .replace(/^(seed|placeholder)\s*:\s*/i, "")
    .trim();
  if (!rawTitle && number) return number;
  if (!number) return rawTitle || "Congressional roll call";
  const bare = number.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
  const titleBare = rawTitle.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
  if (titleBare.startsWith(bare)) {
    if (/^[^:]+:\s*/.test(rawTitle)) return rawTitle.replace(/^[^:]+/, number);
    return `${number}: ${rawTitle}`;
  }
  return `${number}: ${rawTitle}`;
}

function mapLiveCardToScorecard(card) {
  const billNumber = normalizeBillNumber(card.billNumber) || card.billNumber || null;
  const rawTitle = String(
    card.rawTitle || card.title || card.voteQuestion || "Congressional roll call"
  ).trim();
  const shortTitle = String(card.short_title || card.shortTitle || "").trim();
  const title = shortTitle || formatBillTitle(billNumber, rawTitle);
  const summary =
    String(
      card.plain_summary ||
        card.plainSummary ||
        card.plainEnglishSummary ||
        card.shortPitch ||
        card.officialSummary ||
        card.voteQuestion ||
        ""
    ).trim() || null;
  return {
    votePosition:
      card.votePosition || castToVotePosition(card.voteCast),
    billId: String(card.billId || card.id || `${billNumber || "roll"}-${card.date || ""}`),
    rollCallId: String(card.rollCallId || card.billId || card.id || ""),
    billNumber,
    title,
    rawTitle,
    short_title: shortTitle || null,
    shortTitle: shortTitle || null,
    plain_summary: summary,
    plainSummary: summary,
    plainEnglishSummary: summary,
    yea_impact: card.yea_impact || card.yeaImpact || null,
    nay_impact: card.nay_impact || card.nayImpact || null,
    category:
      card.category ||
      (card.subjectCategory && card.subjectCategory !== "Other"
        ? card.subjectCategory
        : inferCategory(rawTitle, card.voteQuestion)),
    voteDate:
      displayDate(card.voteDate || card.date || card.lastUpdated) || null,
    impacts: card.impacts || {
      wallet: null,
      community: null,
      rights: null,
    },
    summarySource: card.summarySource || null,
  };
}

function getSupabaseAdmin() {
  const url = env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseBillParts(billNumber = "") {
  const raw = String(billNumber || "").trim();
  const match = raw.match(
    /^(h\.?\s*r\.?|s\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*con\.?\s*res\.?)\s*(\d+)/i
  );
  if (!match) return { bill_type: null, legislation_number: null };
  const kind = match[1].toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
  const number = match[2];
  const typeMap = {
    hr: "hr",
    s: "s",
    sjres: "sjres",
    hjres: "hjres",
    sconres: "sconres",
    hconres: "hconres",
  };
  return {
    bill_type: typeMap[kind] || kind,
    legislation_number: number,
  };
}

function rollCallIdFromScorecardVote(vote = {}) {
  const existing = String(vote.rollCallId || vote.roll_call_id || "").trim();
  if (existing) return existing;
  return String(vote.billId || vote.id || "").trim();
}

function voteNeedsClaude(vote = {}) {
  const shortTitle = String(vote.short_title || vote.shortTitle || "").trim();
  const summary = String(
    vote.plain_summary ||
      vote.plainSummary ||
      vote.plainEnglishSummary ||
      ""
  ).trim();
  if (!shortTitle || !summary) return true;
  // Still looks like a raw amendment code title.
  if (/amdt\.?\s*(?:no\.?\s*)?\d+/i.test(shortTitle)) return true;
  return false;
}

/**
 * Overlay Claude fields from processed_votes; generate + upsert any misses.
 */
async function enrichScorecardVotesWithClaude(votes = [], options = {}) {
  const list = Array.isArray(votes) ? votes : [];
  if (!list.length) return list;

  const supabase = getSupabaseAdmin();
  const ids = [
    ...new Set(list.map(rollCallIdFromScorecardVote).filter(Boolean)),
  ];

  let byId = new Map();
  if (supabase && ids.length) {
    let { data, error } = await supabase
      .from("processed_votes")
      .select(PROCESSED_VOTES_SELECT)
      .in("roll_call_id", ids);
    if (
      error &&
      /short_title|plain_summary|what_it_does|yea_impact|nay_impact/i.test(
        error.message || ""
      )
    ) {
      ({ data, error } = await supabase
        .from("processed_votes")
        .select(PROCESSED_VOTES_SELECT_LEGACY)
        .in("roll_call_id", ids));
    }
    if (error) {
      console.warn(
        "[scorecard-live-votes] processed_votes enrich failed:",
        error.message || error
      );
    } else {
      byId = new Map(
        (data || []).map((row) => [String(row.roll_call_id), row])
      );
    }
  }

  for (const vote of list) {
    const id = rollCallIdFromScorecardVote(vote);
    const row = id ? byId.get(id) : null;
    if (row) applyProcessedSummaryToVoteItem(vote, row);
  }

  const missing = list.filter(voteNeedsClaude);
  const canGenerate =
    options.generate !== false &&
    Boolean(env("ANTHROPIC_API_KEY", "CLAUDE_API_KEY", "OPENAI_API_KEY"));
  if (!canGenerate || !missing.length) {
    return list.map(mapLiveCardToScorecard);
  }

  const congressApiKey = env("CONGRESS_API_KEY", "API_KEY");
  const parentCache = new Map();
  const chunkSize = 2;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (vote) => {
        try {
          const parts = parseBillParts(vote.billNumber);
          const rollCallId = rollCallIdFromScorecardVote(vote);
          const chamber = /senate-vote/i.test(rollCallId) ? "senate" : "house";
          const syncVote = {
            roll_call_id: rollCallId,
            bill_number: vote.billNumber || null,
            bill_type: parts.bill_type,
            legislation_number: parts.legislation_number,
            title: vote.rawTitle || vote.title || "",
            vote_question: vote.voteQuestion || vote.title || "",
            chamber,
            congress: CONGRESS,
          };
          const parent = congressApiKey
            ? await fetchParentBillContext(syncVote, congressApiKey, parentCache)
            : null;
          const context = buildClaudeVoteContext(syncVote, parent);
          const card = await formatVoteWithAI(context);
          applyProcessedSummaryToVoteItem(vote, {
            short_title: card.short_title,
            plain_summary: card.plain_summary,
            what_it_does: card.what_it_does,
            summary: card.summary,
            yea_impact: card.yea_impact,
            nay_impact: card.nay_impact,
            yea_means: card.yea_means,
            nay_means: card.nay_means,
            yea_label: card.yea_label,
            nay_label: card.nay_label,
            summary_source: "llm",
          });
          vote.summarySource = "llm";

          if (supabase && rollCallId) {
            const row = {
              roll_call_id: rollCallId,
              bill_id: vote.billNumber || null,
              bill_number: vote.billNumber || null,
              bill_type: parts.bill_type,
              legislation_number: parts.legislation_number,
              title: vote.rawTitle || vote.title || card.short_title,
              chamber,
              congress: CONGRESS,
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
              summary_source: "llm",
              updated_at: new Date().toISOString(),
            };
            const { error } = await supabase
              .from("processed_votes")
              .upsert(row, { onConflict: "roll_call_id" });
            if (error) {
              console.warn(
                "[scorecard-live-votes] Claude upsert failed:",
                error.message || error
              );
            }
          }
        } catch (error) {
          console.warn(
            "[scorecard-live-votes] Claude enrich failed:",
            error.message || error
          );
        }
      })
    );
  }

  return list.map(mapLiveCardToScorecard);
}

/**
 * Recent House roll calls for a member (Congress.gov), mapped to scorecard votes.
 * Skips CRS/LLM enrichment so scorecard lookup stays fast.
 */
async function fetchHouseScorecardVotes(apiKey, bioguideId, limit = 5) {
  const bio = String(bioguideId || "").toUpperCase();
  if (!bio || !apiKey) return [];

  const listUrl = `${CONGRESS_API}/house-vote/${CONGRESS}?format=json&limit=60&api_key=${encodeURIComponent(
    apiKey
  )}`;
  let votes = [];
  try {
    const listData = await fetchJson(listUrl);
    votes = listData.houseRollCallVotes || [];
  } catch (error) {
    console.warn("[scorecard-live-votes] house list failed:", error.message || error);
    return [];
  }

  const ranked = votes
    .map((vote) => {
      const voteQuestion = vote.voteQuestion || "";
      const result = vote.result || "";
      const legislationType = String(vote.legislationType || "")
        .toLowerCase()
        .replace(/\./g, "")
        .replace(/\s+/g, "");
      const billNumber = vote.legislationType
        ? `${vote.legislationType} ${vote.legislationNumber || ""}`.trim()
        : "";
      return {
        raw: vote,
        voteKind: classifyVoteKind(voteQuestion, result, {
          legislationType,
          billNumber,
          title: vote.legislationTitle || "",
        }),
      };
    })
    .filter(
      (row) =>
        row.voteKind !== "procedural" &&
        !isProceduralLegislation({
          legislationType: row.raw.legislationType,
          billNumber: row.raw.legislationType
            ? `${row.raw.legislationType} ${row.raw.legislationNumber || ""}`
            : "",
          voteQuestion: row.raw.voteQuestion,
          title: row.raw.legislationTitle,
        })
    )
    .sort((a, b) =>
      String(b.raw.startDate || b.raw.date || "").localeCompare(
        String(a.raw.startDate || a.raw.date || "")
      )
    );

  const found = [];
  const chunkSize = 5;
  for (let i = 0; i < ranked.length && found.length < limit; i += chunkSize) {
    const chunk = ranked.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async ({ raw: vote, voteKind }) => {
        const congress = vote.congress || CONGRESS;
        const session = vote.sessionNumber || 1;
        const roll = vote.rollCallNumber;
        if (!roll) return null;
        try {
          const url = `${CONGRESS_API}/house-vote/${congress}/${session}/${roll}/members?format=json&api_key=${encodeURIComponent(
            apiKey
          )}`;
          const data = await fetchJson(url);
          const members = data.houseRollCallVoteMemberVotes?.results || [];
          const row = members.find(
            (entry) => String(entry.bioguideID || "").toUpperCase() === bio
          );
          if (!row) return null;
          const type = String(vote.legislationType || "")
            .toLowerCase()
            .replace(/\./g, "");
          const number = String(vote.legislationNumber || "");
          const billNumber =
            type && number
              ? `${String(vote.legislationType || type)
                  .toUpperCase()
                  .replace(/\./g, "")} ${number}`
              : `Roll Call ${roll}`;
          const billId =
            type && number && voteKind === "final_passage"
              ? `federal-${congress}-${type}-${number}`.toLowerCase()
              : `house-vote-${congress}-${session}-${roll}`;
          const title =
            vote.legislationTitle ||
            vote.voteQuestion ||
            `House Roll Call ${roll}`;
          return {
            id: billId,
            billId,
            billNumber,
            title,
            voteQuestion: vote.voteQuestion || "",
            voteCast: normalizeVoteCast(row.voteCast),
            date: displayDate(vote.startDate || vote.date || null),
            subjectCategory: inferCategory(title, vote.voteQuestion),
            shortPitch: title || vote.voteQuestion || "",
            officialSummary: "",
          };
        } catch {
          return null;
        }
      })
    );
    for (const item of results) {
      if (item) found.push(item);
      if (found.length >= limit) break;
    }
  }

  return enrichScorecardVotesWithClaude(found.map(mapLiveCardToScorecard));
}

async function fetchSenateScorecardVotes(bioguideId, limit = 5) {
  const bio = String(bioguideId || "").toUpperCase();
  if (!bio) return [];
  try {
    const cards = await fetchRecentSenateVotesForMember(bio, {
      congress: CONGRESS,
      limit,
      scanLimit: Math.min(40, Math.max(limit * 4, 24)),
    });
    return enrichScorecardVotesWithClaude(
      (cards || []).map(mapLiveCardToScorecard)
    );
  } catch (error) {
    console.warn(
      "[scorecard-live-votes] senate fetch failed:",
      error.message || error
    );
    return [];
  }
}

/**
 * Fetch live roll calls for a scorecard profile.
 * @param {{ bioguideId?: string|null, chamber?: string|null, limit?: number }} options
 */
async function fetchLiveScorecardVotes(options = {}) {
  const bioguideId = String(options.bioguideId || "").trim().toUpperCase();
  const chamber = String(options.chamber || "").toLowerCase();
  const limit = Math.max(1, Math.min(Number(options.limit) || 5, 12));
  if (!bioguideId) return [];

  if (chamber.includes("senate")) {
    return fetchSenateScorecardVotes(bioguideId, limit);
  }

  const apiKey = env("CONGRESS_API_KEY", "API_KEY");
  if (!apiKey) {
    console.warn("[scorecard-live-votes] missing CONGRESS_API_KEY");
    // Senate path does not need the key; if chamber unknown try senate then house.
    if (!chamber) {
      const senate = await fetchSenateScorecardVotes(bioguideId, limit);
      if (senate.length) return senate;
    }
    return [];
  }

  if (chamber.includes("house") || !chamber) {
    const house = await fetchHouseScorecardVotes(apiKey, bioguideId, limit);
    if (house.length || chamber.includes("house")) return house;
  }

  return fetchSenateScorecardVotes(bioguideId, limit);
}

module.exports = {
  castToVotePosition,
  fetchLiveScorecardVotes,
  fetchHouseScorecardVotes,
  fetchSenateScorecardVotes,
  enrichScorecardVotesWithClaude,
  formatBillTitle,
  inferCategory,
  mapLiveCardToScorecard,
};
