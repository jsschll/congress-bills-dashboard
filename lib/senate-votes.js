/**
 * Senate roll-call votes from Senate.gov LIS XML.
 * Congress.gov has no /senate-vote endpoint; this is the official source.
 *
 * Menu:  /legislative/LIS/roll_call_lists/vote_menu_{congress}_{session}.xml
 * Vote:  /legislative/LIS/roll_call_votes/vote{c}{s}/vote_{c}_{s}_{NNNNN}.xml
 * Members: /legislative/LIS_MEMBER/cvc_member_data.xml (lis_member_id ↔ bioguideId)
 */

const {
  classifyVoteKind,
  isProceduralLegislation,
  DEFAULT_YEA_LABEL,
  DEFAULT_NAY_LABEL,
} = require("./format-bill-summary");

const SENATE_ORIGIN = "https://www.senate.gov";
const USER_AGENT =
  "CongressBillsDashboard/1.0 (+https://github.com/jsschll/congress-bills-dashboard)";

/** @type {Map<string, string> | null} */
let lisByBioguideCache = null;
/** @type {Promise<Map<string, string>> | null} */
let lisByBioguidePromise = null;

function tagText(xml, tag) {
  const match = String(xml || "").match(
    new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i")
  );
  return match ? collapseWs(match[1]) : "";
}

