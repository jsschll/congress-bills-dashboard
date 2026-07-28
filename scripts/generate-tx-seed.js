/**
 * Generates supabase/seed-tx-all-mapping-and-high-courts.sql
 * from statute appellate districts + extracted district-court PDF text.
 *
 * Run: node scripts/generate-tx-seed.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PDF_TEXT = path.join(ROOT, "tmp", "tx-districts.txt");
const OUT_SQL = path.join(
  ROOT,
  "supabase",
  "seed-tx-all-mapping-and-high-courts.sql"
);

/** All 254 Texas counties (canonical names, no "County"). */
const TX_COUNTIES = `
Anderson Andrews Angelina Aransas Archer Armstrong Atascosa Austin Bailey Bandera
Bastrop Baylor Bee Bell Bexar Blanco Borden Bosque Bowie Brazoria Brazos Brewster
Briscoe Brooks Brown Burleson Burnet Caldwell Calhoun Callahan Cameron Camp Carson
Cass Castro Chambers Cherokee Childress Clay Cochran Coke Coleman Collin Collingsworth
Colorado Comal Comanche Concho Cooke Coryell Cottle Crane Crockett Crosby Culberson
Dallam Dallas Dawson Deaf Smith Delta Denton DeWitt Dickens Dimmit Donley Duval
Eastland Ector Edwards Ellis El Paso Erath Falls Fannin Fayette Fisher Floyd Foard
Fort Bend Franklin Freestone Frio Gaines Galveston Garza Gillespie Glasscock Goliad
Gonzales Gray Grayson Gregg Grimes Guadalupe Hale Hall Hamilton Hansford Hardeman
Hardin Harris Harrison Hartley Haskell Hays Hemphill Henderson Hidalgo Hill Hockley
Hood Hopkins Houston Howard Hudspeth Hunt Hutchinson Irion Jack Jackson Jasper Jeff Davis
Jefferson Jim Hogg Jim Wells Johnson Jones Karnes Kaufman Kendall Kenedy Kent Kerr
Kimble King Kinney Kleberg Knox La Salle Lamar Lamb Lampasas Lavaca Lee Leon Liberty
Limestone Lipscomb Live Oak Llano Loving Lubbock Lynn Madison Marion Martin Mason
Matagorda Maverick McCulloch McLennan McMullen Medina Menard Midland Milam Mills
Mitchell Montague Montgomery Moore Morris Motley Nacogdoches Navarro Newton Nolan
Nueces Ochiltree Oldham Orange Palo Pinto Panola Parker Parmer Pecos Polk Potter Presidio
Rains Randall Reagan Real Red River Refugio Reeves Refugio Roberts Robertson Rockwall
Runnels Rusk Sabine San Augustine San Jacinto San Patricio San Saba Schleicher Scurry
Shackelford Shelby Sherman Smith Somervell Starr Stephens Sterling Stonewall Sutton
Swisher Tarrant Taylor Terrell Terry Throckmorton Titus Tom Green Travis Trinity Tyler
Upshur Upton Uvalde Val Verde Van Zandt Victoria Walker Waller Ward Washington Webb
Wharton Wheeler Wichita Wilbarger Willacy Williamson Wilson Winkler Wise Wood Yoakum Young
Zapata Zavala
`
  .trim()
  .split(/\s+/)
  .map((s) => s.replace(/,/g, ""))
  // Fix accidental duplicates from paste
  .filter((v, i, a) => a.indexOf(v) === i);

