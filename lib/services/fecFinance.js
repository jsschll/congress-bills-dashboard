/**
 * OpenFEC-backed campaign finance for Representative Scorecards.
 * Replaces identical party placeholders with per-candidate FEC totals +
 * top itemized contribution sources (employers).
 *
 * Env: FEC_API_KEY (optional; falls back to DEMO_KEY — rate-limited).
 */

const { enrichDonorSource } = require("./industryTaxonomy");

function env(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] || "").trim();
    if (value) return value;
  }
  return "";
}

const OPENFEC = "https://api.open.fec.gov/v1";

function fecApiKey() {
  return env("FEC_API_KEY", "OPENFEC_API_KEY") || "DEMO_KEY";
}

function officeCode(chamber) {
  const value = String(chamber || "").toLowerCase();
  if (value.includes("senate")) return "S";
  if (value.includes("house")) return "H";
  return "";
}

function lastNameFromFullName(name = "") {
  const cleaned = String(name || "")
    .replace(/,.*$/, "")
    .replace(/\b(jr|sr|ii|iii|iv)\.?$/i, "")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || cleaned;
}

async function fecGet(path, params = {}) {
  const url = new URL(`${OPENFEC}${path}`);
  url.searchParams.set("api_key", fecApiKey());
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenFEC ${path} failed (${response.status}): ${text.slice(0, 160)}`);
  }
  return response.json();
}

/**
 * Known identical party-template placeholders from scorecardAutoSeed.
 */
function isPlaceholderFinanceRow(row) {
  if (!row) return true;
  const total = Number(row.total_raised);
  const small = Number(row.small_donor_pct);
  const pac = Number(row.pac_pct);
  const signatures = [
    { total: 3120000, small: 18, pac: 44 },
    { total: 2450000, small: 28, pac: 31 },
    { total: 980000, small: 35, pac: 25 },
  ];
  return signatures.some(
    (sig) =>
      Math.abs(total - sig.total) < 1 &&
      Math.abs(small - sig.small) < 0.05 &&
      Math.abs(pac - sig.pac) < 0.05
  );
}

function financeNeedsRefresh(row, { maxAgeMs = 7 * 24 * 60 * 60 * 1000 } = {}) {
  if (!row || isPlaceholderFinanceRow(row)) return true;
  const updated = Date.parse(row.updated_at || "");
  if (!Number.isFinite(updated)) return true;
  return Date.now() - updated > maxAgeMs;
}

async function resolveFecCandidateId(profile = {}) {
  const existing = String(profile.fec_id || profile.fecId || "").trim();
  if (/^[PHSH]\d/.test(existing) || /^[HPS]\d/.test(existing)) return existing;

  const state = String(profile.state || "").trim().toUpperCase();
  const office = officeCode(profile.chamber);
  const name = lastNameFromFullName(profile.name);
  if (!name) return null;

  const data = await fecGet("/candidates/search/", {
    q: name,
    name,
    state: state || undefined,
    office: office || undefined,
    sort: "-election_years",
    per_page: 5,
  });
  const results = Array.isArray(data?.results) ? data.results : [];
  if (!results.length) return null;

  const stateMatch = state
    ? results.find((row) => String(row.state || "").toUpperCase() === state)
    : null;
  const officeMatch = office
    ? (stateMatch && String(stateMatch.office) === office
        ? stateMatch
        : results.find((row) => String(row.office) === office))
    : stateMatch;
  return String((officeMatch || results[0]).candidate_id || "").trim() || null;
}

async function resolvePrincipalCommitteeId(candidateId, cycle) {
  const attempts = [
    { cycle, designation: "P", per_page: 5 },
    { designation: "P", per_page: 5 },
    { cycle, per_page: 10 },
  ];
  for (const params of attempts) {
    try {
      const data = await fecGet(
        `/candidate/${encodeURIComponent(candidateId)}/committees/`,
        params
      );
      const results = Array.isArray(data?.results) ? data.results : [];
      const principal =
        results.find(
          (row) => String(row.designation || "").toUpperCase() === "P"
        ) || results[0];
      const id = String(principal?.committee_id || "").trim();
      if (id) return id;
    } catch {
      // try next param set
    }
  }
  return null;
}

function clampPct(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 10) / 10;
}

function normalizeEmployerLabel(raw = "") {
  return String(raw || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bSELF[-\s]?EMPLOYED\b/gi, "Self-Employed")
    .replace(/\bNOT EMPLOYED\b/gi, "Not Employed");
}

const GENERIC_EMPLOYERS = new Set([
  "retired",
  "self-employed",
  "self employed",
  "self",
  "homemaker",
  "not employed",
  "none",
  "n/a",
  "na",
  "null",
  "information requested",
  "info requested",
]);

function isGenericEmployer(name = "") {
  const lower = String(name || "").trim().toLowerCase();
  if (!lower) return true;
  if (GENERIC_EMPLOYERS.has(lower)) return true;
  if (lower.startsWith("information requested")) return true;
  if (lower.startsWith("info requested")) return true;
  if (lower.includes("best efforts")) return true;
  return false;
}

async function fetchTopContributionSources(committeeId, cycle, limit = 5) {
  if (!committeeId || !cycle) return [];
  const data = await fecGet("/schedules/schedule_a/by_employer/", {
    committee_id: committeeId,
    cycle,
    sort: "-total",
    per_page: 25,
  });
  const results = Array.isArray(data?.results) ? data.results : [];
  const out = [];
  for (const row of results) {
    const name = normalizeEmployerLabel(row.employer);
    if (!name || isGenericEmployer(name)) continue;
    const amount = Number(row.total);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    out.push(enrichDonorSource({ name, amount: Math.round(amount) }));
    if (out.length >= limit) break;
  }
  // If everything was generic, fall back to top rows including Retired.
  if (!out.length) {
    for (const row of results.slice(0, limit)) {
      const name = normalizeEmployerLabel(row.employer) || "Unspecified";
      if (isGenericEmployer(name) && !/^retired$/i.test(name)) continue;
      const amount = Number(row.total);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      out.push(enrichDonorSource({ name, amount: Math.round(amount) }));
    }
  }
  return out;
}

/**
 * OpenFEC often returns election_full:true rows with cycle:null first.
 * Number(null) === 0, so we must require a real even-year cycle (>= 2000).
 */
function pickCycle(profile = {}, totalsResults = []) {
  const years = (totalsResults || [])
    .map((row) => Number(row.cycle))
    .filter((n) => Number.isFinite(n) && n >= 2000)
    .sort((a, b) => b - a);
  if (years.length) return years[0];

  // Infer from coverage_end_date on election_full aggregates.
  const fromCoverage = (totalsResults || [])
    .map((row) => {
      const end = Date.parse(row.coverage_end_date || "");
      if (!Number.isFinite(end)) return null;
      const y = new Date(end).getUTCFullYear();
      return y % 2 === 0 ? y : y + 1;
    })
    .filter((n) => Number.isFinite(n) && n >= 2000)
    .sort((a, b) => b - a);
  if (fromCoverage.length) return fromCoverage[0];

  const now = new Date().getFullYear();
  return now % 2 === 0 ? now : now + 1;
}

function pickTotalsRow(totalsRows, cycle) {
  const withCycle = (totalsRows || []).filter(
    (row) => Number(row.cycle) === cycle
  );
  const prefer =
    withCycle.find((row) => row.election_full === false) ||
    withCycle[0] ||
    (totalsRows || []).find((row) => row.election_full === false) ||
    (totalsRows || [])[0];
  return prefer || null;
}

/**
 * Build campaign_finance upsert fields from OpenFEC.
 * @param {object} profile representative_profiles row
 */
async function buildFinanceFromFec(profile) {
  const candidateId = await resolveFecCandidateId(profile);
  if (!candidateId) return null;

  // Prefer election_full=false so cycle is populated (not null).
  let totalsPayload = await fecGet(
    `/candidate/${encodeURIComponent(candidateId)}/totals/`,
    { sort: "-cycle", per_page: 12, election_full: false }
  );
  let totalsRows = Array.isArray(totalsPayload?.results)
    ? totalsPayload.results
    : [];
  if (!totalsRows.length) {
    totalsPayload = await fecGet(
      `/candidate/${encodeURIComponent(candidateId)}/totals/`,
      { sort: "-cycle", per_page: 12 }
    );
    totalsRows = Array.isArray(totalsPayload?.results)
      ? totalsPayload.results
      : [];
  }
  if (!totalsRows.length) return null;

  const cycle = pickCycle(profile, totalsRows);
  const totals = pickTotalsRow(totalsRows, cycle);
  if (!totals) return null;
  const receipts = Number(totals.receipts) || 0;
  if (receipts <= 0) return null;

  const individual = Number(totals.individual_contributions) || 0;
  const unitemized = Number(totals.individual_unitemized_contributions) || 0;
  const itemized = Number(totals.individual_itemized_contributions) || 0;
  const pac = Number(totals.other_political_committee_contributions) || 0;
  const party = Number(totals.political_party_committee_contributions) || 0;
  const self = Number(totals.candidate_contribution) || 0;

  // Approximate donor mix from FEC buckets (unique per candidate).
  const smallDonorPct = clampPct((unitemized / receipts) * 100);
  const largeDonorPct = clampPct((itemized / receipts) * 100);
  const pacPct = clampPct(((pac + party) / receipts) * 100);
  const selfFundingPct = clampPct((self / receipts) * 100);

  let committeeId = null;
  try {
    committeeId = await resolvePrincipalCommitteeId(candidateId, cycle);
  } catch (error) {
    console.warn("OpenFEC committee lookup failed:", error.message || error);
  }

  let topIndustries = [];
  try {
    topIndustries = await fetchTopContributionSources(committeeId, cycle, 5);
  } catch (error) {
    console.warn("OpenFEC employer aggregate failed:", error.message || error);
  }

  const cycleLabel =
    cycle > 2000 ? `${cycle - 1}-${cycle}` : String(cycle || "FEC");

  return {
    fec_id: candidateId,
    finance: {
      small_donor_pct: smallDonorPct,
      large_donor_pct: largeDonorPct,
      pac_pct: pacPct,
      self_funding_pct: selfFundingPct,
      total_raised: Math.round(receipts * 100) / 100,
      top_industries: topIndustries,
      cycle: cycleLabel,
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * Sync FEC finance onto campaign_finance for one profile. Returns finance row or null.
 */
async function syncCampaignFinanceFromFec(supabase, profile) {
  if (!supabase || !profile?.id) return null;
  try {
    const built = await buildFinanceFromFec(profile);
    if (!built?.finance) return null;

    if (built.fec_id && !profile.fec_id) {
      await supabase
        .from("representative_profiles")
        .update({ fec_id: built.fec_id, updated_at: new Date().toISOString() })
        .eq("id", profile.id);
      profile.fec_id = built.fec_id;
    }

    const payload = {
      politician_id: profile.id,
      ...built.finance,
    };
    const { data, error } = await supabase
      .from("campaign_finance")
      .upsert(payload, { onConflict: "politician_id" })
      .select("*")
      .maybeSingle();
    if (error) {
      console.warn("campaign_finance FEC upsert failed:", error.message || error);
      return null;
    }
    return data || payload;
  } catch (error) {
    console.warn(
      "OpenFEC campaign finance sync skipped:",
      error.message || error
    );
    return null;
  }
}

module.exports = {
  buildFinanceFromFec,
  financeNeedsRefresh,
  isPlaceholderFinanceRow,
  pickCycle,
  pickTotalsRow,
  syncCampaignFinanceFromFec,
  resolveFecCandidateId,
};
