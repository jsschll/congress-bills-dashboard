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
  ensureScorecardPlaceholders,
  findMissingLegislators,
} = require("./scorecardAutoSeed");

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
 * @param {{ state: string, district: string, districts?: string[], bioguides?: string[] }} location
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

  const rows = dedupeProfileRows(Array.isArray(data) ? data : []);
  const bioguideSet = new Set(
    (location.bioguides || []).map((id) => String(id).toUpperCase())
  );
  const districtSet = new Set(
    [location.district, ...(location.districts || [])]
      .map((value) => normalizeDistrict(value))
      .filter(Boolean)
  );

  const senators = rows.filter(
    (row) => String(row.chamber || "") === "Senate"
  );
  const house = rows.filter((row) => {
    if (String(row.chamber || "") !== "House") return false;
    if (bioguideSet.size && row.bioguide_id) {
      if (bioguideSet.has(String(row.bioguide_id).toUpperCase())) return true;
    }
    return [...districtSet].some((district) =>
      districtsMatch(row.district, district)
    );
  });

  // Prefer the primary district member first, then other overlap matches.
  const primaryDistrict = normalizeDistrict(location.district);
  house.sort((a, b) => {
    const aPrimary = primaryDistrict && districtsMatch(a.district, primaryDistrict) ? 0 : 1;
    const bPrimary = primaryDistrict && districtsMatch(b.district, primaryDistrict) ? 0 : 1;
    if (aPrimary !== bPrimary) return aPrimary - bPrimary;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });

  // Prefer at most 2 senators + house members for matched districts (cap 2 house for split ZIPs).
  const picked = [...senators.slice(0, 2), ...house.slice(0, 2)];

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
      if (picked.length >= 5) break;
    }
  }

  return picked;
}

/**
 * Upsert federal legislators into representative_profiles.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} legislators
 */
