const CONGRESS_API = "https://api.congress.gov/v3";
const CONGRESS = 119;

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
    const text = await response.text().catch(() => "");
    throw new Error(`Upstream ${response.status}: ${text.slice(0, 160)}`);
  }
  return response.json();
}

function parseBillId(billId = "") {
  // federal-119-hr-1 or federal-bill-119-hr-1
  const match = String(billId)
    .toLowerCase()
    .match(/federal-(?:bill-)?(\d{2,3})-([a-z]+)-(\d+)/);
  if (!match) return null;
  return { congress: Number(match[1]), type: match[2], number: match[3] };
}

function normalizeVoteCast(voteCast = "") {
  const value = String(voteCast || "").toLowerCase();
  if (value === "yea" || value === "aye" || value === "yes") return "yea";
  if (value === "nay" || value === "no") return "nay";
  if (value.includes("present")) return "present";
  if (value.includes("not voting") || value === "nv") return "not_voting";
  return value || null;
}

function stanceMatchesVote(stance, voteCast) {
  const vote = normalizeVoteCast(voteCast);
  if (!vote || vote === "present" || vote === "not_voting") return null;
  if (stance === "support") return vote === "yea";
  if (stance === "oppose") return vote === "nay";
  return null;
}

function extractRollCallsFromActions(actions = []) {
  const found = [];
  for (const action of actions) {
    const text = String(action.text || "");
    const house =
      /house/i.test(text) ||
      String(action.sourceSystem?.name || "").toLowerCase().includes("house");
    const match = text.match(/roll\s*(?:call\s*)?(?:no\.?|number)?\s*(\d{1,4})/i);
    if (house && match) {
      found.push({
        chamber: "house",
        rollCallNumber: Number(match[1]),
        actionDate: action.actionDate || "",
        text,
      });
    }
  }
  return found;
}

