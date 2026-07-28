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
  if (text.includes("city") || text.includes("municipal") || text.includes("mayor")) {
    return "Local";
  }
  if (text.includes("county")) return "Local";
  const ocd = String(election.ocdDivisionId || "").toLowerCase();
  if (ocd.includes("/state:") && !/country:us$/.test(ocd.replace(/\/$/, ""))) {
    return "State";
  }
  if (
    text.includes("federal") ||
    text.includes("congress") ||
    text.includes("presidential") ||
    text.includes("midterm") ||
    (ocd.includes("country:us") && !ocd.includes("/state:"))
  ) {
    return "Federal";
  }
  if (text.includes("state:")) return "State";
  return "State";
}

function isNationwideFederalElection(election = {}) {
  const ocd = String(election.ocdDivisionId || "").toLowerCase();
  const name = String(election.name || "").toLowerCase();
  if (ocd.includes("/state:")) return false;
  if (ocd.includes("country:us") && !ocd.includes("/state:")) return true;
  return (
    /\b(federal|u\.?s\.?|national|congress|presidential|midterm)\b/.test(name) &&
    !/\b(primary|county|city|municipal)\b/.test(name)
  );
}

function isStateLevelElection(election = {}) {
  const ocd = String(election.ocdDivisionId || "").toLowerCase();
  const level = String(election.level || inferElectionLevel(election)).toLowerCase();
  if (ocd.includes("/state:")) return true;
  return level === "state" || level === "local";
}

const STATE_NAMES = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

function electionMatchesState(election = {}, stateCode = "") {
  const code = normalizeStateCode(stateCode);
  if (!code) return isNationwideFederalElection(election);

  const ocd = String(election.ocdDivisionId || "").toLowerCase();
  const name = String(election.name || "").toLowerCase();
  const stateName = String(STATE_NAMES[code] || "").toLowerCase();

  if (ocd.includes(`state:${code.toLowerCase()}`)) return true;
  if (isNationwideFederalElection(election)) return true;

  if (stateName && name.includes(stateName)) return true;
  return false;
}

function stateCodeFromAddress(address = "") {
  const text = String(address || "");
  const zipState = text.match(/\b([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\b/);
  if (zipState) return normalizeStateCode(zipState[1]);
  const commaState = text.match(/,\s*([A-Za-z]{2})\b/);
  if (commaState) return normalizeStateCode(commaState[1]);
  return "";
}

function upcomingStateCalendar(stateCode = "") {
  const code = normalizeStateCode(stateCode);
  if (!code) return [];
  const stateName = STATE_NAMES[code] || code;
  const today = new Date().toISOString().slice(0, 10);
  const items = [
    {
      id: `calendar-${code.toLowerCase()}-primary-2026`,
      name: `${stateName} Primary Election`,
      electionDay: "2026-03-03",
      ocdDivisionId: `ocd-division/country:us/state:${code.toLowerCase()}`,
      level: "State",
      source: "calendar",
    },
    {
      id: `calendar-${code.toLowerCase()}-general-2026`,
      name: `${stateName} General Election`,
      electionDay: "2026-11-03",
      ocdDivisionId: `ocd-division/country:us/state:${code.toLowerCase()}`,
      level: "State",
      source: "calendar",
    },
  ];
  return items.filter((item) => item.electionDay >= today);
}

function fallbackElections(stateCode = "") {
  const federal = [
    {
      id: "fallback-2026-midterm",
      name: "2026 U.S. Midterm Election (federal)",
      electionDay: "2026-11-03",
      level: "Federal",
      source: "fallback",
      ocdDivisionId: "ocd-division/country:us",
    },
  ];
  return [...upcomingStateCalendar(stateCode), ...federal];
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
    const stateCode = stateCodeFromAddress(address);
    registrationLinks.stateSite = STATE_ELECTION_SITES[stateCode] || "";
    return json(res, 200, {
      ok: true,
      coverage: "fallback",
      message:
        "Live polling locations need a Civic API connection. Showing upcoming state and federal election dates plus official voter registration links.",
      address,
      normalizedAddress: address,
      stateCode,
      elections: fallbackElections(stateCode),
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
    const stateCode =
      normalizeStateCode(normalized.state) || stateCodeFromAddress(address);
    registrationLinks.stateSite = STATE_ELECTION_SITES[stateCode] || "";

    // voterinfo results are already scoped to this address — always keep them.
    const addressElections = [
      voterData?.election
        ? {
            id: String(voterData.election.id),
            name: voterData.election.name || "Election",
            electionDay: voterData.election.electionDay || "",
            ocdDivisionId: voterData.election.ocdDivisionId || "",
            level: inferElectionLevel(voterData.election),
            source: "google-civic",
          }
        : null,
      ...(voterData?.otherElections || []).map((item) => ({
        id: String(item.id),
        name: item.name || "Election",
        electionDay: item.electionDay || "",
        ocdDivisionId: item.ocdDivisionId || "",
        level: inferElectionLevel(item),
        source: "google-civic",
      })),
    ].filter(Boolean);

    const catalogForState = elections.filter((item) =>
      electionMatchesState(item, stateCode)
    );

    const mergedElections = [];
    const seen = new Set();
    for (const item of [...addressElections, ...catalogForState]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      mergedElections.push(item);
    }

    // If Civic has no state/local elections for this state yet, add calendar dates.
    const hasStateElection = mergedElections.some((item) =>
      isStateLevelElection(item)
    );
    if (!hasStateElection && stateCode) {
      for (const item of upcomingStateCalendar(stateCode)) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        mergedElections.push(item);
      }
    }

    if (!mergedElections.length) {
      mergedElections.push(...fallbackElections(stateCode));
    }

    mergedElections.sort((a, b) =>
      String(a.electionDay).localeCompare(String(b.electionDay))
    );

    const primaryElection = addressElections[0] || null;

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
      coverage: voterData ? "live" : hasStateElection ? "partial" : "calendar",
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
