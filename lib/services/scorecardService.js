/**
 * Representative Scorecard service.
 *
 * Builds full scorecard payloads for federal reps resolved from a ZIP/address.
 * Runtime companion to lib/services/scorecardService.ts.
 */

const { createClient } = require("@supabase/supabase-js");
const {
  districtsMatch,
  env,
  extractZip,
  normalizeDistrict,
  resolveCongressionalDistrict,
} = require("./geocodioDistricts");

const {
  mapPoliticianProfileRow,
  mapCampaignFinanceRow,
  mapAttendanceVotingActivityRow,
  mapBillRollCallVoteRow,
  mapRepresentativeVoteRecordRow,
} = require("../types/scorecard-mappers");

function getSupabaseAdmin() {
  const url =
    env("SUPABASE_URL") || "https://inosruobpxnqcfxxosqr.supabase.co";
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = env("SUPABASE_ANON_KEY");
  const key = serviceKey || anonKey;
  if (!key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toNumber(value, fallback = null) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sortIndustries(industries) {
  const list = Array.isArray(industries) ? industries : [];
  return [...list]
    .map((item) => ({
      name: String(item?.name || "").trim() || "Unknown",
      amount: toNumber(item?.amount, 0) || 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ state: string, district: string, bioguides?: string[] }} location
 */
async function fetchFederalRepresentatives(supabase, location) {
  const state = String(location.state || "").toUpperCase();
  if (!state) return [];

  const { data, error } = await supabase
    .from("representative_profiles")
    .select("*")
    .eq("state", state)
    .in("chamber", ["House", "Senate"]);

  if (error) {
    const err = new Error(
      error.message || "Failed to load representative profiles"
    );
    err.statusCode = 500;
    err.cause = error;
    throw err;
  }

  const rows = Array.isArray(data) ? data : [];
  const bioguideSet = new Set(
    (location.bioguides || []).map((id) => String(id).toUpperCase())
  );

  const senators = rows.filter(
    (row) => String(row.chamber || "") === "Senate"
  );
  const house = rows.filter((row) => {
    if (String(row.chamber || "") !== "House") return false;
    if (bioguideSet.size && row.bioguide_id) {
      if (bioguideSet.has(String(row.bioguide_id).toUpperCase())) return true;
    }
    return districtsMatch(row.district, location.district);
  });

  // Prefer at most 2 senators + 1 house member.
  const picked = [
    ...senators.slice(0, 2),
    ...house.slice(0, 1),
  ];

  // If bioguide hints exist and we under-matched, try direct bioguide pull.
  if (picked.length < 3 && bioguideSet.size) {
    const have = new Set(picked.map((row) => row.id));
    for (const row of rows) {
      if (have.has(row.id)) continue;
      if (
        row.bioguide_id &&
        bioguideSet.has(String(row.bioguide_id).toUpperCase())
      ) {
        picked.push(row);
        have.add(row.id);
      }
      if (picked.length >= 3) break;
    }
  }

  return picked;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} politicianId
 */
async function fetchCampaignFinance(supabase, politicianId) {
  const { data, error } = await supabase
    .from("campaign_finance")
    .select("*")
    .eq("politician_id", politicianId)
    .maybeSingle();
  if (error) {
    console.warn("campaign_finance read failed:", error.message || error);
    return null;
  }
  return data || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} politicianId
 */
async function fetchAttendance(supabase, politicianId) {
  const { data, error } = await supabase
    .from("attendance_voting_activity")
    .select("*")
    .eq("politician_id", politicianId)
    .maybeSingle();
  if (error) {
    console.warn(
      "attendance_voting_activity read failed:",
      error.message || error
    );
    return null;
  }
  return data || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} politicianId
 * @param {number} [limit]
 */
async function fetchRecentVotes(supabase, politicianId, limit = 5) {
  const { data, error } = await supabase
    .from("representative_vote_records")
    .select(
      `
      id,
      politician_id,
      bill_id,
      vote_position,
      created_at,
      updated_at,
      bill:scorecard_bills (
        id,
        bill_number,
        title,
        plain_english_summary,
        category,
        vote_date,
        wallet_impact,
        community_impact,
        rights_impact,
        created_at,
        updated_at
      )
    `
    )
    .eq("politician_id", politicianId)
    .order("vote_date", {
      ascending: false,
      foreignTable: "scorecard_bills",
      nullsFirst: false,
    })
    .limit(limit);

  if (error) {
    // Fallback without foreign order if PostgREST rejects it.
    console.warn(
      "representative_vote_records ordered read failed:",
      error.message || error
    );
    const retry = await supabase
      .from("representative_vote_records")
      .select(
        `
        id,
        politician_id,
        bill_id,
        vote_position,
        created_at,
        updated_at,
        bill:scorecard_bills (*)
      `
      )
      .eq("politician_id", politicianId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (retry.error) {
      console.warn(
        "representative_vote_records read failed:",
        retry.error.message || retry.error
      );
      return [];
    }
    return Array.isArray(retry.data) ? retry.data : [];
  }

  return Array.isArray(data) ? data : [];
}

function buildAttendancePayload(row) {
  if (!row) return null;
  const mapped = mapAttendanceVotingActivityRow(row);
  const total = mapped.totalVotes || 0;
  const missed = mapped.missedVotes || 0;
  const missedVotePct =
    total > 0 ? Math.round((missed / total) * 1000) / 10 : null;
  return {
    ...mapped,
    missedVotePct,
  };
}

function buildCampaignFinancePayload(row) {
  if (!row) return null;
  const mapped = mapCampaignFinanceRow(row);
  const topIndustries = sortIndustries(mapped.topIndustries).slice(0, 5);
  return {
    politicianId: mapped.politicianId,
    smallDonorPct: mapped.smallDonorPct,
    largeDonorPct: mapped.largeDonorPct,
    pacPct: mapped.pacPct,
    selfFundingPct: mapped.selfFundingPct,
    totalRaised: mapped.totalRaised,
    topIndustries,
    cycle: mapped.cycle ?? null,
  };
}

function buildRecentVotePayload(row) {
  const vote = mapRepresentativeVoteRecordRow({
    id: row.id,
    politician_id: row.politician_id,
    bill_id: row.bill_id,
    vote_position: row.vote_position,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
  const billRow = Array.isArray(row.bill) ? row.bill[0] : row.bill;
  const bill = billRow ? mapBillRollCallVoteRow(billRow) : null;
  return {
    votePosition: vote.votePosition,
    billId: vote.billId,
    billNumber: bill?.billNumber || null,
    title: bill?.title || null,
    plainEnglishSummary: bill?.plainEnglishSummary || null,
    category: bill?.category || null,
    voteDate: bill?.voteDate || null,
    impacts: {
      wallet: bill?.walletImpact || null,
      community: bill?.communityImpact || null,
      rights: bill?.rightsImpact || null,
    },
  };
}

/**
 * Assemble one representative scorecard.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} profileRow
 */
async function buildScorecardPayload(supabase, profileRow) {
  const profile = mapPoliticianProfileRow(profileRow);
  const [financeRow, attendanceRow, voteRows] = await Promise.all([
    fetchCampaignFinance(supabase, profile.id),
    fetchAttendance(supabase, profile.id),
    fetchRecentVotes(supabase, profile.id, 5),
  ]);

  return {
    profile,
    campaignFinance: buildCampaignFinancePayload(financeRow),
    attendance: buildAttendancePayload(attendanceRow),
    recentVotes: voteRows.map(buildRecentVotePayload),
  };
}

/**
 * Lookup federal representatives + scorecards for a ZIP or address.
 * @param {{ zipCode?: string|null, address?: string|null, supabase?: any }} options
 */
async function lookupRepresentativesByLocation(options = {}) {
  const zipCode = String(options.zipCode || "").trim() || null;
  const address = String(options.address || "").trim() || null;
  if (!zipCode && !address) {
    const error = new Error("Provide zipCode or address query parameter");
    error.statusCode = 400;
    throw error;
  }

  const location = await resolveCongressionalDistrict({ zipCode, address });
  const supabase = options.supabase || getSupabaseAdmin();
  if (!supabase) {
    const error = new Error(
      "Database is not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)"
    );
    error.statusCode = 503;
    throw error;
  }

  let profiles = [];
  try {
    profiles = await fetchFederalRepresentatives(supabase, location);
  } catch (dbError) {
    // Table may not exist yet in some environments — surface a clear error.
    const message = dbError.message || String(dbError);
    if (/relation .* does not exist|Could not find the table/i.test(message)) {
      const error = new Error(
        "Scorecard tables are missing. Run supabase/migration-representative-scorecard.sql"
      );
      error.statusCode = 503;
      throw error;
    }
    throw dbError;
  }

  const representatives = [];
  const scorecardErrors = [];
  for (const profile of profiles) {
    try {
      representatives.push(await buildScorecardPayload(supabase, profile));
    } catch (scoreError) {
      scorecardErrors.push({
        politicianId: profile.id,
        name: profile.name,
        error: scoreError.message || String(scoreError),
      });
    }
  }

  return {
    ok: true,
    query: {
      zipCode: zipCode || extractZip(address) || location.zipCode,
      address,
    },
    location: {
      state: location.state,
      district: normalizeDistrict(location.district),
      formattedAddress: location.formattedAddress,
      source: location.source,
      lat: location.lat,
      lng: location.lng,
      ...(location.warning ? { warning: location.warning } : {}),
    },
    counts: {
      senators: representatives.filter((r) => r.profile.chamber === "Senate")
        .length,
      house: representatives.filter((r) => r.profile.chamber === "House")
        .length,
      total: representatives.length,
    },
    representatives,
    ...(scorecardErrors.length ? { scorecardErrors } : {}),
  };
}

module.exports = {
  buildAttendancePayload,
  buildCampaignFinancePayload,
  buildRecentVotePayload,
  buildScorecardPayload,
  fetchFederalRepresentatives,
  getSupabaseAdmin,
  lookupRepresentativesByLocation,
  normalizeDistrict,
  sortIndustries,
};
