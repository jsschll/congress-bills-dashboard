/**
 * Map FEC employers / OpenSecrets-style donor labels → policy industry sectors.
 * Used by OpenFEC sync (server) and Follow the Money drill-down (client mirror).
 */

/** @typedef {{ slug: string, label: string, policyCategory: string, match: RegExp, keywords: RegExp, tagAliases?: string[] }} IndustrySector */

/** @type {IndustrySector[]} */
const INDUSTRY_SECTORS = [
  {
    slug: "energy-environment",
    label: "Energy & Environment",
    policyCategory: "Energy & Environment",
    match:
      /\b(oil|gas|petroleum|pipeline|coal|mining|utilities|electric|energy|kraken|exxon|chevron|conocophillips|occidental|halliburton|schlumberger|pioneer|devon|eog|cheniere|enbridge|tc energy|nextEra|duke energy|southern company|epa|renewable|solar|wind)\b/i,
    keywords:
      /\b(oil|gas|petroleum|pipeline|fossil|drilling|epa|climate|emission|renewable|coal|mining|utility|electric|energy|environment)\b/i,
    tagAliases: ["Oil & Gas", "Energy & Environment", "Mining", "Electric Utilities"],
  },
  {
    slug: "telecommunications",
    label: "Telecommunications",
    policyCategory: "Economy & Taxes",
    match:
      /\b(at&t|att\b|verizon|t-?mobile|comcast|charter communications|cox communications|dish network|lumen|centurylink|sprint|telecom|broadband|cable|wireless|fcc)\b/i,
    keywords:
      /\b(telecom|telecommunications|broadband|spectrum|fcc|wireless|cable|5g|internet service|net neutrality)\b/i,
    tagAliases: ["Telecom Services", "Telephone Utilities", "TV / Movies / Music", "Telecommunications"],
  },
  {
    slug: "finance-investment",
    label: "Finance & Investment",
    policyCategory: "Economy & Taxes",
    match:
      /\b(bank|securities|investment|capital|fidelity|blackstone|blackrock|apollo|kkr|goldman|morgan stanley|jpmorgan|jp morgan|citigroup|wells fargo|vanguard|bridgewater|fortress|andreessen|a16z|hedge|broker|brokerage|private equity|asset management|schwab|raymond james|bny|mellon)\b/i,
    keywords:
      /\b(bank|securities|investment|finance|capital markets|hedge|broker|wall street|federal reserve|sec\b|dodd-?frank)\b/i,
    tagAliases: [
      "Securities & Investment",
      "Commercial Banks",
      "Finance / Credit Companies",
      "Finance & Investment",
    ],
  },
  {
    slug: "real-estate",
    label: "Real Estate",
    policyCategory: "Housing & Infrastructure",
    match:
      /\b(real estate|realtor|realtors|home builder|construction|housing|property management|cbre|jones lang|coldwell|keller williams|re\/max)\b/i,
    keywords:
      /\b(housing|real estate|mortgage|rent|zoning|property|homeless|infra|transit|highway|bridge|construction)\b/i,
    tagAliases: ["Real Estate", "Home Builders", "Construction Services"],
  },
  {
    slug: "healthcare",
    label: "Healthcare",
    policyCategory: "Healthcare",
    match:
      /\b(health|pharma|hospital|medical|pfizer|moderna|johnson & johnson|unitedhealth|cvs|cigna|humana|anthem|abbvie|merck|bristol|novartis|insurance)\b/i,
    keywords:
      /\b(health|medicare|medicaid|hospital|pharma|drug|vaccine|aca|insurance|medical)\b/i,
    tagAliases: ["Health Professionals", "Hospitals / Nursing Homes", "Pharmaceuticals / Health Products", "Healthcare"],
  },
  {
    slug: "defense-aerospace",
    label: "Defense & Aerospace",
    policyCategory: "Foreign Policy & Defense",
    match:
      /\b(defense|aerospace|lockheed|boeing|raytheon|northrop|general dynamics|l3harris|palantir|arms|weapons|military)\b/i,
    keywords:
      /\b(defense|military|armed forces|veteran|nato|war|troop|sanction|aerospace|weapons)\b/i,
    tagAliases: ["Defense Aerospace", "Defense Electronics", "Foreign Policy & Defense"],
  },
  {
    slug: "education-labor",
    label: "Education & Labor",
    policyCategory: "Education & Labor",
    match:
      /\b(edu|teacher|school|university|college|labor|union|public sector|afl-?cio|nean|aft\b)\b/i,
    keywords:
      /\b(school|educat|student|university|college|labor|union|wage|worker|osha|teacher)\b/i,
    tagAliases: ["Public Sector Unions", "Education", "Education & Labor"],
  },
  {
    slug: "immigration-border",
    label: "Immigration & Border",
    policyCategory: "Immigration & Border",
    match: /\b(immigra|border|customs|ice\b|cbp\b)\b/i,
    keywords: /\b(immigra|border|asylum|visa|deport|refugee|customs)\b/i,
    tagAliases: ["Immigration & Border"],
  },
  {
    slug: "civil-rights-justice",
    label: "Civil Rights & Justice",
    policyCategory: "Civil Rights & Justice",
    match: /\b(civil rights|voting rights|gun|firearm|nra\b|justice|aclu)\b/i,
    keywords:
      /\b(civil rights|voting rights|discrim|police|prison|justice|gun|court)\b/i,
    tagAliases: ["Gun Rights", "Civil Rights & Justice"],
  },
  {
    slug: "law-lobbying",
    label: "Law & Lobbying",
    policyCategory: "Civil Rights & Justice",
    match:
      /\b(law firm|lawyer|legal|lobby|lobbyist|bgr group|aking|covington|skadden|sullivan & cromwell|kirkland)\b/i,
    keywords: /\b(lawyer|legal|lobby|court|litigation|attorney)\b/i,
    tagAliases: ["Lawyers / Law Firms", "Lawyers & Lobbyists", "Lobbyists"],
  },
  {
    slug: "tech-software",
    label: "Technology",
    policyCategory: "Economy & Taxes",
    match:
      /\b(google|alphabet|microsoft|amazon|apple|meta\b|facebook|nvidia|intel|oracle|salesforce|software|cyber|tech\b|electronics|silicon)\b/i,
    keywords:
      /\b(tech|software|internet|cyber|ai\b|artificial intelligence|data privacy|big tech)\b/i,
    tagAliases: ["Electronics Mfg & Equip", "Internet", "Computer Software", "Technology"],
  },
  {
    slug: "agriculture-food",
    label: "Agriculture & Food",
    policyCategory: "Economy & Taxes",
    match: /\b(agri|agriculture|farm|food|crop|livestock|tyson|cargill|monsanto|bayer crop)\b/i,
    keywords: /\b(agriculture|farm|food|crop|usda|livestock|nutrition)\b/i,
    tagAliases: ["Crop Production & Basic Processing", "Agricultural Services / Products", "Food Processing & Sales"],
  },
  {
    slug: "economy-taxes",
    label: "Economy & Taxes",
    policyCategory: "Economy & Taxes",
    match:
      /\b(retail|business|entrepreneur|accountant|tax|walmart|home depot|costco|target|commerce)\b/i,
    keywords:
      /\b(tax|irs|tariff|budget|spend|deficit|debt|bank|securities|investment|finance|retail|economy)\b/i,
    tagAliases: ["Misc Business", "Retail Sales", "Economy & Taxes"],
  },
];