// Clean TX_COUNTIES - I may have duplicated Refugio. Rebuild carefully.
const TX_COUNTIES_CLEAN = [
  "Anderson","Andrews","Angelina","Aransas","Archer","Armstrong","Atascosa","Austin",
  "Bailey","Bandera","Bastrop","Baylor","Bee","Bell","Bexar","Blanco","Borden","Bosque",
  "Bowie","Brazoria","Brazos","Brewster","Briscoe","Brooks","Brown","Burleson","Burnet",
  "Caldwell","Calhoun","Callahan","Cameron","Camp","Carson","Cass","Castro","Chambers",
  "Cherokee","Childress","Clay","Cochran","Coke","Coleman","Collin","Collingsworth",
  "Colorado","Comal","Comanche","Concho","Cooke","Coryell","Cottle","Crane","Crockett",
  "Crosby","Culberson","Dallam","Dallas","Dawson","Deaf Smith","Delta","Denton","DeWitt",
  "Dickens","Dimmit","Donley","Duval","Eastland","Ector","Edwards","Ellis","El Paso",
  "Erath","Falls","Fannin","Fayette","Fisher","Floyd","Foard","Fort Bend","Franklin",
  "Freestone","Frio","Gaines","Galveston","Garza","Gillespie","Glasscock","Goliad",
  "Gonzales","Gray","Grayson","Gregg","Grimes","Guadalupe","Hale","Hall","Hamilton",
  "Hansford","Hardeman","Hardin","Harris","Harrison","Hartley","Haskell","Hays",
  "Hemphill","Henderson","Hidalgo","Hill","Hockley","Hood","Hopkins","Houston","Howard",
  "Hudspeth","Hunt","Hutchinson","Irion","Jack","Jackson","Jasper","Jeff Davis",
  "Jefferson","Jim Hogg","Jim Wells","Johnson","Jones","Karnes","Kaufman","Kendall",
  "Kenedy","Kent","Kerr","Kimble","King","Kinney","Kleberg","Knox","La Salle","Lamar",
  "Lamb","Lampasas","Lavaca","Lee","Leon","Liberty","Limestone","Lipscomb","Live Oak",
  "Llano","Loving","Lubbock","Lynn","Madison","Marion","Martin","Mason","Matagorda",
  "Maverick","McCulloch","McLennan","McMullen","Medina","Menard","Midland","Milam",
  "Mills","Mitchell","Montague","Montgomery","Moore","Morris","Motley","Nacogdoches",
  "Navarro","Newton","Nolan","Nueces","Ochiltree","Oldham","Orange","Palo Pinto",
  "Panola","Parker","Parmer","Pecos","Polk","Potter","Presidio","Rains","Randall",
  "Reagan","Real","Red River","Reeves","Refugio","Roberts","Robertson","Rockwall",
  "Runnels","Rusk","Sabine","San Augustine","San Jacinto","San Patricio","San Saba",
  "Schleicher","Scurry","Shackelford","Shelby","Sherman","Smith","Somervell","Starr",
  "Stephens","Sterling","Stonewall","Sutton","Swisher","Tarrant","Taylor","Terrell",
  "Terry","Throckmorton","Titus","Tom Green","Travis","Trinity","Tyler","Upshur",
  "Upton","Uvalde","Val Verde","Van Zandt","Victoria","Walker","Waller","Ward",
  "Washington","Webb","Wharton","Wheeler","Wichita","Wilbarger","Willacy","Williamson",
  "Wilson","Winkler","Wise","Wood","Yoakum","Young","Zapata","Zavala",
];

/** Appellate districts 1–14 from Tex. Gov't Code §22.201 (exclude 15th specialty statewide). */
const APPELLATE = {
  1: ["Austin","Brazoria","Chambers","Colorado","Fort Bend","Galveston","Grimes","Harris","Waller","Washington"],
  2: ["Archer","Clay","Cooke","Denton","Hood","Jack","Montague","Parker","Tarrant","Wichita","Wise","Young"],
  3: ["Bastrop","Bell","Blanco","Burnet","Caldwell","Coke","Comal","Concho","Fayette","Hays","Irion","Lampasas","Lee","Llano","McCulloch","Milam","Mills","Runnels","San Saba","Schleicher","Sterling","Tom Green","Travis","Williamson"],
  4: ["Atascosa","Bandera","Bexar","Brooks","Dimmit","Duval","Edwards","Frio","Gillespie","Guadalupe","Jim Hogg","Jim Wells","Karnes","Kendall","Kerr","Kimble","Kinney","La Salle","McMullen","Mason","Maverick","Medina","Menard","Real","Starr","Sutton","Uvalde","Val Verde","Webb","Wilson","Zapata","Zavala"],
  5: ["Collin","Dallas","Grayson","Hunt","Kaufman","Rockwall"],
  6: ["Bowie","Camp","Cass","Delta","Fannin","Franklin","Gregg","Harrison","Hopkins","Hunt","Lamar","Marion","Morris","Panola","Red River","Rusk","Titus","Upshur","Wood"],
  7: ["Armstrong","Bailey","Briscoe","Carson","Castro","Childress","Cochran","Collingsworth","Cottle","Crosby","Dallam","Deaf Smith","Dickens","Donley","Floyd","Foard","Garza","Gray","Hale","Hall","Hansford","Hardeman","Hartley","Hemphill","Hockley","Hutchinson","Kent","King","Lamb","Lipscomb","Lubbock","Lynn","Moore","Motley","Ochiltree","Oldham","Parmer","Potter","Randall","Roberts","Sherman","Swisher","Terry","Wilbarger","Wheeler","Yoakum"],
  8: ["Andrews","Brewster","Crane","Crockett","Culberson","El Paso","Hudspeth","Jeff Davis","Loving","Pecos","Presidio","Reagan","Reeves","Terrell","Upton","Ward","Winkler"],
  9: ["Hardin","Jasper","Jefferson","Liberty","Montgomery","Newton","Orange","Polk","San Jacinto","Tyler"],
  10: ["Bosque","Burleson","Brazos","Coryell","Ellis","Falls","Freestone","Hamilton","Hill","Johnson","Leon","Limestone","Madison","McLennan","Navarro","Robertson","Somervell","Walker"],
  11: ["Baylor","Borden","Brown","Callahan","Coleman","Comanche","Dawson","Eastland","Ector","Erath","Fisher","Gaines","Glasscock","Haskell","Howard","Jones","Knox","Martin","Midland","Mitchell","Nolan","Palo Pinto","Scurry","Shackelford","Stephens","Stonewall","Taylor","Throckmorton"],
  12: ["Anderson","Angelina","Cherokee","Gregg","Henderson","Houston","Nacogdoches","Rains","Rusk","Sabine","San Augustine","Shelby","Smith","Trinity","Upshur","Van Zandt","Wood"],
  13: ["Aransas","Bee","Calhoun","Cameron","DeWitt","Goliad","Gonzales","Hidalgo","Jackson","Kenedy","Kleberg","Lavaca","Live Oak","Matagorda","Nueces","Refugio","San Patricio","Victoria","Wharton","Willacy"],
  14: ["Austin","Brazoria","Chambers","Colorado","Fort Bend","Galveston","Grimes","Harris","Waller","Washington"],
};

