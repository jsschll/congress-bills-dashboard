const GOOGLE_CIVIC_BASE = "https://www.googleapis.com/civicinfo/v2";

const STATE_ELECTION_SITES = {
  AL: "https://www.sos.alabama.gov/alabama-votes",
  AK: "https://www.elections.alaska.gov/",
  AZ: "https://azsos.gov/elections",
  AR: "https://www.sos.arkansas.gov/elections/",
  CA: "https://www.sos.ca.gov/elections",
  CO: "https://www.sos.state.co.us/voter/pages/pub/home.xhtml",
  CT: "https://portal.ct.gov/sots/election-services",
  DE: "https://elections.delaware.gov/",
  DC: "https://www.dcboe.org/",
  FL: "https://www.dos.myflorida.com/elections/",
  GA: "https://sos.ga.gov/elections-division-georgia-secretary-states-office",
  HI: "https://elections.hawaii.gov/",
  ID: "https://sos.idaho.gov/elections-voter-information/",
  IL: "https://www.elections.il.gov/",
  IN: "https://www.in.gov/sos/elections/",
  IA: "https://sos.iowa.gov/elections",
  KS: "https://www.sos.ks.gov/elections/elections.html",
  KY: "https://elect.ky.gov/",
  LA: "https://www.sos.la.gov/ElectionsAndVoting",
  ME: "https://www.maine.gov/sos/cec/elec/",
  MD: "https://elections.maryland.gov/",
  MA: "https://www.sec.state.ma.us/ele/",
  MI: "https://www.michigan.gov/sos/elections",
  MN: "https://www.sos.state.mn.us/elections-voting/",
  MS: "https://www.sos.ms.gov/elections-voting",
  MO: "https://www.sos.mo.gov/elections",
  MT: "https://sosmt.gov/elections/",
  NE: "https://sos.nebraska.gov/elections",
  NV: "https://www.nvsos.gov/sos/elections",
  NH: "https://www.sos.nh.gov/elections",
  NJ: "https://www.nj.gov/state/elections/",
  NM: "https://www.sos.nm.gov/voting-and-elections/",
  NY: "https://www.elections.ny.gov/",
  NC: "https://www.ncsbe.gov/",
  ND: "https://vip.sos.nd.gov/",
  OH: "https://www.ohiosos.gov/elections/",
  OK: "https://oklahoma.gov/elections.html",
  OR: "https://sos.oregon.gov/voting-elections/",
  PA: "https://www.vote.pa.gov/",
  RI: "https://vote.sos.ri.gov/",
  SC: "https://www.scvotes.gov/elections",
  SD: "https://sdsos.gov/elections-voting/",
  TN: "https://sos.tn.gov/elections",
  TX: "https://www.sos.state.tx.us/elections/",
  UT: "https://vote.utah.gov/",
  VT: "https://sos.vermont.gov/elections/",
  VA: "https://www.elections.virginia.gov/",
  WA: "https://www.sos.wa.gov/elections/",
  WV: "https://sos.wv.gov/elections/",
  WI: "https://myvote.wi.gov/",
  WY: "https://sos.wyo.gov/Elections/",
};

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

function normalizeStateCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (raw.length === 2) return raw;
  return "";
}

function formatAddress(parts = {}) {
  return [parts.line1, parts.line2, parts.city, parts.state, parts.zip]
    .filter(Boolean)
    .join(", ");
}

function formatPlace(place = {}) {
  const address = place.address || {};
  return {
    name: address.locationName || "",
    address: formatAddress(address),
    hours: place.pollingHours || "",
    startDate: place.startDate || "",
    endDate: place.endDate || "",
    notes: Array.isArray(place.notes) ? place.notes.join(" ") : place.notes || "",
  };
}

function inferElectionLevel(election = {}) {
  const text = `${election.name || ""} ${election.ocdDivisionId || ""}`.toLowerCase();
  if (text.includes("country:us") || text.includes("federal") || text.includes("general")) {
    if (text.includes("primary") && !text.includes("country:us")) return "State";
    if (text.includes("country:us") || /\b(congress|presidential|midterm)\b/.test(text)) {
      return "Federal";
    }
  }
  if (text.includes("city") || text.includes("municipal") || text.includes("mayor")) {
    return "Local";
  }
  if (text.includes("county")) return "Local";
  if (text.includes("state:")) return "State";
  return "State";
}

function fallbackElections() {
  return [
    {
      id: "fallback-2026-midterm",
      name: "2026 U.S. Midterm Election (federal)",
      electionDay: "2026-11-03",
      level: "Federal",
      source: "fallback",
    },
  ];
}