const SECTOR_BY_SLUG = new Map(
  INDUSTRY_SECTORS.map((sector) => [sector.slug, sector])
);

function normalizeNeedle(value = "") {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Classify an employer or OpenSecrets-style industry label.
 * @param {string} raw
 * @returns {{ slug: string, label: string, policyCategory: string }}
 */
function classifyDonorSource(raw = "") {
  const name = normalizeNeedle(raw);
  if (!name) {
    return {
      slug: "economy-taxes",
      label: "Economy & Taxes",
      policyCategory: "Economy & Taxes",
    };
  }

  // Exact / alias hit on known OpenSecrets or sector labels.
  const lower = name.toLowerCase();
  for (const sector of INDUSTRY_SECTORS) {
    if (sector.label.toLowerCase() === lower) {
      return {
        slug: sector.slug,
        label: sector.label,
        policyCategory: sector.policyCategory,
      };
    }
    if (
      (sector.tagAliases || []).some((alias) => alias.toLowerCase() === lower)
    ) {
      return {
        slug: sector.slug,
        label: sector.label,
        policyCategory: sector.policyCategory,
      };
    }
  }

  for (const sector of INDUSTRY_SECTORS) {
    if (sector.match.test(name)) {
      return {
        slug: sector.slug,
        label: sector.label,
        policyCategory: sector.policyCategory,
      };
    }
  }

  return {
    slug: "economy-taxes",
    label: "Economy & Taxes",
    policyCategory: "Economy & Taxes",
  };
}

function getIndustrySector(slugOrLabel = "") {
  const raw = normalizeNeedle(slugOrLabel);
  if (!raw) return null;
  if (SECTOR_BY_SLUG.has(raw)) return SECTOR_BY_SLUG.get(raw);
  const classified = classifyDonorSource(raw);
  return SECTOR_BY_SLUG.get(classified.slug) || null;
}

/**
 * Enrich a donor source row with industry sector fields.
 * @param {{ name?: string, amount?: number, industry_slug?: string, industry?: string, category?: string }} row
 */
function enrichDonorSource(row = {}) {
  const name = normalizeNeedle(row.name || row.employer || "");
  const amount = Number(row.amount);
  const classified =
    row.industry_slug && SECTOR_BY_SLUG.has(String(row.industry_slug))
      ? {
          slug: String(row.industry_slug),
          label:
            row.industry ||
            SECTOR_BY_SLUG.get(String(row.industry_slug))?.label ||
            String(row.industry_slug),
          policyCategory:
            row.category ||
            SECTOR_BY_SLUG.get(String(row.industry_slug))?.policyCategory ||
            "Economy & Taxes",
        }
      : classifyDonorSource(name);
  return {
    name,
    amount: Number.isFinite(amount) ? amount : 0,
    industry_slug: classified.slug,
    industry: classified.label,
    category: classified.policyCategory,
  };
}

function policyCategoryFromSlug(slug = "") {
  return getIndustrySector(slug)?.policyCategory || null;
}

function industryLabelFromSlug(slug = "") {
  return getIndustrySector(slug)?.label || null;
}

module.exports = {
  INDUSTRY_SECTORS,
  classifyDonorSource,
  enrichDonorSource,
  getIndustrySector,
  industryLabelFromSlug,
  policyCategoryFromSlug,
};
