#!/usr/bin/env node
/**
 * Report which counties in a state have mapping but lack local judge rows.
 *
 * Usage:
 *   node scripts/coverage-report.js TX
 */

const { requireSupabase } = require("./lib/supabase");
const { normalizeCountyName } = require("./lib/csv");

async function fetchAll(supabase, table, columns, filters = {}) {
  const pageSize = 1000;
  let from = 0;
  const rows = [];

  for (;;) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
    for (const [key, value] of Object.entries(filters)) {
      query = query.eq(key, value);
    }
    const { data, error } = await query;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function main() {
  const stateCode = String(process.argv[2] || "TX").toUpperCase();
  const supabase = requireSupabase();

  const mappings = await fetchAll(
    supabase,
    "county_district_mapping",
    "county_name, appellate_district_numbers, judicial_district_numbers",
    { state_code: stateCode }
  );

  const officials = await fetchAll(
    supabase,
    "state_officials",
    "full_name, level, district_number, county_name",
    { state_code: stateCode }
  );

  const byLevel = {};
  for (const row of officials) {
    byLevel[row.level] = (byLevel[row.level] || 0) + 1;
  }

  const districtByCounty = new Map();
  const countyMagByCounty = new Map();

  for (const row of officials) {
    const county = normalizeCountyName(row.county_name);
    if (!county) continue;
    if (row.level === "District") {
      districtByCounty.set(county, (districtByCounty.get(county) || 0) + 1);
    }
    if (row.level === "County/Magistrate" || row.level === "County") {
      countyMagByCounty.set(
        county,
        (countyMagByCounty.get(county) || 0) + 1
      );
    }
  }

  const missingDistrict = [];
  const missingCountyMag = [];
  const complete = [];

  for (const map of mappings) {
    const county = normalizeCountyName(map.county_name);
    const d = districtByCounty.get(county) || 0;
    const c = countyMagByCounty.get(county) || 0;
    if (d === 0) missingDistrict.push(county);
    if (c === 0) missingCountyMag.push(county);
    if (d > 0 && c > 0) complete.push(county);
  }

  console.log(`\nCoverage report for ${stateCode}`);
  console.log("================================");
  console.log(`Mapped counties:          ${mappings.length}`);
  console.log(`Officials total:          ${officials.length}`);
  for (const [level, count] of Object.entries(byLevel).sort()) {
    console.log(`  ${level}: ${count}`);
  }
  console.log(`Counties with District + County/Magistrate: ${complete.length}`);
  console.log(`Mapped counties missing District rows: ${missingDistrict.length}`);
  if (missingDistrict.length) {
    console.log("  ", missingDistrict.sort().join(", "));
  }
  console.log(
    `Mapped counties missing County/Magistrate rows: ${missingCountyMag.length}`
  );
  if (missingCountyMag.length) {
    console.log("  ", missingCountyMag.sort().join(", "));
  }

  if (!mappings.length) {
    console.log(
      `\nNo county_district_mapping rows for ${stateCode}. Import a mapping CSV first.`
    );
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
