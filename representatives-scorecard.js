/**
 * Vanilla Representative Scorecard dashboard.
 * Page 1 layout + Page 2 hero badges / actions / Action Match Scorecard.
 */

(function (global) {
  const SESSION_KEY = "article1.scorecardSession";
  const PENDING_FOLLOW_KEY = "article1.pendingFollow";
  const ENDPOINT = "/api/representatives/lookup";

  const POLICY_TOPIC_FILTERS = [
    "All Topics",
    "Economy & Taxes",
    "Healthcare",
    "Immigration & Border",
    "Housing & Infrastructure",
    "Foreign Policy & Defense",
    "Civil Rights & Justice",
    "Energy & Environment",
    "Education & Labor",
  ];

  /**
   * Map FEC employers / OpenSecrets-style labels → policy industry sectors.
   * Keep in sync with lib/services/industryTaxonomy.js.
   */
  const INDUSTRY_SECTORS = [
    {
      slug: "energy-environment",
      label: "Energy & Environment",
      policyCategory: "Energy & Environment",
      match:
        /\b(oil|gas|petroleum|pipeline|coal|mining|utilities|electric|energy|kraken|exxon|chevron|conocophillips|occidental|halliburton|schlumberger|pioneer|devon|eog|cheniere|enbridge|tc energy|nextera|duke energy|southern company|epa|renewable|solar|wind)\b/i,
      keywords:
        /\b(oil|gas|petroleum|pipeline|fossil|drilling|epa|climate|emission|renewable|coal|mining|utility|electric|energy|environment)\b/i,
      tagAliases: [
        "Oil & Gas",
        "Energy & Environment",
        "Mining",
        "Electric Utilities",
      ],
    },
    {
      slug: "telecommunications",
      label: "Telecommunications",
      policyCategory: "Economy & Taxes",
      match:
        /\b(at&t|att\b|verizon|t-?mobile|comcast|charter communications|cox communications|dish network|lumen|centurylink|sprint|telecom|broadband|cable|wireless|fcc)\b/i,
      keywords:
        /\b(telecom|telecommunications|broadband|spectrum|fcc|wireless|cable|5g|internet service|net neutrality)\b/i,
      tagAliases: [
        "Telecom Services",
        "Telephone Utilities",
        "TV / Movies / Music",
        "Telecommunications",
      ],
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
        /\b(real estate|realtor|realtors|home builder|construction|housing|property management|cbre|jones lang|coldwell|keller williams)\b/i,
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
      tagAliases: [
        "Health Professionals",
        "Hospitals / Nursing Homes",
        "Pharmaceuticals / Health Products",
        "Healthcare",
      ],
    },
    {
      slug: "defense-aerospace",
      label: "Defense & Aerospace",
      policyCategory: "Foreign Policy & Defense",
      match:
        /\b(defense|aerospace|lockheed|boeing|raytheon|northrop|general dynamics|l3harris|palantir|arms|weapons|military)\b/i,
      keywords:
        /\b(defense|military|armed forces|veteran|nato|war|troop|sanction|aerospace|weapons)\b/i,
      tagAliases: [
        "Defense Aerospace",
        "Defense Electronics",
        "Foreign Policy & Defense",
      ],
    },
    {
      slug: "education-labor",
      label: "Education & Labor",
      policyCategory: "Education & Labor",
      match:
        /\b(edu|teacher|school|university|college|labor|union|public sector|afl-?cio)\b/i,
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
      tagAliases: [
        "Lawyers / Law Firms",
        "Lawyers & Lobbyists",
        "Lobbyists",
      ],
    },
    {
      slug: "tech-software",
      label: "Technology",
      policyCategory: "Economy & Taxes",
      match:
        /\b(google|alphabet|microsoft|amazon|apple|meta\b|facebook|nvidia|intel|oracle|salesforce|software|cyber|tech\b|electronics|silicon)\b/i,
      keywords:
        /\b(tech|software|internet|cyber|ai\b|artificial intelligence|data privacy|big tech)\b/i,
      tagAliases: [
        "Electronics Mfg & Equip",
        "Internet",
        "Computer Software",
        "Technology",
      ],
    },
    {
      slug: "agriculture-food",
      label: "Agriculture & Food",
      policyCategory: "Economy & Taxes",
      match:
        /\b(agri|agriculture|farm|food|crop|livestock|tyson|cargill|monsanto|bayer crop)\b/i,
      keywords: /\b(agriculture|farm|food|crop|usda|livestock|nutrition)\b/i,
      tagAliases: [
        "Crop Production & Basic Processing",
        "Agricultural Services / Products",
        "Food Processing & Sales",
      ],
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

  const INDUSTRY_SECTOR_BY_SLUG = new Map(
    INDUSTRY_SECTORS.map((sector) => [sector.slug, sector])
  );

  function classifyDonorSource(raw = "") {
    const name = String(raw || "").trim();
    if (!name) return INDUSTRY_SECTOR_BY_SLUG.get("economy-taxes");
    const lower = name.toLowerCase();
    for (const sector of INDUSTRY_SECTORS) {
      if (sector.label.toLowerCase() === lower) return sector;
      if (
        (sector.tagAliases || []).some((alias) => alias.toLowerCase() === lower)
      ) {
        return sector;
      }
    }
    for (const sector of INDUSTRY_SECTORS) {
      if (sector.match.test(name)) return sector;
    }
    return INDUSTRY_SECTOR_BY_SLUG.get("economy-taxes");
  }

  function resolveIndustrySector(slugOrLabel = "") {
    const raw = String(slugOrLabel || "").trim();
    if (!raw) return null;
    if (INDUSTRY_SECTOR_BY_SLUG.has(raw)) {
      return INDUSTRY_SECTOR_BY_SLUG.get(raw);
    }
    return classifyDonorSource(raw);
  }

  function enrichDonorSourceClient(item = {}) {
    const name = String(item.name || "").trim();
    const slug = String(item.industry_slug || item.industrySlug || "").trim();
    const sector =
      (slug && INDUSTRY_SECTOR_BY_SLUG.get(slug)) || classifyDonorSource(name);
    return {
      name,
      amount: Number(item.amount) || 0,
      industry_slug: sector.slug,
      industry: sector.label,
      category: sector.policyCategory,
    };
  }

  function industryLabelFromFilter(filter = "") {
    return resolveIndustrySector(filter)?.label || String(filter || "").trim();
  }

  function policyCategoryFromIndustry(slugOrLabel = "") {
    return resolveIndustrySector(slugOrLabel)?.policyCategory || null;
  }

  function topicSlugFromCategory(category = "") {
    const value = String(category || "").trim().toLowerCase();
    if (!value) return "";
    for (const sector of INDUSTRY_SECTORS) {
      if (sector.policyCategory.toLowerCase() === value) return sector.slug;
      if (sector.label.toLowerCase() === value) return sector.slug;
      if (
        (sector.tagAliases || []).some((alias) => alias.toLowerCase() === value)
      ) {
        return sector.slug;
      }
    }
    return value.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function voteMatchesIndustry(
    vote = {},
    industryFilter = "",
    { allowRelatedCategory = false } = {}
  ) {
    const sector = resolveIndustrySector(industryFilter);
    if (!sector) return true;

    const tags = [
      ...(Array.isArray(vote.industry_tags) ? vote.industry_tags : []),
      ...(Array.isArray(vote.industryTags) ? vote.industryTags : []),
      ...(Array.isArray(vote.tags) ? vote.tags : []),
    ]
      .map((tag) => String(tag || "").trim().toLowerCase())
      .filter(Boolean);

    const aliasNeedles = new Set(
      [
        sector.slug,
        sector.label,
        sector.policyCategory,
        ...(sector.tagAliases || []),
      ]
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean)
    );

    if (tags.some((tag) => aliasNeedles.has(tag))) return true;

    const category = String(
      vote.category || vote.primary_category || vote.primaryCategory || ""
    ).trim();
    const categoryLower = category.toLowerCase();
    const voteTopicSlug =
      String(vote.topic_slug || vote.topicSlug || "").trim() ||
      (category ? topicSlugFromCategory(category) : "");
    if (voteTopicSlug && voteTopicSlug === sector.slug) return true;

    if (category) {
      if (categoryLower === sector.label.toLowerCase()) return true;
      // Unique owners (e.g. Healthcare) can match on policy category directly.
      // Shared buckets (Economy & Taxes) only via related fallback or keywords.
      const uniqueOwner =
        INDUSTRY_SECTORS.filter(
          (row) => row.policyCategory === sector.policyCategory
        ).length === 1;
      if (
        (uniqueOwner || allowRelatedCategory) &&
        categoryLower === sector.policyCategory.toLowerCase()
      ) {
        return true;
      }
    }

    if (allowRelatedCategory) return false;

    const haystack = [
      vote.title,
      vote.rawTitle,
      vote.billNumber,
      vote.plainEnglishSummary,
      vote.plain_summary,
      vote.plainSummary,
      vote.category,
      vote.impacts?.wallet,
      vote.impacts?.community,
      vote.impacts?.rights,
      ...tags,
    ]
      .filter(Boolean)
      .join(" ");

    return sector.keywords.test(haystack);
  }

  const CATEGORY_RULES = [
    {
      key: "Immigration & Border",
      re: /\b(immigra|border|asylum|visa|deport|refugee|customs)\b/i,
    },
    {
      key: "Healthcare",
      re: /\b(health|medicare|medicaid|hospital|drug|pharma|aca|insurance|vaccine)\b/i,
    },
    {
      key: "Housing & Infrastructure",
      re: /\b(hous(e|ing)|rent|mortgage|homeless|zoning|infra|transit|highway|bridge)\b/i,
    },
    {
      key: "Foreign Policy & Defense",
      re: /\b(defense|military|veteran|armed forces|national security|foreign|war|nato|troop|sanction)\b/i,
    },
    {
      key: "Civil Rights & Justice",
      re: /\b(civil rights|voting rights|discrim|police|prison|justice|gun|court)\b/i,
    },
    {
      key: "Energy & Environment",
      re: /\b(climat|environment|energy|epa|clean air|water|emission|oil|gas|renewable)\b/i,
    },
    {
      key: "Education & Labor",
      re: /\b(school|educat|student|university|college|title ix|labor|union|wage|worker|osha)\b/i,
    },
    {
      key: "Economy & Taxes",
      re: /\b(tax|irs|tariff|revenue|duty|excise|budget|spend|deficit|debt|economy|fee|payroll)\b/i,
    },
  ];

  /** @type {Map<string, object>} */
  const enrichCache = new Map();
  /** @type {Set<string>} */
  let followedPoliticianIds = new Set();
  /** @type {{ id?: string } | null} */
  let followUser = null;
  /** @type {object | null} */
  let activeRosterPerson = null;
  /** @type {{ id?: string, body?: string } | null} */
  let politicianNote = null;
  /** @type {Element | null} */
  let notesModalLastFocus = null;
  let notePopoverHideTimer = 0;
  let notesBound = false;

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUsd(amount) {
    if (amount == null || Number.isNaN(Number(amount))) return "—";
    const n = Number(amount);
    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n >= 1000 ? 0 : 2,
      }).format(n);
    } catch {
      return `$${Math.round(n).toLocaleString("en-US")}`;
    }
  }

  function formatPct(value) {
    if (value == null || Number.isNaN(Number(value))) return "—";
    return `${Math.round(Number(value) * 10) / 10}%`;
  }

  function partyKind(party) {
    const value = String(party || "").toLowerCase();
    if (value.startsWith("dem")) return "democrat";
    if (value.startsWith("rep") || value.includes("gop")) return "republican";
    if (value.startsWith("ind")) return "independent";
    return "other";
  }

  function partyLabel(kind, raw) {
    if (kind === "democrat") return "Democrat";
    if (kind === "republican") return "Republican";
    if (kind === "independent") return "Independent";
    return String(raw || "Nonpartisan");
  }

  function partyClassName(party) {
    if (typeof partyClass === "function") return partyClass(party);
    const kind = partyKind(party);
    if (kind === "democrat") return "party--dem";
    if (kind === "republican") return "party--rep";
    return "party--other";
  }

  function authNextHref() {
    const next = `${global.location.pathname}${global.location.search}`.replace(
      /^\//,
      ""
    );
    return typeof authHrefForNext === "function"
      ? authHrefForNext(next)
      : `auth.html?next=${encodeURIComponent(next)}`;
  }

  function promptScorecardAuth(copy = {}) {
    if (typeof promptAuthGate === "function") {
      promptAuthGate({
        next: `${global.location.pathname}${global.location.search}`.replace(
          /^\//,
          ""
        ),
        title: copy.title || "Create a free account",
        body:
          copy.body ||
          "Create a free account to track topics, receive personalized alerts, and contact your representatives directly.",
      });
      return;
    }
    global.location.href = authNextHref();
  }

  function readQuery() {
    const params = new URLSearchParams(global.location.search);
    return {
      id: (params.get("id") || "").trim() || null,
      bioguideId:
        (params.get("bioguideId") || params.get("bioguide") || "")
          .trim()
          .toUpperCase() || null,
      politicianId:
        (params.get("politicianId") || params.get("rosterId") || "").trim() ||
        null,
      zipCode:
        (params.get("zipCode") || params.get("zip") || "").trim() || null,
      address:
        (params.get("address") || params.get("q") || "").trim() || null,
    };
  }

  function readSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeSession(payload) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch {
      /* ignore quota */
    }
  }

  function setStatus(message, type = "loading") {
    const el = $("scorecard-status");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.dataset.type = type;
    if (message && (type === "success" || type === "error")) {
      global.clearTimeout(setStatus._hideTimer);
      setStatus._hideTimer = global.setTimeout(() => {
        if (el.dataset.type === type && el.textContent === message) {
          el.hidden = true;
          el.textContent = "";
        }
      }, type === "success" ? 4200 : 7000);
    }
  }

  function readPendingFollow() {
    try {
      const raw = sessionStorage.getItem(PENDING_FOLLOW_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writePendingFollow(payload) {
    try {
      if (!payload) sessionStorage.removeItem(PENDING_FOLLOW_KEY);
      else sessionStorage.setItem(PENDING_FOLLOW_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }

  function pendingFollowMatches(person) {
    const pending = readPendingFollow();
    if (!pending || !person) return null;
    const pendingBio = String(pending.bioguideId || "")
      .trim()
      .toUpperCase();
    const personBio = String(person.bioguide_id || person.bioguideId || "")
      .trim()
      .toUpperCase();
    if (pendingBio && personBio && pendingBio === personBio) return pending;
    if (pending.id && person.id && String(pending.id) === String(person.id)) {
      return pending;
    }
    if (
      pending.name &&
      person.name &&
      String(pending.name).toLowerCase() === String(person.name).toLowerCase()
    ) {
      return pending;
    }
    return null;
  }

  function districtLabel(profile) {
    const state = String(profile.state || "").toUpperCase();
    if (profile.chamber === "Senate") {
      return [state, "U.S. Senate"].filter(Boolean).join(" · ");
    }
    const district = String(profile.district || "").replace(/^0+/, "");
    if (!state) return profile.chamber || "Federal office";
    return district ? `${state}-${district}` : `${state} · At-Large`;
  }

  function officeBadgeLabel(profile, overview) {
    if (overview?.office_title) return String(overview.office_title);
    if (profile.chamber === "Senate") return "U.S. Senator";
    if (profile.chamber === "House") {
      const state = String(profile.state || "").toUpperCase();
      const district = String(profile.district || "").replace(/^0+/, "");
      if (state && district) return `House - ${state}-${district}`;
      return "U.S. Representative";
    }
    return profile.chamber || "Official";
  }

  function tenureLabel(profile, overview) {
    if (overview?.tenure?.label) return String(overview.tenure.label);
    const elected = overview?.tenure?.electedYear;
    const years = overview?.tenure?.yearsActive;
    if (elected != null && years != null) {
      return `Elected ${elected} · ${years} Year${years === 1 ? "" : "s"} Active`;
    }
    if (profile.nextElectionYear) {
      return `Next election ${profile.nextElectionYear}`;
    }
    return "";
  }

  function tabLabel(rep, senateIndex) {
    if (rep.profile.chamber === "Senate") return `Senate ${senateIndex}`;
    if (rep.profile.chamber === "House") {
      const district = String(rep.profile.district || "").replace(/^0+/, "");
      const state = String(rep.profile.state || "").toUpperCase();
      return district ? `House · ${state}-${district}` : "House Representative";
    }
    return rep.profile.name;
  }

  function voteTone(position) {
    const raw = String(position || "").toUpperCase();
    if (raw === "YES" || raw === "YEA" || raw === "AYE") return "yes";
    if (raw === "NO" || raw === "NAY") return "no";
    return "neutral";
  }

  function normalizeBillNumber(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const match = raw.match(
      /^(h\.?\s*r\.?|s\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*con\.?\s*res\.?)\s*(\d+)/i
    );
    if (!match) return raw;
    const kind = match[1].toLowerCase().replace(/\s+/g, "").replace(/\./g, "");
    const number = match[2];
    if (kind === "hr") return `H.R. ${number}`;
    if (kind === "s") return `S. ${number}`;
    if (kind === "sjres") return `S.J.Res. ${number}`;
    if (kind === "hjres") return `H.J.Res. ${number}`;
    if (kind === "sconres") return `S.Con.Res. ${number}`;
    if (kind === "hconres") return `H.Con.Res. ${number}`;
    return raw;
  }

  function formatVoteTitle(vote) {
    const shortTitle = String(
      vote?.short_title || vote?.shortTitle || ""
    ).trim();
    if (shortTitle && !/amdt\.?\s*(?:no\.?\s*)?\d+/i.test(shortTitle)) {
      return shortTitle;
    }
    const number = normalizeBillNumber(vote?.billNumber);
    let title = String(vote?.rawTitle || vote?.title || "")
      .replace(/^(seed|placeholder)\s*:\s*/i, "")
      .trim();
    if (!title) return number || "Congressional roll call";
    if (number) {
      const bare = number.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
      const titleBare = title.replace(/\./g, "").replace(/\s+/g, "").toLowerCase();
      if (titleBare.startsWith(bare)) {
        if (/^[^:]+:\s*/.test(title)) return title.replace(/^[^:]+/, number);
        return `${number}: ${title}`;
      }
      return `${number}: ${title}`;
    }
    return title;
  }

  function formatVoteCodeBadge(vote) {
    const shortTitle = String(
      vote?.short_title || vote?.shortTitle || ""
    ).trim();
    const raw = String(vote?.rawTitle || "").trim();
    if (raw && shortTitle && raw.toLowerCase() !== shortTitle.toLowerCase()) {
      const match = raw.match(
        /([A-Z][A-Za-z.'\-]+(?:\s+[A-Z][A-Za-z.'\-]+){0,3})\s+Amdt\.?\s*(?:No\.?\s*)?(\d+)/i
      );
      if (match) return `${match[1]} Amdt. No. ${match[2]}`;
      if (/amdt\.?\s*(?:no\.?\s*)?\d+/i.test(raw)) return raw;
    }
    return "";
  }

  function sentenceClamp(text, maxSentences = 2) {
    const cleaned = String(text || "").trim();
    if (!cleaned) return "";
    const parts = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
    return parts
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, maxSentences)
      .join(" ");
  }

  function buildPlainEnglishSummary(vote) {
    const fromClaude = sentenceClamp(
      vote?.plain_summary ||
        vote?.plainSummary ||
        vote?.plainEnglishSummary ||
        "",
      2
    );
    if (fromClaude) return fromClaude;
    const fromSummary = sentenceClamp(vote?.plainEnglishSummary || "", 2);
    if (fromSummary) return fromSummary;
    const impacts = [
      vote?.impacts?.wallet,
      vote?.impacts?.community,
      vote?.impacts?.rights,
    ]
      .map((text) => String(text || "").trim())
      .filter(Boolean);
    if (impacts.length) return sentenceClamp(impacts.slice(0, 2).join(" "), 2);
    return "";
  }

  function categorizeBill(bill = {}, voteCopy = null) {
    if (typeof normalizePolicyCategory === "function") {
      const haystack = [
        bill.title,
        bill.bill_number,
        bill.billNumber,
        ...(bill.tags || []),
        bill.policyArea,
        bill.short_pitch,
        bill.category,
        bill.plainEnglishSummary,
        voteCopy?.card_summary,
        voteCopy?.plain_summary,
        voteCopy?.takeaway,
      ]
        .filter(Boolean)
        .join(" ");
      return normalizePolicyCategory(
        voteCopy?.primary_category ||
          bill.primary_category ||
          bill.category ||
          "",
        haystack
      );
    }
    const haystack = [
      bill.title,
      bill.bill_number,
      bill.billNumber,
      ...(bill.tags || []),
      bill.policyArea,
      bill.short_pitch,
      bill.category,
      bill.plainEnglishSummary,
    ]
      .filter(Boolean)
      .join(" ");
    for (const rule of CATEGORY_RULES) {
      if (rule.re.test(haystack)) return rule.key;
    }
    return "Economy & Taxes";
  }

  function siteHref(website) {
    const site = String(website || "").trim();
    if (!site) return "";
    return /^https?:\/\//i.test(site) ? site : `https://${site}`;
  }

  function buildContactPills(profile, enrich) {
    const overview = enrich?.overview || {};
    const roster = enrich?.roster || {};
    const phone =
      profile.phone || overview.phone || enrich?.contact?.phone || "";
    const website =
      profile.website ||
      overview.website_url ||
      enrich?.contact?.website ||
      "";
    const siteUrl = siteHref(website);
    const social =
      typeof mapPoliticianSocialLinks === "function"
        ? mapPoliticianSocialLinks(roster)
        : [];
    const fromCongress = Array.isArray(enrich?.contact?.social)
      ? enrich.contact.social
      : [];

    const pills = [];
    if (phone) {
      pills.push({
        label: "Phone",
        href: `tel:${String(phone).replace(/[^\d+]/g, "")}`,
      });
    }
    if (siteUrl) {
      pills.push({
        label: "Official Website",
        href: siteUrl,
        external: true,
      });
    }

    const seen = new Set(pills.map((p) => p.label));
    for (const link of [...social, ...fromCongress]) {
      const label = String(link.label || "").trim();
      const url = String(link.url || "").trim();
      if (!label || !url || seen.has(label)) continue;
      seen.add(label);
      pills.push({ label, href: url, external: true });
    }
    return pills;
  }

  async function loadEnrichment(profile) {
    const bioguide = String(profile?.bioguideId || "")
      .trim()
      .toUpperCase();
    const cacheKey = bioguide || profile?.id || profile?.name || "";
    if (cacheKey && enrichCache.has(cacheKey)) {
      return enrichCache.get(cacheKey);
    }

    const result = {
      overview: null,
      contact: null,
      roster: null,
      recentVotes: [],
    };

    const client = typeof getSupabase === "function" ? getSupabase() : null;
    if (client) {
      let query = client
        .from("politicians")
        .select(
          "id,name,party,bioguide_id,external_key,level,chamber,state,district,office_title,photo_url,website_url,phone,metadata"
        );
      if (profile.rosterPoliticianId) {
        query = query.eq("id", profile.rosterPoliticianId);
      } else if (bioguide) {
        query = query.ilike("bioguide_id", bioguide);
      } else {
        query = null;
      }
      if (query) {
        const { data } = await query.limit(1).maybeSingle();
        if (data) result.roster = data;
      }
    }

    if (bioguide) {
      try {
        const params = new URLSearchParams({ bioguide });
        if (typeof API_KEY === "string" && API_KEY.trim()) {
          params.set("api_key", API_KEY.trim());
        }
        const response = await fetch(
          `/api/politician-profile?${params.toString()}`
        );
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          result.overview = data.overview || null;
          result.contact = data.contact || null;
          result.recentVotes = Array.isArray(data.recentVotes)
            ? data.recentVotes
            : [];
        }
      } catch (error) {
        console.warn("Scorecard profile enrich failed:", error);
      }
    }

    if (cacheKey) enrichCache.set(cacheKey, result);
    return result;
  }

  function mapProfileVotesToScorecard(votes) {
    return (votes || [])
      .map((vote) => {
        const cast = String(vote.voteCast || vote.vote_cast || "").toLowerCase();
        let votePosition = "NOT_VOTING";
        if (cast === "yea" || cast === "aye" || cast === "yes") votePosition = "YES";
        else if (cast === "nay" || cast === "no") votePosition = "NO";
        else if (cast.includes("present")) votePosition = "ABSTAIN";
        const billNumber = vote.billNumber || vote.bill_number || null;
        const normalizedNumber =
          typeof normalizeBillNumber === "function"
            ? normalizeBillNumber(billNumber)
            : billNumber;
        const rawTitle = String(
          vote.rawTitle || vote.title || vote.voteQuestion || "Congressional roll call"
        )
          .replace(/^(seed|placeholder)\s*:\s*/i, "")
          .trim();
        const shortTitle = String(
          vote.short_title || vote.shortTitle || ""
        ).trim();
        const title =
          shortTitle ||
          (normalizedNumber &&
          !String(rawTitle)
            .replace(/\./g, "")
            .replace(/\s+/g, "")
            .toLowerCase()
            .startsWith(
              String(normalizedNumber)
                .replace(/\./g, "")
                .replace(/\s+/g, "")
                .toLowerCase()
            )
            ? `${normalizedNumber}: ${rawTitle}`
            : rawTitle);
        const plainSummary = String(
          vote.plain_summary ||
            vote.plainSummary ||
            vote.plainEnglishSummary ||
            vote.shortPitch ||
            vote.officialSummary ||
            vote.voteQuestion ||
            ""
        ).trim();
        const voteQuestion = String(
          vote.voteQuestion || vote.vote_question || vote.question || ""
        ).trim();
        const voteKind = String(
          vote.voteKind || vote.vote_kind || ""
        ).trim();
        const motion =
          typeof describeVoteMotion === "function"
            ? describeVoteMotion({
                voteQuestion,
                voteKind,
                result: vote.result,
                motionLabel: vote.motionLabel,
              })
            : {
                label:
                  vote.motionLabel ||
                  (typeof formatVoteMotionLabel === "function"
                    ? formatVoteMotionLabel({ voteQuestion, voteKind })
                    : voteQuestion || "Floor Vote"),
                detail: vote.motionDetail || voteQuestion || "",
                isProcedural: Boolean(vote.isProceduralMotion),
              };
        return {
          votePosition,
          billId: String(vote.billId || vote.id || vote.rollCallId || title),
          rollCallId: String(vote.rollCallId || vote.billId || vote.id || ""),
          rollCallNumber:
            vote.rollCallNumber != null
              ? Number(vote.rollCallNumber)
              : vote.roll_call_number != null
                ? Number(vote.roll_call_number)
                : null,
          billNumber: normalizedNumber,
          title,
          rawTitle,
          short_title: shortTitle || null,
          shortTitle: shortTitle || null,
          plain_summary: plainSummary || null,
          plainSummary: plainSummary || null,
          plainEnglishSummary: plainSummary || null,
          yea_impact: vote.yea_impact || vote.yeaImpact || null,
          nay_impact: vote.nay_impact || vote.nayImpact || null,
          is_key_vote:
            typeof vote.is_key_vote === "boolean"
              ? vote.is_key_vote
              : typeof vote.isKeyVote === "boolean"
                ? vote.isKeyVote
                : null,
          isKeyVote:
            typeof vote.is_key_vote === "boolean"
              ? vote.is_key_vote
              : typeof vote.isKeyVote === "boolean"
                ? vote.isKeyVote
                : null,
          category: vote.subjectCategory || vote.policyArea || categorizeBill(vote),
          voteDate: vote.date || (vote.lastUpdated || "").slice(0, 10) || null,
          voteQuestion: voteQuestion || null,
          voteKind: voteKind || null,
          result: vote.result || null,
          motionLabel: motion.label || null,
          motionDetail: motion.detail || null,
          isProceduralMotion: Boolean(motion.isProcedural),
          impacts: {
            wallet: null,
            community: null,
            rights: null,
          },
          summarySource: vote.summarySource || null,
        };
      })
      .filter((vote) => {
        const title = String(vote.title || "");
        return !/^seed\s*:/i.test(title) && !/^placeholder\s*:/i.test(title);
      });
  }

  function hasUsableVotes(votes) {
    return (votes || []).some((vote) => {
      const title = String(vote?.title || "");
      const number = String(vote?.billNumber || "");
      if (/^seed\s*:/i.test(title) || /^placeholder\s*:/i.test(title)) return false;
      if (/-seed-/i.test(number) || /-ph-/i.test(number)) return false;
      return Boolean(title || number);
    });
  }

  async function loadMatchRows(bioguide) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user || !bioguide) return { user: null, rows: [] };

    const { data, error } = await client
      .from("stance_vote_matches")
      .select(
        "bill_id, user_stance, member_vote, matched, roll_call_number, congress, vote_result, bill:bill_id(id, bill_number, title, tags, official_url, short_pitch, level)"
      )
      .eq("user_id", user.id)
      .ilike("bioguide_id", bioguide)
      .not("member_vote", "is", null)
      .order("updated_at", { ascending: false });

    if (error) {
      console.warn(error);
      return { user, rows: [] };
    }
    const rows =
      typeof enrichActionMatchRows === "function"
        ? await enrichActionMatchRows(client, data || [])
        : data || [];
    return { user, rows };
  }

  function normalizeLegislationTypeLocal(type) {
    return String(type || "")
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function legislationKeyFromParts(congress, billType, legislationNumber) {
    const c = Number(congress || 0);
    const t = normalizeLegislationTypeLocal(billType);
    const n = String(legislationNumber || "").replace(/\D/g, "");
    if (!c || !t || !n) return "";
    return `${c}:${t}:${n}`;
  }

  function parseBillNumberPartsLocal(billNumber) {
    const match = String(billNumber || "")
      .trim()
      .match(
        /^(h\.?\s*r\.?|s\.?|s\.?\s*j\.?\s*res\.?|h\.?\s*j\.?\s*res\.?|s\.?\s*con\.?\s*res\.?|h\.?\s*con\.?\s*res\.?|[a-z.]+)\s*(\d+)/i
      );
    if (!match) return null;
    return {
      billType: normalizeLegislationTypeLocal(match[1]),
      legislationNumber: match[2],
    };
  }

  function legislationKeyFromVote(vote = {}) {
    const id = String(vote.billId || vote.id || "").toLowerCase();
    const fromId = id.match(/federal-(?:bill-)?(\d{2,3})-([a-z]+)-(\d+)/);
    if (fromId) {
      return legislationKeyFromParts(fromId[1], fromId[2], fromId[3]);
    }
    const meta = parseRollMetaFromBillId(id);
    if (meta.legislationType && meta.legislationNumber) {
      return legislationKeyFromParts(
        meta.congress || 119,
        meta.legislationType,
        meta.legislationNumber
      );
    }
    const parts = parseBillNumberPartsLocal(vote.billNumber || vote.bill_number);
    if (parts) {
      return legislationKeyFromParts(
        vote.congress || meta.congress || 119,
        parts.billType,
        parts.legislationNumber
      );
    }
    return "";
  }

  function legislationKeyFromBillRow(row = {}) {
    const id = String(row.bill_id || row.id || row.roll_call_id || "").toLowerCase();
    const fromId = id.match(/federal-(?:bill-)?(\d{2,3})-([a-z]+)-(\d+)/);
    if (fromId) {
      return legislationKeyFromParts(fromId[1], fromId[2], fromId[3]);
    }
    const parts = parseBillNumberPartsLocal(
      row.bill_number || row.legislation_number
        ? `${row.bill_type || ""} ${row.legislation_number || row.bill_number || ""}`
        : row.bill_number
    );
    if (parts) {
      return legislationKeyFromParts(
        row.congress || row.metadata?.congress || 119,
        row.bill_type || parts.billType,
        row.legislation_number || parts.legislationNumber
      );
    }
    if (row.bill_type && (row.legislation_number || row.bill_number)) {
      return legislationKeyFromParts(
        row.congress || 119,
        row.bill_type,
        row.legislation_number || row.bill_number
      );
    }
    return "";
  }

  /**
   * Load the signed-in user's stances once, keyed by exact bill_id and by
   * legislation (congress:type:number) so Senate quiz answers apply to House.
   */
  async function loadUserStanceIndex() {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    const byBillId = new Map();
    const byLegislationKey = new Map();
    if (!client || !user) {
      return { user: null, client: null, byBillId, byLegislationKey };
    }

    const { data: stances, error } = await client
      .from("bill_stances")
      .select("bill_id, stance, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) {
      console.warn(error);
      return { user, client, byBillId, byLegislationKey };
    }

    const ids = [];
    for (const row of stances || []) {
      const billId = String(row.bill_id || "").trim();
      const stance = String(row.stance || "").toLowerCase();
      if (!billId || !stance) continue;
      if (!byBillId.has(billId)) byBillId.set(billId, stance);
      ids.push(billId);
      const federalKey = legislationKeyFromBillRow({ bill_id: billId });
      if (federalKey && !byLegislationKey.has(federalKey)) {
        byLegislationKey.set(federalKey, stance);
      }
    }

    if (ids.length) {
      const [billItemsRes, processedRes] = await Promise.all([
        client
          .from("bill_items")
          .select("id, bill_number, metadata")
          .in("id", ids),
        client
          .from("processed_votes")
          .select(
            "roll_call_id, bill_number, bill_type, legislation_number, congress"
          )
          .in("roll_call_id", ids),
      ]);
      if (billItemsRes.error) console.warn(billItemsRes.error);
      if (processedRes.error) console.warn(processedRes.error);

      for (const item of billItemsRes.data || []) {
        const stance = byBillId.get(String(item.id));
        if (!stance) continue;
        const meta = item.metadata || {};
        const key =
          legislationKeyFromBillRow({
            bill_id: item.id,
            bill_number: item.bill_number,
            congress: meta.congress,
            bill_type: meta.legislationType || meta.bill_type,
            legislation_number:
              meta.legislationNumber || meta.legislation_number,
          }) ||
          legislationKeyFromParts(
            meta.congress || 119,
            meta.legislationType,
            meta.legislationNumber
          );
        if (key && !byLegislationKey.has(key)) {
          byLegislationKey.set(key, stance);
        }
      }

      for (const row of processedRes.data || []) {
        const stance = byBillId.get(String(row.roll_call_id));
        if (!stance) continue;
        const key = legislationKeyFromBillRow(row);
        if (key && !byLegislationKey.has(key)) {
          byLegislationKey.set(key, stance);
        }
      }
    }

    return { user, client, byBillId, byLegislationKey };
  }

  function resolveStanceForVote(vote, stanceIndex) {
    if (!vote || !stanceIndex) return "";
    const billId = String(vote.billId || vote.id || "").trim();
    if (billId && stanceIndex.byBillId.has(billId)) {
      return stanceIndex.byBillId.get(billId);
    }
    const key = legislationKeyFromVote(vote);
    if (key && stanceIndex.byLegislationKey.has(key)) {
      return stanceIndex.byLegislationKey.get(key);
    }
    return "";
  }

  /**
   * Project the user's existing (often Senate) stances onto this member's
   * recent votes so House Action Match scores fill in without re-quizzing.
   */
  async function projectStancesOntoMember(profile, votes = []) {
    const bioguide = String(profile?.bioguideId || "").toUpperCase();
    if (!bioguide || !votes.length) {
      return { projected: 0, stanceIndex: null };
    }

    const stanceIndex = await loadUserStanceIndex();
    const { user, client } = stanceIndex;
    if (!user || !client) {
      return { projected: 0, stanceIndex };
    }

    const rows = [];
    for (const vote of votes) {
      const stance = resolveStanceForVote(vote, stanceIndex);
      const memberVote = positionToMemberVote(vote.votePosition);
      if (!stance || !memberVote) continue;
      if (memberVote === "Present" || memberVote === "Not Voting") continue;

      const item = quizBillItemFromVote(vote, profile);
      if (!item?.id) continue;
      const matched = stanceMatchesPosition(stance, vote.votePosition);
      if (matched == null) continue;

      try {
        await upsertQuizBillItem(client, item);
      } catch (error) {
        console.warn(error);
      }

      rows.push({
        user_id: user.id,
        bill_id: item.id,
        bioguide_id: bioguide,
        politician_name: profile.name || bioguide,
        politician_level: "federal",
        user_stance: stance,
        member_vote: memberVote,
        matched,
        roll_call_number: item.rollCallNumber || null,
        congress: item.congress || null,
        session_number: item.sessionNumber || null,
        vote_result: null,
        updated_at: new Date().toISOString(),
      });
    }

    if (!rows.length) {
      return { projected: 0, stanceIndex };
    }

    const { error } = await client.from("stance_vote_matches").upsert(rows, {
      onConflict: "user_id,bill_id,bioguide_id",
    });
    if (error) {
      console.warn("projectStancesOntoMember failed:", error.message || error);
      return { projected: 0, stanceIndex };
    }
    return { projected: rows.length, stanceIndex };
  }

  async function loadStanceMapForVotes(votes = []) {
    const stanceIndex = await loadUserStanceIndex();
    const map = new Map();
    for (const vote of votes || []) {
      const billId = String(vote.billId || vote.id || "").trim();
      if (!billId) continue;
      const stance = resolveStanceForVote(vote, stanceIndex);
      if (stance) map.set(billId, stance);
    }
    return {
      user: stanceIndex.user,
      client: stanceIndex.client,
      map,
      stanceIndex,
    };
  }

  function toRosterPerson(profile, enrich) {
    const roster = enrich?.roster || {};
    const overview = enrich?.overview || {};
    const bioguide = String(
      profile.bioguideId || roster.bioguide_id || overview.bioguide_id || ""
    )
      .trim()
      .toUpperCase();
    return {
      id:
        profile.rosterPoliticianId ||
        roster.id ||
        null,
      name: profile.name || roster.name || overview.name,
      party: profile.party || roster.party || overview.party,
      bioguide_id: bioguide || null,
      bioguideId: bioguide || null,
      external_key:
        roster.external_key || (bioguide ? `federal:${bioguide}` : null),
      level: roster.level || overview.level || "federal",
      chamber:
        roster.chamber ||
        (profile.chamber === "Senate"
          ? "senate"
          : profile.chamber === "House"
            ? "house"
            : profile.chamber),
      state: profile.state || roster.state || overview.state,
      district: profile.district || roster.district || overview.district,
      office_title:
        overview.office_title ||
        roster.office_title ||
        officeBadgeLabel(profile, overview),
      photo_url: profile.photoUrl || roster.photo_url || overview.photo_url,
      website_url: profile.website || roster.website_url || overview.website_url,
      phone: profile.phone || roster.phone || overview.phone,
      metadata: roster.metadata || {},
      tenure: overview.tenure || null,
    };
  }

  async function ensureFollowState() {
    followUser = typeof getUser === "function" ? await getUser() : null;
    followedPoliticianIds = new Set();
    if (followUser && typeof loadFollowedPoliticianIds === "function") {
      followedPoliticianIds = await loadFollowedPoliticianIds(followUser.id);
    }
  }

  async function resolveFollowTargetId(person) {
    if (!person) return null;
    let id = person.id || null;
    if (!id && typeof resolveRosterId === "function") {
      id = await resolveRosterId(person);
    }
    if (!id && typeof upsertPoliticianRecord === "function") {
      const record = await upsertPoliticianRecord(person);
      id = record?.id || null;
      if (id) person.id = id;
    }
    return id ? String(id) : null;
  }

  async function toggleFollowForPerson(person, { announce = true } = {}) {
    if (!person) throw new Error("No official selected.");
    const user = typeof getUser === "function" ? await getUser() : null;
    followUser = user;
    if (!user) {
      writePendingFollow({
        id: person.id || null,
        bioguideId: person.bioguide_id || person.bioguideId || null,
        name: person.name || null,
        createdAt: Date.now(),
      });
      promptScorecardAuth({
        title: "Follow officials with a free account",
        body: "Create a free account to follow representatives, save votes, and get alerts when they act.",
      });
      return { redirected: true };
    }

    const id = await resolveFollowTargetId(person);
    if (!id) {
      throw new Error("Could not resolve this official to follow.");
    }
    person.id = id;

    if (!followedPoliticianIds.size && typeof loadFollowedPoliticianIds === "function") {
      followedPoliticianIds = await loadFollowedPoliticianIds(user.id);
    }

    let following = false;
    if (followedPoliticianIds.has(id)) {
      await unfollowPolitician(user.id, id);
      followedPoliticianIds.delete(id);
      following = false;
      if (announce) {
        setStatus(
          `Unfollowed ${person.name || "this official"}.`,
          "success"
        );
        if (typeof showAppToast === "function") {
          showAppToast(`Unfollowed ${person.name || "this official"}.`, "info");
        }
      }
    } else {
      await followPolitician(user.id, id);
      followedPoliticianIds.add(id);
      following = true;
      if (announce) {
        setStatus(
          `Following ${person.name || "this official"} — their actions will show in My Feed.`,
          "success"
        );
        if (typeof showAppToast === "function") {
          showAppToast(`Following ${person.name || "this official"}.`, "success");
        }
      }
    }
    syncFollowButton();
    return { following, id };
  }

  async function completePendingFollowIfNeeded(person) {
    const pending = pendingFollowMatches(person);
    if (!pending || !followUser || !person) return;
    writePendingFollow(null);
    try {
      const id = await resolveFollowTargetId(person);
      if (!id) return;
      person.id = id;
      if (followedPoliticianIds.has(id)) {
        syncFollowButton();
        setStatus(
          `You’re already following ${person.name || "this official"}.`,
          "success"
        );
        return;
      }
      await followPolitician(followUser.id, id);
      followedPoliticianIds.add(id);
      syncFollowButton();
      setStatus(
        `Following ${person.name || "this official"} — their actions will show in My Feed.`,
        "success"
      );
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Could not complete follow after sign-in.", "error");
    }
  }

  function syncFollowButton() {
    const button = $("scorecard-follow-btn");
    if (!button) return;
    const id = activeRosterPerson?.id
      ? String(activeRosterPerson.id)
      : "";
    const following = Boolean(id && followedPoliticianIds.has(id));
    button.classList.toggle("is-following", following);
    button.setAttribute("aria-pressed", following ? "true" : "false");
    button.setAttribute(
      "aria-label",
      following
        ? `Following ${activeRosterPerson?.name || "this official"}. Activate to unfollow.`
        : `Follow ${activeRosterPerson?.name || "this official"}`
    );
    button.title = following
      ? "Following — hover to unfollow"
      : "Follow this official to see their actions in My Feed";
  }

  function bindFollowButton() {
    const button = $("scorecard-follow-btn");
    if (!button || button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    syncFollowButton();

    button.addEventListener("click", async () => {
      if (!activeRosterPerson) return;
      button.disabled = true;
      try {
        const result = await toggleFollowForPerson(activeRosterPerson);
        if (result?.redirected) return;
      } catch (error) {
        console.error(error);
        setStatus(error.message || "Could not update follow.", "error");
      } finally {
        button.disabled = false;
      }
    });
  }

  function noteHasContent() {
    return Boolean(String(politicianNote?.body || "").trim());
  }

  function setNotesStatus(message, type = "loading") {
    const el = $("scorecard-notes-status");
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
    el.dataset.type = type;
  }

  function refreshNoteUi() {
    const button = $("scorecard-note-open");
    const label = button?.querySelector(".politician-profile-note-btn__label");
    const preview = $("scorecard-note-preview");
    const editBtn = document.querySelector(
      "#scorecard-note-popover [data-note-action='edit']"
    );
    const clearBtn = $("scorecard-note-clear");
    const text = noteHasContent() ? "Your Journal" : "Journal";
    if (label) label.textContent = text;
    if (button) {
      button.setAttribute(
        "aria-label",
        noteHasContent()
          ? `Your Journal for ${activeRosterPerson?.name || "this official"}`
          : `Journal for ${activeRosterPerson?.name || "this official"}`
      );
    }
    if (preview) {
      if (noteHasContent()) {
        preview.textContent = String(politicianNote.body);
        preview.classList.remove("is-empty");
      } else {
        preview.textContent =
          "No Journal yet. Add a private Journal for this official.";
        preview.classList.add("is-empty");
      }
    }
    if (editBtn) {
      editBtn.textContent = noteHasContent() ? "Edit Journal" : "Add Journal";
    }
    const bodyInput = $("scorecard-note-body");
    const modal = $("scorecard-notes-modal");
    if (bodyInput && modal && !modal.hidden) {
      bodyInput.value = String(politicianNote?.body || "");
    }
    if (clearBtn) clearBtn.hidden = !noteHasContent();
  }

  function getNoteWrap() {
    return $("scorecard-note-wrap");
  }

  function getNotePopover() {
    return $("scorecard-note-popover");
  }

  function showNotePopover() {
    const wrap = getNoteWrap();
    const popover = getNotePopover();
    const button = $("scorecard-note-open");
    if (!wrap || !popover) return;
    global.clearTimeout(notePopoverHideTimer);
    popover.hidden = false;
    wrap.classList.add("is-open");
    button?.setAttribute("aria-expanded", "true");
  }

  function hideNotePopover({ immediate = false } = {}) {
    const run = () => {
      const wrap = getNoteWrap();
      const popover = getNotePopover();
      const button = $("scorecard-note-open");
      if (!popover) return;
      popover.hidden = true;
      wrap?.classList.remove("is-open");
      button?.setAttribute("aria-expanded", "false");
    };
    global.clearTimeout(notePopoverHideTimer);
    if (immediate) run();
    else notePopoverHideTimer = global.setTimeout(run, 140);
  }

  function bindNotePopover() {
    const wrap = getNoteWrap();
    if (!wrap || wrap.dataset.bound === "1") return;
    wrap.dataset.bound = "1";
    wrap.addEventListener("mouseenter", () => showNotePopover());
    wrap.addEventListener("mouseleave", () => hideNotePopover());
    wrap.addEventListener("focusin", () => showNotePopover());
    wrap.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) hideNotePopover();
    });
  }

  function openNotesModal() {
    const modal = $("scorecard-notes-modal");
    if (!modal) return;
    hideNotePopover({ immediate: true });
    notesModalLastFocus = document.activeElement;
    const bodyInput = $("scorecard-note-body");
    if (bodyInput) bodyInput.value = String(politicianNote?.body || "");
    const clearBtn = $("scorecard-note-clear");
    if (clearBtn) clearBtn.hidden = !noteHasContent();
    modal.hidden = false;
    document.body.classList.add("politician-notes-modal-open");
    bodyInput?.focus?.();
  }

  function closeNotesModal() {
    const modal = $("scorecard-notes-modal");
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("politician-notes-modal-open");
    setNotesStatus("", "loading");
    if (notesModalLastFocus && typeof notesModalLastFocus.focus === "function") {
      notesModalLastFocus.focus();
    } else {
      $("scorecard-note-open")?.focus();
    }
  }

  async function resolveRosterId(person) {
    if (person?.id && /^[0-9a-f-]{36}$/i.test(String(person.id))) {
      return String(person.id);
    }
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    if (!client || !person) return null;
    const bioguide = String(person.bioguide_id || person.bioguideId || "").trim();
    if (bioguide) {
      const { data } = await client
        .from("politicians")
        .select("id")
        .ilike("bioguide_id", bioguide)
        .limit(1)
        .maybeSingle();
      if (data?.id) {
        person.id = data.id;
        return String(data.id);
      }
    }
    if (typeof upsertPoliticianRecord === "function" && person.name) {
      try {
        const record = await upsertPoliticianRecord(person);
        if (record?.id) {
          person.id = record.id;
          return String(record.id);
        }
      } catch (error) {
        console.warn(error);
      }
    }
    return null;
  }

  async function loadNoteForPerson(person, user) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    if (!client || !user || !person) {
      politicianNote = null;
      refreshNoteUi();
      return;
    }
    const politicianId = await resolveRosterId(person);
    const name = String(person.name || "").trim();
    const byId = new Map();
    const selectCols =
      "id, kind, title, body, politician_id, politician_name, action_date, created_at, updated_at";

    if (politicianId) {
      const { data, error } = await client
        .from("civic_actions")
        .select(selectCols)
        .eq("user_id", user.id)
        .eq("kind", "note")
        .eq("politician_id", politicianId);
      if (error) console.warn(error);
      for (const row of data || []) byId.set(row.id, row);
    }
    if (name) {
      const { data, error } = await client
        .from("civic_actions")
        .select(selectCols)
        .eq("user_id", user.id)
        .eq("kind", "note")
        .eq("politician_name", name);
      if (error) console.warn(error);
      for (const row of data || []) byId.set(row.id, row);
    }

    const rows = [...byId.values()].sort((a, b) =>
      String(b.updated_at || b.created_at || "").localeCompare(
        String(a.updated_at || a.created_at || "")
      )
    );
    politicianNote = rows[0] || null;
    refreshNoteUi();
  }

  async function saveNote() {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user) {
      promptScorecardAuth({
        title: "File a Journal with a free account",
        body: "Create a free account to keep private notes on meetings and follow-ups with your representatives.",
      });
      return;
    }
    const bodyInput = $("scorecard-note-body");
    const body = String(bodyInput?.value || "").trim();
    if (!body) {
      setNotesStatus("Write something before filing.", "error");
      return;
    }
    const politicianId = await resolveRosterId(activeRosterPerson);
    const politicianName =
      String(activeRosterPerson?.name || "").trim() || null;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

    try {
      if (politicianNote?.id) {
        const { error } = await client
          .from("civic_actions")
          .update({
            body,
            title: null,
            politician_id: politicianId || politicianNote.politician_id || null,
            politician_name: politicianName,
            action_date: today,
            updated_at: now,
          })
          .eq("id", politicianNote.id)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { data, error } = await client
          .from("civic_actions")
          .insert({
            user_id: user.id,
            kind: "note",
            title: null,
            body,
            politician_id: politicianId,
            politician_name: politicianName,
            action_date: today,
            contact_method: null,
          })
          .select(
            "id, kind, title, body, politician_id, politician_name, action_date, created_at, updated_at"
          )
          .maybeSingle();
        if (error) throw error;
        politicianNote = data;
      }
      await loadNoteForPerson(activeRosterPerson, user);
      setNotesStatus("Journal filed.", "success");
    } catch (error) {
      console.error(error);
      setNotesStatus(error.message || "Could not file Journal.", "error");
    }
  }

  async function clearNote() {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user || !politicianNote?.id) return;
    try {
      const { error } = await client
        .from("civic_actions")
        .delete()
        .eq("id", politicianNote.id)
        .eq("user_id", user.id);
      if (error) throw error;
      politicianNote = null;
      const bodyInput = $("scorecard-note-body");
      if (bodyInput) bodyInput.value = "";
      refreshNoteUi();
      setNotesStatus("Journal cleared.", "success");
    } catch (error) {
      console.error(error);
      setNotesStatus(error.message || "Could not clear Journal.", "error");
    }
  }

  function ensureNotesHandlers() {
    if (notesBound) return;
    notesBound = true;
    const modal = $("scorecard-notes-modal");
    modal?.addEventListener("click", (event) => {
      if (event.target?.dataset?.closeNotes) closeNotesModal();
    });
    $("scorecard-note-save")?.addEventListener("click", () => {
      saveNote();
    });
    $("scorecard-note-clear")?.addEventListener("click", () => {
      clearNote();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeNotesModal();
    });
  }

  function bindHeroActions() {
    ensureNotesHandlers();
    bindFollowButton();
    bindNotePopover();
    syncFollowButton();
    refreshNoteUi();

    const hero = $("scorecard-hero");
    if (!hero || hero.dataset.noteClicks === "1") return;
    hero.dataset.noteClicks = "1";
    hero.addEventListener("click", (event) => {
      const openBtn = event.target.closest("#scorecard-note-open");
      const action = event.target.closest("[data-note-action]");
      if (action) {
        const kind = action.dataset.noteAction;
        if (kind === "open" || kind === "edit") openNotesModal();
        return;
      }
      if (openBtn) {
        if (global.matchMedia("(hover: none)").matches) openNotesModal();
        else showNotePopover();
      }
    });
  }

  function summarizeMatch(matchPayload) {
    const { user, rows } = matchPayload || { user: null, rows: [] };
    const compared = (rows || []).filter((row) => row.matched != null);
    const matched = compared.filter((row) => row.matched === true);
    const score =
      !user || compared.length === 0
        ? null
        : Math.round((matched.length / compared.length) * 100);
    return {
      user: user || null,
      compared: compared.length,
      matched: matched.length,
      score,
      rows: rows || [],
    };
  }

  function matchScoreToneClass(score) {
    if (score == null) return "";
    if (score >= 70) return "is-high";
    if (score >= 40) return "is-mid";
    return "is-low";
  }

  function renderHeroMatchBadge(summary) {
    const score = summary?.score;
    const tone = matchScoreToneClass(score);
    const value = score == null ? "—" : `${score}%`;
    const aria =
      score == null
        ? "Action Match Score unavailable"
        : `Action Match Score ${score} percent`;
    return `
      <div class="scorecard-hero__match" aria-label="${escapeHtml(aria)}">
        <div class="politician-match-hero__score ${tone}">
          <span class="politician-match-hero__value">${escapeHtml(value)}</span>
          <span class="politician-match-hero__label">Action Match Score</span>
        </div>
      </div>
    `;
  }

  function renderHero(el, profile, enrich, matchSummary) {
    if (!el || !profile) return;
    const overview = enrich?.overview || {};
    const kind = partyKind(profile.party || overview.party);
    const partyText = partyLabel(kind, profile.party || overview.party);
    const photoUrl =
      profile.photoUrl || overview.photo_url || enrich?.roster?.photo_url || "";
    const photo = photoUrl
      ? `<img class="scorecard-hero__photo" src="${escapeHtml(
          photoUrl
        )}" alt="" />`
      : `<div class="scorecard-hero__photo scorecard-hero__photo--fallback" aria-hidden="true">${escapeHtml(
          String(profile.name || "")
            .split(/\s+/)
            .slice(0, 2)
            .map((p) => p[0] || "")
            .join("")
        )}</div>`;
    const tenure = tenureLabel(profile, overview);
    const role = districtLabel(profile);
    const pills = buildContactPills(profile, enrich);

    el.innerHTML = `
      <div class="scorecard-hero__media">${photo}</div>
      <div class="scorecard-hero__body">
        <div class="scorecard-hero__badges">
          <span class="scorecard-hero__badge">${escapeHtml(
            officeBadgeLabel(profile, overview)
          )}</span>
          <span class="scorecard-hero__badge scorecard-hero__badge--level">Federal</span>
          <span class="politician-card__party ${partyClassName(
            profile.party || overview.party
          )}">${escapeHtml(partyText)}</span>
        </div>
        <h2 class="scorecard-hero__name">${escapeHtml(profile.name)}</h2>
        <p class="scorecard-hero__role">${escapeHtml(role)}</p>
        ${
          tenure
            ? `<p class="scorecard-hero__tenure">${escapeHtml(tenure)}</p>`
            : ""
        }
        <div class="politician-profile-actions">
          <div class="politician-profile-actions__row">
            <button
              type="button"
              id="scorecard-follow-btn"
              class="politician-profile-follow-btn"
              aria-pressed="false"
            >
              <span class="politician-profile-follow-btn__icon" aria-hidden="true">
                <span class="politician-profile-follow-btn__icon-plus">+</span>
                <span class="politician-profile-follow-btn__icon-check">✓</span>
              </span>
              <span class="politician-profile-follow-btn__label">
                <span class="politician-profile-follow-btn__label-follow">Follow</span>
                <span class="politician-profile-follow-btn__label-following">Following</span>
                <span class="politician-profile-follow-btn__label-unfollow">Unfollow</span>
              </span>
            </button>
            <div class="politician-profile-note-wrap" id="scorecard-note-wrap">
              <button
                type="button"
                id="scorecard-note-open"
                class="politician-profile-note-btn"
                aria-haspopup="true"
                aria-expanded="false"
                aria-controls="scorecard-note-popover"
              >
                <span class="politician-profile-note-btn__icon" aria-hidden="true">📝</span>
                <span class="politician-profile-note-btn__label">Journal</span>
              </button>
              <div
                id="scorecard-note-popover"
                class="politician-profile-note-popover"
                role="dialog"
                aria-label="Journal preview"
                hidden
              >
                <p class="politician-profile-note-popover__kicker">Your Journal</p>
                <div
                  id="scorecard-note-preview"
                  class="politician-profile-note-popover__body"
                ></div>
                <div class="politician-profile-note-popover__actions">
                  <button type="button" class="refresh-btn" data-note-action="open">
                    Open
                  </button>
                  <button
                    type="button"
                    class="politician-profile-note-popover__secondary"
                    data-note-action="edit"
                  >
                    Add Journal
                  </button>
                </div>
              </div>
            </div>
          </div>
          <p class="politician-profile-follow__hint">
            Follow for Docket updates · Journal stays private to you
          </p>
        </div>
        <div class="politician-profile-contact" aria-label="Contact links">
          ${
            pills.length
              ? pills
                  .map((pill) => {
                    const extra = pill.external
                      ? ' target="_blank" rel="noopener noreferrer"'
                      : "";
                    return `<a class="politician-profile-contact__link" href="${escapeHtml(
                      pill.href
                    )}"${extra}>${escapeHtml(pill.label)}</a>`;
                  })
                  .join("")
              : `<span class="politician-profile-contact__empty">No public contact links on file.</span>`
          }
        </div>
      </div>
      ${renderHeroMatchBadge(matchSummary)}
    `;

    bindHeroActions();
  }

  function renderMatch(section, bodyEl, ledeEl, profile, matchPayload, options = {}) {
    if (!section || !bodyEl) return;
    section.hidden = false;
    const chamberLabel =
      profile.chamber === "Senate" ? "Senate" : "House";
    const personName = profile.name || "this official";
    const summary = summarizeMatch(matchPayload);
    const { user, rows } = matchPayload || { user: null, rows: [] };

    if (ledeEl) {
      ledeEl.textContent =
        profile.chamber === "Senate"
          ? "Your Support / Oppose stances compared to this senator’s Senate roll-call votes."
          : "Your Support / Oppose stances compared to this official’s House roll-call votes.";
    }

    if (!user) {
      bodyEl.innerHTML = `
        <p class="politician-profile-empty">
          <a href="${escapeHtml(authNextHref())}">Sign in</a>
          and Support or Oppose bills to build your Action Match Score with ${escapeHtml(
            personName
          )}.
        </p>
        <p class="politician-quick-match">
          <button type="button" class="refresh-btn" data-open-match-quiz="1">🎯 Match My Votes</button>
          <a class="scorecard-match__quiz-link" href="onboarding.html">Or take Voter Pulse</a>
        </p>`;
      return summary;
    }

    const compared = (rows || []).filter((row) => row.matched != null);
    const matched = compared.filter((row) => row.matched === true);
    const score = summary.score;
    const agree = compared.filter((row) => row.matched === true);
    const differ = compared.filter((row) => row.matched === false);

    const categoryMap = new Map();
    for (const row of compared) {
      const bill = row.bill || {};
      const category =
        row.category || categorizeBill(bill, row.voteCopy || null);
      row.category = category;
      const entry = categoryMap.get(category) || {
        key: category,
        compared: 0,
        matched: 0,
      };
      entry.compared += 1;
      if (row.matched === true) entry.matched += 1;
      categoryMap.set(category, entry);
    }
    const categories = [...categoryMap.values()].sort(
      (a, b) => b.compared - a.compared
    );

    const billLink = (row) =>
      typeof renderActionMatchScorecardItem === "function"
        ? renderActionMatchScorecardItem(row, escapeHtml)
        : `<li class="scorecard-match-item">${escapeHtml(
            row.bill?.title || row.bill_id || "Roll call"
          )}</li>`;

    if (compared.length === 0) {
      bodyEl.innerHTML = `
        <p class="politician-match-hero__meta">
          Support or Oppose recent roll calls to calculate your Action Match Score with ${escapeHtml(
            personName
          )}. Your score appears in the profile card above.
        </p>
        <p class="politician-quick-match">
          <button type="button" class="refresh-btn" data-open-match-quiz="1">🎯 Match My Votes</button>
          <a class="scorecard-match__quiz-link" href="onboarding.html">Or take Voter Pulse</a>
        </p>`;
      return summary;
    }

    const topicFilters = POLICY_TOPIC_FILTERS.map((topic, index) => {
      const value = topic === "All Topics" ? "all" : topic;
      return `<button
          type="button"
          class="scorecard-topic-chip${index === 0 ? " is-active" : ""}"
          data-match-topic-filter="${escapeHtml(value)}"
          aria-pressed="${index === 0 ? "true" : "false"}"
        >${escapeHtml(topic)}</button>`;
    }).join("");

    bodyEl.innerHTML = `
      <p class="scorecard-match__summary">
        ${matched.length} of ${compared.length} comparable ${escapeHtml(
          chamberLabel
        )} roll calls match your stance${
          score == null ? "" : ` · <strong>${score}% Action Match</strong>`
        }.
      </p>

      <div class="scorecard-topic-filters" role="toolbar" aria-label="Filter by policy topic">
        ${topicFilters}
      </div>

      <div class="politician-match-categories" aria-label="Category breakdown">
        ${categories
          .map((row) => {
            const pct = Math.max(
              0,
              Math.min(100, Math.round((row.matched / row.compared) * 100))
            );
            return `<div class="politician-match-categories__row">
              <span class="politician-match-categories__label" title="${escapeHtml(
                row.key
              )}">${escapeHtml(row.key)}</span>
              <strong class="politician-match-categories__pct">${pct}%</strong>
              <div class="politician-match-categories__track" aria-hidden="true"><i style="width:${pct}%"></i></div>
            </div>`;
          })
          .join("")}
      </div>

      <div class="politician-match-split">
        <div>
          <h3>Where You Agree</h3>
          <ul class="politician-profile-list" data-match-list="agree">
            ${
              agree.length
                ? agree.slice(0, 12).map(billLink).join("")
                : `<li class="politician-profile-empty" data-match-empty="agree">No matching votes yet.</li>`
            }
          </ul>
          <p class="scorecard-topic-empty" data-match-filter-empty="agree" hidden>No agreeing votes in this topic.</p>
        </div>
        <div>
          <h3>Where You Differ</h3>
          <ul class="politician-profile-list" data-match-list="differ">
            ${
              differ.length
                ? differ.slice(0, 12).map(billLink).join("")
                : `<li class="politician-profile-empty" data-match-empty="differ">No diverging votes yet.</li>`
            }
          </ul>
          <p class="scorecard-topic-empty" data-match-filter-empty="differ" hidden>No differing votes in this topic.</p>
        </div>
      </div>
    `;
    bindMatchListInteractions(bodyEl);
    const industryTopic = policyCategoryFromIndustry(options.industryFilter || "");
    bindMatchTopicFilters(bodyEl, industryTopic || "all");
    return summary;
  }

  function bindMatchTopicFilters(root, initialTopic = "all") {
    if (!root) return;
    const chips = [
      ...root.querySelectorAll("[data-match-topic-filter]"),
    ];
    if (!chips.length) return;

    const applyFilter = (topic) => {
      chips.forEach((chip) => {
        const active = chip.getAttribute("data-match-topic-filter") === topic;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", active ? "true" : "false");
      });

      ["agree", "differ"].forEach((listKey) => {
        const list = root.querySelector(`[data-match-list="${listKey}"]`);
        if (!list) return;
        let visible = 0;
        list.querySelectorAll("[data-match-item]").forEach((item) => {
          const category = item.getAttribute("data-category") || "";
          const show = topic === "all" || category === topic;
          item.hidden = !show;
          if (show) visible += 1;
        });
        const empty = root.querySelector(
          `[data-match-filter-empty="${listKey}"]`
        );
        if (empty) empty.hidden = visible > 0;
      });
    };

    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        applyFilter(chip.getAttribute("data-match-topic-filter") || "all");
      });
    });

    const start =
      initialTopic &&
      chips.some(
        (chip) => chip.getAttribute("data-match-topic-filter") === initialTopic
      )
        ? initialTopic
        : "all";
    applyFilter(start);
  }

  function openMatchBillDetail(payload) {
    const modal = $("scorecard-match-detail-modal");
    if (!modal || !payload) return;
    if (typeof fillBillBreakdownModal === "function") {
      fillBillBreakdownModal(payload, { prefix: "scorecard-match-detail" });
    }
    modal.hidden = false;
    document.body.classList.add("scorecard-match-detail-open");
    modal.querySelector(".scorecard-match-detail__close")?.focus();
  }

  function closeMatchBillDetail() {
    const modal = $("scorecard-match-detail-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("scorecard-match-detail-open");
  }

  function bindMatchListInteractions(root) {
    if (!root) return;
    if (typeof bindActionMatchProgressiveDisclosure === "function") {
      bindActionMatchProgressiveDisclosure(root, openMatchBillDetail);
      return;
    }
    root.querySelectorAll("[data-open-match-detail]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          const payload = JSON.parse(
            decodeURIComponent(button.getAttribute("data-open-match-detail") || "")
          );
          openMatchBillDetail(payload);
        } catch (error) {
          console.warn(error);
        }
      });
    });
  }

  function bindMatchDetailModalChrome() {
    const modal = $("scorecard-match-detail-modal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-match-detail]")) {
        closeMatchBillDetail();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeMatchBillDetail();
    });
  }

  function clampPct(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  function normalizeFundingSlices(slices = []) {
    const cleaned = slices.map((slice) => ({
      ...slice,
      pct: clampPct(slice.pct),
    }));
    const total = cleaned.reduce((sum, slice) => sum + slice.pct, 0);
    if (total <= 100 || total === 0) return cleaned;
    return cleaned.map((slice) => ({
      ...slice,
      pct: Math.round((slice.pct / total) * 1000) / 10,
    }));
  }

  function renderDonor(el, finance, options = {}) {
    if (!el) return;
    if (!finance) {
      el.innerHTML = `
        <p class="scorecard-card__eyebrow">Donor Alignment</p>
        <h3 class="scorecard-card__title">Where the money comes from</h3>
        <p class="scorecard-empty">
          FEC campaign-finance totals are not available for this member yet.
        </p>`;
      return;
    }
    const selectedIndustrySlug = String(
      options.selectedIndustry || ""
    ).trim();
    const selectedSourceName = String(options.selectedSourceName || "").trim();
    const selectedSector = selectedIndustrySlug
      ? resolveIndustrySector(selectedIndustrySlug)
      : null;
    const selectedIndustryLabel = selectedSector?.label || "";
    const relatedTopic = selectedSector?.policyCategory || null;
    const slices = normalizeFundingSlices([
      {
        key: "small",
        label: "Small Donors (<$200)",
        pct: Number(finance.smallDonorPct) || 0,
      },
      {
        key: "large",
        label: "Large Donors",
        pct: Number(finance.largeDonorPct) || 0,
      },
      { key: "pac", label: "PACs", pct: Number(finance.pacPct) || 0 },
      {
        key: "self",
        label: "Self-Funding",
        pct: Number(finance.selfFundingPct) || 0,
      },
    ]);
    const industries = (
      Array.isArray(finance.topIndustries) ? finance.topIndustries : []
    )
      .map((item) => enrichDonorSourceClient(item))
      .slice(0, 5);
    const top = industries[0];

    el.innerHTML = `
      <p class="scorecard-card__eyebrow">Donor Alignment</p>
      <h3 class="scorecard-card__title">Where the money comes from</h3>
      <p class="scorecard-card__meta">
        ${
          finance.totalRaised != null
            ? `${escapeHtml(formatUsd(finance.totalRaised))}${
                finance.cycle ? ` · ${escapeHtml(finance.cycle)}` : ""
              }`
            : "FEC cycle totals unavailable"
        }
      </p>
      <div class="scorecard-bar" role="img" aria-label="Funding mix">
        ${slices
          .map((slice) =>
            slice.pct > 0
              ? `<span class="is-${slice.key}" style="flex:0 0 ${slice.pct}%; width:${slice.pct}%; max-width:${slice.pct}%"></span>`
              : ""
          )
          .join("")}
      </div>
      <ul class="scorecard-legend">
        ${slices
          .map(
            (slice) => `<li>
              <span class="swatch is-${slice.key}"></span>
              <span>${escapeHtml(slice.label)}</span>
              <strong>${escapeHtml(formatPct(slice.pct))}</strong>
            </li>`
          )
          .join("")}
      </ul>
      <h4 class="scorecard-subtitle">Top contribution sources</h4>
      <p class="scorecard-industries__hint">
        From FEC itemized receipts${
          finance.cycle
            ? ` · cycle ${escapeHtml(String(finance.cycle))}`
            : ""
        }. Tap a source to filter Action Match and Recent Votes by industry.
      </p>
      ${
        industries.length
          ? `<ol class="scorecard-industries" role="list">
              ${industries
                .map((item, index) => {
                  const name = String(item.name || "").trim();
                  const slug = String(item.industry_slug || "").trim();
                  const industryLabel = String(item.industry || "").trim();
                  const selected =
                    selectedIndustrySlug &&
                    ((selectedSourceName &&
                      selectedSourceName.toLowerCase() === name.toLowerCase()) ||
                      (!selectedSourceName &&
                        selectedIndustrySlug === slug));
                  return `<li>
                    <button
                      type="button"
                      class="scorecard-industry${selected ? " is-selected" : ""}"
                      data-industry-slug="${escapeHtml(slug)}"
                      data-industry-label="${escapeHtml(industryLabel)}"
                      data-source-name="${escapeHtml(name)}"
                      aria-pressed="${selected ? "true" : "false"}"
                    >
                      <span class="scorecard-industry__label">${
                        index + 1
                      }. ${escapeHtml(name)}</span>
                      <span class="scorecard-industry__sector">${escapeHtml(
                        industryLabel
                      )}</span>
                      <strong class="scorecard-industry__amount">${escapeHtml(
                        formatUsd(item.amount)
                      )}</strong>
                    </button>
                  </li>`;
                })
                .join("")}
            </ol>`
          : `<p class="scorecard-empty">No itemized employer totals for this FEC cycle yet.</p>`
      }
      ${
        selectedIndustryLabel
          ? `<aside class="scorecard-callout scorecard-callout--filter" role="status">
              <span class="scorecard-callout__badge">Industry filter</span>
              <p><strong>${escapeHtml(selectedIndustryLabel)}</strong>${
                relatedTopic && relatedTopic !== selectedIndustryLabel
                  ? ` · related topic: ${escapeHtml(relatedTopic)}`
                  : ""
              }</p>
              <p>Showing roll calls linked to this industry${
                selectedSourceName
                  ? ` (from ${escapeHtml(selectedSourceName)})`
                  : ""
              }. Tap again or Clear Filter to reset.</p>
              <button type="button" class="refresh-btn scorecard-industry-clear" data-clear-industry="1">
                Clear Filter
              </button>
            </aside>`
          : top
            ? `<aside class="scorecard-callout">
              <span class="scorecard-callout__badge">Money vs. Vote</span>
              <p><strong>${escapeHtml(top.name)}</strong> · ${escapeHtml(
                formatUsd(top.amount)
              )}</p>
              <p>Compare this source’s industry (${escapeHtml(
                top.industry || "Economy & Taxes"
              )}) with related roll-call votes in the feed.</p>
            </aside>`
            : ""
      }
    `;

    el.querySelectorAll("[data-industry-slug]").forEach((button) => {
      button.addEventListener("click", () => {
        const slug = String(
          button.getAttribute("data-industry-slug") || ""
        ).trim();
        const sourceName = String(
          button.getAttribute("data-source-name") || ""
        ).trim();
        if (!slug) return;
        const sameSource =
          selectedIndustrySlug === slug &&
          selectedSourceName.toLowerCase() === sourceName.toLowerCase();
        if (typeof options.onSelectIndustry === "function") {
          options.onSelectIndustry(
            sameSource ? null : { slug, sourceName }
          );
        }
      });
    });
    el.querySelector("[data-clear-industry]")?.addEventListener("click", () => {
      if (typeof options.onSelectIndustry === "function") {
        options.onSelectIndustry(null);
      }
    });
  }

  function renderAttendance(el, attendance) {
    if (!el) return;
    if (!attendance) {
      el.innerHTML =
        '<p class="scorecard-empty">Attendance stats are not available yet.</p>';
      return;
    }
    const missedPct =
      attendance.missedVotePct != null
        ? Number(attendance.missedVotePct)
        : attendance.totalVotes
          ? Math.round(
              (attendance.missedVotes / attendance.totalVotes) * 1000
            ) / 10
          : null;
    const attendancePct =
      missedPct == null ? null : Math.round((100 - missedPct) * 10) / 10;
    const avg = { missed: 2.8, attendance: 97.2, sponsored: 18, bipartisan: 24 };
    const rows = [
      {
        label: "Missed votes",
        member:
          attendance.missedVotes == null
            ? "—"
            : `${attendance.missedVotes}${
                missedPct == null ? "" : ` (${formatPct(missedPct)})`
              }`,
        average: formatPct(avg.missed),
      },
      {
        label: "Attendance rate",
        member: formatPct(attendancePct),
        average: formatPct(avg.attendance),
      },
      {
        label: "Bills sponsored",
        member:
          attendance.sponsoredBillsCount == null
            ? "—"
            : String(attendance.sponsoredBillsCount),
        average: String(avg.sponsored),
      },
      {
        label: "Bipartisan cosponsorship",
        member: formatPct(attendance.bipartisanCosponsorPct),
        average: formatPct(avg.bipartisan),
      },
    ];

    el.innerHTML = `
      <p class="scorecard-card__eyebrow">Attendance & Activity</p>
      <h3 class="scorecard-card__title">How often they show up</h3>
      <div class="scorecard-table">
        <div class="scorecard-table__head">
          <span>Metric</span><span>Member</span><span>Congress avg</span>
        </div>
        ${rows
          .map(
            (row) => `<div class="scorecard-table__row">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(row.member)}</strong>
              <span>${escapeHtml(row.average)}</span>
            </div>`
          )
          .join("")}
      </div>
    `;
  }

  function positionToMemberVote(position) {
    const raw = String(position || "").toUpperCase();
    if (raw === "YES" || raw === "YEA" || raw === "AYE") return "Yea";
    if (raw === "NO" || raw === "NAY") return "Nay";
    if (raw === "ABSTAIN" || raw === "PRESENT") return "Present";
    if (raw === "NOT_VOTING" || raw === "NOT VOTING" || raw === "NV") {
      return "Not Voting";
    }
    return null;
  }

  function stanceMatchesPosition(stance, votePosition) {
    const memberVote = positionToMemberVote(votePosition);
    if (!memberVote || memberVote === "Present" || memberVote === "Not Voting") {
      return null;
    }
    if (stance === "support") return memberVote === "Yea";
    if (stance === "oppose") return memberVote === "Nay";
    return null;
  }

  function parseRollMetaFromBillId(billId) {
    const id = String(billId || "").toLowerCase();
    let match = id.match(/^(?:house|senate)-vote-(\d+)-(\d+)-(\d+)$/);
    if (match) {
      return {
        congress: Number(match[1]),
        sessionNumber: Number(match[2]),
        rollCallNumber: Number(match[3]),
      };
    }
    match = id.match(/^federal-(?:bill-)?(\d+)-([a-z]+)-(\d+)$/);
    if (match) {
      return {
        congress: Number(match[1]),
        legislationType: match[2],
        legislationNumber: match[3],
      };
    }
    return {};
  }

  function quizBillItemFromVote(vote, profile) {
    const billId = engagementBillIdFromVote(vote);
    if (!billId) return null;
    const meta = parseRollMetaFromBillId(String(vote.billId || vote.id || ""));
    const billNumber =
      normalizeBillNumber(vote.billNumber) || vote.billNumber || "Roll call";
    const parts = parseBillNumberPartsLocal(billNumber);
    const congress = meta.congress || vote.congress || 119;
    const legislationType =
      meta.legislationType || parts?.billType || vote.legislationType || null;
    const legislationNumber =
      meta.legislationNumber ||
      parts?.legislationNumber ||
      vote.legislationNumber ||
      null;
    return {
      id: billId,
      billNumber,
      title: formatVoteTitle(vote),
      level: "Federal",
      jurisdiction:
        profile?.chamber === "Senate" ? "U.S. Senate" : "U.S. House",
      shortPitch: buildPlainEnglishSummary(vote) || vote.plainEnglishSummary || "",
      category: vote.category || null,
      votePosition: vote.votePosition,
      voteCast: vote.votePosition || vote.voteCast || null,
      officialUrl: null,
      tags: vote.category ? [vote.category] : [],
      congress,
      sessionNumber: meta.sessionNumber || vote.sessionNumber || null,
      rollCallNumber: meta.rollCallNumber || vote.rollCallNumber || null,
      legislationType,
      legislationNumber,
    };
  }

  /** Prefer legislation-style federal ids so stance/follow sync with Bill Details. */
  function engagementBillIdFromVote(vote = {}) {
    const raw = String(vote.billId || vote.id || "").trim();
    if (/^federal-(?:bill-)?\d{2,3}-[a-z]+-\d+/i.test(raw)) {
      return raw.toLowerCase().replace(/^federal-bill-/, "federal-");
    }
    const key = legislationKeyFromVote(vote);
    if (key) {
      const [congress, type, number] = key.split(":");
      return `federal-${congress}-${type}-${number}`;
    }
    return raw;
  }

  async function upsertQuizBillItem(client, item) {
    const payload = {
      id: item.id,
      bill_number: item.billNumber || "Bill",
      title: item.title || "Untitled",
      level: "Federal",
      jurisdiction: item.jurisdiction || "U.S. Congress",
      primary_sponsor_name: null,
      primary_sponsor_title: null,
      last_updated: new Date().toISOString(),
      status_step_number: 4,
      status_total_steps: 4,
      status_step_name: "Voted",
      short_pitch: item.shortPitch || null,
      delta_summary: { added: [], changed: [], removed: [] },
      official_url: item.officialUrl || null,
      tags: item.tags || [],
      all_steps: [],
      metadata: {
        source: "scorecard-match-quiz",
        congress: item.congress || null,
        sessionNumber: item.sessionNumber || null,
        rollCallNumber: item.rollCallNumber || null,
        legislationType: item.legislationType || null,
        legislationNumber: item.legislationNumber || null,
      },
      updated_at: new Date().toISOString(),
    };
    const { error } = await client.from("bill_items").upsert(payload, {
      onConflict: "id",
    });
    if (error) throw error;
  }

  function setMatchQuizStatus(message, tone) {
    const el = $("scorecard-match-quiz-status");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      el.className = "status";
      return;
    }
    el.hidden = false;
    el.textContent = message;
    el.className = `status${tone ? ` is-${tone}` : ""}`;
  }

  function focusActionMatchSection() {
    const section = $("scorecard-match");
    if (!section) return;
    section.hidden = false;
    section.classList.remove("is-match-focus");
    // Retrigger animation.
    void section.offsetWidth;
    section.classList.add("is-match-focus");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    global.setTimeout(() => section.classList.remove("is-match-focus"), 1800);
  }

  function closeMatchQuizModal() {
    const modal = $("scorecard-match-modal");
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("scorecard-match-modal-open");
    setMatchQuizStatus("");
  }

  function renderMatchQuizBody(bodyEl, votes, profile, stancesMap) {
    if (!bodyEl) return;
    const items = (votes || [])
      .map((vote) => quizBillItemFromVote(vote, profile))
      .filter(Boolean)
      .slice(0, 8);

    if (!items.length) {
      bodyEl.innerHTML = `
        <div class="scorecard-empty scorecard-empty--card" role="status">
          <p>No recent roll-call votes recorded for this representative.</p>
        </div>`;
      return;
    }

    bodyEl.innerHTML = `
      <ol class="scorecard-match-quiz__list">
        ${items
          .map((item, index) => {
            const mine = stancesMap.get(item.id) || null;
            const summary = String(item.shortPitch || "").trim();
            return `<li class="scorecard-match-quiz__card" data-bill-id="${escapeHtml(
              item.id
            )}">
              <div class="scorecard-match-quiz__card-top">
                <span class="scorecard-match-quiz__index">${index + 1}</span>
                ${
                  item.billNumber
                    ? `<span class="scorecard-bill">${escapeHtml(
                        item.billNumber
                      )}</span>`
                    : ""
                }
                ${
                  item.category
                    ? `<span class="scorecard-vote__category">${escapeHtml(
                        item.category
                      )}</span>`
                    : ""
                }
              </div>
              <h3>${escapeHtml(item.title)}</h3>
              ${
                summary
                  ? `<p class="scorecard-match-quiz__summary">${escapeHtml(
                      summary
                    )}</p>`
                  : ""
              }
              <div class="scorecard-match-quiz__actions" role="group" aria-label="Your stance">
                <button
                  type="button"
                  class="scorecard-match-quiz__btn is-support${
                    mine === "support" ? " is-active" : ""
                  }"
                  data-match-stance="support"
                  data-bill-id="${escapeHtml(item.id)}"
                  aria-pressed="${mine === "support"}"
                >Support</button>
                <button
                  type="button"
                  class="scorecard-match-quiz__btn is-oppose${
                    mine === "oppose" ? " is-active" : ""
                  }"
                  data-match-stance="oppose"
                  data-bill-id="${escapeHtml(item.id)}"
                  aria-pressed="${mine === "oppose"}"
                >Oppose</button>
              </div>
              <p class="scorecard-match-quiz__result" data-match-result="${escapeHtml(
                item.id
              )}" ${mine ? "" : "hidden"}>
                ${
                  mine
                    ? mine === "support"
                      ? "You supported this"
                      : "You opposed this"
                    : ""
                }
              </p>
            </li>`;
          })
          .join("")}
      </ol>`;
  }

  async function loadStanceMapForBills(billIds) {
    // Back-compat wrapper: exact bill_id matches only.
    const { user, client, byBillId } = await loadUserStanceIndex();
    const map = new Map();
    for (const id of billIds || []) {
      const key = String(id || "").trim();
      if (key && byBillId.has(key)) map.set(key, byBillId.get(key));
    }
    return { user, client, map };
  }

  async function saveMatchQuizStance({
    item,
    stance,
    profile,
    onScoreRefresh,
  }) {
    const client = typeof getSupabase === "function" ? getSupabase() : null;
    const user = typeof getUser === "function" ? await getUser() : null;
    if (!client || !user) {
      promptScorecardAuth({
        title: "Match My Votes needs an account",
        body: "Create a free account to save your positions, build Action Match, and compare with your representatives.",
      });
      return null;
    }
    await upsertQuizBillItem(client, item);

    const bioguide = String(profile.bioguideId || "").toUpperCase();
    const memberVote = positionToMemberVote(item.votePosition);
    const matched = stanceMatchesPosition(stance, item.votePosition);

    const { error } = await client.from("bill_stances").upsert(
      {
        user_id: user.id,
        bill_id: item.id,
        stance,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,bill_id" }
    );
    if (error) throw error;

    if (bioguide && memberVote) {
      const { error: matchError } = await client
        .from("stance_vote_matches")
        .upsert(
          {
            user_id: user.id,
            bill_id: item.id,
            bioguide_id: bioguide,
            politician_name: profile.name || bioguide,
            politician_level: "federal",
            user_stance: stance,
            member_vote: memberVote,
            matched,
            roll_call_number: item.rollCallNumber || null,
            congress: item.congress || null,
            session_number: item.sessionNumber || null,
            vote_result: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id,bill_id,bioguide_id" }
        );
      if (matchError) console.warn(matchError);
    }

    if (typeof onScoreRefresh === "function") {
      await onScoreRefresh();
    }
    return { stance, matched, memberVote };
  }

  let matchQuizContext = {
    votes: [],
    profile: null,
    onScoreRefresh: null,
  };

  function bindMatchQuizActions(bodyEl) {
    if (!bodyEl || bodyEl.dataset.boundMatchQuiz === "1") return;
    bodyEl.dataset.boundMatchQuiz = "1";
    bodyEl.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-match-stance]");
      if (!button) return;
      const stance = button.dataset.matchStance;
      const billId = button.dataset.billId;
      const { votes, profile, onScoreRefresh } = matchQuizContext;
      const vote = (votes || []).find(
        (row) => String(row.billId || "") === String(billId || "")
      );
      const item = quizBillItemFromVote(vote, profile);
      if (!item || !stance || !profile) return;

      button.disabled = true;
      setMatchQuizStatus("Saving your stance…", "loading");
      try {
        const result = await saveMatchQuizStance({
          item,
          stance,
          profile,
          onScoreRefresh,
        });
        if (!result) return;
        const card = button.closest(".scorecard-match-quiz__card");
        card
          ?.querySelectorAll("[data-match-stance]")
          .forEach((btn) => {
            const active = btn.dataset.matchStance === stance;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", String(active));
          });
        const resultEl = card?.querySelector("[data-match-result]");
        if (resultEl) {
          resultEl.hidden = false;
          const align =
            result.matched === true
              ? " · matches their roll call"
              : result.matched === false
                ? " · differs from their roll call"
                : "";
          resultEl.textContent = `${
            stance === "support" ? "You supported this" : "You opposed this"
          }${align}`;
        }
        setMatchQuizStatus("Action Match updated.", "success");
      } catch (error) {
        console.warn(error);
        setMatchQuizStatus(
          error?.message || "Could not save that stance.",
          "error"
        );
      } finally {
        button.disabled = false;
      }
    });
  }

  async function openMatchQuizModal({
    votes,
    profile,
    onScoreRefresh,
  }) {
    const modal = $("scorecard-match-modal");
    const bodyEl = $("scorecard-match-quiz-body");
    const ledeEl = $("scorecard-match-quiz-lede");
    if (!modal || !bodyEl) {
      focusActionMatchSection();
      return;
    }

    matchQuizContext = {
      votes: votes || [],
      profile: profile || null,
      onScoreRefresh: onScoreRefresh || null,
    };

    focusActionMatchSection();
    modal.hidden = false;
    document.body.classList.add("scorecard-match-modal-open");
    if (ledeEl) {
      ledeEl.textContent = `Support or Oppose recent ${
        profile?.chamber === "Senate" ? "Senate" : "House"
      } roll calls to recalculate your Action Match with ${
        profile?.name || "this representative"
      }.`;
    }

    const items = (votes || [])
      .map((vote) => quizBillItemFromVote(vote, profile))
      .filter(Boolean)
      .slice(0, 8);
    const { map } = await loadStanceMapForVotes(votes || []);
    renderMatchQuizBody(bodyEl, votes, profile, map);
    bindMatchQuizActions(bodyEl);
    setMatchQuizStatus(
      items.length
        ? ""
        : "No recent roll-call votes recorded for this representative.",
      items.length ? "" : "error"
    );
    modal.querySelector(".scorecard-match-modal__close")?.focus();
  }

  function bindMatchQuizModalChrome(getContext) {
    const modal = $("scorecard-match-modal");
    if (!modal || modal.dataset.bound === "1") return;
    modal.dataset.bound = "1";
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-match-quiz]")) {
        closeMatchQuizModal();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeMatchQuizModal();
    });
    document.addEventListener("click", (event) => {
      const trigger = event.target.closest(
        "[data-open-match-quiz], #scorecard-match-cta"
      );
      if (!trigger) return;
      event.preventDefault();
      const ctx = typeof getContext === "function" ? getContext() : null;
      if (!ctx) return;
      openMatchQuizModal(ctx);
    });
  }

  function isDisplayedKeyVote(vote = {}) {
    if (vote.is_key_vote === true || vote.isKeyVote === true) return true;
    if (vote.is_key_vote === false || vote.isKeyVote === false) return false;
    // Fallback for rows not yet re-synced with Claude's gatekeeper.
    const billNumber = String(vote.billNumber || "");
    if (/j\.?\s*res/i.test(billNumber)) return true;
    const kind = String(vote.voteKind || "").toLowerCase();
    if (kind === "final_passage" || kind === "amendment") return true;
    const title = String(vote.title || vote.rawTitle || "");
    if (/war powers|military|authorization/i.test(title)) return true;
    return false;
  }

  function renderVotes(el, votes, query, options = {}) {
    if (!el) return;
    const q = String(query || "").trim().toLowerCase();
    const scope =
      options.scope ||
      el.dataset.voteScope ||
      "key";
    const industryFilter = String(
      options.industryFilter || el.dataset.industryFilter || ""
    ).trim();
    const politicianName = String(
      options.politicianName || el.dataset.politicianName || ""
    ).trim();
    if (politicianName) el.dataset.politicianName = politicianName;
    el.dataset.voteScope = scope;
    if (industryFilter) el.dataset.industryFilter = industryFilter;
    else delete el.dataset.industryFilter;

    const sourceVotes = (votes || []).filter((vote) => {
      const title = String(vote.title || "");
      const number = String(vote.billNumber || "");
      const summary = String(vote.plainEnglishSummary || "");
      if (/^seed\s*:/i.test(title) || /^placeholder\s*:/i.test(title)) return false;
      if (/-seed-/i.test(number) || /-ph-/i.test(number)) return false;
      if (/seeded placeholder|placeholder vote data/i.test(summary)) return false;
      return true;
    });
    // When drilling into an industry, include all votes (not just key) so the
    // Money vs. Vote filter has enough related roll calls to show.
    const effectiveScope = industryFilter ? "all" : scope;
    const scopedVotes =
      effectiveScope === "all"
        ? sourceVotes
        : sourceVotes.filter((vote) => isDisplayedKeyVote(vote));
    const industrySector = industryFilter
      ? resolveIndustrySector(industryFilter)
      : null;
    let industryMatchMode = "direct";
    let industryVotes = industryFilter
      ? scopedVotes.filter((vote) => voteMatchesIndustry(vote, industryFilter))
      : scopedVotes;
    if (industryFilter && !industryVotes.length) {
      const related = scopedVotes.filter((vote) =>
        voteMatchesIndustry(vote, industryFilter, {
          allowRelatedCategory: true,
        })
      );
      if (related.length) {
        industryVotes = related;
        industryMatchMode = "related";
      } else {
        industryMatchMode = "empty";
      }
    }
    const filtered = industryVotes.filter((vote) => {
      if (!q) return true;
      const haystack = [
        vote.billNumber,
        vote.title,
        vote.plainEnglishSummary,
        vote.plain_summary,
        vote.category,
        vote.impacts?.wallet,
        vote.impacts?.community,
        vote.impacts?.rights,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const topics = [
      ...new Set(
        sourceVotes
          .map((vote) => String(vote.category || "").trim())
          .filter(Boolean)
      ),
    ];

    const impactMeta = {
      wallet: { icon: "💳", label: "Wallet Impact", className: "is-wallet" },
      community: {
        icon: "🏙️",
        label: "Community Impact",
        className: "is-community",
      },
      rights: { icon: "⚖️", label: "Rights Impact", className: "is-rights" },
    };

    const selectedIndustryLabel = industryFilter
      ? industryLabelFromFilter(industryFilter)
      : "";

    el.innerHTML = `
      <div class="scorecard-votes__header">
        <div class="scorecard-votes__heading">
          <p class="scorecard-card__eyebrow">Truth in Voting</p>
          <h3 class="scorecard-card__title">Recent roll calls</h3>
        </div>
        <div class="scorecard-votes__tools">
          <button
            type="button"
            id="scorecard-match-cta"
            class="scorecard-match-cta"
            data-open-match-quiz="1"
          >
            <span aria-hidden="true">🎯</span>
            Match My Votes
          </button>
          <label class="scorecard-topic">
            <span>Votes</span>
            <select id="scorecard-vote-scope" aria-label="Vote significance filter" ${
              industryFilter ? "disabled" : ""
            }>
              <option value="key"${
                scope === "key" && !industryFilter ? " selected" : ""
              }>Key Votes</option>
              <option value="all"${
                scope === "all" || industryFilter ? " selected" : ""
              }>All Votes</option>
            </select>
          </label>
          <label class="scorecard-topic">
            <span>Topic</span>
            <select id="scorecard-topic-filter" ${
              industryFilter ? "disabled" : ""
            }>
              <option value="all">All topics</option>
              ${topics
                .map(
                  (topic) =>
                    `<option value="${escapeHtml(topic)}">${escapeHtml(
                      topic
                    )}</option>`
                )
                .join("")}
            </select>
          </label>
        </div>
      </div>
      ${
        industryFilter
          ? `<div class="scorecard-industry-filter-badge" role="status">
              <span>
                ${
                  industryMatchMode === "related"
                    ? `No direct “${escapeHtml(
                        selectedIndustryLabel
                      )}” roll calls — showing related
                        <strong>${escapeHtml(
                          industrySector?.policyCategory || "topic"
                        )}</strong> votes`
                    : `Filtered by industry:
                        <strong>${escapeHtml(selectedIndustryLabel)}</strong>`
                }
              </span>
              <button type="button" class="refresh-btn" data-clear-industry-filter="1">
                Clear Filter
              </button>
            </div>`
          : ""
      }
      ${
        filtered.length
          ? `<ul class="scorecard-vote-list">
              ${filtered
                .map((vote, idx) => {
                  const tone = voteTone(vote.votePosition);
                  const positionLabel = String(vote.votePosition || "—")
                    .toUpperCase()
                    .replace(/_/g, " ");
                  const billNumber = normalizeBillNumber(vote.billNumber);
                  const displayTitle = formatVoteTitle(vote);
                  const codeBadge = formatVoteCodeBadge(vote);
                  const motion =
                    typeof describeVoteMotion === "function"
                      ? describeVoteMotion(vote)
                      : {
                          label:
                            vote.motionLabel ||
                            (typeof formatVoteMotionLabel === "function"
                              ? formatVoteMotionLabel(vote)
                              : "Floor Vote"),
                          detail: vote.motionDetail || vote.motionLabel || "",
                          isProcedural: Boolean(vote.isProceduralMotion),
                        };
                  const motionLabel = String(
                    motion.label || vote.motionLabel || "Floor Vote"
                  ).trim();
                  const motionDetail = String(
                    motion.detail || motionLabel
                  ).trim();
                  const summary = buildPlainEnglishSummary(vote);
                  const impacts = [
                    ["wallet", vote.impacts?.wallet],
                    ["community", vote.impacts?.community],
                    ["rights", vote.impacts?.rights],
                  ].filter(([, text]) => text);
                  return `<li class="scorecard-vote">
                    <div class="scorecard-vote__top">
                      <div class="scorecard-vote__meta">
                        <div class="scorecard-vote__badges">
                          ${
                            billNumber
                              ? `<span class="scorecard-bill">${escapeHtml(
                                  billNumber
                                )}</span>`
                              : ""
                          }
                          <span
                            class="scorecard-vote__motion${
                              motion.isProcedural ? " is-procedural" : ""
                            }"
                            title="${escapeHtml(motionDetail)}"
                          >${escapeHtml(motionLabel)}</span>
                          ${
                            vote.category
                              ? `<span class="scorecard-vote__category">${escapeHtml(
                                  vote.category
                                )}</span>`
                              : ""
                          }
                        </div>
                        <h4>${escapeHtml(displayTitle)}</h4>
                        <p class="scorecard-vote__motion-line">
                          ${escapeHtml(motionLabel)}${
                            vote.rollCallNumber
                              ? ` · Roll Call ${escapeHtml(
                                  String(vote.rollCallNumber)
                                )}`
                              : ""
                          }
                        </p>
                        ${
                          codeBadge
                            ? `<span class="scorecard-vote__code">${escapeHtml(
                                codeBadge
                              )}</span>`
                            : ""
                        }
                      </div>
                      <span class="scorecard-vote-pill is-${tone}" aria-label="Voted ${escapeHtml(
                        positionLabel
                      )} on ${escapeHtml(motionLabel)}">${escapeHtml(
                    positionLabel
                  )}</span>
                    </div>
                    ${
                      impacts.length
                        ? `<div class="scorecard-impacts">
                            ${impacts
                              .map(([kind, text]) => {
                                const meta = impactMeta[kind] || {
                                  icon: "",
                                  label: kind,
                                  className: "",
                                };
                                return `<span class="scorecard-impact-pill ${
                                  meta.className
                                }" title="${escapeHtml(text)}">
                                  <span class="scorecard-impact-pill__icon" aria-hidden="true">${
                                    meta.icon
                                  }</span>
                                  <span class="scorecard-impact-pill__label">${escapeHtml(
                                    meta.label
                                  )}</span>
                                </span>`;
                              })
                              .join("")}
                          </div>`
                        : ""
                    }
                    ${
                      summary
                        ? typeof renderCollapsibleSummaryHtml === "function"
                          ? renderCollapsibleSummaryHtml(
                              {
                                plain_summary: summary,
                                summary: vote.officialSummary || vote.summary || "",
                              },
                              {
                                escapeHtmlFn: escapeHtml,
                                paragraphClass: "scorecard-vote__plain",
                              }
                            )
                          : `<p class="scorecard-vote__plain">${escapeHtml(
                              summary
                            )}</p>`
                        : ""
                    }
                    <div class="scorecard-vote__actions" data-vote-engage="${idx}"></div>
                  </li>`;
                })
                .join("")}
            </ul>`
          : `<div class="scorecard-empty scorecard-empty--card" role="status">
              ${
                industryFilter
                  ? (() => {
                      const relatedCategory =
                        industrySector?.policyCategory || "related topic";
                      const subjectParam = (() => {
                        const cat = String(relatedCategory).toLowerCase();
                        if (cat.includes("economy") || cat.includes("tax"))
                          return "economy";
                        if (cat.includes("health")) return "healthcare";
                        if (cat.includes("defense") || cat.includes("foreign"))
                          return "defense";
                        if (cat.includes("energy") || cat.includes("environment"))
                          return "energy";
                        if (cat.includes("civil") || cat.includes("justice"))
                          return "civil_rights";
                        if (cat.includes("immigra") || cat.includes("border"))
                          return "immigration";
                        if (cat.includes("tech") || cat.includes("telecom"))
                          return "tech";
                        return "";
                      })();
                      const billsHref = subjectParam
                        ? `bills-policies.html?tab=votes&subject=${encodeURIComponent(
                            subjectParam
                          )}`
                        : "bills-policies.html?tab=votes";
                      return `<p>No direct roll-call votes flagged for “${escapeHtml(
                        selectedIndustryLabel
                      )}” in the current cycle.</p>
                    <p class="scorecard-empty__hint">
                      Donor industries don’t always map to a same-cycle floor vote.
                      Browse broader
                      <strong>${escapeHtml(relatedCategory)}</strong>
                      votes, or clear the filter to see every roll call.
                    </p>
                    <div class="scorecard-empty__actions">
                      <a class="refresh-btn" href="${billsHref}">
                        View general ${escapeHtml(relatedCategory)} bills
                      </a>
                      <button type="button" class="refresh-btn" data-clear-industry-filter="1">
                        Clear Filter
                      </button>
                    </div>`;
                    })()
                  : `<p>${
                      sourceVotes.length
                        ? scope === "key"
                          ? "No key votes in this list yet. Switch to All Votes to see every roll call."
                          : "No roll calls match this filter."
                        : "No recent roll-call votes recorded for this representative."
                    }</p>`
              }
            </div>`
      }
    `;

    el._scorecardVoteRows = filtered;
    el._scorecardVoteOptions = {
      politicianName,
      bioguideId: String(
        options.bioguideId || el.dataset.bioguideId || ""
      ).toUpperCase(),
      chamber: String(options.chamber || el.dataset.chamber || ""),
      industryFilter,
      onStanceChange: options.onStanceChange || el._scorecardVoteOptions?.onStanceChange || null,
      onClearIndustry:
        options.onClearIndustry || el._scorecardVoteOptions?.onClearIndustry || null,
    };
    if (el._scorecardVoteOptions.bioguideId) {
      el.dataset.bioguideId = el._scorecardVoteOptions.bioguideId;
    }
    if (el._scorecardVoteOptions.chamber) {
      el.dataset.chamber = el._scorecardVoteOptions.chamber;
    }

    mountScorecardVoteEngagement(el, filtered, el._scorecardVoteOptions);

    el.querySelectorAll("[data-clear-industry-filter]").forEach((button) => {
      button.addEventListener("click", () => {
        if (typeof el._scorecardVoteOptions.onClearIndustry === "function") {
          el._scorecardVoteOptions.onClearIndustry();
        }
      });
    });

    const scopeSelect = $("scorecard-vote-scope");
    if (scopeSelect && !industryFilter) {
      scopeSelect.addEventListener("change", () => {
        renderVotes(el, sourceVotes, query, {
          scope: scopeSelect.value,
          politicianName,
          bioguideId: el._scorecardVoteOptions?.bioguideId,
          chamber: el._scorecardVoteOptions?.chamber,
          industryFilter: el._scorecardVoteOptions?.industryFilter || "",
          onStanceChange: el._scorecardVoteOptions?.onStanceChange,
          onClearIndustry: el._scorecardVoteOptions?.onClearIndustry,
        });
      });
    }

    const topicSelect = $("scorecard-topic-filter");
    if (topicSelect && !industryFilter) {
      topicSelect.addEventListener("change", () => {
        const topic = topicSelect.value;
        const next =
          topic === "all"
            ? sourceVotes
            : sourceVotes.filter(
                (vote) =>
                  String(vote.category || "").toLowerCase() ===
                  topic.toLowerCase()
              );
        renderVotes(el, next, query, {
          scope: el.dataset.voteScope || "key",
          politicianName,
          bioguideId: el._scorecardVoteOptions?.bioguideId,
          chamber: el._scorecardVoteOptions?.chamber,
          industryFilter: el._scorecardVoteOptions?.industryFilter || "",
          onStanceChange: el._scorecardVoteOptions?.onStanceChange,
          onClearIndustry: el._scorecardVoteOptions?.onClearIndustry,
        });
      });
    }
  }

  function mountScorecardVoteEngagement(el, votes, options = {}) {
    if (!el) return;
    const politicianName = String(options.politicianName || "").trim();
    const bioguideId = String(options.bioguideId || "").toUpperCase();
    const chamberHint = String(options.chamber || el.dataset.chamber || "");
    const profile = {
      chamber: /senate/i.test(chamberHint) ? "Senate" : "House",
      bioguideId,
    };

    el.querySelectorAll("[data-vote-engage]").forEach((container) => {
      const index = Number(container.getAttribute("data-vote-engage"));
      const vote = votes?.[index];
      if (!vote) return;

      const openAskAi = () => {
        if (typeof openVoteAskAiDrawer === "function") {
          openVoteAskAiDrawer(vote, politicianName);
        } else if (typeof openAskAiDrawer === "function") {
          openAskAiDrawer({
            context: {
              type: "vote",
              politicianName,
              ...vote,
            },
          });
        } else {
          alert("Ask AI is not available on this page yet.");
        }
      };

      const item = quizBillItemFromVote(vote, profile);
      if (item?.id && window.PolicyEngagement?.mount) {
        window.PolicyEngagement.mount(container, item, {
          compact: true,
          supportLabel: "Support",
          opposeLabel: "Oppose",
          prompt: "",
          showFollow: true,
          showAskAi: true,
          showTakeAction: false,
          showCommunity: false,
          showWhoVoted: false,
          showAlignment: false,
          compareBioguides: bioguideId ? [bioguideId] : [],
          voteCast: vote.votePosition || vote.voteCast || null,
          onAskAi: openAskAi,
          onStanceChange: async (payload) => {
            if (typeof options.onStanceChange === "function") {
              await options.onStanceChange(payload);
            }
          },
        });
        return;
      }

      // Fallback: keep Ask AI visible even if engagement cannot mount.
      container.innerHTML = `
        <button type="button" class="refresh-btn policy-engage__ask-ai scorecard-vote__ask-ai">
          Ask AI
        </button>
      `;
      container.querySelector("button")?.addEventListener("click", openAskAi);
    });
  }

  function renderTabs(tabsEl, representatives, activeId, onSelect) {
    if (!tabsEl) return;
    let senateIndex = 0;
    tabsEl.hidden = representatives.length === 0;
    tabsEl.innerHTML = representatives
      .map((rep) => {
        if (rep.profile.chamber === "Senate") senateIndex += 1;
        const selected = rep.profile.id === activeId;
        return `<button type="button" class="scorecard-tab${
          selected ? " is-active" : ""
        }" role="tab" aria-selected="${selected}" data-id="${escapeHtml(
          rep.profile.id
        )}">
          <span class="scorecard-tab__label">${escapeHtml(
            tabLabel(rep, senateIndex)
          )}</span>
          <span class="scorecard-tab__name">${escapeHtml(
            rep.profile.name
          )}</span>
        </button>`;
      })
      .join("");

    tabsEl.querySelectorAll(".scorecard-tab").forEach((button) => {
      button.addEventListener("click", () => onSelect(button.dataset.id));
    });
  }

  async function fetchBundle({ id, bioguideId, politicianId, zipCode, address }) {
    const params = new URLSearchParams();
    if (id) params.set("id", id);
    if (bioguideId) params.set("bioguideId", bioguideId);
    if (politicianId) params.set("politicianId", politicianId);
    if (zipCode) params.set("zipCode", zipCode);
    if (address) params.set("address", address);
    const response = await fetch(`${ENDPOINT}?${params.toString()}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.ok === false) {
      throw new Error(payload?.error || `Lookup failed (${response.status})`);
    }
    return payload;
  }

  function bindViewToggle() {
    const toggle = $("scorecard-view-toggle");
    const main = document.querySelector(".page--scorecard");
    const details = $("scorecard-directory-details");
    if (!toggle || toggle.dataset.bound === "1") return;
    toggle.dataset.bound = "1";

    toggle.addEventListener("click", (event) => {
      const button = event.target.closest("[data-view]");
      if (!button) return;
      const view = button.dataset.view;
      toggle.querySelectorAll("[data-view]").forEach((btn) => {
        const selected = btn.dataset.view === view;
        btn.classList.toggle("is-active", selected);
        btn.setAttribute("aria-selected", selected ? "true" : "false");
      });
      if (main) main.dataset.activeView = view;

      if (view === "directory") {
        if (details) details.open = true;
        $("scorecard-directory")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      } else {
        $("scorecard-primary")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
  }

  function mountOfficialsDirectory(lookupQuery) {
    const section = $("scorecard-directory");
    const toggle = $("scorecard-view-toggle");
    const query = String(lookupQuery || "").trim();

    if (!query) {
      if (section) section.hidden = true;
      if (toggle) toggle.hidden = true;
      return;
    }

    if (section) section.hidden = false;
    if (toggle) toggle.hidden = false;
    bindViewToggle();

    if (typeof mountAddressResultsPage !== "function") {
      const status = $("directory-status");
      if (status) {
        status.hidden = false;
        status.dataset.type = "error";
        status.textContent =
          "Officials directory is unavailable on this page build.";
      }
      return;
    }

    mountAddressResultsPage({
      statusId: "directory-status",
      resultsId: "address-results",
      queryLabelId: null,
      redirectIfMissing: false,
      queryOverride: query,
    });
  }

  function mountRepresentativesScorecard() {
    const query = readQuery();
    const session = readSession();
    const heading = $("scorecard-heading");
    const lede = $("scorecard-lede");
    const tabs = $("scorecard-tabs");
    const panel = $("scorecard-panel");
    const search = $("scorecard-vote-search");

    let state = {
      data: null,
      activeId: query.id || session?.activeId || null,
      voteQuery: "",
      paintToken: 0,
      lastEnrich: null,
      selectedIndustry: null,
      selectedSourceName: null,
    };

    async function maybeShowVoterPulseBanner() {
      const banner = $("voter-pulse-banner");
      if (!banner) return;
      banner.addEventListener("click", (event) => {
        if (!event.target.closest("[data-dismiss-voter-pulse]")) return;
        event.preventDefault();
        if (typeof dismissVoterPulseBanner === "function") {
          dismissVoterPulseBanner();
        }
        banner.hidden = true;
      });

      try {
        const params = new URLSearchParams(global.location.search);
        if (params.get("pulse") === "1") {
          banner.hidden = true;
          return;
        }
        if (
          typeof isVoterPulseBannerDismissed === "function" &&
          isVoterPulseBannerDismissed()
        ) {
          banner.hidden = true;
          return;
        }
        const user =
          typeof getUser === "function" ? await getUser() : null;
        if (!user) {
          banner.hidden = true;
          return;
        }
        const offer =
          typeof shouldOfferVoterPulse === "function"
            ? await shouldOfferVoterPulse(user)
            : false;
        banner.hidden = !offer;
      } catch (error) {
        console.warn(error);
        banner.hidden = true;
      }
    }

    function maybeFocusPulseArrival() {
      const params = new URLSearchParams(global.location.search);
      if (params.get("pulse") !== "1") return;
      global.setTimeout(() => {
        focusActionMatchSection();
        // Clean the query so refresh does not re-animate.
        const url = new URL(global.location.href);
        url.searchParams.delete("pulse");
        global.history.replaceState({}, "", url.toString());
      }, 450);
    }

    maybeShowVoterPulseBanner();

    async function refreshActionMatchScore() {
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active?.profile) return;
      const matchPayload = await loadMatchRows(active.profile.bioguideId);
      const matchSummary = summarizeMatch(matchPayload);
      renderMatch(
        $("scorecard-match"),
        $("scorecard-match-body"),
        $("scorecard-match-lede"),
        active.profile,
        matchPayload,
        { industryFilter: state.selectedIndustry }
      );
      renderHero(
        $("scorecard-hero"),
        active.profile,
        state.lastEnrich,
        matchSummary
      );
    }

    function paintVotesAndDonor(active) {
      if (!active) return;
      const voteOpts = {
        politicianName: active.profile?.name || "",
        bioguideId: active.profile?.bioguideId || "",
        chamber: active.profile?.chamber || "",
        industryFilter: state.selectedIndustry || "",
        onStanceChange: refreshActionMatchScore,
        onClearIndustry: () => setSelectedIndustry(null),
      };
      renderDonor($("scorecard-donor"), active.campaignFinance, {
        selectedIndustry: state.selectedIndustry,
        selectedSourceName: state.selectedSourceName,
        onSelectIndustry: setSelectedIndustry,
      });
      if (hasUsableVotes(active.recentVotes)) {
        renderVotes(
          $("scorecard-votes"),
          active.recentVotes,
          state.voteQuery,
          voteOpts
        );
      }
    }

    function setSelectedIndustry(selection) {
      let nextSlug = null;
      let nextSource = null;
      if (selection && typeof selection === "object") {
        nextSlug = String(selection.slug || "").trim() || null;
        nextSource = String(selection.sourceName || "").trim() || null;
      } else if (selection) {
        // Backward-compatible: raw string may be a slug or employer/label.
        const sector = resolveIndustrySector(selection);
        nextSlug = sector?.slug || String(selection).trim() || null;
        nextSource = null;
      }
      state.selectedIndustry = nextSlug;
      state.selectedSourceName = nextSlug ? nextSource : null;
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active) return;
      paintVotesAndDonor(active);
      // Keep Action Match topic chips in sync with the industry drill-down.
      const matchBody = $("scorecard-match-body");
      if (matchBody?.querySelector("[data-match-topic-filter]")) {
        const topic = policyCategoryFromIndustry(nextSlug) || "all";
        bindMatchTopicFilters(matchBody, topic);
      }
      if (nextSlug) {
        $("scorecard-votes")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }

    bindMatchQuizModalChrome(() => {
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active) return null;
      return {
        votes: active.recentVotes || [],
        profile: active.profile,
        onScoreRefresh: refreshActionMatchScore,
      };
    });
    bindMatchDetailModalChrome();

    async function paint() {
      const token = ++state.paintToken;
      const reps = state.data?.representatives || [];
      const active =
        reps.find((rep) => rep.profile.id === state.activeId) || reps[0] || null;
      if (!active) {
        panel.hidden = true;
        return;
      }
      panel.hidden = false;
      state.activeId = active.profile.id;
      renderTabs(tabs, reps, state.activeId, (id) => {
        state.activeId = id;
        state.selectedIndustry = null;
        state.selectedSourceName = null;
        const url = new URL(global.location.href);
        url.searchParams.set("id", id);
        global.history.replaceState({}, "", url.toString());
        writeSession({
          ...(state.data || {}),
          activeId: id,
          query: state.data?.query || query,
        });
        paint();
      });

      // Immediate paint with profile we already have.
      const pendingMatch = { user: followUser, rows: [] };
      renderHero(
        $("scorecard-hero"),
        active.profile,
        null,
        summarizeMatch(pendingMatch)
      );
      paintVotesAndDonor(active);
      renderAttendance($("scorecard-attendance"), active.attendance);
      if (!hasUsableVotes(active.recentVotes)) {
        const votesEl = $("scorecard-votes");
        if (votesEl) {
          votesEl.innerHTML = `
            <div class="scorecard-votes__header">
              <div class="scorecard-votes__heading">
                <p class="scorecard-card__eyebrow">Truth in Voting</p>
                <h3 class="scorecard-card__title">Recent roll calls</h3>
              </div>
              <div class="scorecard-votes__tools">
                <button
                  type="button"
                  id="scorecard-match-cta"
                  class="scorecard-match-cta"
                  data-open-match-quiz="1"
                >
                  <span aria-hidden="true">🎯</span>
                  Match My Votes
                </button>
              </div>
            </div>
            <div class="scorecard-empty scorecard-empty--card" role="status">
              <p>Loading recent roll-call votes…</p>
            </div>`;
        }
      }
      renderMatch(
        $("scorecard-match"),
        $("scorecard-match-body"),
        $("scorecard-match-lede"),
        active.profile,
        pendingMatch,
        { industryFilter: state.selectedIndustry }
      );

      const [enrich] = await Promise.all([loadEnrichment(active.profile)]);
      if (token !== state.paintToken) return;

      if (!hasUsableVotes(active.recentVotes)) {
        const liveVotes = mapProfileVotesToScorecard(enrich?.recentVotes);
        active.recentVotes = liveVotes;
        paintVotesAndDonor(active);
      }

      // Project existing user stances (often from Senate quiz) onto this
      // member so House Action Match badges fill without re-taking the quiz.
      if (followUser && hasUsableVotes(active.recentVotes)) {
        try {
          await projectStancesOntoMember(
            active.profile,
            active.recentVotes || []
          );
        } catch (error) {
          console.warn(error);
        }
      }
      if (token !== state.paintToken) return;

      const matchPayload = await loadMatchRows(active.profile.bioguideId);
      if (token !== state.paintToken) return;

      activeRosterPerson = toRosterPerson(active.profile, enrich);
      state.lastEnrich = enrich;
      const matchSummary = summarizeMatch(matchPayload);
      renderHero($("scorecard-hero"), active.profile, enrich, matchSummary);
      renderMatch(
        $("scorecard-match"),
        $("scorecard-match-body"),
        $("scorecard-match-lede"),
        active.profile,
        matchPayload,
        { industryFilter: state.selectedIndustry }
      );
      await resolveFollowTargetId(activeRosterPerson);
      await loadNoteForPerson(activeRosterPerson, followUser);
      if (token !== state.paintToken) return;
      refreshNoteUi();
      syncFollowButton();
      await completePendingFollowIfNeeded(activeRosterPerson);
      if (token !== state.paintToken) return;
      syncFollowButton();
    }

    if (search) {
      search.addEventListener("input", () => {
        state.voteQuery = search.value;
        const reps = state.data?.representatives || [];
        const active =
          reps.find((rep) => rep.profile.id === state.activeId) || reps[0];
        if (active) paintVotesAndDonor(active);
      });
    }

    (async () => {
      setStatus("Loading scorecards…", "loading");
      panel.hidden = true;
      tabs.hidden = true;

      try {
        await ensureFollowState();
        if (window.PolicyEngagement?.init) {
          await window.PolicyEngagement.init().catch((error) =>
            console.warn(error)
          );
        }

        let payload = null;
        const deepLinkId = query.id || null;
        const deepLinkBioguide = query.bioguideId || null;
        const deepLinkPoliticianId = query.politicianId || null;
        const isDeepLink = Boolean(
          deepLinkId || deepLinkBioguide || deepLinkPoliticianId
        );
        // Deep links (Politicians search → Hawley) must not reuse the session
        // ZIP/address, or the API returns your district set and picks Cornyn.
        const guestLocation =
          typeof readGuestLocationContext === "function"
            ? readGuestLocationContext()
            : null;
        const zipCode = isDeepLink
          ? query.zipCode || null
          : query.zipCode ||
            session?.query?.zipCode ||
            guestLocation?.zipCode ||
            null;
        const address = isDeepLink
          ? query.address || null
          : query.address ||
            session?.query?.address ||
            (!zipCode ? guestLocation?.address || null : null);
        const id = deepLinkId;
        const bioguideId = deepLinkBioguide;
        const politicianId = deepLinkPoliticianId;
        const sessionActiveId = session?.activeId || null;
        const directoryQuery =
          address ||
          zipCode ||
          session?.query?.address ||
          session?.query?.zipCode ||
          (typeof resolveAddressLookupQuery === "function"
            ? resolveAddressLookupQuery()
            : "") ||
          null;

        if (
          !id &&
          !bioguideId &&
          !politicianId &&
          !zipCode &&
          !address &&
          session?.representatives?.length
        ) {
          // Prefer a fresh district lookup when session still has a home ZIP /
          // address (covers sessions poisoned by an earlier Hawley deep link).
          const sessionZip = session?.query?.zipCode || null;
          const sessionAddress = session?.query?.address || null;
          if (sessionZip || sessionAddress) {
            payload = await fetchBundle({
              zipCode: sessionZip,
              address: sessionAddress,
            });
          } else {
            payload = session;
          }
        } else if (
          !id &&
          !bioguideId &&
          !politicianId &&
          !zipCode &&
          !address
        ) {
          setStatus(
            "Start from the home page ZIP lookup, Politicians tab, or open with ?zipCode= / ?bioguideId= / ?id=.",
            "error"
          );
          return;
        } else {
          // Never reuse a prior deep-link activeId (e.g. Hawley) when looking up
          // by ZIP/address — that made "Find my representatives" return Hawley.
          payload = await fetchBundle({
            id:
              id ||
              (!bioguideId && !politicianId && !zipCode && !address
                ? sessionActiveId
                : null),
            bioguideId,
            politicianId,
            zipCode,
            address,
          });
        }

        state.data = payload;
        state.activeId =
          id ||
          payload.activeId ||
          payload.representatives?.find(
            (rep) =>
              bioguideId &&
              String(rep.profile.bioguideId || "").toUpperCase() === bioguideId
          )?.profile?.id ||
          payload.representatives?.find(
            (rep) =>
              politicianId &&
              String(rep.profile.rosterPoliticianId || "") === politicianId
          )?.profile?.id ||
          payload.representatives?.[0]?.profile?.id ||
          null;

        // Deep links must not overwrite the user's district roster in session.
        // Otherwise the next bare / ZIP visit can resurrect Hawley as "my reps".
        const priorHasDistrict =
          Boolean(session?.query?.zipCode || session?.query?.address) &&
          Array.isArray(session?.representatives) &&
          session.representatives.length > 0;
        if (isDeepLink && priorHasDistrict) {
          writeSession({
            ...session,
            query: {
              ...session.query,
              bioguideId: null,
              politicianId: null,
              lastViewedBioguideId: bioguideId || politicianId || null,
            },
          });
        } else {
          const nextQuery = {
            zipCode: zipCode || session?.query?.zipCode || null,
            address: address || session?.query?.address || null,
            // Don't persist deep-link bioguide into the "my reps" session.
            bioguideId: isDeepLink ? null : bioguideId,
            politicianId: isDeepLink ? null : politicianId,
            lastViewedBioguideId: isDeepLink
              ? bioguideId || politicianId || null
              : null,
          };
          writeSession({
            ...payload,
            activeId: state.activeId,
            query: nextQuery,
          });
          if (
            typeof saveGuestLocationContext === "function" &&
            (nextQuery.zipCode || nextQuery.address)
          ) {
            saveGuestLocationContext({
              zipCode: nextQuery.zipCode,
              address: nextQuery.address,
              query: nextQuery.zipCode || nextQuery.address,
            });
          }
        }

        if (heading) {
          const singleName = payload.representative?.profile?.name;
          heading.textContent =
            payload.location?.formattedAddress ||
            payload.location?.state ||
            singleName ||
            "Your federal representatives";
        }
        if (lede) {
          if (payload.counts) {
            lede.textContent = `${payload.counts.total || 0} federal representative${
              payload.counts.total === 1 ? "" : "s"
            } — switch tabs for scorecards, or open Full Regional & State Representation below.`;
          } else if (payload.representatives?.length === 1) {
            lede.textContent =
              "Donor alignment, attendance, Action Match, and Truth in Voting for this member.";
          }
        }

        setStatus("", "loading");
        await paint();
        maybeFocusPulseArrival();
        mountOfficialsDirectory(
          directoryQuery ||
            payload.location?.formattedAddress ||
            payload.location?.state ||
            null
        );
      } catch (error) {
        setStatus(error?.message || "Could not load scorecards.", "error");
      }
    })();
  }

  global.mountRepresentativesScorecard = mountRepresentativesScorecard;
  global.ARTICLE1_SCORECARD_SESSION_KEY = SESSION_KEY;
})(typeof window !== "undefined" ? window : globalThis);
