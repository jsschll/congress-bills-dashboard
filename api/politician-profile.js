const CONGRESS_API = "https://api.congress.gov/v3";
const CONGRESS = 119;
const {
  formatBillSummary,
  isProceduralLegislation,
  classifyVoteKind,
  completeSentences,
  plainVoteFallback,
  defaultYeaNayMeans,
  DEFAULT_YEA_LABEL,
  DEFAULT_NAY_LABEL,
} = require("../lib/format-bill-summary");
const {
  fetchRecentSenateVotesForMember,
} = require("../lib/senate-votes");

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

function ordinal(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n || "");
  const mod100 = num % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
  switch (num % 10) {
    case 1:
      return `${num}st`;
    case 2:
      return `${num}nd`;
    case 3:
      return `${num}rd`;
    default:
      return `${num}th`;
  }
}

function normalizeVoteCast(voteCast = "") {
  const value = String(voteCast || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "Yea";
  if (value === "nay" || value === "no") return "Nay";
  if (value.includes("present")) return "Present";
  if (value.includes("not voting") || value === "nv") return "Not Voting";
  return voteCast || null;
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
  return "Other";
}

function plainEnglishForVote(vote, summaryText = "") {
  const crs = toSentences(summaryText, 2);
  if (crs) return crs;
  return plainVoteFallback(vote);
}

function yeaNayMeans(vote = {}) {
  return defaultYeaNayMeans(vote);
}

async function fetchBillSummary(congress, type, number, apiKey) {
  if (!type || !number) return "";
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
  if (!type || !number) return "";
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

function mapSocial(social = {}) {
  const out = [];
  const pairs = [
    ["twitter", "Twitter / X"],
    ["twitter_url", "Twitter / X"],
    ["x", "Twitter / X"],
    ["facebook", "Facebook"],
    ["facebook_url", "Facebook"],
    ["youtube", "YouTube"],
    ["youtube_url", "YouTube"],
    ["instagram", "Instagram"],
    ["instagram_url", "Instagram"],
  ];
  const seen = new Set();
  for (const [key, label] of pairs) {
    let value = social[key];
    if (!value) continue;
    value = String(value).trim();
    if (!value) continue;
    if (!/^https?:\/\//i.test(value)) {
      if (/twitter|x/i.test(key)) value = `https://twitter.com/${value.replace(/^@/, "")}`;
      else if (/facebook/i.test(key)) value = `https://facebook.com/${value}`;
      else if (/youtube/i.test(key)) value = `https://youtube.com/${value}`;
      else if (/instagram/i.test(key)) value = `https://instagram.com/${value.replace(/^@/, "")}`;
    }
    if (seen.has(label)) continue;
    seen.add(label);
    out.push({ label, url: value });
  }
  return out;
}

function mapChannels(channels = []) {
  if (!Array.isArray(channels)) return [];
  return channels
    .map((channel) => {
      const type = String(channel.type || channel.id || "").toLowerCase();
      const id = String(channel.id || channel.value || "").trim();
      if (!id) return null;
      if (type.includes("twitter") || type === "x") {
        return {
          label: "Twitter / X",
          url: id.startsWith("http") ? id : `https://twitter.com/${id.replace(/^@/, "")}`,
        };
      }
      if (type.includes("facebook")) {
        return {
          label: "Facebook",
          url: id.startsWith("http") ? id : `https://facebook.com/${id}`,
        };
      }
      if (type.includes("youtube")) {
        return {
          label: "YouTube",
          url: id.startsWith("http") ? id : `https://youtube.com/${id}`,
        };
      }
      return null;
    })
    .filter(Boolean);
}

function buildRoleLabel(member, stateCode, chamber, district) {
  const state = String(stateCode || member?.state || "").toUpperCase();
  const isSenate =
    String(chamber || "").toLowerCase().includes("senate") ||
    String(member?.terms?.[member.terms.length - 1]?.chamber || "")
      .toLowerCase()
      .includes("senate");
  if (isSenate) {
    return state ? `US Senate · ${state}` : "US Senate";
  }
  const dist = district ?? member?.district;
  if (state && dist != null && dist !== "" && !/^statewide$/i.test(String(dist))) {
    return `US House · ${state} ${ordinal(dist)} District`;
  }
  return state ? `US House · ${state}` : "US House";
}

function buildTenure(terms = []) {
  const list = Array.isArray(terms) ? terms : [];
  if (!list.length) {
    return { electedYear: null, yearsActive: null, label: "Tenure unavailable" };
  }
  const starts = list
    .map((term) => Number(term.startYear))
    .filter((year) => Number.isFinite(year));
  const ends = list
    .map((term) => Number(term.endYear) || new Date().getFullYear())
    .filter((year) => Number.isFinite(year));
  const electedYear = starts.length ? Math.min(...starts) : null;
  const latestEnd = ends.length ? Math.max(...ends) : new Date().getFullYear();
  const yearsActive =
    electedYear != null ? Math.max(0, latestEnd - electedYear) : null;
  if (electedYear == null) {
    return { electedYear: null, yearsActive: null, label: "Tenure unavailable" };
  }
  return {
    electedYear,
    yearsActive,
    label: `Elected ${electedYear} · ${yearsActive} Year${
      yearsActive === 1 ? "" : "s"
    } Active`,
  };
}

function normalizeMember(member) {
  const bioguide = member.bioguideId || member.bioguideID || "";
  const party =
    member.partyHistory?.[member.partyHistory.length - 1]?.partyName ||
    member.partyName ||
    member.party ||
    "";
  const terms = Array.isArray(member.terms)
    ? member.terms
    : Array.isArray(member.terms?.item)
      ? member.terms.item
      : [];
  const latest = terms[terms.length - 1] || {};
  const chamberRaw = String(latest.chamber || member.chamber || "").toLowerCase();
  const chamber = chamberRaw.includes("senate")
    ? "senate"
    : chamberRaw.includes("house")
      ? "house"
      : chamberRaw || "house";
  const stateCode =
    latest.stateCode ||
    (typeof member.state === "string" && member.state.length === 2
      ? member.state
      : "") ||
    "";
  const district =
    chamber === "senate"
      ? "Statewide"
      : member.district ?? latest.district ?? "";
  const tenure = buildTenure(terms);
  const phone =
    member.addressInformation?.phoneNumber ||
    member.phoneNumber ||
    member.phone ||
    "";
  const website = member.officialWebsiteUrl || member.url || "";
  const photo =
    member.depiction?.imageUrl ||
    (bioguide
      ? `https://www.congress.gov/img/member/${String(bioguide).toLowerCase()}_200.jpg`
      : "");

  return {
    bioguide_id: bioguide,
    external_key: bioguide ? `federal:${bioguide}` : null,
    name:
      member.directOrderName ||
      member.name ||
      `${member.firstName || ""} ${member.lastName || ""}`.trim(),
    party,
    state: stateCode || member.state || "",
    district: district != null ? String(district) : "",
    chamber,
    level: "federal",
    office_title:
      chamber === "senate" ? "U.S. Senator" : "U.S. Representative",
    photo_url: photo,
    website_url: website,
    phone,
    role_label: buildRoleLabel(member, stateCode, chamber, district),
    tenure,
    current_member: member.currentMember !== false,
    address: member.addressInformation || null,
    sponsored_count: member.sponsoredLegislation?.count ?? null,
    cosponsored_count: member.cosponsoredLegislation?.count ?? null,
    terms,
    source: "congress.gov",
  };
}

function mapSponsored(rows = []) {
  return (rows || []).map((row) => {
    const type = String(row.type || "").toLowerCase();
    const number = String(row.number || "");
    const congress = row.congress || CONGRESS;
    return {
      id: `federal-${congress}-${type}-${number}`.toLowerCase(),
      billNumber: `${String(row.type || "").toUpperCase()} ${number}`.trim(),
      title: row.title || "Untitled bill",
      congress,
      type,
      number,
      introducedDate: row.introducedDate || null,
      latestAction: row.latestAction || null,
      policyArea: row.policyArea?.name || null,
      officialUrl: `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`,
      kind: "sponsored",
    };
  });
}

async function fetchRecentVotesForMember(apiKey, bioguideId, limit = 16) {
  const bio = String(bioguideId || "").toUpperCase();
  if (!bio) return [];

  const listUrl = `${CONGRESS_API}/house-vote/${CONGRESS}?format=json&limit=80&api_key=${encodeURIComponent(
    apiKey
  )}`;
  let votes = [];
  try {
    const listData = await fetchJson(listUrl);
    votes = listData.houseRollCallVotes || [];
  } catch (error) {
    console.warn(error);
    return [];
  }

  // Skip resolutions + procedural noise; keep chronological so "Recent Votes" is recent.
  const ranked = votes
    .map((vote) => {
      const voteQuestion = vote.voteQuestion || "";
      const result = vote.result || "";
      const legislationType = String(vote.legislationType || "")
        .toLowerCase()
        .replace(/\./g, "");
      const billNumber =
        legislationType && vote.legislationNumber
          ? `${legislationType}${vote.legislationNumber}`
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
  const chunkSize = 6;
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
          const members =
            data.houseRollCallVoteMemberVotes?.results || [];
          const row = members.find(
            (entry) =>
              String(entry.bioguideID || "").toUpperCase() === bio
          );
          if (!row) return null;
          const type = String(vote.legislationType || "")
            .toLowerCase()
            .replace(/\./g, "");
          const number = String(vote.legislationNumber || "");
          const billNumber =
            type && number
              ? `${String(vote.legislationType || type).toUpperCase().replace(/\./g, "")} ${number}`
              : `Roll Call ${roll}`;
          const billId =
            type && number && voteKind === "final_passage"
              ? `federal-${congress}-${type}-${number}`.toLowerCase()
              : `house-vote-${congress}-${session}-${roll}`;
          const title =
            vote.legislationTitle ||
            vote.voteQuestion ||
            `House Roll Call ${roll}`;
          const base = {
            id: billId,
            billId,
            billNumber,
            title,
            level: "Federal",
            jurisdiction: "U.S. House",
            congress,
            sessionNumber: session,
            rollCallNumber: roll,
            voteQuestion: vote.voteQuestion || "",
            voteKind,
            voteCast: normalizeVoteCast(row.voteCast),
            result: vote.result || "",
            date: displayDate(vote.startDate || vote.date || null),
            lastUpdated:
              toIsoDate(vote.startDate || vote.date) || new Date().toISOString(),
            policyArea: null,
            subjectCategory: "Other",
            tags: [],
            shortPitch: "",
            yeaMeans: "",
            nayMeans: "",
            yeaLabel: DEFAULT_YEA_LABEL,
            nayLabel: DEFAULT_NAY_LABEL,
            officialUrl:
              type && number
                ? `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`
                : `https://clerk.house.gov/Votes/Details/${congress}${String(
                    roll
                  ).padStart(3, "0")}`,
            clerkUrl: `https://clerk.house.gov/Votes/Details/${congress}${String(
              roll
            ).padStart(3, "0")}`,
            hasLinkedBill: Boolean(type && number),
            legislationType: type,
            legislationNumber: number,
            kind: "vote",
            primarySponsor: { name: "U.S. House", title: "Roll-call vote" },
            statusLabel: vote.result || vote.voteQuestion || "House vote",
            allSteps: [],
            status: null,
            deltaSummary: { added: [], changed: [], removed: [] },
          };
          const meanings = yeaNayMeans(base);
          base.yeaMeans = meanings.yeaMeans;
          base.nayMeans = meanings.nayMeans;
          base.yeaLabel = meanings.yeaLabel;
          base.nayLabel = meanings.nayLabel;
          base.shortPitch = plainEnglishForVote(base);
          return base;
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

  // Enrich a capped set with CRS summary + plain-English card.
  // Keep this small so the profile API stays fast on Vercel.
  await enrichVoteCards(found, apiKey);
  return found;
}

async function enrichVoteCards(found, apiKey) {
  const enrichCount = Math.min(found.length, 8);
  const llmBudget = env("OPENAI_API_KEY", "OPENAI_KEY", "AI_API_KEY") ? 3 : 0;
  const chunkEnrich = 4;
  for (let i = 0; i < enrichCount; i += chunkEnrich) {
    const chunk = found.slice(i, i + chunkEnrich);
    await Promise.all(
      chunk.map(async (vote, chunkIndex) => {
        const absoluteIndex = i + chunkIndex;
        try {
          let summary = "";
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
            summary = crsSummary || "";
            vote.policyArea = policyArea || null;
            vote.subjectCategory = mapSubjectCategory(policyArea);
            vote.tags = policyArea ? [policyArea, vote.subjectCategory] : [];
          }

          const card = await formatBillSummary(
            summary || vote.shortPitch || vote.voteQuestion || "",
            vote.title || vote.billNumber || "",
            {
              forceHeuristic: absoluteIndex >= llmBudget,
              voteMeta: vote,
            }
          );
          vote.shortPitch = card.summary;
          vote.yeaMeans = card.yea_means;
          vote.nayMeans = card.nay_means;
          vote.yeaLabel = card.yea_label;
          vote.nayLabel = card.nay_label;
          vote.summarySource = card.source;
        } catch (error) {
          console.warn(error);
        }
      })
    );
  }

  // Chronological for the profile feed.
  found.sort((a, b) =>
    String(b.date || "").localeCompare(String(a.date || ""))
  );
  return found;
}

async function fetchRecentSenateVotes(apiKey, bioguideId, limit = 16) {
  try {
    const found = await fetchRecentSenateVotesForMember(bioguideId, {
      congress: CONGRESS,
      limit,
      scanLimit: 48,
    });
    await enrichVoteCards(found, apiKey);
    return found;
  } catch (error) {
    console.warn(error);
    return [];
  }
}

function isImpactful(bill) {
  const area = String(bill.policyArea || "").toLowerCase();
  const title = String(bill.title || "").toLowerCase();
  const haystack = `${area} ${title}`;
  return /\b(tax|immigration|border|health|medicare|medicaid|family|child|housing|gun|climate|veteran|social security|appropriations|budget|infrastructure|education|crime|justice)\b/i.test(
    haystack
  );
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const apiKey =
    env("CONGRESS_API_KEY", "API_KEY") ||
    String(req.query.api_key || "").trim();
  const bioguide = String(
    req.query.bioguide || req.query.bioguideId || ""
  )
    .trim()
    .toUpperCase();

  if (!bioguide) {
    return json(res, 400, {
      error: "Provide bioguide (e.g. N000026)",
    });
  }
  if (!apiKey) {
    return json(res, 500, { error: "Missing Congress.gov API key." });
  }

  try {
    const memberUrl = `${CONGRESS_API}/member/${encodeURIComponent(
      bioguide
    )}?format=json&api_key=${encodeURIComponent(apiKey)}`;
    const memberData = await fetchJson(memberUrl);
    const member = memberData.member;
    if (!member) {
      return json(res, 404, { error: "Member not found on Congress.gov" });
    }

    const overview = normalizeMember(member);

    const sponsoredUrl = `${CONGRESS_API}/member/${encodeURIComponent(
      bioguide
    )}/sponsored-legislation?format=json&limit=20&api_key=${encodeURIComponent(
      apiKey
    )}`;
    const sponsoredData = await fetchJson(sponsoredUrl).catch(() => ({
      sponsoredLegislation: [],
    }));
    const sponsored = mapSponsored(sponsoredData.sponsoredLegislation || []);

    let recentVotes = [];
    if (overview.chamber === "house") {
      recentVotes = await fetchRecentVotesForMember(apiKey, bioguide, 16);
    } else if (overview.chamber === "senate") {
      recentVotes = await fetchRecentSenateVotes(apiKey, bioguide, 16);
    }

    const recentActions = [...recentVotes, ...sponsored]
      .sort((a, b) => {
        const da = new Date(
          a.date || a.introducedDate || a.latestAction?.actionDate || 0
        ).getTime();
        const db = new Date(
          b.date || b.introducedDate || b.latestAction?.actionDate || 0
        ).getTime();
        return db - da;
      })
      .slice(0, 10);

    const keyLegislation = sponsored.filter(isImpactful).slice(0, 8);
    if (keyLegislation.length < 4) {
      for (const bill of sponsored) {
        if (keyLegislation.length >= 6) break;
        if (!keyLegislation.find((row) => row.id === bill.id)) {
          keyLegislation.push(bill);
        }
      }
    }

    return json(res, 200, {
      overview,
      contact: {
        email: null,
        phone: overview.phone || null,
        website: overview.website_url || null,
        social: [],
        office: overview.address || null,
      },
      sponsored,
      recentVotes,
      recentActions,
      keyLegislation,
      congressUrl: `https://www.congress.gov/member/${encodeURIComponent(
        overview.name.replace(/,\s*/g, "-").replace(/\s+/g, "-")
      )}/${bioguide}`,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      error: error.message || "Politician profile lookup failed",
    });
  }
};