async function findHouseVotesForBill(apiKey, congress, type, number) {
  const votes = [];

  try {
    const actionsUrl = `${CONGRESS_API}/bill/${congress}/${type}/${number}/actions?format=json&limit=250&api_key=${encodeURIComponent(apiKey)}`;
    const actionsData = await fetchJson(actionsUrl);
    const fromActions = extractRollCallsFromActions(actionsData.actions || []);
    for (const entry of fromActions) {
      // Prefer session 1; try both if needed later
      votes.push({
        congress,
        sessionNumber: 1,
        rollCallNumber: entry.rollCallNumber,
        source: "actions",
      });
      votes.push({
        congress,
        sessionNumber: 2,
        rollCallNumber: entry.rollCallNumber,
        source: "actions",
      });
    }
  } catch (error) {
    console.warn(error);
  }

  // Fallback: scan recent house votes for matching legislation
  if (!votes.length) {
    try {
      const listUrl = `${CONGRESS_API}/house-vote/${congress}?format=json&limit=250&api_key=${encodeURIComponent(apiKey)}`;
      const listData = await fetchJson(listUrl);
      const needleType = String(type || "").toUpperCase().replace(".", "");
      const needleNumber = String(number || "");
      for (const vote of listData.houseRollCallVotes || []) {
        const legType = String(vote.legislationType || "").toUpperCase().replace(".", "");
        const legNumber = String(vote.legislationNumber || "");
        if (legType === needleType && legNumber === needleNumber) {
          votes.push({
            congress: vote.congress || congress,
            sessionNumber: vote.sessionNumber || 1,
            rollCallNumber: vote.rollCallNumber,
            result: vote.result || "",
            source: "house-vote-list",
          });
        }
      }
    } catch (error) {
      console.warn(error);
    }
  }

  // Dedupe by congress/session/roll
  const seen = new Set();
  return votes.filter((vote) => {
    const key = `${vote.congress}-${vote.sessionNumber}-${vote.rollCallNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(vote.rollCallNumber);
  });
}

async function fetchMemberVotes(apiKey, congress, session, rollCall) {
  const url = `${CONGRESS_API}/house-vote/${congress}/${session}/${rollCall}/members?format=json&api_key=${encodeURIComponent(apiKey)}`;
  try {
    const data = await fetchJson(url);
    return {
      meta: data.houseRollCallVoteMemberVotes || {},
      results: data.houseRollCallVoteMemberVotes?.results || [],
    };
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const apiKey =
    process.env.CONGRESS_API_KEY ||
    process.env.API_KEY ||
    String(req.query.api_key || "").trim();
  if (!apiKey) {
    return json(res, 500, {
      error: "Missing Congress.gov API key.",
    });
  }

  const billId = String(req.query.billId || "").trim();
  const stance = String(req.query.stance || "").trim().toLowerCase();
  const bioguides = String(req.query.bioguides || "")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean);

  const parsed =
    parseBillId(billId) ||
    (req.query.congress && req.query.type && req.query.number
      ? {
          congress: Number(req.query.congress),
          type: String(req.query.type).toLowerCase(),
          number: String(req.query.number),
        }
      : null);

  if (!parsed) {
    return json(res, 400, { error: "Provide billId like federal-119-hr-1" });
  }
  if (stance && !["support", "oppose"].includes(stance)) {
    return json(res, 400, { error: "stance must be support or oppose" });
  }

  try {
    const voteRefs = await findHouseVotesForBill(
      apiKey,
      parsed.congress || CONGRESS,
      parsed.type,
      parsed.number
    );

    if (!voteRefs.length) {
      return json(res, 200, {
        billId,
        congress: parsed.congress,
        type: parsed.type,
        number: parsed.number,
        hasRollCall: false,
        message: "No House roll call found for this bill yet.",
        members: [],
        tallies: null,
      });
    }

    let chosen = null;
    let memberResults = [];
    for (const ref of voteRefs) {
      const payload = await fetchMemberVotes(
        apiKey,
        ref.congress,
        ref.sessionNumber,
        ref.rollCallNumber
      );
      if (payload?.results?.length) {
        chosen = { ...ref, meta: payload.meta };
        memberResults = payload.results;
        break;
      }
    }

    if (!chosen) {
      return json(res, 200, {
        billId,
        hasRollCall: false,
        message: "Roll call referenced but member votes unavailable.",
        members: [],
      });
    }

    const yea = memberResults.filter((row) => normalizeVoteCast(row.voteCast) === "yea").length;
    const nay = memberResults.filter((row) => normalizeVoteCast(row.voteCast) === "nay").length;

    let members = [];
    if (bioguides.length) {
      members = bioguides.map((bioguide) => {
        const row = memberResults.find(
          (entry) => String(entry.bioguideID || "").toUpperCase() === bioguide
        );
        const voteCast = row?.voteCast || null;
        return {
          bioguideId: bioguide,
          name: row ? `${row.firstName || ""} ${row.lastName || ""}`.trim() : null,
          party: row?.voteParty || null,
          state: row?.voteState || null,
          voteCast,
          matched: stance ? stanceMatchesVote(stance, voteCast) : null,
        };
      });
    } else {
      // Sample of yea/nay leaders for display
      members = memberResults.slice(0, 12).map((row) => ({
        bioguideId: row.bioguideID,
        name: `${row.firstName || ""} ${row.lastName || ""}`.trim(),
        party: row.voteParty || null,
        state: row.voteState || null,
        voteCast: row.voteCast,
        matched: stance ? stanceMatchesVote(stance, row.voteCast) : null,
      }));
    }

    return json(res, 200, {
      billId,
      congress: chosen.congress,
      sessionNumber: chosen.sessionNumber,
      rollCallNumber: chosen.rollCallNumber,
      hasRollCall: true,
      result: chosen.meta?.result || chosen.result || "",
      tallies: { yea, nay, total: memberResults.length },
      members,
      sourceUrl: `https://clerk.house.gov/Votes/Details/${chosen.congress}${String(chosen.rollCallNumber).padStart(3, "0")}`,
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, { error: error.message || "Vote lookup failed" });
  }
};