function collapseWs(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeVoteCast(voteCast = "") {
  const value = String(voteCast || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "Yea";
  if (value === "nay" || value === "no") return "Nay";
  if (value.includes("present")) return "Present";
  if (value.includes("not voting") || value === "nv") return "Not Voting";
  return voteCast || null;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/xml,text/xml,*/*",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Senate.gov ${response.status}: ${text.slice(0, 120)}`);
  }
  return response.text();
}

function padVoteNumber(n) {
  return String(Number(n) || n).padStart(5, "0");
}

function voteMenuUrl(congress, session) {
  return `${SENATE_ORIGIN}/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
}

function voteDetailUrl(congress, session, voteNumber) {
  const pad = padVoteNumber(voteNumber);
  return `${SENATE_ORIGIN}/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${pad}.xml`;
}

function votePublicUrl(congress, session, voteNumber) {
  const pad = padVoteNumber(voteNumber);
  return `${SENATE_ORIGIN}/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${pad}.htm`;
}

/**
 * Parse Senate issue strings like "H.R. 5371", "S. 5", "S.J.Res. 82".
 */
function parseLegislationIssue(issue) {
  const cleaned = collapseWs(issue);
  if (!cleaned) return null;
  if (/^PN/i.test(cleaned)) {
    return { kind: "nomination", billNumber: cleaned, type: "", number: "" };
  }

  const patterns = [
    [/^(H\.?\s*J\.?\s*Res\.?)\s*(\d+)/i, "hjres", "H.J.Res."],
    [/^(S\.?\s*J\.?\s*Res\.?)\s*(\d+)/i, "sjres", "S.J.Res."],
    [/^(H\.?\s*Con\.?\s*Res\.?)\s*(\d+)/i, "hconres", "H.Con.Res."],
    [/^(S\.?\s*Con\.?\s*Res\.?)\s*(\d+)/i, "sconres", "S.Con.Res."],
    [/^(H\.?\s*Res\.?)\s*(\d+)/i, "hres", "H.Res."],
    [/^(S\.?\s*Res\.?)\s*(\d+)/i, "sres", "S.Res."],
    [/^(H\.?\s*R\.?)\s*(\d+)/i, "hr", "H.R."],
    [/^(S\.?)\s*(\d+)/i, "s", "S."],
  ];

  for (const [re, type, label] of patterns) {
    const match = cleaned.match(re);
    if (!match) continue;
    const number = match[2];
    return {
      kind: "legislation",
      type,
      number,
      billNumber: `${label} ${number}`,
    };
  }

  return { kind: "other", billNumber: cleaned, type: "", number: "" };
}

function parseMenuDate(voteDate, congressYear) {
  const raw = collapseWs(voteDate);
  if (!raw) return null;
  // Menu uses "18-Dec" without year.
  const short = raw.match(/^(\d{1,2})-([A-Za-z]{3})$/);
  if (short && congressYear) {
    const parsed = new Date(`${short[1]} ${short[2]} ${congressYear} 12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  const full = new Date(raw.includes(",") ? raw : `${raw} 12:00:00`);
  if (!Number.isNaN(full.getTime())) return full.toISOString().slice(0, 10);
  return raw;
}

function parseDetailDate(voteDate) {
  const raw = collapseWs(voteDate);
  if (!raw) return null;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return parseMenuDate(raw, null);
}

async function loadLisMemberMap() {
  if (lisByBioguideCache) return lisByBioguideCache;
  if (lisByBioguidePromise) return lisByBioguidePromise;

  lisByBioguidePromise = (async () => {
    const xml = await fetchText(
      `${SENATE_ORIGIN}/legislative/LIS_MEMBER/cvc_member_data.xml`
    );
    const map = new Map();
    const blocks = String(xml).matchAll(
      /<senator\s+lis_member_id="([^"]+)">([\s\S]*?)<\/senator>/gi
    );
    for (const match of blocks) {
      const lis = String(match[1] || "").trim().toUpperCase();
      const bioguide = tagText(match[2], "bioguideId").toUpperCase();
      if (lis && bioguide) map.set(bioguide, lis);
    }
    lisByBioguideCache = map;
    return map;
  })().catch((error) => {
    lisByBioguidePromise = null;
    throw error;
  });

  return lisByBioguidePromise;
}

async function resolveLisMemberId(bioguideId) {
  const bio = String(bioguideId || "").trim().toUpperCase();
  if (!bio) return null;
  const map = await loadLisMemberMap();
  return map.get(bio) || null;
}

function parseVoteMenu(xml) {
  const congress = Number(tagText(xml, "congress")) || null;
  const session = Number(tagText(xml, "session")) || 1;
  const congressYear = Number(tagText(xml, "congress_year")) || null;
  const votes = [];
  for (const match of String(xml).matchAll(/<vote>([\s\S]*?)<\/vote>/gi)) {
    const block = match[1];
    // Skip nested en_bloc matter-only shells without a top-level vote_number.
    const voteNumberRaw = tagText(block, "vote_number");
    if (!voteNumberRaw) continue;
    const voteNumber = Number(voteNumberRaw);
    if (!Number.isFinite(voteNumber)) continue;
    const issue = tagText(block, "issue");
    const question = tagText(block, "question");
    const title = tagText(block, "title");
    const result = tagText(block, "result");
    const voteDate = tagText(block, "vote_date");
    votes.push({
      congress,
      session,
      congressYear,
      voteNumber,
      issue,
      question,
      title,
      result,
      voteDate,
      date: parseMenuDate(voteDate, congressYear),
    });
  }
  // Menu is newest-first already; keep that order.
  return { congress, session, congressYear, votes };
}

function memberVoteFromDetail(xml, lisMemberId) {
  const lis = String(lisMemberId || "").trim().toUpperCase();
  if (!lis) return null;
  for (const match of String(xml).matchAll(/<member>([\s\S]*?)<\/member>/gi)) {
    const block = match[1];
    const id = tagText(block, "lis_member_id").toUpperCase();
    if (id !== lis) continue;
    return {
      voteCast: normalizeVoteCast(tagText(block, "vote_cast")),
      lastName: tagText(block, "last_name"),
      firstName: tagText(block, "first_name"),
      party: tagText(block, "party"),
      state: tagText(block, "state"),
    };
  }
  return null;
}

function parseVoteDetail(xml) {
  const congress = Number(tagText(xml, "congress")) || null;
  const session = Number(tagText(xml, "session")) || 1;
  const voteNumber = Number(tagText(xml, "vote_number"));
  const question =
    tagText(xml, "vote_question_text") || tagText(xml, "question");
  const title =
    tagText(xml, "vote_title") ||
    tagText(xml, "vote_document_text") ||
    question;
  const result =
    tagText(xml, "vote_result") || tagText(xml, "vote_result_text");
  const documentType = tagText(xml, "document_type");
  const documentNumber = tagText(xml, "document_number");
  const documentName = tagText(xml, "document_name");
  const documentTitle = tagText(xml, "document_title");
  const voteDate = tagText(xml, "vote_date");

  let legislation = null;
  if (documentType && documentNumber) {
    legislation = parseLegislationIssue(`${documentType} ${documentNumber}`);
  }
  if (!legislation?.type && documentName) {
    legislation = parseLegislationIssue(documentName);
  }

  return {
    congress,
    session,
    voteNumber,
    question,
    title: documentTitle || title,
    result,
    date: parseDetailDate(voteDate),
    legislation,
    documentType,
    documentNumber,
  };
}

function isSenateCandidate(menuVote) {
  const legislation = parseLegislationIssue(menuVote.issue);
  if (!legislation || legislation.kind === "nomination") return false;
  if (legislation.kind === "other" && !legislation.type) {
    // Allow question-based legislation votes without a clean issue parse.
    if (!/\b(passage|amendment|joint resolution|bill)\b/i.test(menuVote.question)) {
      return false;
    }
  }

  const voteKind = classifyVoteKind(menuVote.question, menuVote.result, {
    legislationType: legislation.type,
    billNumber: legislation.billNumber,
    title: menuVote.title,
    issue: menuVote.issue,
  });
  if (voteKind === "procedural") return false;
  if (
    isProceduralLegislation({
      legislationType: legislation.type,
      billNumber: legislation.billNumber,
      voteQuestion: menuVote.question,
      title: menuVote.title,
      issue: menuVote.issue,
    })
  ) {
    return false;
  }
  return true;
}

function yeaNayMeans() {
  return {
    yeaMeans:
      "A Yea vote supports advancing this measure as written on this roll call.",
    nayMeans:
      "A Nay vote supports rejecting this measure on this roll call.",
    yeaLabel: DEFAULT_YEA_LABEL,
    nayLabel: DEFAULT_NAY_LABEL,
  };
}

function plainEnglishForSenateVote(vote) {
  const kind = vote.voteKind;
  const bill = vote.billNumber || "this measure";
  const title =
    vote.title && vote.title !== vote.voteQuestion ? ` (${vote.title})` : "";
  if (kind === "final_passage") {
    return `This was a final Senate vote on whether to pass ${bill}${title}.`;
  }
  if (kind === "amendment") {
    return `This Senate vote was on an amendment to ${bill}${title}.`;
  }
  const question = String(vote.voteQuestion || "").trim();
  if (question) return `Senate roll call on: ${question.replace(/\.$/, "")}.`;
  return `Recent Senate roll-call vote${vote.result ? ` — result: ${vote.result}` : ""}.`;
}

function toVoteCard(detail, memberRow, voteKind) {
  const legislation = detail.legislation || {};
  const type = legislation.type || "";
  const number = legislation.number || "";
  const billNumber =
    legislation.billNumber ||
    (type && number ? `${type.toUpperCase()} ${number}` : `Roll Call ${detail.voteNumber}`);
  const congress = detail.congress;
  const session = detail.session;
  const roll = detail.voteNumber;
  const billId =
    type && number && voteKind === "final_passage"
      ? `federal-${congress}-${type}-${number}`.toLowerCase()
      : `senate-vote-${congress}-${session}-${roll}`;
  const publicUrl = votePublicUrl(congress, session, roll);
  const meanings = yeaNayMeans();
  const base = {
    id: billId,
    billId,
    billNumber,
    title: detail.title || detail.question || `Senate Roll Call ${roll}`,
    level: "Federal",
    jurisdiction: "U.S. Senate",
    chamber: "senate",
    congress,
    sessionNumber: session,
    rollCallNumber: roll,
    voteQuestion: detail.question || "",
    voteKind,
    voteCast: memberRow.voteCast,
    result: detail.result || "",
    date: detail.date,
    lastUpdated: detail.date
      ? `${detail.date}T12:00:00.000Z`
      : new Date().toISOString(),
    policyArea: null,
    subjectCategory: "Other",
    tags: [],
    shortPitch: "",
    yeaMeans: meanings.yeaMeans,
    nayMeans: meanings.nayMeans,
    yeaLabel: meanings.yeaLabel,
    nayLabel: meanings.nayLabel,
    officialUrl:
      type && number
        ? `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`
        : publicUrl,
    clerkUrl: publicUrl,
    senateUrl: publicUrl,
    hasLinkedBill: Boolean(type && number),
    legislationType: type,
    legislationNumber: number,
    kind: "vote",
    primarySponsor: { name: "U.S. Senate", title: "Roll-call vote" },
    statusLabel: detail.result || detail.question || "Senate vote",
    allSteps: [],
    status: null,
    deltaSummary: { added: [], changed: [], removed: [] },
  };
  base.shortPitch = plainEnglishForSenateVote(base);
  return base;
}

/**
 * Load recent Senate roll calls where this bioguide cast a vote.
 * @param {string} bioguideId
 * @param {{ congress?: number, limit?: number, scanLimit?: number }} [options]
 */
async function fetchRecentSenateVotesForMember(bioguideId, options = {}) {
  const bio = String(bioguideId || "").trim().toUpperCase();
  const congress = Number(options.congress) || 119;
  const limit = Math.max(1, Math.min(Number(options.limit) || 16, 24));
  const scanLimit = Math.max(limit, Math.min(Number(options.scanLimit) || 48, 80));
  if (!bio) return [];

  const lisMemberId = await resolveLisMemberId(bio);
  if (!lisMemberId) {
    console.warn(`No Senate LIS id for bioguide ${bio}`);
    return [];
  }

  // Prefer the newest session that has votes published.
  let menu = null;
  for (const session of [2, 1]) {
    try {
      const xml = await fetchText(voteMenuUrl(congress, session));
      const parsed = parseVoteMenu(xml);
      if (parsed.votes.length) {
        menu = parsed;
        break;
      }
    } catch (error) {
      console.warn(error);
    }
  }
  if (!menu?.votes?.length) return [];

  const candidates = menu.votes.filter(isSenateCandidate).slice(0, scanLimit);
  const found = [];
  const chunkSize = 5;

  for (let i = 0; i < candidates.length && found.length < limit; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (menuVote) => {
        try {
          const xml = await fetchText(
            voteDetailUrl(
              menuVote.congress || congress,
              menuVote.session || menu.session || 1,
              menuVote.voteNumber
            )
          );
          const detail = parseVoteDetail(xml);
          const memberRow = memberVoteFromDetail(xml, lisMemberId);
          if (!memberRow?.voteCast) return null;

          const legislation =
            detail.legislation || parseLegislationIssue(menuVote.issue) || {};
          const voteKind = classifyVoteKind(
            detail.question || menuVote.question,
            detail.result || menuVote.result,
            {
              legislationType: legislation.type,
              billNumber: legislation.billNumber,
              title: detail.title || menuVote.title,
              issue: menuVote.issue,
            }
          );
          if (voteKind === "procedural") return null;
          if (
            isProceduralLegislation({
              legislationType: legislation.type,
              billNumber: legislation.billNumber,
              voteQuestion: detail.question || menuVote.question,
              title: detail.title || menuVote.title,
              issue: menuVote.issue,
            })
          ) {
            return null;
          }

          return toVoteCard(
            {
              ...detail,
              legislation,
              congress: detail.congress || menuVote.congress || congress,
              session: detail.session || menuVote.session || menu.session || 1,
              date: detail.date || menuVote.date,
            },
            memberRow,
            voteKind
          );
        } catch (error) {
          console.warn(error);
          return null;
        }
      })
    );

    for (const item of results) {
      if (item) found.push(item);
      if (found.length >= limit) break;
    }
  }

  found.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return found;
}

module.exports = {
  fetchRecentSenateVotesForMember,
  resolveLisMemberId,
  parseLegislationIssue,
  parseVoteMenu,
  parseVoteDetail,
  isSenateCandidate,
  voteDetailUrl,
  votePublicUrl,
  normalizeVoteCast,
};