async function fetchJson(url) {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.error?.message || data?.error || `Civic API ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return data;
}

function summarizeContests(contests = []) {
  return contests.slice(0, 12).map((contest) => ({
    type: contest.type || "",
    office: contest.office || "",
    ballotTitle: contest.ballotTitle || contest.referendumTitle || "",
    level: contest.level || "",
    candidates: (contest.candidates || []).slice(0, 6).map((candidate) => ({
      name: candidate.name || "",
      party: candidate.party || "",
    })),
  }));
}

function electionAdmin(stateBlocks = []) {
  const block = stateBlocks[0] || {};
  const body = block.electionAdministrationBody || {};
  return {
    stateName: block.name || "",
    electionInfoUrl: body.electionInfoUrl || "",
    electionRegistrationUrl: body.electionRegistrationUrl || "",
    electionRegistrationConfirmationUrl:
      body.electionRegistrationConfirmationUrl || "",
    absenteeVotingInfoUrl: body.absenteeVotingInfoUrl || "",
    votingLocationFinderUrl: body.votingLocationFinderUrl || "",
    ballotInfoUrl: body.ballotInfoUrl || "",
    correspondenceAddress: formatAddress(body.correspondenceAddress || {}),
  };
}

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") return json(res, 204, {});
  if (req.method !== "GET") return json(res, 405, { error: "Method not allowed" });

  const address = String(req.query.address || req.query.q || "").trim();
  if (!address) {
    return json(res, 400, { error: "Provide an address or ZIP via ?address=" });
  }

  const apiKey = env("GOOGLE_CIVIC_API_KEY", "GOOGLE_API_KEY");
  const electionId = String(req.query.electionId || "").trim();

  const registrationLinks = {
    voteGov: "https://vote.gov/",
    voteGovRegister: "https://vote.gov/register",
    stateSite: "",
  };

  if (!apiKey) {
    return json(res, 200, {
      ok: true,
      coverage: "fallback",
      message:
        "Live polling locations need a Civic API connection. Showing federal election dates and official voter registration links for now.",
      address,
      normalizedAddress: address,
      stateCode: "",
      elections: fallbackElections(),
      voterInfo: null,
      registrationLinks,
      admin: null,
    });
  }

  try {
    const electionsUrl = `${GOOGLE_CIVIC_BASE}/elections?key=${encodeURIComponent(
      apiKey
    )}`;
    const electionsData = await fetchJson(electionsUrl);
    const elections = (electionsData.elections || [])
      .filter((item) => item.id !== "2000") // skip VIP test election
      .map((item) => ({
        id: String(item.id),
        name: item.name || "Election",
        electionDay: item.electionDay || "",
        ocdDivisionId: item.ocdDivisionId || "",
        level: inferElectionLevel(item),
        source: "google-civic",
      }))
      .sort((a, b) => String(a.electionDay).localeCompare(String(b.electionDay)));

    const voterParams = new URLSearchParams({
      address,
      key: apiKey,
    });
    if (electionId) voterParams.set("electionId", electionId);

    let voterData = null;
    let voterError = null;
    try {
      voterData = await fetchJson(
        `${GOOGLE_CIVIC_BASE}/voterinfo?${voterParams.toString()}`
      );
    } catch (error) {
      voterError = error.message || "Voter info unavailable";
    }

    const normalized = voterData?.normalizedInput || {};
    const stateCode = normalizeStateCode(normalized.state);
    registrationLinks.stateSite = STATE_ELECTION_SITES[stateCode] || "";

    const otherElections = (voterData?.otherElections || []).map((item) => ({
      id: String(item.id),
      name: item.name || "Election",
      electionDay: item.electionDay || "",
      ocdDivisionId: item.ocdDivisionId || "",
      level: inferElectionLevel(item),
      source: "google-civic",
    }));

    const primaryElection = voterData?.election
      ? {
          id: String(voterData.election.id),
          name: voterData.election.name || "Election",
          electionDay: voterData.election.electionDay || "",
          ocdDivisionId: voterData.election.ocdDivisionId || "",
          level: inferElectionLevel(voterData.election),
          source: "google-civic",
        }
      : null;

    const mergedElections = [];
    const seen = new Set();
    for (const item of [
      primaryElection,
      ...otherElections,
      ...elections.filter((item) => {
        if (!stateCode) return true;
        const ocd = String(item.ocdDivisionId || "").toLowerCase();
        return (
          ocd.includes("country:us") ||
          ocd.includes(`state:${stateCode.toLowerCase()}`)
        );
      }),
    ].filter(Boolean)) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      mergedElections.push(item);
    }

    if (!mergedElections.length) {
      mergedElections.push(...fallbackElections());
    }

    const voterInfo = voterData
      ? {
          election: primaryElection,
          pollingLocations: (voterData.pollingLocations || [])
            .slice(0, 5)
            .map(formatPlace),
          earlyVoteSites: (voterData.earlyVoteSites || [])
            .slice(0, 5)
            .map(formatPlace),
          dropOffLocations: (voterData.dropOffLocations || [])
            .slice(0, 5)
            .map(formatPlace),
          contests: summarizeContests(voterData.contests || []),
        }
      : null;

    return json(res, 200, {
      ok: true,
      coverage: voterData ? "live" : "partial",
      message: voterError || null,
      address,
      normalizedAddress: formatAddress(normalized) || address,
      stateCode,
      elections: mergedElections.slice(0, 12),
      voterInfo,
      registrationLinks,
      admin: electionAdmin(voterData?.state || []),
    });
  } catch (error) {
    console.error(error);
    return json(res, 500, {
      error: error.message || "Could not load voter information",
    });
  }
};
