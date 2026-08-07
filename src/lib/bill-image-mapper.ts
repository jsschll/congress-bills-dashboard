/**
 * Category → stock photo mapper for Article 1 Editorial cards.
 * Mirrors `lib/utils/billImageMapper.js` for TypeScript / React consumers.
 */

export type BillImageSource = "explicit" | "category_stock" | "default_stock";

export type ResolvedBillImage = {
  url: string;
  alt: string;
  source: BillImageSource;
  categoryId: string | null;
  categoryLabel: string | null;
};

type CategoryStockEntry = {
  id: string;
  label: string;
  pattern: RegExp;
  url: string;
  alt: string;
};

export const CATEGORY_STOCK: Record<string, CategoryStockEntry> = {
  defense: {
    id: "defense",
    label: "Defense",
    pattern:
      /\b(defense|defence|military|armed\s*forces|pentagon|troops?|veterans?|national\s*security|weapons?|navy|army|air\s*force|marines?)\b/i,
    url: "https://images.unsplash.com/photo-1579912437766-7896df6d3cd3?auto=format&fit=crop&w=1400&q=80",
    alt: "Military aircraft on the tarmac at dusk",
  },
  foreign: {
    id: "foreign",
    label: "Foreign Affairs",
    pattern:
      /\b(foreign\s*affairs|diplomacy|diplomatic|international|treaty|allies|embassy|state\s*department|united\s*nations|\bun\b|sanctions?|mediterranean|middle\s*east)\b/i,
    url: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?auto=format&fit=crop&w=1400&q=80",
    alt: "World map illuminated in a darkened briefing room",
  },
  healthcare: {
    id: "healthcare",
    label: "Healthcare",
    pattern:
      /\b(health(\s*care)?|healthcare|medicare|medicaid|hospital|patient|medical|public\s*health|prescription|pharma|mental\s*health|cdc|nih)\b/i,
    url: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&w=1400&q=80",
    alt: "Clinician reviewing charts in a modern hospital",
  },
  economy: {
    id: "economy",
    label: "Economy & Finance",
    pattern:
      /\b(econom(y|ic)|finance|financial|budget|appropriations?|tax(es|ation)?|treasury|revenue|deficit|debt|banking|securities|commerce|trade|gdp|inflation|irs)\b/i,
    url: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1400&q=80",
    alt: "Financial district skyline and market screens",
  },
  environment: {
    id: "environment",
    label: "Environment & Energy",
    pattern:
      /\b(environment(al)?|climate|energy|clean\s*air|emissions?|epa|renewable|solar|wind|oil|gas|fossil|conservation|wildlife|pollution|carbon)\b/i,
    url: "https://images.unsplash.com/photo-1466611653911-95081537e5b7?auto=format&fit=crop&w=1400&q=80",
    alt: "Wind turbines across a green landscape",
  },
  education: {
    id: "education",
    label: "Education",
    pattern:
      /\b(education|school(s)?|student(s)?|college|university|teacher(s)?|curriculum|tuition|pell|k-12|classroom)\b/i,
    url: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=1400&q=80",
    alt: "Students learning together in a classroom",
  },
  agriculture: {
    id: "agriculture",
    label: "Agriculture",
    pattern:
      /\b(agriculture|agricultural|farm(ers?|ing)?|crop(s)?|livestock|usda|food\s*security|rural)\b/i,
    url: "https://images.unsplash.com/photo-1500937386664-56d1dfef142f?auto=format&fit=crop&w=1400&q=80",
    alt: "Golden farmland under open sky",
  },
  infrastructure: {
    id: "infrastructure",
    label: "Infrastructure & Tech",
    pattern:
      /\b(infrastructure|transport(ation)?|transit|highway|bridge|broadband|technology|tech|cyber|semiconductor|construction|public\s*works|rail|airport)\b/i,
    url: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?auto=format&fit=crop&w=1400&q=80",
    alt: "Modern bridge and roadway infrastructure",
  },
  housing: {
    id: "housing",
    label: "Housing",
    pattern:
      /\b(housing|rent(ers?|al)?|eviction|tenant(s)?|homeowner|mortgage|zoning|homeless(ness)?|affordable\s*housing|adu)\b/i,
    url: "https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&w=1400&q=80",
    alt: "Row of urban residential buildings",
  },
  immigration: {
    id: "immigration",
    label: "Immigration",
    pattern:
      /\b(immigrat(e|ion|ory)|border|asylum|visa|refugee|customs|deport|citizenship|dhs)\b/i,
    url: "https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=1400&q=80",
    alt: "People walking together across a sunlit plaza",
  },
  justice: {
    id: "justice",
    label: "Civil Rights & Justice",
    pattern:
      /\b(justice|judiciary|court(s)?|civil\s*rights|criminal|police|prison|sentenc|due\s*process|constitution(al)?|voting\s*rights|legal\s*aid)\b/i,
    url: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1400&q=80",
    alt: "Courthouse columns and justice architecture",
  },
  labor: {
    id: "labor",
    label: "Labor & Workforce",
    pattern:
      /\b(labor|labour|workforce|worker(s)?|wage(s)?|union(s)?|employment|job(s)?|osha|minimum\s*wage)\b/i,
    url: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&w=1400&q=80",
    alt: "People collaborating in a workplace",
  },
};

