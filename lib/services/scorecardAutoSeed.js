/**
 * Auto-seed helpers for Representative Scorecard placeholders.
 *
 * Tables (repo schema):
 * - representative_profiles
 * - campaign_finance          (donor alignment)
 * - attendance_voting_activity (attendance records)
 *
 * Truth in Voting uses live Congress.gov / Senate.gov roll calls
 * (see lib/scorecard-live-votes.js) — do not seed mock vote rows.
 */

function partyLean(party) {
  const value = String(party || "").toLowerCase();
  if (value.startsWith("dem")) return "D";
  if (value.startsWith("rep")) return "R";
  return "I";
}

function placeholderFinance(party) {
  const lean = partyLean(party);
  if (lean === "D") {
    return {
      small_donor_pct: 28,
      large_donor_pct: 34,
      pac_pct: 31,
      self_funding_pct: 7,
      total_raised: 2450000,
      top_industries: [
        { name: "Lawyers / Law Firms", amount: 312000 },
        { name: "Retired", amount: 248000 },
        { name: "Health Professionals", amount: 186000 },
        { name: "Education", amount: 142000 },
        { name: "Public Sector Unions", amount: 121000 },
      ],
      cycle: "2023-2024",
    };
  }
  if (lean === "R") {
    return {
      small_donor_pct: 18,
      large_donor_pct: 29,
      pac_pct: 44,
      self_funding_pct: 9,
      total_raised: 3120000,
      top_industries: [
        { name: "Oil & Gas", amount: 410000 },
        { name: "Securities & Investment", amount: 276000 },
        { name: "Real Estate", amount: 198000 },
        { name: "Retired", amount: 167000 },
        { name: "Leadership PACs", amount: 154000 },
      ],
      cycle: "2023-2024",
    };
  }
  return {
    small_donor_pct: 35,
    large_donor_pct: 30,
    pac_pct: 25,
    self_funding_pct: 10,
    total_raised: 980000,
    top_industries: [
      { name: "Retired", amount: 120000 },
      { name: "Health Professionals", amount: 88000 },
      { name: "Real Estate", amount: 76000 },
      { name: "Education", amount: 54000 },
      { name: "Misc Business", amount: 41000 },
    ],
    cycle: "2023-2024",
  };
}

function placeholderAttendance(chamber) {
  const isSenate = String(chamber || "") === "Senate";
  return {
    total_votes: isSenate ? 420 : 580,
    missed_votes: isSenate ? 9 : 14,
    sponsored_bills_count: isSenate ? 22 : 17,
    bipartisan_cosponsor_pct: isSenate ? 19.5 : 26.0,
    congress: 119,
  };
}

/**
 * Ensure donor + attendance placeholders exist for a profile.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} profile
 */
async function ensureDonorAndAttendancePlaceholders(supabase, profile) {
  if (!profile?.id) return;

  const finance = await supabase
    .from("campaign_finance")
    .select("id")
    .eq("politician_id", profile.id)
    .maybeSingle();
  if (!finance.data && !finance.error) {
    const payload = {
      politician_id: profile.id,
      ...placeholderFinance(profile.party),
    };
    const { error } = await supabase.from("campaign_finance").insert(payload);
    if (error) {
      console.warn("campaign_finance placeholder insert failed:", error.message);
    }
  }

  const attendance = await supabase
    .from("attendance_voting_activity")
    .select("id")
    .eq("politician_id", profile.id)
    .maybeSingle();
  if (!attendance.data && !attendance.error) {
    const payload = {
      politician_id: profile.id,
      ...placeholderAttendance(profile.chamber),
    };
    const { error } = await supabase
      .from("attendance_voting_activity")
      .insert(payload);
    if (error) {
      console.warn(
        "attendance_voting_activity placeholder insert failed:",
        error.message
      );
    }
  }
}

/**
 * @deprecated No-op — Truth in Voting no longer seeds mock roll calls.
 */
async function ensurePlaceholderVotes() {
  return;
}

/**
 * Seed missing donor/attendance placeholders for profile rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} profiles
 */
async function ensureScorecardPlaceholders(supabase, profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  for (const profile of list) {
    await ensureDonorAndAttendancePlaceholders(supabase, profile);
  }
}

/**
 * Find which Geocodio legislators are missing from representative_profiles.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} legislators
 */
async function findMissingLegislators(supabase, legislators) {
  const list = (legislators || []).filter((row) => row?.name && row?.chamber);
  if (!list.length) return [];

  const bioguides = list
    .map((row) => String(row.bioguide_id || "").toUpperCase())
    .filter(Boolean);
  /** @type {Set<string>} */
  const existingBioguides = new Set();
  if (bioguides.length) {
    const { data } = await supabase
      .from("representative_profiles")
      .select("bioguide_id")
      .in("bioguide_id", bioguides);
    for (const row of data || []) {
      if (row.bioguide_id) {
        existingBioguides.add(String(row.bioguide_id).toUpperCase());
      }
    }
  }

  return list.filter((row) => {
    const bio = row.bioguide_id
      ? String(row.bioguide_id).toUpperCase()
      : "";
    if (bio) return !existingBioguides.has(bio);
    return true; // no bioguide → let upsert path reconcile by name
  });
}

module.exports = {
  PLACEHOLDER_BILLS: [],
  ensureDonorAndAttendancePlaceholders,
  ensurePlaceholderVotes,
  ensureScorecardPlaceholders,
  findMissingLegislators,
  placeholderAttendance,
  placeholderFinance,
};
