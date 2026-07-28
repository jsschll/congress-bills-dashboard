/**
 * Build top-100 U.S. city targets and current-mayor seed outputs.
 *
 * Usage:
 *   node scripts/generate-local-mayors-seed.js
 *
 * Outputs:
 *   data/us-top-cities-top100.json
 *   data/local-mayors-top100.json
 *   data/local-mayors-top100-coverage.md
 *   supabase/seed-local-mayors-top100.sql
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const SOURCE_DIR = path.join(DATA_DIR, "sources");
const SUPABASE_DIR = path.join(ROOT, "supabase");
const OUT_CITIES = path.join(DATA_DIR, "us-top-cities-top100.json");
const OUT_MAYORS = path.join(DATA_DIR, "local-mayors-top100.json");
const OUT_COVERAGE = path.join(DATA_DIR, "local-mayors-top100-coverage.md");
const OUT_SQL = path.join(SUPABASE_DIR, "seed-local-mayors-top100.sql");
const CITY_SOURCE_FILE = path.join(SOURCE_DIR, "us-top-cities-top100-2025.txt");
const MAYOR_SOURCE_FILE = path.join(SOURCE_DIR, "us-top100-mayors-2028.txt");

const CITY_RANKING_URL = "https://www.everycityintheusa.com/cities/by-population/";
const MAYOR_SOURCE_URL = "https://ballotpedia.org/United_States_mayoral_elections,_2028";

const STATE_TO_CODE = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN",
  Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};

function sqlString(value) {
  if (value == null || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function toInt(value) {
  const digits = String(value || "").replace(/[^\d-]/g, "");
  if (!digits) return null;
  const num = Number(digits);
  return Number.isFinite(num) ? num : null;
}

function normalizeCityName(city) {
  return String(city || "")
    .replace(/\s+/g, " ")
    .replace(/\s+\[.*?\]/g, "")
    .replace(/\(Nonpartisan\)/gi, "")
    .replace(/\(Unknown\)/gi, "")
    .trim();
}

function canonicalCityName(city, stateCode = "") {
  const value = normalizeCityName(city);
  const key = `${value}|${String(stateCode || "").toUpperCase()}`;
  const aliases = {
    "Washington|DC": "Washington, D.C.",
    "Washington, D.C.|DC": "Washington, D.C.",
    "Lexington-Fayette urban county|KY": "Lexington",
    "Boise City|ID": "Boise",
  };
  return aliases[key] || value;
}

function stripFootnotes(value) {
  return String(value || "")
    .replace(/\s*\[[^\]]+\]/g, "")
    .replace(/\(Unknown\)/gi, "")
    .replace(/\(Nonpartisan\)/gi, "")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "CongressBillsDashboard/1.0 (local mayor seed generator; github.com/jsschll/congress-bills-dashboard)",
      Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

async function loadSource(preferredFile, fallbackUrl) {
  if (fs.existsSync(preferredFile)) {
    return fs.readFileSync(preferredFile, "utf8");
  }
  return fetchText(fallbackUrl);
}

function parseTopCities(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const cities = [];
  for (const line of lines) {
    const match = line.match(/^\|\s*#?(\d+)\s*\|\s*(.+?)\s*\|\s*([A-Z]{2})\s*\|\s*([\d,]+)\s*\|/);
    if (!match) continue;
    const rank = Number(match[1]);
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;
    cities.push({
      rank,
      city_name: canonicalCityName(match[2], match[3]),
      state_code: match[3],
      population_2025: toInt(match[4]),
      source_name: "Every City in the USA / U.S. Census Vintage 2025",
      source_ref: CITY_RANKING_URL,
    });
  }
  return cities.sort((a, b) => a.rank - b.rank);
}

function parseBallotpediaMayors(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const mayors = [];
  for (const line of lines) {
    const match = line.match(
      /^\|\s*(\d+)\s*\|\s*(.+?),\s*([A-Za-z.\- '\u2019]+)\s*\|\s*[\d,]+\s*\|\s*(.+?)\s*\|\s*(\d{4})\s*\|\s*(\d{4})\s*\|\s*(.+?)\s*\|/
    );
    if (!match) continue;
    const rank = Number(match[1]);
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) continue;
    const stateName = stripFootnotes(match[3]);
    const stateCode = STATE_TO_CODE[stateName];
    if (!stateCode) continue;
    mayors.push({
      rank,
      city_name: canonicalCityName(match[2], stateCode),
      state_code: stateCode,
      full_name: stripFootnotes(match[4]),
      title: "Mayor",
      took_office_year: toInt(match[5]),
      term_ends_year: toInt(match[6]),
      government_type: stripFootnotes(match[7]),
      selection_method: "elected",
      source_name: "Ballotpedia",
      source_ref: MAYOR_SOURCE_URL,
      coverage_status: "confirmed",
      level: "City",
      website_url: "",
      photo_url: "",
      party: "",
      appointed_by: null,
      county_name: "",
    });
  }
  return mayors.sort((a, b) => a.rank - b.rank);
}

function mergeCitiesAndMayors(cities, mayors) {
  const mayorByKey = new Map(
    mayors.map((row) => [`${row.city_name}|${row.state_code}`, row])
  );
  const merged = [];
  const missing = [];
  for (const city of cities) {
    const key = `${city.city_name}|${city.state_code}`;
    const mayor = mayorByKey.get(key);
    if (mayor) {
      merged.push({
        ...mayor,
        population_rank: city.rank,
        population_2025: city.population_2025,
      });
    } else {
      missing.push(city);
    }
  }
  return { merged, missing };
}

const MANUAL_MAYOR_OVERRIDES = [
  {
    city_name: "Washington, D.C.",
    state_code: "DC",
    full_name: "Muriel Bowser",
    took_office_year: 2015,
    term_ends_year: 2027,
    government_type: "Strong mayor",
    website_url: "https://mayor.dc.gov/",
    source_name: "DC Mayor official site",
    source_ref: "https://mayor.dc.gov/biography/muriel-bowser",
  },
  {
    city_name: "Lexington",
    state_code: "KY",
    full_name: "Linda Gorton",
    took_office_year: 2019,
    term_ends_year: 2027,
    government_type: "Strong mayor",
    website_url: "https://www.lexingtonky.gov/government/mayors-office/about-mayor-linda-gorton",
    source_name: "City of Lexington",
    source_ref: "https://www.lexingtonky.gov/government/mayors-office/about-mayor-linda-gorton",
  },
  {
    city_name: "Port St. Lucie",
    state_code: "FL",
    full_name: "Shannon Martin",
    took_office_year: 2021,
    term_ends_year: 2026,
    government_type: "Council-manager",
    website_url: "https://www.cityofpsl.com/Government/Your-City-Government/Mayor-City-Council/Mayor-Shannon-Martin",
    source_name: "City of Port St. Lucie",
    source_ref: "https://www.cityofpsl.com/Government/Your-City-Government/Mayor-City-Council/Mayor-Shannon-Martin",
  },
  {
    city_name: "Boise",
    state_code: "ID",
    full_name: "Lauren McLean",
    took_office_year: 2020,
    term_ends_year: 2028,
    government_type: "Strong mayor",
    website_url: "https://www.cityofboise.org/departments/mayor",
    source_name: "City of Boise",
    source_ref: "https://www.cityofboise.org/departments/mayor",
  },
  {
    city_name: "Frisco",
    state_code: "TX",
    full_name: "Mark Hill",
    took_office_year: 2026,
    term_ends_year: 2029,
    government_type: "Council-manager",
    website_url: "https://www.friscotexas.gov/2054/Mayor-Mark-Hill",
    source_name: "City of Frisco",
    source_ref: "https://www.friscotexas.gov/2054/Mayor-Mark-Hill",
  },
  {
    city_name: "Cape Coral",
    state_code: "FL",
    full_name: "John Gunter",
    took_office_year: 2022,
    term_ends_year: 2026,
    government_type: "Council-manager",
    website_url: "https://www.capecoral.gov/government/city_council/mayor/index.php",
    source_name: "City of Cape Coral",
    source_ref: "https://www.capecoral.gov/government/city_council/mayor/index.php",
  },
  {
    city_name: "McKinney",
    state_code: "TX",
    full_name: "Bill Cox",
    took_office_year: 2025,
    term_ends_year: 2029,
    government_type: "Council-manager",
    website_url: "https://www.mckinneytexas.org/1167/Council-Members",
    source_name: "City of McKinney",
    source_ref: "https://www.mckinneytexas.org/1167/Council-Members",
  },
  {
    city_name: "Huntsville",
    state_code: "AL",
    full_name: "Tommy Battle",
    took_office_year: 2008,
    term_ends_year: 2028,
    government_type: "Strong mayor",
    website_url: "https://www.huntsvilleal.gov/government/mayors-office/",
    source_name: "City of Huntsville",
    source_ref: "https://www.huntsvilleal.gov/government/voting-elections/elected-officials/",
  },
];

function applyManualOverrides(cities, mayors) {
  const byKey = new Map(
    mayors.map((row) => [`${row.city_name}|${row.state_code}`, row])
  );
  for (const city of cities) {
    const key = `${city.city_name}|${city.state_code}`;
    if (byKey.has(key)) continue;
    const override = MANUAL_MAYOR_OVERRIDES.find(
      (row) => row.city_name === city.city_name && row.state_code === city.state_code
    );
    if (!override) continue;
    byKey.set(key, {
      rank: city.rank,
      city_name: city.city_name,
      state_code: city.state_code,
      full_name: override.full_name,
      title: "Mayor",
      took_office_year: override.took_office_year,
      term_ends_year: override.term_ends_year,
      government_type: override.government_type,
      selection_method: "elected",
      source_name: override.source_name,
      source_ref: override.source_ref,
      coverage_status: "confirmed",
      level: "City",
      website_url: override.website_url,
      photo_url: "",
      party: "",
      appointed_by: null,
      county_name: "",
    });
  }
  return [...byKey.values()].sort((a, b) => a.rank - b.rank);
}

function makeCoverageMarkdown(cities, mayors, missing) {
  const lines = [
    "# Local mayors coverage",
    "",
    `Source city ranking: ${CITY_RANKING_URL}`,
    `Source mayors: ${MAYOR_SOURCE_URL}`,
    "",
    `- Target cities: ${cities.length}`,
    `- Confirmed mayors: ${mayors.length}`,
    `- Missing/needs manual review: ${missing.length}`,
    "",
    "## Missing cities",
    "",
  ];
  if (!missing.length) {
    lines.push("None.");
    return `${lines.join("\n")}\n`;
  }
  for (const city of missing) {
    lines.push(`- #${city.rank} ${city.city_name}, ${city.state_code}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function makeSeedSql(rows) {
  const values = rows
    .map(
      (row) =>
        `  (${sqlString(row.full_name)}, ${sqlString(row.title)}, 'City', ${sqlString(
          row.state_code
        )}, ${sqlString(row.city_name)}, ${sqlString(row.county_name)}, ${sqlString(
          row.party
        )}, ${sqlString(row.photo_url)}, ${sqlString(row.website_url)}, ${sqlString(
          row.selection_method
        )}, ${sqlString(row.appointed_by)}, ${sqlString(row.source_name)}, ${sqlString(
          row.source_ref
        )}, ${sqlString(row.government_type)}, ${row.took_office_year ?? "NULL"}, ${
          row.term_ends_year ?? "NULL"
        }, ${sqlString(row.coverage_status)})`
    )
    .join(",\n");

  return `-- seed-local-mayors-top100.sql
-- Run after supabase/migration-local-officials.sql
-- Safe to re-run for these cities.

delete from public.local_officials
where level = 'City'
  and title = 'Mayor'
  and (state_code, city_name) in (
${rows
  .map((row) => `    (${sqlString(row.state_code)}, ${sqlString(row.city_name)})`)
  .join(",\n")}
  );

insert into public.local_officials (
  full_name,
  title,
  level,
  state_code,
  city_name,
  county_name,
  party,
  photo_url,
  website_url,
  selection_method,
  appointed_by,
  source_name,
  source_ref,
  government_type,
  took_office_year,
  term_ends_year,
  coverage_status
)
values
${values};

-- Confirm:
-- select count(*) from public.local_officials where title = 'Mayor';
`;
}

async function main() {
  const [citiesText, mayorsText] = await Promise.all([
    loadSource(CITY_SOURCE_FILE, CITY_RANKING_URL),
    loadSource(MAYOR_SOURCE_FILE, MAYOR_SOURCE_URL),
  ]);

  const cities = parseTopCities(citiesText);
  const mayors = applyManualOverrides(cities, parseBallotpediaMayors(mayorsText));
  const { merged, missing } = mergeCitiesAndMayors(cities, mayors);

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  fs.mkdirSync(SUPABASE_DIR, { recursive: true });

  fs.writeFileSync(OUT_CITIES, JSON.stringify(cities, null, 2) + "\n");
  fs.writeFileSync(OUT_MAYORS, JSON.stringify(merged, null, 2) + "\n");
  fs.writeFileSync(OUT_COVERAGE, makeCoverageMarkdown(cities, merged, missing));
  fs.writeFileSync(OUT_SQL, makeSeedSql(merged));

  console.log(`Wrote ${path.relative(ROOT, OUT_CITIES)}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_MAYORS)}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_COVERAGE)}`);
  console.log(`Wrote ${path.relative(ROOT, OUT_SQL)}`);
  console.log(`Target cities: ${cities.length}`);
  console.log(`Confirmed mayors: ${merged.length}`);
  console.log(`Missing mayors: ${missing.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