async function upsertRepresentativeProfiles(supabase, legislators) {
  const rows = (legislators || []).filter((row) => row?.name && row?.chamber);
  if (!rows.length) return [];

  const upserted = [];
  for (const row of rows) {
    const payload = {
      bioguide_id: row.bioguide_id || null,
      fec_id: row.fec_id || null,
      name: row.name,
      party: row.party || null,
      district: row.district || null,
      state: row.state ? String(row.state).toUpperCase() : null,
      chamber: row.chamber,
      office_address: row.office_address || null,
      phone: row.phone || null,
      website: row.website || null,
      photo_url: row.photo_url || null,
      next_election_year: row.next_election_year || null,
      politician_id: row.politician_id || null,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (payload.bioguide_id) {
      result = await supabase
        .from("representative_profiles")
        .upsert(payload, { onConflict: "bioguide_id" })
        .select("*")
        .maybeSingle();
    } else {
      // No bioguide: find existing by state+chamber+name, else insert.
      const existing = await supabase
        .from("representative_profiles")
        .select("*")
        .eq("state", payload.state)
        .eq("chamber", payload.chamber)
        .ilike("name", payload.name)
        .maybeSingle();
      if (existing.data?.id) {
        result = await supabase
          .from("representative_profiles")
          .update(payload)
          .eq("id", existing.data.id)
          .select("*")
          .maybeSingle();
      } else {
        result = await supabase
          .from("representative_profiles")
          .insert(payload)
          .select("*")
          .maybeSingle();
      }
    }

    if (result?.error) {
      console.warn(
        "representative_profiles upsert failed:",
        result.error.message || result.error
      );
      continue;
    }
    if (result?.data) upserted.push(result.data);
  }
  return upserted;
}

/**
 * Copy federal House/Senate rows from politicians → representative_profiles.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ state?: string|null }} [options]
 */
async function syncProfilesFromPoliticians(supabase, options = {}) {
  let query = supabase
    .from("politicians")
    .select(
      "id,name,state,chamber,district,bioguide_id,party,photo_url,website_url,phone,level"
    )
    .eq("level", "federal")
    .in("chamber", ["house", "senate", "House", "Senate"]);

  if (options.state) {
    query = query.eq("state", String(options.state).toUpperCase());
  }

  const { data, error } = await query;
  if (error) {
    console.warn(
      "politicians sync read failed:",
      error.message || error
    );
    return [];
  }

  const byKey = new Map();
  for (const row of data || []) {
    const chamberRaw = String(row.chamber || "").toLowerCase();
    const chamber =
      chamberRaw === "senate"
        ? "Senate"
        : chamberRaw === "house"
          ? "House"
          : null;
    if (!chamber) continue;
    const bioguide = row.bioguide_id
      ? String(row.bioguide_id).toUpperCase()
      : null;
    const nameKey = String(row.name || "")
      .toLowerCase()
      .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, " ")
      .replace(/[^a-z\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // Dedupe on identity, not bioguide alone — politicians table often has
    // duplicate senate rows with and without bioguide_id.
    const key = `${chamber}:${String(row.state || "").toUpperCase()}:${nameKey}:${
      chamber === "House" ? normalizeDistrict(row.district) || "" : ""
    }`;
    const mapped = {
      bioguide_id: bioguide,
      name: row.name,
      party: row.party || null,
      district:
        chamber === "Senate"
          ? null
          : normalizeDistrict(row.district) || null,
      state: row.state ? String(row.state).toUpperCase() : null,
      chamber,
      phone: row.phone || null,
      website: row.website_url || null,
      photo_url:
        row.photo_url ||
        (bioguide
          ? `https://www.congress.gov/img/member/${bioguide.toLowerCase()}_200.jpg`
          : null),
      politician_id: row.id,
    };
    const prev = byKey.get(key);
    if (!prev || (!prev.bioguide_id && mapped.bioguide_id)) {
      byKey.set(key, mapped);
    }
  }

  return upsertRepresentativeProfiles(supabase, [...byKey.values()]);
}

function normalizePersonKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, " ")
    .replace(/\b[a-z]\b\.?/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeProfileRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const chamber = String(row.chamber || "");
    const key = `${chamber}:${String(row.state || "").toUpperCase()}:${normalizePersonKey(
      row.name
    )}:${chamber === "House" ? normalizeDistrict(row.district) || "" : ""}`;
    const prev = map.get(key);
    if (!prev || (!prev.bioguide_id && row.bioguide_id)) {
      map.set(key, row);
    }
  }
  return [...map.values()];
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
async function buildScorecardPayload(supabase, profileRow, options = {}) {
  const profile = mapPoliticianProfileRow(profileRow);
  const voteLimit = Number(options.voteLimit) > 0 ? Number(options.voteLimit) : 5;
  const [financeRow, attendanceRow, voteRows] = await Promise.all([
    fetchCampaignFinance(supabase, profile.id),
    fetchAttendance(supabase, profile.id),
    fetchRecentVotes(supabase, profile.id, voteLimit),
  ]);

  return {
    profile,
    campaignFinance: buildCampaignFinancePayload(financeRow),
    attendance: buildAttendancePayload(attendanceRow),
    recentVotes: voteRows.map(buildRecentVotePayload),
  };
}

/**
 * Load one scorecard by representative profile id or bioguide id.
 * @param {{ id?: string|null, bioguideId?: string|null, supabase?: any, voteLimit?: number }} options
 */
async function getScorecardById(options = {}) {
  const id = String(options.id || "").trim() || null;
  const bioguideId = String(options.bioguideId || "").trim() || null;
  if (!id && !bioguideId) {
    const error = new Error("Provide id or bioguideId");
    error.statusCode = 400;
    throw error;
  }

  const supabase = options.supabase || getSupabaseAdmin();
  if (!supabase) {
    const error = new Error(
      "Database is not configured (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY)"
    );
    error.statusCode = 503;
    throw error;
  }

  let query = supabase.from("representative_profiles").select("*");
  if (id) query = query.eq("id", id);
  else query = query.ilike("bioguide_id", bioguideId);

  const { data, error } = await query.maybeSingle();
  if (error) {
    const message = error.message || String(error);
    if (/relation .* does not exist|Could not find the table/i.test(message)) {
      const missing = new Error(
        "Scorecard tables are missing. Run supabase/migration-representative-scorecard.sql"
      );
      missing.statusCode = 503;
      throw missing;
    }
    const err = new Error(message);
    err.statusCode = 500;
    throw err;
  }
  if (!data) {
    const notFound = new Error("Representative not found");
    notFound.statusCode = 404;
    throw notFound;
  }

  await ensureScorecardPlaceholders(supabase, [data]);

  const representative = await buildScorecardPayload(supabase, data, {
    voteLimit: options.voteLimit || 25,
  });

  return {
    ok: true,
    representative,
    representatives: [representative],
  };
}

/**
 * Order federal reps for scorecard tabs: Senate seats then House.
 * @param {Array<{ profile: { chamber?: string|null, name?: string } }>} reps
 */
function orderRepresentativesForTabs(reps) {
  const list = Array.isArray(reps) ? [...reps] : [];
  const senators = list
    .filter((rep) => rep?.profile?.chamber === "Senate")
    .sort((a, b) =>
      String(a.profile.name || "").localeCompare(String(b.profile.name || ""))
    );
  const house = list.filter((rep) => rep?.profile?.chamber === "House");
  const other = list.filter(
    (rep) =>
      rep?.profile?.chamber !== "Senate" && rep?.profile?.chamber !== "House"
  );
  return [...senators, ...house, ...other];
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

  // 1) If Geocodio returned legislators, seed any missing scorecard profiles.
  if (Array.isArray(location.legislators) && location.legislators.length) {
    try {
      const missing = await findMissingLegislators(
        supabase,
        location.legislators
      );
      if (missing.length) {
        const seeded = await upsertRepresentativeProfiles(supabase, missing);
        await ensureScorecardPlaceholders(supabase, seeded);
      } else {
        // Profiles exist — still ensure donor/attendance/vote placeholders.
        const existing = await fetchFederalRepresentatives(supabase, location);
        await ensureScorecardPlaceholders(supabase, existing);
      }
    } catch (seedError) {
      console.warn(
        "Scorecard auto-seed skipped:",
        seedError.message || seedError
      );
    }
  }

  let profiles = [];
  try {
    profiles = await fetchFederalRepresentatives(supabase, location);
    // 2) If still empty, backfill from politicians roster for this state.
    if (!profiles.length) {
      const synced = await syncProfilesFromPoliticians(supabase, {
        state: location.state,
      });
      await ensureScorecardPlaceholders(supabase, synced);
      profiles = await fetchFederalRepresentatives(supabase, location);
    } else {
      await ensureScorecardPlaceholders(supabase, profiles);
    }
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
      representatives.push(
        await buildScorecardPayload(supabase, profile, { voteLimit: 25 })
      );
    } catch (scoreError) {
      scorecardErrors.push({
        politicianId: profile.id,
        name: profile.name,
        error: scoreError.message || String(scoreError),
      });
    }
  }

  const ordered = orderRepresentativesForTabs(representatives);

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
      senators: ordered.filter((r) => r.profile.chamber === "Senate").length,
      house: ordered.filter((r) => r.profile.chamber === "House").length,
      total: ordered.length,
    },
    representatives: ordered,
    ...(scorecardErrors.length ? { scorecardErrors } : {}),
  };
}

module.exports = {
  buildAttendancePayload,
  buildCampaignFinancePayload,
  buildRecentVotePayload,
  buildScorecardPayload,
  fetchFederalRepresentatives,
  getScorecardById,
  getSupabaseAdmin,
  lookupRepresentativesByLocation,
  normalizeDistrict,
  orderRepresentativesForTabs,
  sortIndustries,
  syncProfilesFromPoliticians,
  upsertRepresentativeProfiles,
  ensureScorecardPlaceholders,
};