export const DEFAULT_STOCK = {
  id: "default",
  label: "Civic",
  url: "https://images.unsplash.com/photo-1523480717983-8643265ba78e?auto=format&fit=crop&w=1400&q=80",
  alt: "Capitol dome against a clear sky",
};

// Prefer topical domains before broad economy/tax keywords (which appear in many bills).
const CATEGORY_ORDER = [
  "defense",
  "foreign",
  "healthcare",
  "environment",
  "education",
  "agriculture",
  "infrastructure",
  "housing",
  "immigration",
  "justice",
  "labor",
  "economy",
] as const;

function asString(value: unknown): string {
  return String(value ?? "").trim();
}

function asList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean);
  const single = asString(value);
  return single ? [single] : [];
}

export type BillImageInput = Record<string, unknown> & {
  imageSrc?: string;
  image_src?: string;
  imageUrl?: string;
  image_url?: string;
  photoUrl?: string;
  photo_url?: string;
  heroImage?: string;
  hero_image?: string;
  imageAlt?: string;
  image_alt?: string;
  title?: string;
  tags?: string[];
};

export function getExplicitBillImage(
  bill: BillImageInput = {}
): ResolvedBillImage | null {
  const url = asString(
    bill.imageSrc ||
      bill.image_src ||
      bill.imageUrl ||
      bill.image_url ||
      bill.photoUrl ||
      bill.photo_url ||
      bill.heroImage ||
      bill.hero_image ||
      ""
  );
  if (!url) return null;
  return {
    url,
    alt: asString(bill.imageAlt || bill.image_alt || bill.title) || "Legislation",
    source: "explicit",
    categoryId: null,
    categoryLabel: null,
  };
}

export function collectTopicSignals(bill: BillImageInput = {}): string {
  return [
    bill.primaryCategory,
    bill.primary_category,
    bill.category,
    bill.subjectCategory,
    bill.policyArea,
    bill.policy_area,
    bill.title,
    bill.short_title,
    bill.shortTitle,
    bill.shortPitch,
    bill.summary,
    bill.plain_summary,
    bill.plainSummary,
    bill.whatItDoes,
    bill.what_it_does,
    ...asList(bill.tags),
    ...asList(bill.subject),
    ...asList(bill.subjects),
    ...asList(bill.key_impacts || bill.keyImpacts || bill.key_points),
  ]
    .map(asString)
    .filter(Boolean)
    .join(" ");
}

function stockResult(entry: CategoryStockEntry): ResolvedBillImage {
  return {
    url: entry.url,
    alt: entry.alt,
    source: "category_stock",
    categoryId: entry.id,
    categoryLabel: entry.label,
  };
}

/** Prefer an explicit primary category / policy area label when it maps cleanly. */
export function matchPrimaryCategory(
  bill: BillImageInput = {}
): ResolvedBillImage | null {
  const labels = [
    bill.primaryCategory,
    bill.primary_category,
    bill.category,
    bill.subjectCategory,
    bill.policyArea,
    bill.policy_area,
  ]
    .map(asString)
    .filter(Boolean);
  if (!labels.length) return null;

  for (const label of labels) {
    const lower = label.toLowerCase();
    for (const key of CATEGORY_ORDER) {
      const entry = CATEGORY_STOCK[key];
      if (entry.label.toLowerCase() === lower || entry.pattern.test(label)) {
        return stockResult(entry);
      }
    }
  }
  return null;
}

export function matchCategoryStock(
  signals = ""
): ResolvedBillImage | null {
  const haystack = asString(signals);
  if (!haystack) return null;
  for (const key of CATEGORY_ORDER) {
    const entry = CATEGORY_STOCK[key];
    if (entry.pattern.test(haystack)) {
      return stockResult(entry);
    }
  }
  return null;
}

export function getDefaultStock(): ResolvedBillImage {
  return {
    url: DEFAULT_STOCK.url,
    alt: DEFAULT_STOCK.alt,
    source: "default_stock",
    categoryId: DEFAULT_STOCK.id,
    categoryLabel: DEFAULT_STOCK.label,
  };
}

export function resolveBillImage(bill: BillImageInput = {}): ResolvedBillImage {
  const explicit = getExplicitBillImage(bill);
  if (explicit) return explicit;
  const primary = matchPrimaryCategory(bill);
  if (primary) return primary;
  const matched = matchCategoryStock(collectTopicSignals(bill));
  if (matched) return matched;
  return getDefaultStock();
}

export function withResolvedBillImage<T extends BillImageInput>(bill: T) {
  const resolved = resolveBillImage(bill);
  return {
    ...bill,
    imageSrc: asString(bill.imageSrc || bill.image_src) || resolved.url,
    image_src: asString(bill.image_src || bill.imageSrc) || resolved.url,
    imageAlt: asString(bill.imageAlt || bill.image_alt) || resolved.alt,
    image_alt: asString(bill.image_alt || bill.imageAlt) || resolved.alt,
    imageSource: resolved.source,
    imageCategory: resolved.categoryId,
  };
}

export function enrichBillImages<T extends BillImageInput>(items: T[] = []) {
  return items.map((item) => withResolvedBillImage(item || ({} as T)));
}
