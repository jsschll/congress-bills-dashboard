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

async function fetchRecentVotesForMember(apiKey, bioguideId, limit = 10) {
  const bio = String(bioguideId || "").toUpperCase();
  if (!bio) return [];

  const listUrl = `${CONGRESS_API}/house-vote/${CONGRESS}?format=json&limit=40&api_key=${encodeURIComponent(
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

  const found = [];
  const chunkSize = 6;
  for (let i = 0; i < votes.length && found.length < limit; i += chunkSize) {
    const chunk = votes.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (vote) => {
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
          const type = String(vote.legislationType || "").toLowerCase();
          const number = String(vote.legislationNumber || "");
          return {
            id:
              type && number
                ? `federal-${congress}-${type}-${number}`.toLowerCase()
                : `house-vote-${congress}-${session}-${roll}`,
            billNumber:
              type && number
                ? `${String(vote.legislationType || "").toUpperCase()} ${number}`
                : `Roll Call ${roll}`,
            title:
              vote.voteQuestion ||
              vote.legislationTitle ||
              `House Roll Call ${roll}`,
            congress,
            sessionNumber: session,
            rollCallNumber: roll,
            voteCast: normalizeVoteCast(row.voteCast),
            result: vote.result || "",
            date: vote.startDate || vote.date || null,
            policyArea: null,
            officialUrl:
              type && number
                ? `https://www.congress.gov/bill/${congress}th-congress/${type}/${number}`
                : `https://clerk.house.gov/Votes/Details/${congress}${String(
                    roll
                  ).padStart(3, "0")}`,
            kind: "vote",
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
  return found;
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
      recentVotes = await fetchRecentVotesForMember(apiKey, bioguide, 10);
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
