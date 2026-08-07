import type { BillMetric, ThemeVariant } from "../components/types";

/**
 * Live / structured legislative bill shape accepted by Article 1.
 * Compatible with `/api/bills-feed` items and processed_votes overlays.
 */
export type LegislativeBill = {
  id?: string;
  billId?: string;
  bill_id?: string;
  billNumber?: string;
  bill_number?: string;
  legislationNumber?: string;
  legislation_number?: string;
  title?: string;
  short_title?: string;
  shortTitle?: string;
  shortPitch?: string;
  short_pitch?: string;
  summary?: string;
  level?: string;
  jurisdiction?: string;
  category?: string;
  primaryCategory?: string;
  primary_category?: string;
  subjectCategory?: string;
  subject?: string | string[];
  subjects?: string[];
  policyArea?: string;
  policy_area?: string;
  type?: string;
  billType?: string;
  bill_type?: string;
  tags?: string[];
  keyImpacts?: string[];
  key_impacts?: string[];
  key_points?: string[];
  keyPoints?: string[];
  humanHook?: string;
  human_hook?: string;
  promptQuestion?: string;
  prompt_question?: string;
  financialSummary?: string;
  financial_summary?: string;
  imageSrc?: string;
  image_src?: string;
  imageAlt?: string;
  image_alt?: string;
  netCost?: string | number;
  net_cost?: string | number;
  fiscalYear?: string | number;
  fiscal_year?: string | number;
  daysLeft?: string | number;
  days_left?: string | number;
  voteProjection?: string;
  vote_projection?: string;
  metrics?: BillMetric[];
  themeVariant?: ThemeVariant;
  theme_variant?: ThemeVariant;
  lastUpdated?: string;
  officialUrl?: string;
  official_url?: string;
};

export type ArticleBillViewModel = {
  billId: string;
  title: string;
  category: string;
  keyImpacts: string[];
  humanHook?: string;
  promptQuestion?: string;
  imageSrc?: string;
  imageAlt?: string;
  financialSummary?: string;
  metrics: BillMetric[];
  themeVariant?: ThemeVariant;
  themeSignals: string;
  isLiveLegislative: boolean;
};

function asString(value: unknown): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(asString).filter(Boolean);
  }
  const single = asString(value);
  if (!single) return [];
  if (single.includes("|") || single.includes(",")) {
    return single
      .split(/[|,]/)
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [single];
}

function parseKeyImpacts(bill: LegislativeBill): string[] {
  const raw =
    bill.keyImpacts ||
    bill.key_impacts ||
    bill.keyPoints ||
    bill.key_points ||
    [];
  return asStringList(raw).slice(0, 4);
}

function firstPresent(...values: unknown[]): string {
  for (const value of values) {
    const next = asString(value);
    if (next) return next;
  }
  return "";
}

/**
 * Concatenate real bill taxonomy fields for theme routing.
 */
export function collectBillThemeSignals(bill: LegislativeBill = {}): string {
  const subjectList = [
    ...asStringList(bill.subject),
    ...asStringList(bill.subjects),
    ...asStringList(bill.tags),
  ];

  return [
    bill.category,
    bill.primaryCategory,
    bill.primary_category,
    bill.subjectCategory,
    bill.policyArea,
    bill.policy_area,
    bill.type,
    bill.billType,
    bill.bill_type,
    ...subjectList,
  ]
    .map(asString)
    .filter(Boolean)
    .join(" ");
}

export function resolveBillCategoryLabel(bill: LegislativeBill = {}): string {
  return (
    firstPresent(
      bill.primaryCategory,
      bill.primary_category,
      bill.category,
      bill.subjectCategory,
      bill.policyArea,
      bill.policy_area,
      asStringList(bill.subject)[0],
      asStringList(bill.subjects)[0],
      asStringList(bill.tags)[0]
    ) || "Legislation"
  );
}

export function resolveBillId(bill: LegislativeBill = {}): string {
  return (
    firstPresent(
      bill.billNumber,
      bill.bill_number,
      bill.legislationNumber,
      bill.legislation_number,
      bill.billId,
      bill.bill_id,
      bill.id
    ) || "Bill"
  );
}

export function resolveBillTitle(bill: LegislativeBill = {}): string {
  return (
    firstPresent(
      bill.short_title,
      bill.shortTitle,
      bill.title,
      bill.shortPitch,
      bill.short_pitch
    ) || "Untitled legislation"
  );
}

