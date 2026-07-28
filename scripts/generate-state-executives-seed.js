/**
 * Generates supabase/seed-state-executives.sql from the curated Wikipedia
 * markdown snapshot + appointed-office supplements.
 *
 * Usage: node scripts/generate-state-executives-seed.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MD_PATH = path.join(ROOT, "data", "wikipedia-statewide-elected-officials.md");
const OUT_SQL = path.join(ROOT, "supabase", "seed-state-executives.sql");
const OUT_JSON = path.join(ROOT, "data", "state-executives.json");
const USER_AGENT =
  "CongressBillsDashboard/1.0 (jessica-local-seed; contact: github.com/jsschll/congress-bills-dashboard)";

const STATE_CODES = {
  Alabama: "AL",
  Alaska: "AK",
  Arizona: "AZ",
  Arkansas: "AR",
  California: "CA",
  Colorado: "CO",
  Connecticut: "CT",
  Delaware: "DE",
  Florida: "FL",
  Georgia: "GA",
  Hawaii: "HI",
  Idaho: "ID",
  Illinois: "IL",
  Indiana: "IN",
  Iowa: "IA",
  Kansas: "KS",
  Kentucky: "KY",
  Louisiana: "LA",
  Maine: "ME",
  Maryland: "MD",
  Massachusetts: "MA",
  Michigan: "MI",
  Minnesota: "MN",
  Mississippi: "MS",
  Missouri: "MO",
  Montana: "MT",
  Nebraska: "NE",
  Nevada: "NV",
  "New Hampshire": "NH",
  "New Jersey": "NJ",
  "New Mexico": "NM",
  "New York": "NY",
  "North Carolina": "NC",
  "North Dakota": "ND",
  Ohio: "OH",
  Oklahoma: "OK",
  Oregon: "OR",
  Pennsylvania: "PA",
  "Rhode Island": "RI",
  "South Carolina": "SC",
  "South Dakota": "SD",
  Tennessee: "TN",
  Texas: "TX",
  Utah: "UT",
  Vermont: "VT",
  Virginia: "VA",
  Washington: "WA",
  "West Virginia": "WV",
  Wisconsin: "WI",
  Wyoming: "WY",
};

const ROLE_ORDER = [
  "Governor",
  "Lieutenant Governor",
  "Attorney General",
  "Secretary of State",
  "Treasurer",
];

/**
 * Fill offices the elected-only Wikipedia list omits (appointed, or
 * differently titled). Mid-2026.
 */