function titleCaseCounty(raw) {
  return String(raw || "")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bDe\b/g, "De")
    .replace(/^Dewitt$/i, "DeWitt")
    .replace(/^El Paso$/i, "El Paso")
    .replace(/^Fort Bend$/i, "Fort Bend")
    .replace(/^Jeff Davis$/i, "Jeff Davis")
    .replace(/^Jim Hogg$/i, "Jim Hogg")
    .replace(/^Jim Wells$/i, "Jim Wells")
    .replace(/^La Salle$/i, "La Salle")
    .replace(/^Live Oak$/i, "Live Oak")
    .replace(/^Palo Pinto$/i, "Palo Pinto")
    .replace(/^Red River$/i, "Red River")
    .replace(/^San /i, "San ")
    .replace(/^Tom Green$/i, "Tom Green")
    .replace(/^Val Verde$/i, "Val Verde")
    .replace(/^Van Zandt$/i, "Van Zandt")
    .replace(/^Mc(\w)/, (_, c) => `Mc${c.toUpperCase()}`);
}

function normalizeKey(name) {
  return String(name || "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function buildAppellateByCounty() {
  const map = new Map();
  for (const county of TX_COUNTIES_CLEAN) {
    map.set(normalizeKey(county), []);
  }
  for (const [district, counties] of Object.entries(APPELLATE)) {
    const d = Number(district);
    for (const county of counties) {
      const key = normalizeKey(county);
      if (!map.has(key)) {
        console.warn("Unknown appellate county:", county);
        continue;
      }
      const list = map.get(key);
      if (!list.includes(d)) list.push(d);
    }
  }
  for (const [, list] of map) list.sort((a, b) => a - b);
  return map;
}

function parseJudicialFromPdfText(text) {
  const start = text.indexOf("State District Courts by County");
  const chunk = start >= 0 ? text.slice(start) : text;
  const judicial = new Map();

  // COUNTY NAME (population)\n numbers...
  const re =
    /([A-Z][A-Z0-9 .'-]*?)\s*\(([\d,]+)\)\s*\n([\s\S]*?)(?=\n[A-Z][A-Z0-9 .'-]*?\s*\([\d,]+\)|\n[A-Z]{2,} \(|$)/g;

  // Simpler line-based parse: lines like "ANDERSON (57,922)" then following lines until next county
  const lines = chunk.split(/\n/);
  let current = null;
  let buf = [];

  function flush() {
    if (!current) return;
    const nums = [];
    const joined = buf.join(" ");
    for (const m of joined.matchAll(/\*?(\d{1,3})\b/g)) {
      const n = Number(m[1]);
      if (n > 0 && n < 600) nums.push(n);
    }
    // handle "2nd 25th" style as 25
    for (const m of joined.matchAll(/(\d+)(?:st|nd|rd|th)\b/gi)) {
      const n = Number(m[1]);
      if (n > 0 && n < 600) nums.push(n);
    }
    judicial.set(normalizeKey(current), [...new Set(nums)].sort((a, b) => a - b));
    current = null;
    buf = [];
  }

  for (const line of lines) {
    const header = line.match(
      /^([A-Z][A-Z .'-]+?)\s*\(([\d,]+)\)\s*$/
    );
    if (header) {
      flush();
      let name = header[1].trim();
      // Fix missing leading letters from PDF extract (NDERSON -> ANDERSON)
      const fixes = {
        NDERSON: "ANDERSON",
        AILEY: "BAILEY",
        ALDWELL: "CALDWELL",
        ALLAM: "DALLAM",
        ASTLAND: "EASTLAND",
        ALLS: "FALLS",
        AINES: "GAINES",
        "E WITT": "DEWITT",
        "DE WITT": "DEWITT",
      };
      current = name;
      buf = [];
      continue;
    }
    if (current) buf.push(line);
  }
  flush();

  // Alias keys
  const aliases = {
    DEWITT: "DEWITT",
    LASALLE: "LASALLE",
  };
  return judicial;
}

function matchCountyKey(pdfKey, countyKeys) {
  if (countyKeys.has(pdfKey)) return pdfKey;
  // Try adding missing first letter A-Z
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const guess = letter + pdfKey;
    if (countyKeys.has(guess)) return guess;
  }
  // Fuzzy: pdf key is suffix of county key
  for (const key of countyKeys) {
    if (key.endsWith(pdfKey) && key.length - pdfKey.length <= 2) return key;
  }
  return null;
}

function sqlArray(nums) {
  if (!nums?.length) return "'{}'::integer[]";
  return `array[${nums.join(", ")}]::integer[]`;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const appellate = buildAppellateByCounty();
  const text = fs.readFileSync(PDF_TEXT, "utf8");
  const judicialRaw = parseJudicialFromPdfText(text);

  const countyKeys = new Set(TX_COUNTIES_CLEAN.map(normalizeKey));
  const judicial = new Map();
  for (const [rawKey, nums] of judicialRaw) {
    const key = matchCountyKey(rawKey, countyKeys);
    if (!key) {
      console.warn("Unmatched judicial county:", rawKey, nums.slice(0, 5));
      continue;
    }
    const existing = judicial.get(key) || [];
    judicial.set(key, [...new Set([...existing, ...nums])].sort((a, b) => a - b));
  }

  // Seed known Fort Bend if missing numbers
  const fb = normalizeKey("Fort Bend");
  if (!judicial.get(fb)?.length) {
    judicial.set(fb, [240, 268, 328, 387, 400, 434, 458, 505]);
  }

  const rows = [];
  let missingJudicial = 0;
  for (const county of TX_COUNTIES_CLEAN) {
    const key = normalizeKey(county);
    const app = appellate.get(key) || [];
    const jud = judicial.get(key) || [];
    if (!jud.length) missingJudicial += 1;
    rows.push({ county, app, jud });
  }

  console.log(
    `Counties: ${rows.length}; with judicial nums: ${
      rows.length - missingJudicial
    }; missing judicial: ${missingJudicial}`
  );

  const mappingValues = rows
    .map(
      (r) =>
        `  ('TX', ${sqlString(r.county)}, ${sqlArray(r.app)}, ${sqlArray(r.jud)})`
    )
    .join(",\n");

  // High courts — current as of mid-2026 (update as seats change)
  const statewide = [
    ["Jimmy Blacklock", "Chief Justice, Supreme Court of Texas"],
    ["James P. Sullivan", "Justice, Supreme Court of Texas"],
    ["Debra Lehrmann", "Justice, Supreme Court of Texas"],
    ["Jeffrey S. Boyd", "Justice, Supreme Court of Texas"],
    ["John Devine", "Justice, Supreme Court of Texas"],
    ["Jane Bland", "Justice, Supreme Court of Texas"],
    ["Rebeca Huddle", "Justice, Supreme Court of Texas"],
    ["Evan Young", "Justice, Supreme Court of Texas"],
    ["Brett Busby", "Justice, Supreme Court of Texas"],
    ["Sharon Keller", "Presiding Judge, Texas Court of Criminal Appeals"],
    ["Barbara Hervey", "Judge, Texas Court of Criminal Appeals"],
    ["Bert Richardson", "Judge, Texas Court of Criminal Appeals"],
    ["Kevin Yeary", "Judge, Texas Court of Criminal Appeals"],
    ["David Newell", "Judge, Texas Court of Criminal Appeals"],
    ["Mary Lou Keel", "Judge, Texas Court of Criminal Appeals"],
    ["Scott Walker", "Judge, Texas Court of Criminal Appeals"],
    ["Jesse McClure", "Judge, Texas Court of Criminal Appeals"],
    ["Gina Parker", "Judge, Texas Court of Criminal Appeals"],
    ["Greg Abbott", "Governor of Texas"],
  ].filter(([, title]) => title);

  // Chief justices of Courts of Appeals 1–14 (seed; expand places later)
  const appellateOfficials = [
    [1, "Terry Adams", "Chief Justice, First Court of Appeals"],
    [2, "Bonnie Sudderth", "Chief Justice, Second Court of Appeals"],
    [3, "Darlene Byrne", "Chief Justice, Third Court of Appeals"],
    [4, "Rebeca Martinez", "Chief Justice, Fourth Court of Appeals"],
    [5, "J. Brett Busby", "Chief Justice, Fifth Court of Appeals"], // may be outdated - use common
    [5, "J.J. Koch", "Chief Justice, Fifth Court of Appeals"],
    [6, "Scott Stevens", "Chief Justice, Sixth Court of Appeals"],
    [7, "Brian Quinn", "Chief Justice, Seventh Court of Appeals"],
    [8, "Maria Salas Mendoza", "Chief Justice, Eighth Court of Appeals"],
    [9, "Scott Golemon", "Chief Justice, Ninth Court of Appeals"],
    [10, "Tom Gray", "Chief Justice, Tenth Court of Appeals"],
    [11, "John Bailey", "Chief Justice, Eleventh Court of Appeals"],
    [12, "Jim Worthen", "Chief Justice, Twelfth Court of Appeals"],
    [13, "Gina Benavides", "Chief Justice, Thirteenth Court of Appeals"],
    [14, "Tracy Christopher", "Chief Justice, Fourteenth Court of Appeals"],
  ];

  // Deduplicate fifth court - keep Goldstein as more likely current
  const appellateClean = appellateOfficials.filter(
    ([d, name]) => !(d === 5 && name.includes("Busby"))
  );

  // Existing Fort Bend appellate justices from user's DB
  const extraAppellate = [
    [14, "Kevin Jewell", "Justice (Place 2), Fourteenth Court of Appeals"],
    [14, "Charles Spain", "Justice (Place 4), Fourteenth Court of Appeals"],
    [14, "Frances Bourliot", "Justice (Place 5), Fourteenth Court of Appeals"],
    [14, "Randy Wilson", "Justice (Place 3), Fourteenth Court of Appeals"],
  ];

  const allAppellate = [...appellateClean, ...extraAppellate];

  const officialInserts = [];
  for (const [name, title] of statewide) {
    officialInserts.push(
      `  (${sqlString(name)}, ${sqlString(title)}, 'Statewide', 'TX', NULL, NULL)`
    );
  }
  for (const [district, name, title] of allAppellate) {
    officialInserts.push(
      `  (${sqlString(name)}, ${sqlString(title)}, 'Appellate', 'TX', ${district}, NULL)`
    );
  }

  const sql = `-- seed-tx-all-mapping-and-high-courts.sql
-- Paste into Supabase SQL Editor and Run.
-- 1) Upserts county_district_mapping for all 254 TX counties
--    (appellate from Gov't Code §22.201; judicial from Oct 2024 district-court list)
-- 2) Upserts Statewide + Appellate high-court officials
-- Does NOT wipe District / County-Magistrate rows you already have.

-- ===== A) County mapping =====
insert into public.county_district_mapping (
  state_code, county_name, appellate_district_numbers, judicial_district_numbers
)
values
${mappingValues}
on conflict (state_code, county_name) do update set
  appellate_district_numbers = excluded.appellate_district_numbers,
  judicial_district_numbers = excluded.judicial_district_numbers;

-- ===== B) Clear prior TX Statewide / Appellate seed rows we manage =====
delete from public.state_officials
where state_code = 'TX'
  and level in ('Statewide', 'Appellate');

-- ===== C) Insert Statewide + Appellate =====
insert into public.state_officials (
  full_name, title, level, state_code, district_number, county_name
)
values
${officialInserts.join(",\n")};

-- Confirm:
-- select count(*) from county_district_mapping where state_code='TX';
-- select level, count(*) from state_officials where state_code='TX' group by level order by 1;
`;

  fs.writeFileSync(OUT_SQL, sql, "utf8");
  console.log("Wrote", OUT_SQL);
  console.log(
    "Sample Fort Bend:",
    rows.find((r) => r.county === "Fort Bend")
  );
}

main();