function buildMetricsFromBill(bill: LegislativeBill): BillMetric[] {
  if (Array.isArray(bill.metrics) && bill.metrics.length) {
    return bill.metrics;
  }

  const metrics: BillMetric[] = [];
  const netCost = firstPresent(bill.netCost, bill.net_cost);
  const fiscalYear = firstPresent(bill.fiscalYear, bill.fiscal_year);
  const daysLeft = firstPresent(bill.daysLeft, bill.days_left);
  const voteProjection = firstPresent(
    bill.voteProjection,
    bill.vote_projection
  );

  if (netCost) {
    metrics.push({
      id: "net-cost",
      label: "Net Cost",
      value: netCost,
      tone: /^-|cut|save|reduc/i.test(netCost) ? "positive" : "warning",
    });
  }
  if (fiscalYear) {
    metrics.push({
      id: "fiscal-year",
      label: "Fiscal Year",
      value: fiscalYear,
      tone: "info",
    });
  }
  if (voteProjection) {
    metrics.push({
      id: "vote-projection",
      label: "Vote Projection",
      value: voteProjection,
      tone: "neutral",
    });
  }
  if (daysLeft) {
    metrics.push({
      id: "days-left",
      label: "Days Left",
      value: daysLeft,
      tone: "warning",
    });
  }

  return metrics;
}

/**
 * True for live federal/state legislative rows (excludes curated local samples).
 */
export function isLiveLegislativeBill(bill: LegislativeBill = {}): boolean {
  const level = asString(bill.level).toLowerCase();
  if (level === "federal" || level === "state") return true;

  const id = asString(bill.id || bill.billId || bill.bill_id).toLowerCase();
  if (id.startsWith("federal-") || id.startsWith("state-")) return true;

  // Reject known curated sample id prefixes from bills-feed.
  if (
    id.startsWith("city-") ||
    id.startsWith("district-") ||
    id.startsWith("county-")
  ) {
    return false;
  }

  // Structured API props without curated ids still count as live input.
  return Boolean(
    bill.billNumber ||
      bill.bill_number ||
      bill.title ||
      bill.policyArea ||
      bill.policy_area
  );
}

/**
 * Map a live bill object into ArticleCard / ThemeWrapper view props.
 * Does not invent placeholder impacts or mock categories.
 */
export function mapLiveBillToArticleProps(
  bill: LegislativeBill = {}
): ArticleBillViewModel {
  const title = resolveBillTitle(bill);
  const category = resolveBillCategoryLabel(bill);
  const keyImpacts = parseKeyImpacts(bill);
  const shortPitch = firstPresent(bill.shortPitch, bill.short_pitch, bill.summary);
  const humanHook = firstPresent(
    bill.humanHook,
    bill.human_hook,
    shortPitch,
    title
  );
  const financialSummary = firstPresent(
    bill.financialSummary,
    bill.financial_summary,
    shortPitch,
    title
  );

  return {
    billId: resolveBillId(bill),
    title,
    category,
    keyImpacts,
    humanHook: humanHook || undefined,
    promptQuestion: firstPresent(bill.promptQuestion, bill.prompt_question) || undefined,
    imageSrc: firstPresent(bill.imageSrc, bill.image_src) || undefined,
    imageAlt: firstPresent(bill.imageAlt, bill.image_alt) || undefined,
    financialSummary: financialSummary || undefined,
    metrics: buildMetricsFromBill(bill),
    themeVariant: bill.themeVariant || bill.theme_variant,
    themeSignals: collectBillThemeSignals(bill),
    isLiveLegislative: isLiveLegislativeBill(bill),
  };
}

export type BillsFeedResponse = {
  ok?: boolean;
  generatedAt?: string;
  items?: LegislativeBill[];
  bills?: LegislativeBill[];
  error?: string;
  coverage?: Record<string, string>;
};

/**
 * Normalize a bills-feed (or similar) payload into live legislative bills only.
 */
export function extractLiveBillsFromFeed(
  payload: BillsFeedResponse | LegislativeBill[] | null | undefined
): LegislativeBill[] {
  const list = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.items)
      ? payload.items
      : Array.isArray(payload?.bills)
        ? payload.bills
        : [];

  return list.filter(isLiveLegislativeBill);
}