const SUPPLEMENTS = [
  { state_code: "AK", title: "Attorney General", full_name: "Treg Taylor", party: "Republican", wiki_title: "Treg Taylor" },
  { state_code: "DE", title: "Secretary of State", full_name: "Jeffrey Bullock", party: "Democratic", wiki_title: "Jeffrey W. Bullock" },
  { state_code: "FL", title: "Secretary of State", full_name: "Cord Byrd", party: "Republican", wiki_title: "Cord Byrd" },
  { state_code: "GA", title: "Treasurer", full_name: "Steve McCoy", party: "Nonpartisan", wiki_title: "Steve McCoy" },
  { state_code: "HI", title: "Attorney General", full_name: "Anne Lopez", party: "Democratic", wiki_title: "Anne E. Lopez" },
  { state_code: "MD", title: "Secretary of State", full_name: "Susan Lee", party: "Democratic", wiki_title: "Susan C. Lee" },
  { state_code: "MD", title: "Treasurer", full_name: "Dereck Davis", party: "Democratic", wiki_title: "Dereck E. Davis" },
  { state_code: "ME", title: "Secretary of State", full_name: "Shenna Bellows", party: "Democratic", wiki_title: "Shenna Bellows" },
  { state_code: "ME", title: "Attorney General", full_name: "Aaron Frey", party: "Democratic", wiki_title: "Aaron Frey" },
  { state_code: "ME", title: "Treasurer", full_name: "Henry Beck", party: "Democratic", wiki_title: "Henry Beck (politician)" },
  { state_code: "MI", title: "Treasurer", full_name: "Rachael Eubanks", party: "Democratic", wiki_title: "Rachael Eubanks" },
  { state_code: "MN", title: "State Auditor", full_name: "Julie Blaha", party: "Democratic", wiki_title: "Julie Blaha", role: "Treasurer" },
  { state_code: "MT", title: "Treasurer", full_name: "Brendan Beatty", party: "Republican", wiki_title: "Brendan Beatty" },
  { state_code: "NH", title: "Secretary of State", full_name: "David Scanlan", party: "Republican", wiki_title: "David Scanlan" },
  { state_code: "NH", title: "Attorney General", full_name: "John Formella", party: "Republican", wiki_title: "John Formella" },
  { state_code: "NH", title: "Treasurer", full_name: "Monica Mezzapelle", party: "Democratic", wiki_title: "Monica Mezzapelle" },
  { state_code: "NJ", title: "Attorney General", full_name: "Matthew Platkin", party: "Democratic", wiki_title: "Matthew Platkin" },
  { state_code: "NJ", title: "Secretary of State", full_name: "Tahesha Way", party: "Democratic", wiki_title: "Tahesha Way" },
  { state_code: "NJ", title: "Treasurer", full_name: "Elizabeth Maher Muoio", party: "Democratic", wiki_title: "Elizabeth Maher Muoio" },
  { state_code: "NY", title: "Secretary of State", full_name: "Walter Mosley", party: "Democratic", wiki_title: "Walter T. Mosley" },
  { state_code: "NY", title: "State Comptroller", full_name: "Thomas DiNapoli", party: "Democratic", wiki_title: "Thomas DiNapoli", role: "Treasurer" },
  { state_code: "OK", title: "Secretary of State", full_name: "Josh Cockroft", party: "Republican", wiki_title: "Josh Cockroft" },
  { state_code: "PA", title: "Secretary of State", full_name: "Al Schmidt", party: "Democratic", wiki_title: "Al Schmidt" },
  { state_code: "RI", title: "Treasurer", full_name: "James Diossa", party: "Democratic", wiki_title: "James Diossa" },
  { state_code: "TN", title: "Lieutenant Governor", full_name: "Randy McNally", party: "Republican", wiki_title: "Randy McNally" },
  { state_code: "TN", title: "Attorney General", full_name: "Jonathan Skrmetti", party: "Republican", wiki_title: "Jonathan Skrmetti" },
  { state_code: "TN", title: "Secretary of State", full_name: "Tre Hargett", party: "Republican", wiki_title: "Tre Hargett" },
  { state_code: "TN", title: "Treasurer", full_name: "David Lillard", party: "Republican", wiki_title: "David Lillard Jr." },
  { state_code: "TX", title: "Secretary of State", full_name: "Jane Nelson", party: "Republican", wiki_title: "Jane Nelson" },
  { state_code: "TX", title: "Comptroller of Public Accounts", full_name: "Kelly Hancock", party: "Republican", wiki_title: "Kelly Hancock", role: "Treasurer" },
  { state_code: "VA", title: "Secretary of State", full_name: "Kelly Gee", party: "Democratic", wiki_title: "Kelly Gee" },
  { state_code: "VA", title: "Treasurer", full_name: "David Richardson", party: "Democratic", wiki_title: "David L. Richardson" },
  { state_code: "WV", title: "Lieutenant Governor", full_name: "Randy Smith", party: "Republican", wiki_title: "Randy Smith (politician)" },
  { state_code: "WY", title: "Attorney General", full_name: "Bridget Hill", party: "Republican", wiki_title: "Bridget Hill" },
];

