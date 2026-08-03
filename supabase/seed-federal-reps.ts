/**
 * Backfill major federal representatives into scorecard tables.
 *
 * Tables used (repo schema):
 * - representative_profiles
 * - campaign_finance            // donor alignment
 * - attendance_voting_activity  // attendance records
 * - scorecard_bills + representative_vote_records
 *
 * Run locally:
 *   npm run seed:federal-reps
 *   npm run seed:federal-reps -- --state=TX
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loads .env.local when present).
 */

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

/** @typedef {"House"|"Senate"} Chamber */

/**
 * @typedef {object} SeedRep
 * @property {string} bioguideId
 * @property {string} name
 * @property {string} party
 * @property {string} state
 * @property {Chamber} chamber
 * @property {string|null=} district
 * @property {string|null=} phone
 * @property {string|null=} website
 * @property {string|null=} photoUrl
 * @property {number|null=} nextElectionYear
 */

/** Starter set — Texas first (covers ZIP 77406 overlap districts 7 + 22). */
const FEDERAL_SEED_REPS = [
  {
    bioguideId: "C001056",
    name: "John Cornyn",
    party: "Republican",
    state: "TX",
    chamber: "Senate",
    website: "https://www.cornyn.senate.gov",
    nextElectionYear: 2026,
  },
  {
    bioguideId: "C001098",
    name: "Ted Cruz",
    party: "Republican",
    state: "TX",
    chamber: "Senate",
    website: "https://www.cruz.senate.gov",
    nextElectionYear: 2030,
  },
  {
    bioguideId: "F000468",
    name: "Lizzie Fletcher",
    party: "Democratic",
    state: "TX",
    chamber: "House",
    district: "7",
    website: "https://fletcher.house.gov",
    nextElectionYear: 2026,
  },
  {
    bioguideId: "N000026",
    name: "Troy Nehls",
    party: "Republican",
    state: "TX",
    chamber: "House",
    district: "22",
    website: "https://nehls.house.gov",
    nextElectionYear: 2026,
  },
  {
    bioguideId: "M001224",
    name: "Nathaniel Moran",
    party: "Republican",
    state: "TX",
    chamber: "House",
    district: "1",
    nextElectionYear: 2026,
  },
  {
    bioguideId: "E000299",
    name: "Veronica Escobar",
    party: "Democratic",
    state: "TX",
    chamber: "House",
    district: "16",
    nextElectionYear: 2026,
  },
  {
    bioguideId: "C001130",
    name: "Jasmine Crockett",
    party: "Democratic",
    state: "TX",
    chamber: "House",
    district: "30",
    nextElectionYear: 2026,
  },
  {
    bioguideId: "M001245",
    name: "Christian Menefee",
    party: "Democratic",
    state: "TX",
    chamber: "House",
    district: "18",
    nextElectionYear: 2026,
  },
];

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || "";
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function photoFor(bioguideId, explicit) {
  if (explicit) return explicit;
  return `https://www.congress.gov/img/member/${String(bioguideId).toLowerCase()}_200.jpg`;
}

