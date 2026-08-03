/**
 * Auto-seed helpers for Representative Scorecard placeholders.
 *
 * Tables (repo schema):
 * - representative_profiles
 * - campaign_finance          (donor alignment)
 * - attendance_voting_activity (attendance records)
 * - scorecard_bills + representative_vote_records (Truth in Voting)
 */

const PLACEHOLDER_BILLS = [
  {
    bill_number: "H.R. 1",
    title: "Placeholder: Household cost-of-living package",
    plain_english_summary:
      "This is placeholder vote data until live roll calls are synced. A Yea would advance a package framed around household costs. A Nay would block that package on this roll call.",
    category: "Economy",
    wallet_impact: "Could change near-term household costs.",
    community_impact: "Affects local budgets and services.",
    rights_impact: "Limited direct civil-rights impact.",
    days_ago: 12,
  },
  {
    bill_number: "S. 100",
    title: "Placeholder: Community health access measure",
    plain_english_summary:
      "Placeholder Senate roll call on a health-access measure. Yea advances the measure as written. Nay rejects it for now.",
    category: "Healthcare",
    wallet_impact: "May affect insurance and clinic costs.",
    community_impact: "Changes access to local care options.",
    rights_impact: "Touches patient privacy and coverage rules.",
    days_ago: 28,
  },
  {
    bill_number: "H.R. 250",
    title: "Placeholder: Clean water and infrastructure bill",
    plain_english_summary:
      "Placeholder House vote on water and infrastructure funding. Yea moves the bill forward. Nay stops it on this vote.",
    category: "Environment",
    wallet_impact: "Public works spending can affect taxes and rates.",
    community_impact: "Impacts local water systems and jobs.",
    rights_impact: "Mostly environmental and public-health focused.",
    days_ago: 45,
  },
];

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

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
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
 * Ensure a few placeholder Truth-in-Voting rows exist for a profile.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} profile
 */
async function ensurePlaceholderVotes(supabase, profile) {
  if (!profile?.id) return;

  const existing = await supabase
    .from("representative_vote_records")
    .select("id")
    .eq("politician_id", profile.id)
    .limit(1);
  if (existing.error) {
    console.warn(
      "vote placeholder check failed:",
      existing.error.message || existing.error
    );
    return;
  }
  if ((existing.data || []).length) return;

  const lean = partyLean(profile.party);
  for (let index = 0; index < PLACEHOLDER_BILLS.length; index += 1) {
    const bill = PLACEHOLDER_BILLS[index];
    const billNumber = `${bill.bill_number}-PH-${String(profile.id).slice(0, 8)}`;
    let billRow;
    const existingBill = await supabase
      .from("scorecard_bills")
      .select("*")
      .eq("bill_number", billNumber)
      .maybeSingle();
    if (existingBill.data) {
      billRow = existingBill.data;
    } else {
      const inserted = await supabase
        .from("scorecard_bills")
        .insert({
          bill_number: billNumber,
          title: bill.title,
          plain_english_summary: bill.plain_english_summary,
          category: bill.category,
          vote_date: isoDaysAgo(bill.days_ago),
          wallet_impact: bill.wallet_impact,
          community_impact: bill.community_impact,
          rights_impact: bill.rights_impact,
        })
        .select("*")
        .maybeSingle();
      if (inserted.error || !inserted.data) {
        console.warn(
          "scorecard_bills placeholder insert failed:",
          inserted.error?.message || inserted.error
        );
        continue;
      }
      billRow = inserted.data;
    }

    // Alternate placeholder positions by party lean + index.
    let votePosition = "YES";
    if (index === 1) votePosition = lean === "R" ? "NO" : "YES";
    if (index === 2) votePosition = lean === "D" ? "NO" : "YES";

    const { error } = await supabase.from("representative_vote_records").upsert(
      {
        politician_id: profile.id,
        bill_id: billRow.id,
        vote_position: votePosition,
      },
      { onConflict: "politician_id,bill_id" }
    );
    if (error) {
      console.warn(
        "representative_vote_records placeholder insert failed:",
        error.message
      );
    }
  }
}

/**
 * Seed missing donor/attendance/vote placeholders for profile rows.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object[]} profiles
 */
async function ensureScorecardPlaceholders(supabase, profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  for (const profile of list) {
    await ensureDonorAndAttendancePlaceholders(supabase, profile);
    await ensurePlaceholderVotes(supabase, profile);
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
  PLACEHOLDER_BILLS,
  ensureDonorAndAttendancePlaceholders,
  ensurePlaceholderVotes,
  ensureScorecardPlaceholders,
  findMissingLegislators,
  placeholderAttendance,
  placeholderFinance,
};