function sqlString(value) {
  if (value == null || value === "") return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function normalizeParty(raw) {
  const value = String(raw || "")
    .replace(/–/g, "-")
    .trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (
    lower.includes("democratic") ||
    lower.includes("farmer-labor") ||
    lower === "dfl"
  ) {
    return "Democratic";
  }
  if (lower.startsWith("rep")) return "Republican";
  if (lower.includes("independent")) return "Independent";
  if (lower.includes("libertarian")) return "Libertarian";
  if (lower.includes("progressive")) return "Progressive";
  return value;
}

function cleanName(raw) {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/\bOn leave\b/gi, "")
    .replace(/\bActing\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOffice(officeRaw) {
  const office = String(officeRaw || "").trim();
  const lower = office.toLowerCase();

  if (lower === "governor") return { title: "Governor", role: "Governor" };
  if (lower.includes("lieutenant governor")) {
    return { title: "Lieutenant Governor", role: "Lieutenant Governor" };
  }
  if (lower.includes("attorney general")) {
    return { title: "Attorney General", role: "Attorney General" };
  }
  if (
    lower.includes("secretary of state") ||
    lower.includes("secretary of the commonwealth")
  ) {
    return { title: "Secretary of State", role: "Secretary of State" };
  }
  if (
    lower === "treasurer" ||
    lower.startsWith("state treasurer") ||
    lower.includes("treasurer and receiver") ||
    lower.includes("general treasurer")
  ) {
    return { title: "Treasurer", role: "Treasurer" };
  }
  if (lower.includes("chief financial officer")) {
    return { title: "Chief Financial Officer", role: "Treasurer" };
  }
  if (lower.includes("comptroller of public accounts")) {
    return { title: "Comptroller of Public Accounts", role: "Treasurer" };
  }
  if (lower === "state comptroller" || lower === "comptroller") {
    return { title: "Comptroller", role: "Treasurer" };
  }
  return null;
}

function parseMarkdown(markdown) {
  const byState = new Map();
  const parts = markdown.split(/\n## /);

  for (const part of parts) {
    const lines = part.split("\n");
    const stateName = lines[0].trim();
    if (!STATE_CODES[stateName]) continue;
    const stateCode = STATE_CODES[stateName];
    const roles = new Map();

    for (const line of lines) {
      if (!line.startsWith("| ")) continue;
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c.length > 0);
      if (cells.length < 2) continue;
      if (/^office$/i.test(cells[0])) continue;

      const mapped = normalizeOffice(cells[0]);
      if (!mapped) continue;
      const fullName = cleanName(cells[1]);
      if (!fullName || /^name$/i.test(fullName)) continue;

      let party = "";
      for (const cell of cells.slice(2)) {
        if (
          /Republican|Democratic|Independent|Libertarian|Farmer|Progressive/i.test(
            cell
          )
        ) {
          party = normalizeParty(cell);
          break;
        }
      }

      if (!roles.has(mapped.role)) {
        roles.set(mapped.role, {
          state_code: stateCode,
          state_name: stateName,
          title: mapped.title,
          role: mapped.role,
          full_name: fullName,
          party,
          wiki_title: fullName,
          court_or_agency: "Executive Branch",
          level: "Statewide",
        });
      }
    }

    byState.set(stateCode, {
      state_code: stateCode,
      state_name: stateName,
      roles,
    });
  }
  return byState;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      "Api-User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  }
  return res.json();
}

async function fetchWikiThumb(title) {
  if (!title) return "";
  const summaryUrl =
    "https://en.wikipedia.org/api/rest_v1/page/summary/" +
    encodeURIComponent(title.replace(/ /g, "_"));
  try {
    const data = await fetchJson(summaryUrl);
    if (data?.thumbnail?.source) return data.thumbnail.source;
    if (data?.originalimage?.source) return data.originalimage.source;
  } catch {
    // fall through
  }
  return "";
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    throw new Error(
      `Missing ${MD_PATH}. Save Wikipedia list markdown there first.`
    );
  }

  const byState = parseMarkdown(fs.readFileSync(MD_PATH, "utf8"));
  console.log(`Parsed ${byState.size} states from markdown`);

  for (const row of SUPPLEMENTS) {
    const stateName =
      Object.keys(STATE_CODES).find((k) => STATE_CODES[k] === row.state_code) ||
      row.state_code;
    if (!byState.has(row.state_code)) {
      byState.set(row.state_code, {
        state_code: row.state_code,
        state_name: stateName,
        roles: new Map(),
      });
    }
    const roles = byState.get(row.state_code).roles;
    const roleKey =
      row.role ||
      (ROLE_ORDER.includes(row.title)
        ? row.title
        : row.title.includes("Secretary")
          ? "Secretary of State"
          : row.title.includes("Comptroller") || row.title.includes("Auditor")
            ? "Treasurer"
            : row.title);
    if (!roles.has(roleKey)) {
      roles.set(roleKey, {
        state_code: row.state_code,
        state_name: stateName,
        title: row.title,
        role: roleKey,
        full_name: row.full_name,
        party: normalizeParty(row.party),
        wiki_title: row.wiki_title || row.full_name,
        court_or_agency: "Executive Branch",
        level: "Statewide",
      });
    }
  }

  const officials = [];
  for (const code of Object.values(STATE_CODES).sort()) {
    const entry = byState.get(code);
    if (!entry) {
      console.warn("Missing state:", code);
      continue;
    }
    for (const role of ROLE_ORDER) {
      const person = entry.roles.get(role);
      if (person) officials.push(person);
    }
  }

  console.log(`Fetching photos for ${officials.length} officials (slow; rate-limited)…`);
  for (let i = 0; i < officials.length; i++) {
    const person = officials[i];
    let photo = await fetchWikiThumb(person.wiki_title);
    if (!photo && person.wiki_title !== person.full_name) {
      await sleep(200);
      photo = await fetchWikiThumb(person.full_name);
    }
    person.photo_url = photo;
    if ((i + 1) % 20 === 0 || i === officials.length - 1) {
      const withPhoto = officials.filter((o) => o.photo_url).length;
      console.log(
        `  ${i + 1}/${officials.length} (photos so far: ${withPhoto})`
      );
    }
    await sleep(250);
  }

  console.log("\nCoverage by role:");
  for (const role of ROLE_ORDER) {
    console.log(
      `  ${role}: ${officials.filter((o) => o.role === role).length}/50`
    );
  }
  console.log(
    `Photos: ${officials.filter((o) => o.photo_url).length}/${officials.length}`
  );

  const missing = [];
  for (const [name, code] of Object.entries(STATE_CODES)) {
    const entry = byState.get(code);
    for (const role of ROLE_ORDER) {
      if (!entry?.roles?.has(role)) missing.push(`${code} (${name}) ${role}`);
    }
  }
  if (missing.length) {
    console.log(`\nStill missing (${missing.length}):`);
    missing.forEach((m) => console.log("  -", m));
  }

  // Sanity: no garbage names
  const bad = officials.filter(
    (o) =>
      !o.full_name ||
      o.full_name.length < 3 ||
      /dab=|background-color|style=/i.test(o.full_name)
  );
  if (bad.length) {
    console.error("Bad rows:", bad);
    throw new Error("Aborting: bad parsed names");
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(officials, null, 2), "utf8");

  const values = officials
    .map(
      (o) =>
        `  (${sqlString(o.full_name)}, ${sqlString(o.title)}, ${sqlString(
          "Executive Branch"
        )}, 'Statewide', ${sqlString(o.state_code)}, NULL, NULL, ${sqlString(
          o.party
        )}, ${sqlString(o.photo_url)})`
    )
    .join(",\n");

  const sql = `-- seed-state-executives.sql
-- Paste into Supabase SQL Editor and Run.
-- Seeds Governor, Lieutenant Governor, Attorney General, Secretary of State,
-- and Treasurer (or treasury equivalent) for all 50 states under
-- court_or_agency = 'Executive Branch'.
--
-- Includes title, name, party, photo_url.
-- Safe to re-run.

alter table public.state_officials
  add column if not exists party text;

alter table public.state_officials
  add column if not exists photo_url text;

delete from public.state_officials
where court_or_agency = 'Executive Branch'
   or (
     level = 'Statewide'
     and lower(coalesce(title, '')) in (
       'governor',
       'lieutenant governor',
       'attorney general',
       'secretary of state',
       'treasurer',
       'chief financial officer',
       'comptroller of public accounts',
       'comptroller'
     )
     and (
       court_or_agency is null
       or court_or_agency ilike 'Office of the %'
       or court_or_agency = 'Executive Branch'
     )
   );

insert into public.state_officials (
  full_name,
  title,
  court_or_agency,
  level,
  state_code,
  district_number,
  county_name,
  party,
  photo_url
)
values
${values};

-- Confirm:
-- select count(*) from state_officials where court_or_agency = 'Executive Branch';
-- select state_code, title, full_name, party, (photo_url is not null) as has_photo
-- from state_officials
-- where court_or_agency = 'Executive Branch'
-- order by state_code, title;
`;

  fs.writeFileSync(OUT_SQL, sql, "utf8");
  console.log("\nWrote", OUT_SQL);
  console.log("Wrote", OUT_JSON);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