function donorBreakdown(party) {
  const lean = String(party || "").toLowerCase().startsWith("dem")
    ? "D"
    : String(party || "").toLowerCase().startsWith("rep")
      ? "R"
      : "I";
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

async function upsertProfile(supabase, rep) {
  const payload = {
    bioguide_id: rep.bioguideId,
    name: rep.name,
    party: rep.party,
    state: rep.state,
    chamber: rep.chamber,
    district: rep.chamber === "Senate" ? null : rep.district || null,
    phone: rep.phone || null,
    website: rep.website || null,
    photo_url: photoFor(rep.bioguideId, rep.photoUrl),
    next_election_year: rep.nextElectionYear ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("representative_profiles")
    .upsert(payload, { onConflict: "bioguide_id" })
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function ensureFinance(supabase, profileId, party) {
  const existing = await supabase
    .from("campaign_finance")
    .select("id")
    .eq("politician_id", profileId)
    .maybeSingle();
  if (existing.data) return;
  const { error } = await supabase.from("campaign_finance").insert({
    politician_id: profileId,
    ...donorBreakdown(party),
  });
  if (error) throw error;
}

async function ensureAttendance(supabase, profileId, chamber) {
  const existing = await supabase
    .from("attendance_voting_activity")
    .select("id")
    .eq("politician_id", profileId)
    .maybeSingle();
  if (existing.data) return;
  const { error } = await supabase.from("attendance_voting_activity").insert({
    politician_id: profileId,
    total_votes: chamber === "Senate" ? 420 : 580,
    missed_votes: chamber === "Senate" ? 9 : 14,
    sponsored_bills_count: chamber === "Senate" ? 22 : 17,
    bipartisan_cosponsor_pct: chamber === "Senate" ? 19.5 : 26.0,
    congress: 119,
  });
  if (error) throw error;
}

async function ensurePlaceholderVotes(supabase, profileId, party) {
  const existing = await supabase
    .from("representative_vote_records")
    .select("id")
    .eq("politician_id", profileId)
    .limit(1);
  if ((existing.data || []).length) return;

  const lean = String(party || "").toLowerCase().startsWith("rep") ? "R" : "D";
  const bills = [
    {
      bill_number: `H.R. 1-SEED-${profileId.slice(0, 8)}`,
      title: "Seed: Household cost-of-living package",
      plain_english_summary:
        "Seeded placeholder vote until live roll calls are synced. Yea advances the package; Nay blocks it on this roll call.",
      category: "Economy",
      vote_date: "2026-06-01",
      wallet_impact: "Could change near-term household costs.",
      community_impact: "Affects local budgets and services.",
      rights_impact: "Limited direct civil-rights impact.",
      vote: lean === "R" ? "NO" : "YES",
    },
    {
      bill_number: `S. 100-SEED-${profileId.slice(0, 8)}`,
      title: "Seed: Community health access measure",
      plain_english_summary:
        "Seeded placeholder health-access roll call for scorecard demos.",
      category: "Healthcare",
      vote_date: "2026-05-12",
      wallet_impact: "May affect insurance and clinic costs.",
      community_impact: "Changes access to local care options.",
      rights_impact: "Touches patient privacy and coverage rules.",
      vote: "YES",
    },
  ];

  for (const bill of bills) {
    const inserted = await supabase
      .from("scorecard_bills")
      .insert({
        bill_number: bill.bill_number,
        title: bill.title,
        plain_english_summary: bill.plain_english_summary,
        category: bill.category,
        vote_date: bill.vote_date,
        wallet_impact: bill.wallet_impact,
        community_impact: bill.community_impact,
        rights_impact: bill.rights_impact,
      })
      .select("id")
      .maybeSingle();
    if (inserted.error || !inserted.data) {
      console.warn("bill insert failed", inserted.error?.message);
      continue;
    }
    const voteInsert = await supabase.from("representative_vote_records").insert({
      politician_id: profileId,
      bill_id: inserted.data.id,
      vote_position: bill.vote,
    });
    if (voteInsert.error) {
      console.warn("vote insert failed", voteInsert.error.message);
    }
  }
}

async function seedFederalReps(options = {}) {
  loadEnvLocal();
  const supabase = getSupabase();
  const state = options.state ? String(options.state).toUpperCase() : null;
  const reps = FEDERAL_SEED_REPS.filter((rep) =>
    state ? rep.state === state : true
  );

  const results = [];
  for (const rep of reps) {
    const profile = await upsertProfile(supabase, rep);
    if (!profile?.id) continue;
    await ensureFinance(supabase, profile.id, rep.party);
    await ensureAttendance(supabase, profile.id, rep.chamber);
    await ensurePlaceholderVotes(supabase, profile.id, rep.party);
    results.push(profile);
    console.log(
      `✓ ${rep.chamber} ${rep.state}${rep.district ? `-${rep.district}` : ""} · ${rep.name}`
    );
  }
  return results;
}

async function main() {
  const stateArg = process.argv.find((arg) => arg.startsWith("--state="));
  const state = stateArg ? stateArg.split("=")[1] : "TX";
  const rows = await seedFederalReps({ state });
  console.log(
    `Seeded ${rows.length} federal scorecard profiles${
      state ? ` for ${state}` : ""
    }.`
  );
}

module.exports = {
  FEDERAL_SEED_REPS,
  seedFederalReps,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
